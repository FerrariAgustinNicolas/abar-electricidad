"""Fail-closed host lifecycle for the real H1 E2E container harness.

Importing this module is intentionally inert. The CLI is an accidental-execution
barrier only; it is not a substitute for separate human execution authority.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import pathlib
import re
import secrets
import selectors
import select
import signal
import socket
import stat
import subprocess
import sys
import tarfile
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Callable, Mapping


DOCKER = "/usr/local/bin/docker"
DOCKER_CONFIG = "/dev/null"
DOCKER_SOCKET = "unix:///Users/agustin/.docker/run/docker.sock"
APP_IMAGE = "sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402"
POSTGRES_IMAGE = "sha256:639ab7ceb90e13123085b741fb31ef493fba25463002f6da665352e7b534b652"
DEPENDENCY_VOLUME = "614258b706e893c8a90f756944166aa97b38a55c1ecaa9fa3e61fe341ee9ccba"
ENGINE_SHA256 = "82b96b51b53e642393dc0cc6ecf6dd06324d367505e8f8a4cb28b7c5ca4052ff"
SERVICE_SHA256 = "3077ee4f0a6d2706131c7feb9cbca69c0f0cf719ff5aaaaa22b5c8cb37d73038"
SPEC_SHA256 = "929dfcc1cd6e124407416f760ad3df9c1b13674a2e0088fd8beed49fbed75fbd"
ENGINE_RELATIVE = "odd/checks/prisma-engine/0edf323efd1d98336f3f0a68684b56f689b900d3/linux-musl-arm64-openssl-3.0.x/schema-engine"
SERVICE_RELATIVE = "backend/src/auth/change-password.service.ts"
SPEC_RELATIVE = "backend/src/auth/change-password.service.spec.ts"
WORK_SECONDS = 45.0
CLEANUP_SECONDS = 15.0
TOTAL_SECONDS = 60.0
SIDECAR_WRITE_SECONDS = 0.25
SIDECAR_STOP_SECONDS = 0.1
QUALIFICATION_KEYS = frozenset(("version", "image", "uid", "gid", "dataPath", "socketPath"))
RESULT_KEYS = frozenset(("version", "runId", "checks", "passed", "productChecks", "productPassed"))
CHECK_NAMES = (
    "migration.scope", "roles.scope", "seed.argon2", "http.csrf",
    "http.login.first", "http.login.second", "http.reject.noop",
    "http.rollback.atomic", "http.changePassword", "database.password.version",
    "database.session.rotation", "database.oldSessionRevocation",
    "database.expirations.preserved", "http.oldPassword.rejected", "http.newPassword.accepted",
)
PRODUCT_CHECK_NAMES = (
    "auth.csrf", "auth.login", "auth.me", "auth.logout", "auth.change-password",
    "admin.list", "admin.create", "admin.patch", "admin.reset-password",
)
ALLOWED_CHECKS = frozenset(CHECK_NAMES)
ALLOWED_PRODUCT_CHECKS = frozenset(PRODUCT_CHECK_NAMES)
MAX_ARCHIVE = 48 * 1024 * 1024
MAX_FILE = 32 * 1024 * 1024
MAX_OUTPUT = 64 * 1024
RESOURCE_HASHES = {
    "password-blocklist.bin": "7a85af89d0f800cc94cbe81ad5a11de7590da24a5ed33c6a5bc5e7f0abea1eb0",
    "password-blocklist.manifest.json": "581027ae246da0bacf0d71a65a35edad5a20a71c5fcfe2d810513b128bfdb510",
    "LICENSE.pwdb.txt": "4088d581cba171b1aa6f880ad3fb5327e2d6de415621cf8b80685ac506c0cae1",
    "LICENSE.seclists.txt": "3dbdc93d5f8829de0941744841730a09c106d0732e5ae0e98ca1d77be7ded66c",
}
REQUIRED_INPUTS = frozenset((
    SERVICE_RELATIVE, ENGINE_RELATIVE, "backend/package.json", "backend/package-lock.json",
    "backend/tsconfig.json", "backend/tsconfig.build.json", "backend/prisma.schema.config.ts",
    "backend/prisma/schema.prisma", "backend/prisma.h1-e2e.config.ts",
    "backend/scripts/h1-real-e2e.mjs", "backend/scripts/h1-product-e2e.mjs", "backend/scripts/copy-auth-resources.mjs",
    "backend/scripts/copy-auth-resources-cli.mjs",
    "backend/prisma/migrations/20261009000100_h1_admin_user/migration.sql",
    "backend/prisma/migrations/20261009000200_h1_auth_context/migration.sql",
    "backend/prisma/migrations/20261009000300_h1_admin_audit/migration.sql",
    *("backend/resources/auth/" + name for name in RESOURCE_HASHES),
))
OPTIONAL_INPUTS = frozenset(("backend/prisma/migrations/migration_lock.toml",))

HEX64 = re.compile(r"^[0-9a-f]{64}$")
RUN_ID = re.compile(r"^[0-9a-f]{32}$")


class HarnessError(Exception):
    """Base for expected fail-closed errors."""


class AdmissionError(HarnessError):
    pass


class DockerCallError(HarnessError):
    def __init__(self, message: str, *, ambiguous: bool = False):
        super().__init__(message)
        self.ambiguous = ambiguous


class LifecycleError(HarnessError):
    pass


class OwnershipError(LifecycleError):
    pass


class ResultError(HarnessError):
    pass


@dataclass(frozen=True)
class Qualification:
    image: str
    uid: int
    gid: int
    data_path: str
    socket_path: str


def validate_qualification(value: Any) -> Qualification:
    """Validate the strict v1 PG-image/identity/path qualification document."""
    if not isinstance(value, dict) or set(value) != QUALIFICATION_KEYS:
        raise AdmissionError("qualification has an invalid schema")
    if type(value.get("version")) is not int or value["version"] != 1 or value.get("image") != POSTGRES_IMAGE:
        raise AdmissionError("qualification version or pinned image mismatch")
    uid, gid = value.get("uid"), value.get("gid")
    if type(uid) is not int or type(gid) is not int or not 0 < uid <= 2147483647 or not 0 < gid <= 2147483647:
        raise AdmissionError("qualification requires observed nonzero numeric UID/GID")
    if value.get("dataPath") != "/var/lib/postgresql/data":
        raise AdmissionError("qualification dataPath mismatch")
    if value.get("socketPath") != "/var/run/postgresql":
        raise AdmissionError("qualification socketPath mismatch")
    return Qualification(value["image"], uid, gid, value["dataPath"], value["socketPath"])


def make_payload(run_id: str, deadline_at_ms: int, rng: Any) -> dict[str, Any]:
    """Create the exact L4 payload; synthetic secrets are generated only on call."""
    if not RUN_ID.fullmatch(run_id) or type(deadline_at_ms) is not int or deadline_at_ms <= 0:
        raise AdmissionError("invalid run identity or deadline")
    secret_names = ("bootstrapPassword", "migrationPassword", "applicationPassword", "observerPassword", "csrfKey", "currentPassword", "newPassword")
    raw = [rng.token_bytes(32) for _ in secret_names]
    if any(not isinstance(item, bytes) or len(item) != 32 for item in raw) or len(set(raw)) != len(raw):
        raise AdmissionError("RNG failed to provide distinct 256-bit secrets")
    values = {name: (base64.urlsafe_b64encode(item).decode("ascii").rstrip("=") if name == "csrfKey" else item.hex()) for name, item in zip(secret_names, raw)}
    return {
        "version": 1,
        "runId": run_id,
        "deadlineAt": deadline_at_ms,
        "database": {
            "host": "h1-pg-" + run_id,
            "port": 5432,
            "name": "h1_db_" + run_id,
            "bootstrapRole": "h1_bootstrap_" + run_id,
            "migrationRole": "h1_migration_" + run_id,
            "applicationRole": "h1_app_" + run_id,
            "observerRole": "h1_observer_" + run_id,
        },
        "secrets": values,
    }


def validate_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) != {"version", "runId", "deadlineAt", "database", "secrets"}:
        raise AdmissionError("payload schema mismatch")
    run_id = payload.get("runId")
    if type(payload.get("version")) is not int or payload["version"] != 1 or not isinstance(run_id, str) or not RUN_ID.fullmatch(run_id):
        raise AdmissionError("payload identity mismatch")
    if type(payload.get("deadlineAt")) is not int or payload["deadlineAt"] <= 0:
        raise AdmissionError("payload deadline invalid")
    expected_db = {"host": "h1-pg-" + run_id, "port": 5432, "name": "h1_db_" + run_id, "bootstrapRole": "h1_bootstrap_" + run_id, "migrationRole": "h1_migration_" + run_id, "applicationRole": "h1_app_" + run_id, "observerRole": "h1_observer_" + run_id}
    if payload.get("database") != expected_db:
        raise AdmissionError("payload database identity mismatch")
    secrets_map = payload.get("secrets")
    expected_keys = {"bootstrapPassword", "migrationPassword", "applicationPassword", "observerPassword", "csrfKey", "currentPassword", "newPassword"}
    if not isinstance(secrets_map, dict) or set(secrets_map) != expected_keys:
        raise AdmissionError("payload secret schema mismatch")
    values = list(secrets_map.values())
    if any(not isinstance(v, str) for v in values) or len(set(values)) != len(values):
        raise AdmissionError("payload secrets must be distinct strings")
    for key, value in secrets_map.items():
        if key == "csrfKey":
            try:
                decoded = base64.urlsafe_b64decode(value + "=")
            except Exception as exc:
                raise AdmissionError("payload CSRF key encoding invalid") from exc
            if len(value) != 43 or base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=") != value:
                raise AdmissionError("payload CSRF key encoding invalid")
        elif not HEX64.fullmatch(value):
            raise AdmissionError("payload password encoding invalid")
    return payload


def encode_stdin_request(archive: bytes, payload: dict[str, Any]) -> bytes:
    if not isinstance(archive, bytes) or not archive or len(archive) > 48 * 1024 * 1024:
        raise AdmissionError("archive size is invalid")
    validate_payload(payload)
    encoded = json.dumps({"archiveBase64": base64.b64encode(archive).decode("ascii"), "payload": payload}, separators=(",", ":")).encode("utf-8")
    if len(encoded) > 64 * 1024 * 1024:
        raise AdmissionError("stdin request exceeds bound")
    return encoded


def _within(root: pathlib.Path, target: pathlib.Path) -> bool:
    try:
        target.relative_to(root)
        return True
    except ValueError:
        return False


def strict_json(raw: str | bytes) -> Any:
    """Reject duplicate object keys and non-JSON numeric constants."""
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = value
        return result

    def invalid_constant(_value):
        raise ValueError("non-JSON constant")
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid_constant)


def archive_path_allowed(name: str) -> bool:
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_./-]+", name):
        return False
    parts = name.split("/")
    if any(part in ("", ".", "..", "generated", "dist", "node_modules", "test", "tests", "__tests__") or part.startswith(".") for part in parts):
        return False
    if name in REQUIRED_INPUTS or name in OPTIONAL_INPUTS:
        return True
    return name.startswith("backend/src/") and name.endswith((".ts", ".json")) and not name.endswith((".spec.ts", ".test.ts"))


class HostFilesystem:
    """Project-confined, no-follow reads and exclusive private audit writes."""
    def __init__(self, root: str | None = None):
        self.root = pathlib.Path(root or pathlib.Path(__file__).resolve().parents[2]).resolve(strict=True)

    @contextmanager
    def _parent(self, path: str, *, create: bool = False):
        target = pathlib.Path(os.path.abspath(path))
        if not _within(self.root, target) or target == self.root:
            raise AdmissionError("filesystem path outside project")
        parts = target.relative_to(self.root).parts
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        descriptors = [os.open(str(self.root), flags)]
        try:
            for part in parts[:-1]:
                created = False
                if create:
                    try:
                        os.mkdir(part, mode=0o700, dir_fd=descriptors[-1])
                        created = True
                    except FileExistsError:
                        pass
                parent = descriptors[-1]
                descriptors.append(os.open(part, flags, dir_fd=parent))
                if created:
                    # Persist both the new inode and its link in the parent chain.
                    os.fsync(descriptors[-1])
                    os.fsync(parent)
            yield descriptors[-1], parts[-1]
        finally:
            for descriptor in reversed(descriptors):
                os.close(descriptor)

    def read_bytes(self, path: str) -> bytes:
        with self._parent(path) as (parent, name):
            descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent)
        with os.fdopen(descriptor, "rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > MAX_FILE:
                raise AdmissionError("input is not a bounded single-link regular file")
            data = stream.read(MAX_FILE + 1)
            after = os.fstat(stream.fileno())
        if len(data) > MAX_FILE or (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns):
            raise AdmissionError("input changed or exceeded its bound")
        return data

    def is_symlink(self, path: str) -> bool:
        return pathlib.Path(path).is_symlink()

    def is_file(self, path: str) -> bool:
        return pathlib.Path(path).is_file()

    def reserve_run(self, root: str, run_id: str) -> None:
        if pathlib.Path(root) != self.root or not RUN_ID.fullmatch(run_id):
            raise AdmissionError("invalid audit namespace")
        target = str(self.root / "odd/probes/h1-real-e2e" / run_id)
        with self._parent(target, create=True) as (parent, name):
            os.mkdir(name, mode=0o700, dir_fd=parent)
            descriptor = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            try:
                os.fsync(descriptor)
                os.fsync(parent)
            finally:
                os.close(descriptor)

    def write_private(self, path: str, data: bytes) -> None:
        with self._parent(path) as (parent, name):
            descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent)
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.fsync(parent)

    def collect_sources(self, root: str) -> dict[str, bytes]:
        if pathlib.Path(root).resolve(strict=True) != self.root:
            raise AdmissionError("source root mismatch")
        result = {}
        source = self.root / "backend/src"
        excluded = {"generated", "dist", "node_modules", "coverage", "test", "tests", "__tests__"}
        if (self.root / "backend").is_symlink() or source.is_symlink() or not source.is_dir():
            raise AdmissionError("authored source root is redirected or missing")
        for current, dirs, files in os.walk(source, topdown=True, followlinks=False):
            # Prune generated/dependency/recovery trees BEFORE inspecting children.
            dirs[:] = sorted(d for d in dirs if d not in excluded and not d.startswith("."))
            for dirname in dirs:
                if (pathlib.Path(current) / dirname).is_symlink():
                    raise AdmissionError("authored source directory is redirected")
            for filename in sorted(files):
                item = pathlib.Path(current) / filename
                relative = item.relative_to(self.root).as_posix()
                if archive_path_allowed(relative):
                    result[relative] = self.read_bytes(str(item))
                    if len(result) > 1024 or sum(map(len, result.values())) > MAX_ARCHIVE:
                        raise AdmissionError("authored inputs exceed bound")
        for relative in sorted(REQUIRED_INPUTS | OPTIONAL_INPUTS):
            target = self.root / relative
            if relative in OPTIONAL_INPUTS and not target.exists() and not target.is_symlink():
                continue
            result[relative] = self.read_bytes(str(target))
        spec = self.read_bytes(str(self.root / SPEC_RELATIVE))
        if hashlib.sha256(result[SERVICE_RELATIVE]).hexdigest() != SERVICE_SHA256 or result[SERVICE_RELATIVE].count(b"\n") != 380:
            raise AdmissionError("frozen service mismatch")
        if hashlib.sha256(spec).hexdigest() != SPEC_SHA256 or spec.count(b"\n") != 1748:
            raise AdmissionError("frozen specification mismatch")
        engine_mode = (self.root / ENGINE_RELATIVE).lstat().st_mode & 0o777
        if engine_mode != 0o600 or len(result[ENGINE_RELATIVE]) != 23183632 or hashlib.sha256(result[ENGINE_RELATIVE]).hexdigest() != ENGINE_SHA256:
            raise AdmissionError("frozen host engine mismatch")
        for name, expected in RESOURCE_HASHES.items():
            if hashlib.sha256(result["backend/resources/auth/" + name]).hexdigest() != expected:
                raise AdmissionError("canonical resource mismatch")
        return result


def collect_build_archive(filesystem: Any, root: str) -> bytes:
    """Pack only regular authored byte inputs; no host generated outputs."""
    entries = filesystem.collect_sources(root)
    if not isinstance(entries, dict) or not REQUIRED_INPUTS.issubset(entries) or len(entries) > 1024:
        raise AdmissionError("required build inputs are missing")
    if any(not archive_path_allowed(name) or not isinstance(value, bytes) or len(value) > MAX_FILE for name, value in entries.items()):
        raise AdmissionError("unsafe archive entry")
    if sum(map(len, entries.values())) > MAX_ARCHIVE:
        raise AdmissionError("archive contents exceed bound")
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name in sorted(entries):
            info = tarfile.TarInfo(name)
            info.size, info.mode, info.mtime = len(entries[name]), 0o600, 0
            info.uid = info.gid = 0
            archive.addfile(info, io.BytesIO(entries[name]))
    result = buffer.getvalue()
    if len(result) > MAX_ARCHIVE:
        raise AdmissionError("archive exceeds bound")
    return result


def verify_frozen_inputs(filesystem: Any, *, service_path: str, engine_path: str, service_sha256: str, engine_sha256: str, engine_mode: int) -> None:
    if engine_mode & 0o111:
        raise AdmissionError("host engine must remain non-executable")
    if hashlib.sha256(filesystem.read_bytes(service_path)).hexdigest() != service_sha256:
        raise AdmissionError("frozen service hash mismatch")
    if hashlib.sha256(filesystem.read_bytes(engine_path)).hexdigest() != engine_sha256:
        raise AdmissionError("frozen engine hash mismatch")


def container_invocation(container_id: str, secrets_map: Mapping[str, str]) -> tuple[list[str], dict[str, str]]:
    if not HEX64.fullmatch(container_id):
        raise AdmissionError("container id must be immutable full ID")
    if any(not isinstance(k, str) or not isinstance(v, str) for k, v in secrets_map.items()):
        raise AdmissionError("invalid synthetic secret values")
    argv = [DOCKER, "--config", DOCKER_CONFIG, "--host", DOCKER_SOCKET, "exec", "-i", container_id, "node", "-e", BOOTSTRAP_SOURCE]
    env = {"PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "LC_ALL": "C"}
    return argv, env


# Fixed programs only: stdin never selects commands, paths, or source text.
PG_BOOTSTRAP_SOURCE = r'''
set -euo pipefail
umask 077
IFS= read -r run_id
IFS= read -r password
[[ "$run_id" =~ ^[0-9a-f]{32}$ && "$password" =~ ^[0-9a-f]{64}$ ]]
if IFS= read -r extra; then exit 1; fi
bin=/usr/lib/postgresql/17/bin
data=/var/lib/postgresql/data
socket=/var/run/postgresql
role="h1_bootstrap_$run_id"
database="h1_db_$run_id"
for tool in initdb pg_ctl createdb; do test -x "$bin/$tool"; done
test ! -e "$data/PG_VERSION"
set -o noclobber
printf '%s\n' "$password" > /tmp/h1-bootstrap.pw
printf '*:5432:*:%s:%s\n' "$role" "$password" > /tmp/h1-bootstrap.pgpass
unset password
"$bin/initdb" -D "$data" --username="$role" --pwfile=/tmp/h1-bootstrap.pw \
    --auth-local=scram-sha-256 --auth-host=scram-sha-256 --no-locale --encoding=UTF8 >/dev/null 2>&1
# Only this run's database/roles on directly connected, owner-verified internal networks.
printf 'host %s %s samenet scram-sha-256\n' "$database" \
    "$role,h1_migration_$run_id,h1_app_$run_id,h1_observer_$run_id" >> "$data/pg_hba.conf"
"$bin/pg_ctl" -D "$data" -l /tmp/h1-postgres.log -w -t 8 \
    -o "-h '*' -p 5432 -k $socket" start >/dev/null 2>&1
PGPASSFILE=/tmp/h1-bootstrap.pgpass "$bin/createdb" \
    -h 127.0.0.1 -p 5432 -U "$role" "$database" >/dev/null 2>&1
'''

BOOTSTRAP_SOURCE = r'''
"use strict";
const fs = require("node:fs"), path = require("node:path");
const crypto = require("node:crypto"), cp = require("node:child_process");
const { pathToFileURL } = require("node:url");
const ROOT = "/tmp/http-work", MAX = 48 * 1024 * 1024;
const ENGINE = "odd/checks/prisma-engine/0edf323efd1d98336f3f0a68684b56f689b900d3/linux-musl-arm64-openssl-3.0.x/schema-engine";
const SERVICE = "backend/src/auth/change-password.service.ts";
const FIXED = [
  SERVICE, ENGINE, "backend/package.json", "backend/package-lock.json",
  "backend/tsconfig.json", "backend/tsconfig.build.json", "backend/prisma.schema.config.ts",
  "backend/prisma/schema.prisma", "backend/prisma.h1-e2e.config.ts",
  "backend/scripts/h1-real-e2e.mjs", "backend/scripts/h1-product-e2e.mjs", "backend/scripts/copy-auth-resources.mjs",
  "backend/scripts/copy-auth-resources-cli.mjs",
  "backend/prisma/migrations/20261009000100_h1_admin_user/migration.sql",
  "backend/prisma/migrations/20261009000200_h1_auth_context/migration.sql",
  "backend/prisma/migrations/20261009000300_h1_admin_audit/migration.sql",
  "backend/resources/auth/password-blocklist.bin",
  "backend/resources/auth/password-blocklist.manifest.json",
  "backend/resources/auth/LICENSE.pwdb.txt", "backend/resources/auth/LICENSE.seclists.txt",
];
const HASHES = {
  [SERVICE]: "3077ee4f0a6d2706131c7feb9cbca69c0f0cf719ff5aaaaa22b5c8cb37d73038",
  [ENGINE]: "82b96b51b53e642393dc0cc6ecf6dd06324d367505e8f8a4cb28b7c5ca4052ff",
  "backend/resources/auth/password-blocklist.bin": "7a85af89d0f800cc94cbe81ad5a11de7590da24a5ed33c6a5bc5e7f0abea1eb0",
  "backend/resources/auth/password-blocklist.manifest.json": "581027ae246da0bacf0d71a65a35edad5a20a71c5fcfe2d810513b128bfdb510",
  "backend/resources/auth/LICENSE.pwdb.txt": "4088d581cba171b1aa6f880ad3fb5327e2d6de415621cf8b80685ac506c0cae1",
  "backend/resources/auth/LICENSE.seclists.txt": "3dbdc93d5f8829de0941744841730a09c106d0732e5ae0e98ca1d77be7ded66c",
};
const publish = process.stdout.write.bind(process.stdout);
const publishDiagnostic = process.stderr.write.bind(process.stderr);
const remoteOrigin = process.hrtime.bigint();
const diagnosticStages = new Set(["stdin", "archive", "integrity", "prisma_generate", "typescript_build", "resources_copy", "fixture_import", "fixture_run", "postgres_ready", "roles", "migrate", "runtime_grants", "seed", "application_start", "auth_checks", "admin_checks", "docker_exec"]);
const diagnosticErrors = new Set(["RUNTIME_ERROR", "BUILD_FAILED", "DEADLINE", "PROTOCOL_ERROR"]);
const pgErrorCategories = new Set(["DNS_FAILURE", "CONNECTION_REFUSED", "CONNECTION_TIMEOUT", "AUTH_REJECTED", "DATABASE_MISSING", "SERVER_NOT_READY", "UNKNOWN"]);
const diagnosticChecks = new Set(["migration.scope", "roles.scope", "seed.argon2", "http.csrf",
  "http.login.first", "http.login.second", "http.reject.noop", "http.rollback.atomic",
  "http.changePassword", "database.password.version", "database.session.rotation",
  "database.oldSessionRevocation", "database.expirations.preserved", "http.oldPassword.rejected",
  "http.newPassword.accepted", "auth.csrf", "auth.login", "auth.me", "auth.logout",
  "auth.change-password", "admin.list", "admin.create", "admin.patch", "admin.reset-password"]);
function emitStage(stage, phase, errorClass, pgErrorCategory) {
  if (typeof stage !== "string" || !(diagnosticStages.has(stage) ||
      (stage.startsWith("check.") && diagnosticChecks.has(stage.slice(6))))) return;
  if (typeof phase !== "string" || !["start", "end", "error"].includes(phase) ||
      (phase === "error" ? (typeof errorClass !== "string" || !diagnosticErrors.has(errorClass)) : errorClass !== undefined)) return;
  if (pgErrorCategory !== undefined && (stage !== "postgres_ready" || phase !== "error" ||
      errorClass !== "RUNTIME_ERROR" || !pgErrorCategories.has(pgErrorCategory))) return;
  const frame = {version: 1, event: "stage", clock: "remote", stage, phase,
    elapsedMs: Math.max(0, Math.min(65000, Number((process.hrtime.bigint() - remoteOrigin) / 1000000n)))};
  if (phase === "error") frame.errorClass = errorClass;
  if (pgErrorCategory !== undefined) frame.pgErrorCategory = pgErrorCategory;
  try { publishDiagnostic("H1_DIAG_V1 " + JSON.stringify(frame) + "\n"); } catch {}
}
function silence(_chunk, encoding, callback) {
  const done = typeof encoding === "function" ? encoding : callback;
  if (typeof done === "function") queueMicrotask(done);
  return true;
};
process.stdout.write = silence;
process.stderr.write = silence;
function reject() { throw Error("H1 bootstrap failed"); }
function exact(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}
function allowed(name) {
  const parts = name.split("/");
  if (!/^[A-Za-z0-9_./-]+$/.test(name) ||
      parts.some(p => !p || p === "." || p === ".." || p.startsWith(".") ||
        ["generated", "dist", "node_modules", "test", "tests", "__tests__"].includes(p))) return false;
  return FIXED.includes(name) || name === "backend/prisma/migrations/migration_lock.toml" ||
    (name.startsWith("backend/src/") && /\.(ts|json)$/.test(name) && !/\.(spec|test)\.ts$/.test(name));
}
function field(block, start, end) {
  const bytes = block.subarray(start, end);
  const nul = bytes.indexOf(0);
  const value = bytes.subarray(0, nul === -1 ? bytes.length : nul).toString("ascii");
  if ([...bytes].some(b => b > 127)) reject();
  return value;
}
function octal(value) {
  const text = value.replace(/\0/g, "").trim();
  if (!/^[0-7]+$/.test(text)) reject();
  const result = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(result)) reject();
  return result;
}
function unpack(bytes) {
  let offset = 0, count = 0, ended = false;
  const seen = new Set();
  fs.mkdirSync(ROOT, { mode: 0o700 });
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(b => b === 0)) {
      if (bytes.length - offset < 1024 || bytes.subarray(offset).some(b => b !== 0)) reject();
      ended = true; break;
    }
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    if (checksum !== octal(field(header, 148, 156)) || field(header, 257, 263) !== "ustar") reject();
    const prefix = field(header, 345, 500), leaf = field(header, 0, 100);
    const name = prefix ? prefix + "/" + leaf : leaf;
    const size = octal(field(header, 124, 136));
    if (![0, 48].includes(header[156]) || !allowed(name) || seen.has(name) ||
        size > 32 * 1024 * 1024 || ++count > 1024 || field(header, 157, 257)) reject();
    offset += 512;
    const next = offset + Math.ceil(size / 512) * 512;
    if (offset + size > bytes.length || next > bytes.length) reject();
    const target = path.join(ROOT, name);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, bytes.subarray(offset, offset + size), { mode: 0o600, flag: "wx" });
    seen.add(name); offset = next;
  }
  if (!ended || FIXED.some(name => !seen.has(name))) reject();
}
async function input() {
  emitStage("stdin", "start");
  const chunks = []; let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > 64 * 1024 * 1024) reject();
    chunks.push(chunk);
  }
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!exact(request, ["archiveBase64", "payload"]) || typeof request.archiveBase64 !== "string") reject();
  const bytes = Buffer.from(request.archiveBase64, "base64");
  if (!bytes.length || bytes.length > MAX || bytes.toString("base64") !== request.archiveBase64) reject();
  emitStage("stdin", "end");
  return { bytes, payload: request.payload };
}
function payloadValid(p) {
  if (!exact(p, ["version", "runId", "deadlineAt", "database", "secrets"]) ||
      p.version !== 1 || typeof p.runId !== "string" || !/^[0-9a-f]{32}$/.test(p.runId) ||
      !Number.isSafeInteger(p.deadlineAt) || p.deadlineAt <= Date.now()) reject();
  const id = p.runId;
  const expected = { host: "h1-pg-" + id, port: 5432, name: "h1_db_" + id,
    bootstrapRole: "h1_bootstrap_" + id, migrationRole: "h1_migration_" + id,
    applicationRole: "h1_app_" + id, observerRole: "h1_observer_" + id };
  if (!exact(p.database, Object.keys(expected)) || Object.entries(expected).some(([k, v]) => p.database[k] !== v)) reject();
  const keys = ["bootstrapPassword", "migrationPassword", "applicationPassword", "observerPassword", "csrfKey", "currentPassword", "newPassword"];
  if (!exact(p.secrets, keys) || new Set(Object.values(p.secrets)).size !== keys.length) reject();
  for (const key of keys) {
    const value = p.secrets[key];
    if (typeof value !== "string") reject();
    if (key === "csrfKey") {
      if (!/^[A-Za-z0-9_-]{43}$/.test(value) || Buffer.from(value, "base64url").length !== 32 ||
          Buffer.from(value, "base64url").toString("base64url") !== value) reject();
    } else if (!/^[0-9a-f]{64}$/.test(value)) reject();
  }
}
function hash(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
(async () => {
  let request;
  try { request = await input(); }
  catch { emitStage("stdin", "error", "PROTOCOL_ERROR"); throw Error("H1 bootstrap failed"); }
  payloadValid(request.payload);
  const timer = setTimeout(() => process.exit(124), Math.max(1, request.payload.deadlineAt - Date.now()));
  timer.unref();
  emitStage("archive", "start");
  try { unpack(request.bytes); emitStage("archive", "end"); }
  catch { emitStage("archive", "error", "PROTOCOL_ERROR"); throw Error("H1 bootstrap failed"); }
  emitStage("integrity", "start");
  const backend = path.join(ROOT, "backend"), engine = path.join(ROOT, ENGINE);
  try {
    for (const [name, expected] of Object.entries(HASHES)) if (hash(path.join(ROOT, name)) !== expected) reject();
    if (fs.lstatSync(engine).size !== 23183632) reject();
    emitStage("integrity", "end");
  } catch { emitStage("integrity", "error", "PROTOCOL_ERROR"); throw Error("H1 bootstrap failed"); }
  fs.chmodSync(engine, 0o500); // ONLY the freshly extracted copy, after rehash.
  const deps = "/deps/correction-1/node_modules";
  if (!fs.statSync(deps).isDirectory()) reject();
  fs.symlinkSync(deps, path.join(backend, "node_modules"), "dir");
  const env = { PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: "/tmp", NODE_ENV: "test", npm_config_offline: "true",
    npm_config_update_notifier: "false", PRISMA_SCHEMA_ENGINE_BINARY: engine };
  function build(args) {
    const remaining = request.payload.deadlineAt - Date.now();
    if (remaining <= 0) reject();
    const result = cp.spawnSync(process.execPath, args, { cwd: backend, env,
      stdio: ["ignore", "pipe", "pipe"], timeout: remaining,
      maxBuffer: 64 * 1024, killSignal: "SIGKILL" });
    if (result.error || result.signal || result.status !== 0) reject();
  }
  for (const [stage, args] of [["prisma_generate", [path.join(deps, "prisma/build/index.js"), "generate", "--config", "prisma.schema.config.ts"]],
       ["typescript_build", [path.join(deps, "typescript/bin/tsc"), "-p", "tsconfig.build.json"]],
       ["resources_copy", [path.join(backend, "scripts/copy-auth-resources-cli.mjs")]]]) {
    emitStage(stage, "start");
    try { build(args); emitStage(stage, "end"); }
    catch { emitStage(stage, "error", "BUILD_FAILED"); throw Error("H1 bootstrap failed"); }
  }
  const artifacts = ["src/generated/prisma/client.ts", "dist/generated/prisma/client.js",
    "dist/main.js", "dist/auth/password-blocklist.js"];
  for (const name of ["password-blocklist.bin", "password-blocklist.manifest.json", "LICENSE.pwdb.txt", "LICENSE.seclists.txt"]) {
    const source = path.join(backend, "resources/auth", name);
    const target = path.join(backend, "dist/resources/auth", name);
    if (!fs.readFileSync(source).equals(fs.readFileSync(target))) reject();
    artifacts.push("dist/resources/auth/" + name);
  }
  for (const name of artifacts) {
    const info = fs.lstatSync(path.join(backend, name));
    if (!info.isFile() || info.isSymbolicLink() || !info.size) reject();
  }
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  emitStage("fixture_import", "start");
  let fixture;
  try { fixture = await import(pathToFileURL(path.join(backend, "scripts/h1-real-e2e.mjs")).href); emitStage("fixture_import", "end"); }
  catch { emitStage("fixture_import", "error", "RUNTIME_ERROR"); throw Error("H1 bootstrap failed"); }
  if (typeof fixture.runRealE2E !== "function" || Date.now() >= request.payload.deadlineAt) reject();
  emitStage("fixture_run", "start");
  let result;
  try { result = await fixture.runRealE2E(request.payload, emitStage); emitStage("fixture_run", "end"); }
  catch { emitStage("fixture_run", "error", "RUNTIME_ERROR"); throw Error("H1 bootstrap failed"); }
  publish("H1_REAL_E2E_RESULT=" + JSON.stringify(result) + "\n");
})().catch(() => { process.exitCode = 1; });
'''


def validate_result(value: Any, run_id: str, known_secrets: list[str]) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != RESULT_KEYS:
        raise ResultError("result schema is not exact")
    if type(value.get("version")) is not int or value["version"] != 1 or value.get("runId") != run_id or not RUN_ID.fullmatch(run_id):
        raise ResultError("result identity mismatch")
    checks = value.get("checks")
    if not isinstance(checks, list) or len(checks) > 64:
        raise ResultError("invalid result checks")
    names = set()
    for check in checks:
        if not isinstance(check, dict) or set(check) != {"name", "passed"}:
            raise ResultError("invalid result check schema")
        name = check["name"]
        if not isinstance(name, str) or name not in ALLOWED_CHECKS or name in names or type(check["passed"]) is not bool:
            raise ResultError("invalid result check value")
        names.add(name)
    if names != ALLOWED_CHECKS or tuple(check["name"] for check in checks) != CHECK_NAMES:
        raise ResultError("fixture result check IDs are not configured or complete")
    product_checks = value.get("productChecks")
    if not isinstance(product_checks, list) or len(product_checks) != len(PRODUCT_CHECK_NAMES):
        raise ResultError("invalid product result checks")
    product_names = set()
    for check in product_checks:
        if not isinstance(check, dict) or set(check) != {"name", "passed"}:
            raise ResultError("invalid product result check schema")
        name = check["name"]
        if not isinstance(name, str) or name not in ALLOWED_PRODUCT_CHECKS or name in product_names or type(check["passed"]) is not bool:
            raise ResultError("invalid product result check value")
        product_names.add(name)
    if product_names != ALLOWED_PRODUCT_CHECKS or tuple(check["name"] for check in product_checks) != PRODUCT_CHECK_NAMES:
        raise ResultError("product fixture check IDs are not configured or complete")
    if type(value.get("productPassed")) is not bool or value["productPassed"] != all(c["passed"] for c in product_checks):
        raise ResultError("product result aggregate mismatch")
    expected_passed = all(c["passed"] for c in checks) and value["productPassed"]
    if type(value.get("passed")) is not bool or value["passed"] != expected_passed:
        raise ResultError("result aggregate mismatch")
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"))
    if any(secret and secret in encoded for secret in known_secrets):
        raise ResultError("result contains a known synthetic secret")
    return value


def parse_result_output(raw: bytes, run_id: str, known_secrets: list[str]) -> dict[str, Any]:
    """Accept exactly one bounded result marker; never surface child diagnostics."""
    if not isinstance(raw, bytes) or len(raw) > 16 * 1024:
        raise ResultError("child output exceeds result bound")
    try:
        text = raw.decode("utf-8", "strict")
    except UnicodeDecodeError as exc:
        raise ResultError("child result is not UTF-8") from exc
    prefix = "H1_REAL_E2E_RESULT="
    lines = text.splitlines()
    markers = [line[len(prefix):] for line in lines if line.startswith(prefix)]
    if len(markers) != 1 or len(lines) != 1 or not markers[0]:
        raise ResultError("child output is not exactly one result marker")
    try:
        result = strict_json(markers[0])
    except (ValueError, TypeError) as exc:
        raise ResultError("child result JSON is invalid") from exc
    return validate_result(result, run_id, known_secrets)


class DiagnosticFrameCollector:
    """Incrementally admit only bounded, exact remote diagnostic JSONL frames."""
    def __init__(self, emit: Callable[[dict[str, Any]], None]):
        self.emit = emit
        self.partial = bytearray()
        self.discarding = False
        self.last_elapsed: int | None = None
        self.accepted = 0

    def feed(self, chunk: bytes) -> None:
        for byte in chunk:
            if byte == 10:
                if not self.discarding:
                    self._line(bytes(self.partial))
                self.partial.clear()
                self.discarding = False
            elif not self.discarding:
                if len(self.partial) + 1 >= MAX_DIAGNOSTIC_FRAME:
                    self.partial.clear()
                    self.discarding = True
                else:
                    self.partial.append(byte)

    def finish(self) -> None:
        # A truncated frame is never accepted, and raw content is discarded.
        self.partial.clear()

    def _line(self, line: bytes) -> None:
        if line.startswith(b"\x00") or not line.startswith(DIAGNOSTIC_PREFIX) or len(line) + 1 > MAX_DIAGNOSTIC_FRAME:
            return
        try:
            value = strict_json(line[len(DIAGNOSTIC_PREFIX):])
        except (ValueError, TypeError):
            return
        required = {"version", "event", "clock", "stage", "phase", "elapsedMs"}
        if not isinstance(value, dict) or not required.issubset(value) or set(value) - (required | {"errorClass", "pgErrorCategory"}):
            return
        stage = value.get("stage")
        allowed = isinstance(stage, str) and (stage in DIAGNOSTIC_STAGES or
                  any(stage == "check." + name for name in CHECK_NAMES + PRODUCT_CHECK_NAMES))
        elapsed = value.get("elapsedMs")
        if type(value.get("version")) is not int or value.get("version") != 1 or type(value.get("event")) is not str or value.get("event") != "stage" or \
                type(value.get("clock")) is not str or value.get("clock") != "remote" or not allowed or \
                type(value.get("phase")) is not str or value.get("phase") not in ("start", "end", "error") or \
                type(elapsed) is not int or not 0 <= elapsed <= 65000:
            return
        if value["phase"] == "error":
            error_class = value.get("errorClass")
            if "errorClass" not in value or type(error_class) is not str or error_class not in DIAGNOSTIC_ERRORS:
                return
        elif "errorClass" in value:
            return
        if "pgErrorCategory" in value:
            category = value["pgErrorCategory"]
            if (value["clock"] != "remote" or stage != "postgres_ready" or value["phase"] != "error" or
                    value.get("errorClass") != "RUNTIME_ERROR" or type(category) is not str or category not in PG_ERROR_CATEGORIES):
                return
        if self.accepted >= MAX_DIAGNOSTIC_EVENTS or (self.last_elapsed is not None and elapsed < self.last_elapsed):
            return
        record = {"event": "diagnostic_stage", "clock": "remote", "stage": stage,
                  "phase": value["phase"], "elapsedMs": elapsed}
        if "errorClass" in value:
            record["errorClass"] = value["errorClass"]
        if "pgErrorCategory" in value:
            record["pgErrorCategory"] = value["pgErrorCategory"]
        self.emit(record)
        self.accepted += 1
        self.last_elapsed = elapsed


class DockerCLI:
    """Bounded pipes and selected daemon metadata; no raw diagnostics escape."""
    def __init__(self, clock: Any, deadline: float, record_private: Callable[[dict[str, Any]], None], *, isolated_client: bool = True):
        self.clock, self.deadline, self.record_private = clock, deadline, record_private
        self.dependency_identity = None
        self.isolated_client = isolated_client
        self.diagnostic_count = 0

    def set_deadline(self, deadline: float) -> None:
        self.deadline = deadline

    def _emit_diagnostic(self, record: dict[str, Any]) -> None:
        if self.diagnostic_count >= MAX_DIAGNOSTIC_EVENTS:
            return
        self.record_private(record)
        self.diagnostic_count += 1

    def _call(self, args: list[str], *, stdin: bytes | None = None, timeout: float | None = None) -> bytes:
        diagnostic = len(args) >= 4 and args[0] == "exec" and BOOTSTRAP_SOURCE in args
        diagnostic_started = self.clock.monotonic()
        def emit_host(phase: str, error_class: str | None = None) -> None:
            elapsed = max(0, min(65000, int((self.clock.monotonic() - diagnostic_started) * 1000)))
            record = {"event": "diagnostic_stage", "clock": "host", "stage": "docker_exec",
                      "phase": phase, "elapsedMs": elapsed}
            if error_class is not None:
                record["errorClass"] = error_class
            self._emit_diagnostic(record)
        remote = DiagnosticFrameCollector(self._emit_diagnostic) if diagnostic else None
        if diagnostic:
            emit_host("start")
        budget = self.deadline - self.clock.monotonic()
        if timeout is not None:
            budget = min(budget, timeout)
        if budget <= 0:
            if diagnostic:
                emit_host("error", "DEADLINE")
            raise TimeoutError("lifecycle deadline elapsed")
        if stdin is not None and (not isinstance(stdin, bytes) or len(stdin) > 64 * 1024 * 1024):
            if diagnostic:
                emit_host("error", "PROTOCOL_ERROR")
            raise AdmissionError("stdin bound exceeded")
        until = self.clock.monotonic() + budget
        command = [DOCKER, "--config", DOCKER_CONFIG, "--host", DOCKER_SOCKET] + args
        proc = None
        captured = {"stdout": bytearray(), "stderr": bytearray()}
        selector = selectors.DefaultSelector()
        try:
            proc = subprocess.Popen(command, stdin=subprocess.PIPE if stdin is not None else subprocess.DEVNULL,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0, start_new_session=self.isolated_client,
                                    env={"PATH": "/usr/local/bin:/usr/bin:/bin", "LC_ALL": "C"})
            for channel in ("stdout", "stderr"):
                stream = getattr(proc, channel)
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, selectors.EVENT_READ, channel)
            sent = 0
            if stdin:
                os.set_blocking(proc.stdin.fileno(), False)
                selector.register(proc.stdin, selectors.EVENT_WRITE, "stdin")
            elif proc.stdin is not None:
                proc.stdin.close()
            while selector.get_map():
                remaining = until - self.clock.monotonic()
                if remaining <= 0:
                    raise TimeoutError("Docker operation timed out")
                for key, _mask in selector.select(min(0.1, remaining)):
                    stream, channel = key.fileobj, key.data
                    try:
                        if channel == "stdin":
                            sent += os.write(stream.fileno(), memoryview(stdin)[sent:sent + 65536])
                            if sent == len(stdin):
                                selector.unregister(stream)
                                stream.close()
                        else:
                            chunk = os.read(stream.fileno(), 16384)
                            if not chunk:
                                selector.unregister(stream)
                                stream.close()
                            else:
                                captured[channel].extend(chunk)
                                if channel == "stderr" and remote is not None:
                                    remote.feed(chunk)
                                if len(captured[channel]) > MAX_OUTPUT:
                                    raise DockerCallError("Docker stream bound exceeded", ambiguous=True)
                    except BlockingIOError:
                        continue
                    except BrokenPipeError:
                        raise DockerCallError("Docker stdin was not consumed", ambiguous=True) from None
            remaining = until - self.clock.monotonic()
            if remaining <= 0:
                raise TimeoutError("Docker operation timed out")
            try:
                code = proc.wait(timeout=remaining)
            except subprocess.TimeoutExpired:
                raise TimeoutError("Docker operation timed out") from None
            try:
                self.record_private({"event": "docker_call", "returncode": code,
                                     "stdoutBytes": len(captured["stdout"]), "stderrBytes": len(captured["stderr"])})
            except LifecycleError:
                # Controller has marked audit incomplete. Deliver any create ID
                # before its next checkpoint aborts work; cleanup must not lose it.
                pass
            if remote is not None:
                remote.finish()
            if code != 0 or (stdin is not None and sent != len(stdin)):
                raise DockerCallError("Docker operation failed", ambiguous=True)
            if diagnostic:
                emit_host("end")
            return bytes(captured["stdout"])
        except TimeoutError:
            if diagnostic:
                if remote is not None:
                    remote.finish()
                emit_host("error", "DEADLINE")
            raise
        except Exception:
            if diagnostic:
                if remote is not None:
                    remote.finish()
                emit_host("error", "RUNTIME_ERROR")
            raise
        finally:
            if remote is not None:
                remote.finish()
            selector.close()
            if proc is not None:
                if proc.poll() is None:
                    # Guarded clients share the worker's group for outer containment.
                    # Never kill that group here: it also contains this I/O worker.
                    try:
                        if self.isolated_client:
                            os.killpg(proc.pid, signal.SIGKILL)
                        else:
                            proc.kill()
                    except ProcessLookupError:
                        pass
                    try:
                        proc.wait(timeout=0)
                    except subprocess.TimeoutExpired:
                        pass
                    try:
                        self.record_private({"event": "client_terminated", "exitObserved": proc.poll() is not None})
                    except Exception:
                        pass
                for stream in (proc.stdin, proc.stdout, proc.stderr):
                    if stream is not None:
                        stream.close()

    def require_dependencies(self) -> None:
        fmt = '{"name":{{json .Name}},"driver":{{json .Driver}},"scope":{{json .Scope}},"options":{{json .Options}},"created":{{json .CreatedAt}}}'
        value = strict_json(self._call(["volume", "inspect", "--format", fmt, DEPENDENCY_VOLUME]))
        if not isinstance(value, dict) or value.get("name") != DEPENDENCY_VOLUME or value.get("driver") != "local" or value.get("scope") != "local" or value.get("options") not in (None, {}):
            raise AdmissionError("retained dependency volume unavailable")
        if not isinstance(value.get("created"), str) or len(value["created"]) > 64:
            raise AdmissionError("retained dependency metadata invalid")
        if self.dependency_identity is not None and value != self.dependency_identity:
            raise AdmissionError("retained dependency identity changed")
        self.dependency_identity = value

    def create(self, kind: str, name: str, image: str, labels: dict[str, str], config: dict[str, Any]) -> str:
        label_args = [part for key, value in sorted(labels.items()) for part in ("--label", key + "=" + value)]
        if kind == "network":
            args = ["network", "create", "--driver", "bridge", "--internal"] + label_args + [name]
        elif kind == "container" and image in (POSTGRES_IMAGE, APP_IMAGE):
            args = ["create", "--name", name, "--pull", "never", "--network", config["network"],
                    "--network-alias", config["alias"], "--user", config["user"], "--read-only",
                    "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
                    "--pids-limit", "128", "--memory", "512m", "--cpus", "1", "--log-driver", "none"]
            args += label_args
            for mount in config["tmpfs"]:
                args += ["--tmpfs", mount]
            if config.get("dependency"):
                args += ["--mount", "type=volume,source=" + DEPENDENCY_VOLUME + ",target=/deps,readonly,volume-nocopy"]
            args += ["--entrypoint", config["entrypoint"], image] + config["command"]
        else:
            raise AdmissionError("invalid resource kind or image")
        try:
            resource_id = self._call(args).decode("ascii", "strict").strip()
        except (UnicodeError, DockerCallError) as exc:
            raise DockerCallError("resource create outcome uncertain", ambiguous=True) from exc
        if not HEX64.fullmatch(resource_id):
            raise DockerCallError("invalid immutable create ID", ambiguous=True)
        return resource_id

    def inspect(self, resource_id: str, *, kind: str = "container") -> dict[str, Any] | None:
        if not HEX64.fullmatch(resource_id):
            raise OwnershipError("invalid immutable observation ID")
        if kind == "network":
            fields = {"id": ".Id", "name": ".Name", "members": ".Containers",
                      "internal": ".Internal", "driver": ".Driver"}
            label_source = ".Labels"
            args = ["network", "inspect"]
        elif kind == "container":
            fields = {"id": ".Id", "name": ".Name", "image": ".Image", "running": ".State.Running",
                      "user": ".Config.User", "entrypoint": ".Config.Entrypoint",
                      "readonly": ".HostConfig.ReadonlyRootfs", "privileged": ".HostConfig.Privileged",
                      "caps": ".HostConfig.CapDrop", "security": ".HostConfig.SecurityOpt",
                      "pids": ".HostConfig.PidsLimit", "memory": ".HostConfig.Memory",
                      "cpus": ".HostConfig.NanoCpus", "portBindings": ".HostConfig.PortBindings",
                      "publishAll": ".HostConfig.PublishAllPorts", "binds": ".HostConfig.Binds",
                      "tmpfs": ".HostConfig.Tmpfs", "mounts": ".Mounts",
                      "networkMode": ".HostConfig.NetworkMode", "networks": ".NetworkSettings.Networks",
                      "logDriver": ".HostConfig.LogConfig.Type"}
            label_source = ".Config.Labels"
            args = ["container", "inspect"]
        else:
            raise OwnershipError("invalid observation kind")
        fmt = "{" + ",".join(json.dumps(key) + ":{{json " + value + "}}" for key, value in fields.items())
        fmt += ',"labels":{"h1.e2e.run":{{json (index ' + label_source + ' "h1.e2e.run")}},"h1.e2e.unit":{{json (index ' + label_source + ' "h1.e2e.unit")}}}}'
        try:
            value = strict_json(self._call(args + ["--format", fmt, resource_id]))
            if not isinstance(value, dict):
                return None
            value["name"] = str(value.get("name", "")).lstrip("/")
            value["kind"] = kind
            if kind == "network":
                value["image"] = ""
                if not isinstance(value.get("members"), dict):
                    return None
                value["members"] = list(value["members"])
            return value
        except (DockerCallError, ValueError, TypeError, UnicodeError):
            return None

    def assert_isolated(self, resource_id: str, config: dict[str, Any], *, expected_running: bool) -> None:
        if type(expected_running) is not bool:
            raise OwnershipError("container stage expectation invalid")
        item = self.inspect(resource_id)
        if not item or item.get("user") != config["user"] or item.get("entrypoint") != [config["entrypoint"]]:
            raise OwnershipError("container identity configuration mismatch")
        if item.get("readonly") is not True or item.get("privileged") is not False or item.get("publishAll") is not False:
            raise OwnershipError("container isolation mismatch")
        security = item.get("security") or []
        if item.get("caps") != ["ALL"] or not any(s in security for s in ("no-new-privileges", "no-new-privileges=true")):
            raise OwnershipError("container capabilities mismatch")
        if (item.get("pids"), item.get("memory"), item.get("cpus")) != (128, 512 * 1024 * 1024, 1000000000):
            raise OwnershipError("container resource limit mismatch")
        if item.get("binds") or item.get("publishAll") or any((item.get("portBindings") or {}).values()):
            raise OwnershipError("unexpected host exposure")
        network_id = config.get("network")
        if not isinstance(network_id, str) or not HEX64.fullmatch(network_id) or \
                item.get("networkMode") != network_id or item.get("logDriver") != "none":
            raise OwnershipError("container network or logging mismatch")
        network_name = config.get("networkName")
        alias = config.get("alias")
        run_id = alias.removeprefix("h1-pg-") if isinstance(alias, str) and alias.startswith("h1-pg-") else \
            alias.removeprefix("h1-app-") if isinstance(alias, str) and alias.startswith("h1-app-") else ""
        if not re.fullmatch(r"[0-9a-f]{32}", run_id) or network_name != "h1-net-" + run_id:
            raise OwnershipError("expected owned network name mismatch")
        networks = item.get("networks")
        if not isinstance(networks, dict) or len(networks) != 1 or set(networks) != {network_name}:
            raise OwnershipError("unexpected attached network")
        observed_network = networks[network_name]
        if not isinstance(observed_network, dict) or item.get("running") is not expected_running:
            raise OwnershipError("container stage mismatch")
        observed_network_id = observed_network.get("NetworkID")
        if expected_running:
            if observed_network_id != network_id:
                raise OwnershipError("connected network identity mismatch")
        # Docker has not assigned a connected endpoint until start; only this exact
        # created stage may observe an empty NetworkID for the already named network.
        elif observed_network_id not in ("", network_id):
            raise OwnershipError("prestart network identity mismatch")
        expected_tmpfs = dict(mount.split(":", 1) for mount in config["tmpfs"])
        if item.get("tmpfs") != expected_tmpfs:
            raise OwnershipError("container tmpfs mismatch")
        mounts = item.get("mounts")
        if not isinstance(mounts, list):
            raise OwnershipError("container mount observation unavailable")
        volumes = [m for m in mounts if m.get("Type") == "volume"]
        if config.get("dependency"):
            if len(volumes) != 1 or volumes[0].get("Name") != DEPENDENCY_VOLUME or volumes[0].get("Destination") != "/deps" or volumes[0].get("RW") is not False:
                raise OwnershipError("read-only dependency mount mismatch")
        elif volumes:
            raise OwnershipError("unexpected volume")
        for mount in mounts:
            if mount.get("Type") == "volume" and config.get("dependency"):
                continue
            if mount.get("Type") != "tmpfs" or mount.get("Destination") not in expected_tmpfs:
                raise OwnershipError("unexpected mount")


    def start(self, resource_id: str) -> None:
        raw = self._call(["start", resource_id]).decode("ascii", "strict").strip()
        if raw != resource_id:
            raise DockerCallError("container start outcome uncertain", ambiguous=True)

    def execute(self, resource_id: str, program: str, stdin: bytes) -> bytes:
        if not HEX64.fullmatch(resource_id):
            raise OwnershipError("exec needs immutable ID")
        if program == BOOTSTRAP_SOURCE:
            command = ["node", "-e", BOOTSTRAP_SOURCE]
        elif program == PG_BOOTSTRAP_SOURCE:
            command = ["/bin/bash", "-ceu", PG_BOOTSTRAP_SOURCE]
        else:
            raise AdmissionError("unrecognized fixed program")
        return self._call(["exec", "-i", resource_id] + command, stdin=stdin)

    def stop(self, resource_id: str, timeout: int) -> None:
        raw = self._call(["stop", "--timeout", str(timeout), resource_id], timeout=timeout + 1).decode("ascii", "strict").strip()
        if raw != resource_id:
            raise DockerCallError("container stop outcome uncertain", ambiguous=True)

    def remove(self, resource_id: str, *, kind: str = "container") -> None:
        args = ["network", "rm", resource_id] if kind == "network" else ["rm", resource_id]
        raw = self._call(args).decode("ascii", "strict").strip()
        if raw != resource_id:
            raise DockerCallError("resource remove outcome uncertain", ambiguous=True)

    def network_members(self, resource_id: str) -> list[str]:
        item = self.inspect(resource_id, kind="network")
        if item is None:
            raise OwnershipError("network observation unavailable")
        return item["members"]


class LifecycleController:
    def __init__(self, *, docker: Any, filesystem: Any, clock: Any, rng: Any, project_root: str, output: Callable[[dict[str, Any]], None], started_at: float | None = None, event_sink: Callable[[dict[str, Any]], None] | None = None):
        self.docker, self.filesystem, self.clock, self.rng = docker, filesystem, clock, rng
        self.project_root = pathlib.Path(project_root).resolve()
        self.output = output
        self.started_at, self.event_sink = started_at, event_sink
        self.records: list[dict[str, Any]] = []
        self.owned: list[dict[str, Any]] = []
        self.run_id: str | None = None
        self.started: float | None = None
        self.deadline: float | None = None
        self.qualification: Qualification | None = None
        self.audit_ready = False
        self.audit_complete = True
        self.ambiguous_create = False
        self._attempted = False
        self._cleaning = False
        self.docker.record_private = self._transport_record

    def load_qualification(self, path: str) -> Qualification:
        candidate = pathlib.Path(path)
        if not candidate.is_absolute():
            candidate = self.project_root / candidate
        absolute = pathlib.Path(os.path.abspath(candidate))
        if not _within(self.project_root, absolute):
            raise AdmissionError("qualification must be inside the project")
        cursor = self.project_root
        for part in absolute.relative_to(self.project_root).parts:
            cursor = cursor / part
            if self.filesystem.is_symlink(str(cursor)):
                raise AdmissionError("qualification path contains a symlink")
        if not self.filesystem.is_file(str(absolute)):
            raise AdmissionError("qualification file is missing")
        try:
            raw = self.filesystem.read_bytes(str(absolute))
            if len(raw) > 4096:
                raise ValueError("qualification bound exceeded")
            parsed = strict_json(raw)
        except Exception as exc:
            raise AdmissionError("qualification JSON is invalid") from exc
        return validate_qualification(parsed)

    def _labels(self) -> dict[str, str]:
        return {"h1.e2e.run": self.run_id, "h1.e2e.unit": "real-e2e"}

    def _checkpoint(self) -> None:
        if self.audit_ready and not self.audit_complete and not self._cleaning:
            raise LifecycleError("durable audit was lost")
        if self.deadline is None or self.clock.monotonic() >= self.deadline:
            raise TimeoutError("work deadline elapsed")

    def _record(self, event: str, **fields: Any) -> None:
        record = {"version": 1, "runId": self.run_id, "sequence": len(self.records), "event": event, **fields}
        if len(self.records) >= 256:
            self.audit_complete = False
            raise LifecycleError("audit record bound exceeded")
        self.records.append(record)
        failed = False
        # Publish projected ownership hints BEFORE a filesystem operation can stall.
        # IPC and disk are attempted independently; neither substitutes for the other.
        if self.event_sink is not None:
            try:
                self.event_sink(record)
            except Exception:
                failed = True
        if self.audit_ready:
            try:
                self._persist_record()
            except Exception:
                failed = True
        if failed:
            self.audit_complete = False
            if not self._cleaning:
                raise LifecycleError("control record unavailable") from None

    def _transport_record(self, record: dict[str, Any]) -> None:
        # Only fixed nonsecret counters, never argv, stdin or raw diagnostics.
        event = record.get("event")
        if event == "docker_call":
            self._record(event, returncode=record["returncode"],
                         stdoutBytes=record["stdoutBytes"], stderrBytes=record["stderrBytes"])
        elif event == "client_terminated":
            self._record(event, exitObserved=bool(record["exitObserved"]))
        elif event == "diagnostic_stage":
            fields = {key: record[key] for key in ("clock", "stage", "phase", "elapsedMs", "errorClass", "pgErrorCategory") if key in record}
            self._record(event, **fields)
        else:
            raise LifecycleError("unrecognized transport record")

    def _persist_record(self, final: bool = False) -> None:
        if self.run_id is None or not self.records:
            return
        record = self.records[-1]
        target = self.project_root / "odd/probes/h1-real-e2e" / self.run_id / ("%03d.json" % record["sequence"])
        self.filesystem.write_private(str(target), json.dumps(record, sort_keys=True, separators=(",", ":")).encode())

    def create_owned(self, kind: str, name: str, image: str, run_id: str, config: dict[str, Any]) -> str:
        if not RUN_ID.fullmatch(run_id) or run_id != self.run_id:
            raise LifecycleError("run identity mismatch")
        self._checkpoint()
        labels = self._labels()
        self._record("create_intent", kind=kind, name=name, image=image)
        try:
            resource_id = self.docker.create(kind, name, image, labels, config)
        except Exception:
            self.ambiguous_create = True
            self._record("create_uncertain", kind=kind, name=name)
            raise LifecycleError("resource create outcome uncertain; no adoption") from None
        if not isinstance(resource_id, str) or not HEX64.fullmatch(resource_id):
            self.ambiguous_create = True
            self._record("create_invalid_id", kind=kind, name=name)
            raise LifecycleError("Docker did not return immutable ID")
        resource = {"id": resource_id, "kind": kind, "name": name, "image": image, "labels": labels}
        # Retain the ID in memory BEFORE any fallible audit or inspection.
        self.owned.append(resource)
        self._record("created", id=resource_id, kind=kind, name=name, image=image)
        self._checkpoint()
        self.inspect_owned(resource_id, kind, name, image, run_id)
        return resource_id

    def inspect_owned(self, resource_id: str, kind: str, name: str, image: str, run_id: str) -> dict[str, Any]:
        if not HEX64.fullmatch(resource_id) or run_id != self.run_id:
            raise OwnershipError("resource identity mismatch")
        actual = self.docker.inspect(resource_id, kind=kind)
        if not isinstance(actual, dict) or actual.get("kind") != kind or actual.get("id") != resource_id or actual.get("name") != name or actual.get("image") != image or actual.get("labels") != self._labels():
            raise OwnershipError("daemon ownership observation mismatch")
        return actual

    def _observe(self, resource: dict[str, Any]) -> dict[str, Any]:
        return self.inspect_owned(resource["id"], resource["kind"], resource["name"], resource["image"], self.run_id)

    def container_configs(self, network_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        q = self.qualification
        if q is None or self.run_id is None or not HEX64.fullmatch(network_id):
            raise AdmissionError("container configuration lacks qualified identity")
        pg_tmpfs = [
            q.data_path + ":rw,nosuid,nodev,noexec,size=256m,uid=%d,gid=%d,mode=0700" % (q.uid, q.gid),
            q.socket_path + ":rw,nosuid,nodev,noexec,size=16m,uid=%d,gid=%d,mode=0700" % (q.uid, q.gid),
            "/tmp:rw,nosuid,nodev,noexec,size=16m,uid=%d,gid=%d,mode=0700" % (q.uid, q.gid),
        ]
        network_name = "h1-net-" + self.run_id
        pg = {"network": network_id, "networkName": network_name, "alias": "h1-pg-" + self.run_id, "user": "%d:%d" % (q.uid, q.gid),
              "entrypoint": "/bin/bash", "command": ["-ceu", "exec sleep infinity"], "tmpfs": pg_tmpfs}
        app = {"network": network_id, "networkName": network_name, "alias": "h1-app-" + self.run_id, "user": "1000:1000",
               "entrypoint": "node",
               "command": ["-e", "process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)"],
               "tmpfs": ["/tmp:rw,nosuid,nodev,exec,size=128m,uid=1000,gid=1000,mode=0700"], "dependency": True}
        return pg, app

    def _start_owned(self, resource_id: str, config: dict[str, Any]) -> None:
        resource = next(r for r in self.owned if r["id"] == resource_id)
        self._checkpoint()
        self._observe(resource)
        self.docker.assert_isolated(resource_id, config, expected_running=False)
        self._record("start_intent", id=resource_id)
        self.docker.start(resource_id)
        actual = self._observe(resource)
        self.docker.assert_isolated(resource_id, config, expected_running=True)
        if actual.get("running") is not True:
            raise LifecycleError("daemon did not observe running container")
        self._record("started", id=resource_id)

    def cleanup_network(self, resource_id: str, name: str, run_id: str) -> bool:
        self.inspect_owned(resource_id, "network", name, "", run_id)
        members = self.docker.network_members(resource_id)
        if members:
            self._record("network_retained", id=resource_id, reason="attached_members")
            return False
        self.docker.remove(resource_id, kind="network")
        return True

    def cleanup_owned(self) -> bool:
        if self.started is None:
            return not self.owned and not self.ambiguous_create
        until = self.started + TOTAL_SECONDS
        self.docker.set_deadline(until)
        self._cleaning = True
        complete = not self.ambiguous_create
        try:
            self._record("cleanup_started")
            for resource in reversed(tuple(self.owned)):
                if resource.get("cleaned"):
                    continue
                remaining = until - self.clock.monotonic()
                if remaining <= 0:
                    self.audit_complete = False
                    complete = False
                    break
                try:
                    actual = self._observe(resource)
                    self._record("cleanup_intent", id=resource["id"], kind=resource["kind"])
                    if resource["kind"] == "container":
                        if actual.get("running") is True:
                            self.docker.stop(resource["id"], max(0, min(1, int(remaining))))
                        actual = self._observe(resource)
                        if actual.get("running") is not False:
                            raise OwnershipError("container termination not observed")
                        self.docker.remove(resource["id"])
                    else:
                        if not self.cleanup_network(resource["id"], resource["name"], self.run_id):
                            complete = False
                            continue
                    resource["cleaned"] = True
                    self._record("cleaned", id=resource["id"], kind=resource["kind"])
                except Exception:
                    complete = False
                    self._record("retained", id=resource["id"], kind=resource["kind"])
            return complete and all(r.get("cleaned") is True for r in self.owned)
        finally:
            self._cleaning = False

    def run(self, *, execute: bool, cleanup_owned: bool, qualification_path: str) -> dict[str, Any]:
        if execute is not True or cleanup_owned is not True:
            raise AdmissionError("both explicit accidental-execution flags are required")
        if self._attempted:
            raise AdmissionError("supervisor permits one attempt only")
        self._attempted = True
        self.started = self.clock.monotonic() if self.started_at is None else self.started_at
        self.deadline = self.started + WORK_SECONDS
        # Qualification and source admission precede randomness, audit writes and daemon calls.
        self.qualification = self.load_qualification(qualification_path)
        archive = collect_build_archive(self.filesystem, str(self.project_root))
        self._checkpoint()
        raw_id = self.rng.token_bytes(16)
        if not isinstance(raw_id, bytes) or len(raw_id) != 16:
            raise AdmissionError("invalid synthetic run identity")
        self.run_id = raw_id.hex()
        deadline_at = int((self.clock.time() + self.deadline - self.clock.monotonic()) * 1000)
        payload = make_payload(self.run_id, deadline_at, self.rng)
        request = encode_stdin_request(archive, payload)
        self.filesystem.reserve_run(str(self.project_root), self.run_id)
        self.audit_ready = True
        self.docker.set_deadline(self.deadline)
        result = None
        failure = None
        phase = "audit"
        clean = False
        try:
            self._record("run_started", qualifiedUid=self.qualification.uid, qualifiedGid=self.qualification.gid)
            phase = "dependencies"
            self._checkpoint()
            self.docker.require_dependencies()
            phase = "network"
            network = self.create_owned("network", "h1-net-" + self.run_id, "", self.run_id, {})
            observed_network = self._observe(self.owned[-1])
            if observed_network.get("internal") is not True or observed_network.get("driver") != "bridge" or observed_network.get("members"):
                raise OwnershipError("new network is not isolated and empty")
            pg_config, app_config = self.container_configs(network)
            phase = "postgres"
            pg = self.create_owned("container", "h1-pg-" + self.run_id, POSTGRES_IMAGE, self.run_id, pg_config)
            self._start_owned(pg, pg_config)
            self._checkpoint()
            self._record("postgres_bootstrap_intent", id=pg)
            pg_input = (self.run_id + "\n" + payload["secrets"]["bootstrapPassword"] + "\n").encode()
            self.docker.execute(pg, PG_BOOTSTRAP_SOURCE, pg_input)
            self._record("postgres_bootstrapped", id=pg)
            phase = "application"
            self.docker.require_dependencies()
            app = self.create_owned("container", "h1-app-" + self.run_id, APP_IMAGE, self.run_id, app_config)
            self.docker.require_dependencies()
            self._start_owned(app, app_config)
            self._checkpoint()
            phase = "fixture"
            self._record("fixture_intent", id=app)
            raw = self.docker.execute(app, BOOTSTRAP_SOURCE, request)
            self._checkpoint()
            result = parse_result_output(raw, self.run_id, list(payload["secrets"].values()))
            self._record("fixture_observed", passed=result["passed"])
            if result["passed"] is not True:
                failure = "fixture"
        except TimeoutError:
            failure = "deadline"
        except (KeyboardInterrupt, InterruptedError):
            failure = "interrupted"
        except Exception:
            failure = phase
        finally:
            clean = self.cleanup_owned()
            if failure is None and not clean:
                failure = "cleanup"
            self._cleaning = True
            try:
                if self.clock.monotonic() < self.started + TOTAL_SECONDS:
                    self._record("run_finished", cleanupComplete=clean, fixtureObserved=result is not None,
                                 fixturePassed=bool(result and result["passed"]), failure=failure)
                else:
                    self.audit_complete = False
            finally:
                self._cleaning = False
        if failure is None and not self.audit_complete:
            failure = "audit"
        summary = {"version": 1, "runId": self.run_id, "result": result, "cleanupComplete": clean,
                   "auditComplete": self.audit_complete, "failure": failure,
                   "passed": bool(result and result["passed"] and clean and self.audit_complete and failure is None)}
        self.output(summary)
        return summary


MAX_IPC_FRAME = 4096
MAX_IPC_BUFFER = 16384
MAX_IPC_PACKETS = 256
MAX_DIAGNOSTIC_EVENTS = 128
MAX_DIAGNOSTIC_FRAME = 512
PG_ERROR_CATEGORIES = frozenset(("DNS_FAILURE", "CONNECTION_REFUSED", "CONNECTION_TIMEOUT", "AUTH_REJECTED", "DATABASE_MISSING", "SERVER_NOT_READY", "UNKNOWN"))
DIAGNOSTIC_PREFIX = b"H1_DIAG_V1 "
DIAGNOSTIC_STAGES = frozenset((
    "stdin", "archive", "integrity", "prisma_generate", "typescript_build",
    "resources_copy", "fixture_import", "fixture_run", "postgres_ready", "roles",
    "migrate", "runtime_grants", "seed", "application_start", "auth_checks",
    "admin_checks", "docker_exec",
))
DIAGNOSTIC_ERRORS = frozenset(("RUNTIME_ERROR", "BUILD_FAILED", "DEADLINE", "PROTOCOL_ERROR"))
SUMMARY_FAILURES = frozenset(("audit", "dependencies", "network", "postgres", "application", "fixture", "deadline", "interrupted", "cleanup", "guard", "admission", "ipc", "worker", "output"))


class PosixGuardBoundary:
    """Forked I/O worker with bounded nonblocking stream IPC."""
    def __init__(self, clock: Any):
        self.clock = clock
        self.pid: int | None = None
        self.read_fd: int | None = None
        self.worker_fd: int | None = None
        self.buffer = bytearray()
        self.packet_count = 0
        self.eof = False
        self.interrupted = False
        self.output_fd = 1
        self.output_safe = False
        self.old_sigchld: Any = None
        self._sigchld_changed = False

    def start(self, args: Any, started: float) -> None:
        if self.pid is not None:
            raise LifecycleError("guard already started")
        self.old_sigchld = signal.signal(signal.SIGCHLD, signal.SIG_DFL)
        self._sigchld_changed = True
        parent_socket, worker_socket = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
        read_fd, write_fd = parent_socket.detach(), worker_socket.detach()
        self.read_fd, self.worker_fd = read_fd, write_fd
        try:
            os.set_blocking(read_fd, False)
            os.set_blocking(write_fd, False)
            pid = os.fork()
        except BaseException:
            for descriptor in (read_fd, write_fd):
                try:
                    os.close(descriptor)
                except OSError:
                    pass
            self.read_fd = self.worker_fd = None
            raise
        if pid == 0:
            os.close(read_fd)
            try:
                os.setsid()
                self._worker(args, started, write_fd)
            finally:
                os._exit(0)
        # Pin ownership before any fallible parent-side close.
        self.pid, self.read_fd = pid, read_fd
        os.close(write_fd)
        self.worker_fd = None

    @staticmethod
    def _send(fd: int, packet: dict[str, Any], *, best_effort: bool = False) -> None:
        try:
            raw = json.dumps(packet, separators=(",", ":"), sort_keys=True).encode("utf-8") + b"\n"
            if len(raw) > MAX_IPC_FRAME:
                raise LifecycleError("guard IPC frame exceeds bound")
            sent = os.write(fd, raw)
            if sent != len(raw):
                raise LifecycleError("guard IPC write incomplete")
        except (OSError, TypeError, ValueError, LifecycleError):
            if best_effort:
                return
            raise LifecycleError("guard IPC unavailable") from None

    @staticmethod
    def _progress_packet(record: dict[str, Any]) -> dict[str, Any] | None:
        event = record.get("event")
        if event in ("create_intent", "created", "create_uncertain", "create_invalid_id"):
            packet = {key: record[key] for key in ("event", "kind", "name", "image", "id") if key in record}
            packet.update(type="progress", runId=record.get("runId"))
        elif event in ("cleaned", "cleanup_started"):
            packet = {"type": "progress", "runId": record.get("runId"), "event": event}
            for key in ("id", "kind"):
                if key in record:
                    packet[key] = record[key]
        elif event == "diagnostic_stage":
            packet = {"type": "progress", "runId": record.get("runId"), "event": event}
            packet.update({key: record[key] for key in ("clock", "stage", "phase", "elapsedMs", "errorClass", "pgErrorCategory") if key in record})
        else:
            return None
        return packet

    def _worker(self, args: Any, started: float, channel: int) -> None:
        stop_requested = False
        def request_stop(_number, _frame):
            nonlocal stop_requested
            if not stop_requested:
                stop_requested = True
                raise InterruptedError("guard cleanup requested")
        signal.signal(signal.SIGTERM, request_stop)
        signal.signal(signal.SIGINT, request_stop)
        try:
            info = os.fstat(self.output_fd)
            # Regular-file O_NONBLOCK is ineffective; reject it before worker-side resources.
            self.output_safe = stat.S_ISFIFO(info.st_mode) or stat.S_ISSOCK(info.st_mode) or os.isatty(self.output_fd)
            if not self.output_safe:
                self._send(channel, {"type": "rejected"})
                return
            self._send(channel, {"type": "ready", "outputSafe": True})
            root = pathlib.Path(__file__).resolve().parents[2]
            def progress(record: dict[str, Any]) -> None:
                packet = self._progress_packet(record)
                if packet is not None:
                    self._send(channel, packet)
            def output(_summary: dict[str, Any]) -> None:
                return
            controller = LifecycleController(
                docker=DockerCLI(time, started + WORK_SECONDS, lambda record: controller._transport_record(record), isolated_client=False),
                filesystem=HostFilesystem(str(root)), clock=time, rng=secrets,
                project_root=str(root), output=output, started_at=started, event_sink=progress,
            )
            summary = controller.run(execute=args.execute, cleanup_owned=args.cleanup_owned,
                                     qualification_path=args.qualification)
            self._send(channel, {"type": "result", "value": summary})
            self._send(channel, {"type": "exit", "code": 0 if summary.get("passed") else 1}, best_effort=True)
        except BaseException as exc:
            if isinstance(exc, AdmissionError):
                self._send(channel, {"type": "rejected"}, best_effort=True)
            self._send(channel, {"type": "exit", "code": 1}, best_effort=True)
        finally:
            try:
                os.close(channel)
            except OSError:
                pass

    def _take_frame(self) -> dict[str, Any] | None:
        newline = self.buffer.find(b"\n")
        if newline < 0:
            if len(self.buffer) > MAX_IPC_FRAME:
                raise ResultError("guard IPC frame exceeded")
            return None
        if newline + 1 > MAX_IPC_FRAME:
            raise ResultError("guard IPC frame exceeded")
        line = bytes(self.buffer[:newline])
        del self.buffer[:newline + 1]
        self.packet_count += 1
        if self.packet_count > MAX_IPC_PACKETS:
            raise ResultError("guard IPC packet count exceeded")
        try:
            value = strict_json(line)
        except (ValueError, TypeError) as exc:
            raise ResultError("guard IPC packet invalid") from exc
        if not isinstance(value, dict):
            raise ResultError("guard IPC packet invalid")
        return value

    def receive(self, timeout: float) -> dict[str, Any] | None:
        if self.read_fd is None or self.eof:
            self.eof = True
            return None
        packet = self._take_frame()
        if packet is not None:
            return packet
        try:
            ready, _, _ = select.select([self.read_fd], [], [], max(0.0, timeout))
        except InterruptedError:
            self.interrupted = True
            return None
        if not ready:
            return None
        try:
            chunk = os.read(self.read_fd, MAX_IPC_BUFFER + 1)
        except InterruptedError:
            self.interrupted = True
            return None
        if not chunk:
            self.eof = True
            if self.buffer:
                raise ResultError("guard IPC truncated at EOF")
            return None
        self.buffer.extend(chunk)
        if len(self.buffer) > MAX_IPC_BUFFER:
            raise ResultError("guard IPC buffer exceeded")
        return self._take_frame()

    def request_cleanup(self) -> None:
        pid = self.pid
        if pid is not None:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass

    def stop(self, until: float) -> bool:
        pid = self.pid
        if pid is None:
            return False
        until = min(until, self.clock.monotonic() + CLEANUP_SECONDS)
        interrupt_deadline = None
        try:
            os.killpg(pid, signal.SIGKILL)
        except OSError:
            try:
                os.kill(pid, signal.SIGKILL)
            except OSError:
                pass
        while self.clock.monotonic() < until:
            if self.interrupted and interrupt_deadline is None:
                interrupt_deadline = min(until, self.clock.monotonic() + CLEANUP_SECONDS)
                until = interrupt_deadline
            try:
                observed, _status = os.waitpid(pid, os.WNOHANG)
            except InterruptedError:
                observed = 0
            except ChildProcessError:
                self.pid = None
                return False
            except OSError:
                return False
            if observed == pid:
                self.pid = None
                return True
            try:
                time.sleep(min(0.01, max(0.0, until - self.clock.monotonic())))
            except InterruptedError:
                pass
        try:
            observed, _status = os.waitpid(pid, os.WNOHANG)
        except InterruptedError:
            return False
        except ChildProcessError:
            self.pid = None
            return False
        except OSError:
            return False
        if observed == pid:
            self.pid = None
            return True
        return False

    def emit(self, report: dict[str, Any]) -> bool:
        if not self.output_safe:
            return False
        try:
            raw = json.dumps(report, sort_keys=True, separators=(",", ":")).encode("utf-8") + b"\n"
            if len(raw) > MAX_IPC_FRAME:
                return False
            was_blocking = os.get_blocking(self.output_fd)
            try:
                os.set_blocking(self.output_fd, False)
                return os.write(self.output_fd, raw) == len(raw)
            finally:
                os.set_blocking(self.output_fd, was_blocking)
        except (OSError, BlockingIOError, InterruptedError, TypeError, ValueError):
            return False

    def close(self) -> None:
        for descriptor in (self.read_fd, self.worker_fd):
            if descriptor is not None:
                try:
                    os.close(descriptor)
                except OSError:
                    pass
        self.read_fd = self.worker_fd = None
        if self._sigchld_changed:
            try:
                signal.signal(signal.SIGCHLD, self.old_sigchld)
            except (OSError, ValueError):
                pass
            self._sigchld_changed = False


def _validate_progress(packet: dict[str, Any], state: dict[str, Any]) -> None:
    event = packet.get("event")
    run_id = packet.get("runId")
    if not isinstance(run_id, str) or not RUN_ID.fullmatch(run_id):
        raise ResultError("guard progress identity invalid")
    if state["run_id"] is not None and run_id != state["run_id"]:
        raise ResultError("guard progress run changed")
    if event == "diagnostic_stage":
        required = {"type", "runId", "event", "clock", "stage", "phase", "elapsedMs"}
        if not required.issubset(packet) or set(packet) - (required | {"errorClass", "pgErrorCategory"}):
            raise ResultError("guard diagnostic schema invalid")
        clock, stage, phase, elapsed = (packet.get(key) for key in ("clock", "stage", "phase", "elapsedMs"))
        valid_stage = type(stage) is str and (stage in DIAGNOSTIC_STAGES or
                      any(stage == "check." + name for name in CHECK_NAMES + PRODUCT_CHECK_NAMES))
        if type(clock) is not str or clock not in ("host", "remote") or not valid_stage or \
                type(phase) is not str or phase not in ("start", "end", "error") or \
                type(elapsed) is not int or not 0 <= elapsed <= 65000:
            raise ResultError("guard diagnostic value invalid")
        if phase == "error":
            error_class = packet.get("errorClass")
            if "errorClass" not in packet or type(error_class) is not str or error_class not in DIAGNOSTIC_ERRORS:
                raise ResultError("guard diagnostic error class invalid")
        elif "errorClass" in packet:
            raise ResultError("guard diagnostic error class unexpected")
        if "pgErrorCategory" in packet:
            category = packet["pgErrorCategory"]
            if clock != "remote" or stage != "postgres_ready" or phase != "error" or \
                    packet.get("errorClass") != "RUNTIME_ERROR" or type(category) is not str or category not in PG_ERROR_CATEGORIES:
                raise ResultError("guard PostgreSQL category invalid")
        previous = state["diagnostic_elapsed"].get(clock)
        if state["cleanup_started"] or state["diagnostic_count"] >= MAX_DIAGNOSTIC_EVENTS or \
                (previous is not None and elapsed < previous):
            raise ResultError("guard diagnostic sequence invalid")
        state["run_id"] = run_id
        state["diagnostic_elapsed"][clock] = elapsed
        state["diagnostic_count"] += 1
        return
    if event == "cleanup_started":
        if set(packet) != {"type", "runId", "event"} or state["cleanup_started"]:
            raise ResultError("guard cleanup event invalid")
        state["run_id"] = run_id
        state["cleanup_started"] = True
        return
    schemas = {
        "create_intent": {"type", "runId", "event", "kind", "name", "image"},
        "created": {"type", "runId", "event", "kind", "name", "image", "id"},
        "create_uncertain": {"type", "runId", "event", "kind", "name"},
        "create_invalid_id": {"type", "runId", "event", "kind", "name"},
        "cleaned": {"type", "runId", "event", "id", "kind"},
    }
    if event not in schemas or set(packet) != schemas[event]:
        raise ResultError("guard progress schema invalid")
    kind, name = packet.get("kind"), packet.get("name")
    allowed = {("network", "h1-net-" + run_id, ""),
               ("container", "h1-pg-" + run_id, POSTGRES_IMAGE),
               ("container", "h1-app-" + run_id, APP_IMAGE)}
    if event.startswith("create_"):
        expected_image = packet.get("image")
        if event != "create_intent":
            expected_image = {"h1-net-" + run_id: "", "h1-pg-" + run_id: POSTGRES_IMAGE,
                              "h1-app-" + run_id: APP_IMAGE}.get(name)
        key = (kind, name, expected_image)
        if key not in allowed:
            raise ResultError("guard create intent invalid")
        if event == "create_intent":
            if key in state["intents"] or state["cleanup_started"]:
                raise ResultError("guard create intent invalid")
            state["run_id"] = run_id
            state["intents"][key] = None
        else:
            if key not in state["intents"] or state["intents"][key] is not None:
                raise ResultError("guard create outcome invalid")
            state["run_id"] = run_id
            state["intents"][key] = "uncertain"
            state["uncertain"] = True
        return
    resource_id = packet.get("id")
    if not isinstance(resource_id, str) or not HEX64.fullmatch(resource_id):
        raise ResultError("guard resource ID invalid")
    if event == "created":
        key = (kind, name, packet.get("image", ""))
        if state["cleanup_started"] or key not in state["intents"] or state["intents"][key] is not None or resource_id in state["created"]:
            raise ResultError("guard created ID has no pending intent")
        state["run_id"] = run_id
        state["intents"][key] = resource_id
        state["created"][resource_id] = kind
    else:
        if not state["cleanup_started"] or state["created"].get(resource_id) != kind or resource_id in state["cleaned"]:
            raise ResultError("guard cleanup ID is unknown or duplicated")
        state["run_id"] = run_id
        state["cleaned"].add(resource_id)


def _valid_summary(value: Any, state: dict[str, Any]) -> bool:
    if not isinstance(value, dict) or set(value) != {"version", "runId", "result", "cleanupComplete", "auditComplete", "failure", "passed"}:
        return False
    run_id = value.get("runId")
    if not isinstance(run_id, str) or not RUN_ID.fullmatch(run_id) or (state["run_id"] is not None and run_id != state["run_id"]):
        return False
    if type(value.get("version")) is not int or value["version"] != 1 or any(type(value.get(key)) is not bool for key in ("cleanupComplete", "auditComplete", "passed")):
        return False
    if value["failure"] is not None and (not isinstance(value["failure"], str) or value["failure"] not in SUMMARY_FAILURES):
        return False
    result = value.get("result")
    if result is not None:
        try:
            validate_result(result, run_id, [])
        except ResultError:
            return False
    return value["passed"] is (result is not None and result["passed"] and value["cleanupComplete"] and value["auditComplete"] and value["failure"] is None)


_SIDECAR_WRITER_SOURCE = (
    "import base64, importlib.util, json, sys\n"
    "spec = importlib.util.spec_from_file_location('h1_sidecar_writer', sys.argv[1])\n"
    "module = importlib.util.module_from_spec(spec)\n"
    "sys.modules[spec.name] = module\n"
    "spec.loader.exec_module(module)\n"
    "request = json.load(sys.stdin)\n"
    "module.HostFilesystem(request['root']).write_private("
    "request['target'], base64.b64decode(request['data'], validate=True))\n"
)


def _sidecar_process(root: str, target: str, data: bytes) -> subprocess.Popen[bytes]:
    return subprocess.Popen(
        [sys.executable, "-I", "-S", "-B", "-c", _SIDECAR_WRITER_SOURCE,
         str(pathlib.Path(__file__).resolve())],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        close_fds=True)


def _persist_sidecar_bounded(root: str, target: str, data: bytes,
                             process_factory: Callable[[str, str, bytes], Any] | None = None) -> str:
    """Best-effort private sidecar write isolated from the supervisor's deadline."""
    process = (process_factory or _sidecar_process)(root, target, data)
    request = json.dumps({"root": root, "target": target,
                          "data": base64.b64encode(data).decode("ascii")},
                         sort_keys=True, separators=(",", ":")).encode()
    try:
        process.communicate(request, timeout=SIDECAR_WRITE_SECONDS)
        return "written" if process.returncode == 0 else "failed"
    except subprocess.TimeoutExpired:
        process.kill()
        try:
            process.wait(timeout=SIDECAR_STOP_SECONDS)
        except subprocess.TimeoutExpired:
            return "stalled_unreaped"
        return "stalled_reaped"
    finally:
        if process.stdin is not None and not process.stdin.closed:
            process.stdin.close()


def supervise(args: Any, boundary: Any | None = None, clock: Any = time,
              memory_sink: Callable[[dict[str, Any]], None] | None = None,
              sidecar_process_factory: Callable[[str, str, bytes], Any] | None = None) -> int:
    """Independent parent timer: it never performs filesystem or Docker work."""
    if getattr(args, "execute", False) is not True or getattr(args, "cleanup_owned", False) is not True:
        return 1
    started = clock.monotonic()
    work_until, hard_until = started + WORK_SECONDS, started + TOTAL_SECONDS
    total_until = hard_until
    guard = boundary or PosixGuardBoundary(clock)
    state = {"ready": False, "output_safe": False, "run_id": None, "intents": {},
             "created": {}, "cleaned": set(), "uncertain": False, "cleanup_started": False,
             "diagnostic_count": 0, "diagnostic_elapsed": {"remote": None, "host": None},
             "summary": None, "exit": None, "failed": False, "failure_reason": None,
             "rejected": False}
    cleanup_requested = False
    stop_attempted = False
    start_attempted = False
    cancellation = {"requested": False, "deadline": None}
    previous_signals: dict[int, Any] = {}

    def cancel_parent(_number, _frame):
        cancellation["requested"] = True
        try:
            guard.interrupted = True
        except Exception:
            pass

    def stop_worker() -> bool:
        nonlocal stop_attempted
        if stop_attempted:
            return False
        stop_attempted = True
        try:
            return bool(guard.stop(total_until))
        except Exception:
            return False

    def accept(packet: Any) -> None:
        if not isinstance(packet, dict):
            raise ResultError("worker packet is not an object")
        if packet.get("type") == "rejected":
            if set(packet) != {"type"} or state["rejected"]:
                raise ResultError("worker rejection frame invalid")
            state["failed"] = True
            state["failure_reason"] = "admission"
            state["rejected"] = True
        elif packet.get("type") == "ready":
            if set(packet) != {"type", "outputSafe"} or packet["outputSafe"] is not True or state["ready"]:
                raise ResultError("worker output qualification failed")
            state["ready"] = state["output_safe"] = True
            # Parent may emit only after receiving this exact qualification frame.
            guard.output_safe = True
        elif packet.get("type") == "progress":
            if not state["ready"]:
                raise ResultError("progress before output qualification")
            _validate_progress(packet, state)
        elif packet.get("type") == "result":
            if not state["ready"] or state["summary"] is not None or set(packet) != {"type", "value"} or not _valid_summary(packet["value"], state):
                raise ResultError("worker summary invalid")
            # Bind only after every summary field and its nested result have passed validation.
            if state["run_id"] is None:
                state["run_id"] = packet["value"]["runId"]
            state["summary"] = packet["value"]
        elif packet.get("type") == "exit":
            if set(packet) != {"type", "code"} or type(packet["code"]) is not int or packet["code"] not in (0, 1) or state["exit"] is not None:
                raise ResultError("worker exit frame invalid")
            state["exit"] = packet["code"]
        else:
            raise ResultError("unknown worker packet")

    try:
        previous_signals[signal.SIGTERM] = signal.signal(signal.SIGTERM, cancel_parent)
        previous_signals[signal.SIGINT] = signal.signal(signal.SIGINT, cancel_parent)
        start_attempted = True
        guard.start(args, started)
        while clock.monotonic() < total_until:
            now = clock.monotonic()
            if getattr(guard, "interrupted", False):
                cancellation["requested"] = True
            if cancellation["requested"]:
                if cancellation["deadline"] is None:
                    cancellation["deadline"] = min(hard_until, now + CLEANUP_SECONDS)
                total_until = cancellation["deadline"]
                work_until = min(work_until, now)
                state["failed"] = True
                state["failure_reason"] = "interrupted"
            # Drain queued progress at the boundary before deciding whether to signal.
            if now >= work_until and not cleanup_requested and not state["cleanup_started"]:
                for _ in range(MAX_IPC_PACKETS):
                    try:
                        packet = guard.receive(0)
                    except Exception:
                        state["failed"] = True
                        state["failure_reason"] = "ipc"
                        break
                    if packet is None:
                        break
                    try:
                        accept(packet)
                    except Exception:
                        state["failed"] = True
                        state["failure_reason"] = "ipc"
                        break
                    if state["failed"] or state["cleanup_started"] or state["rejected"] or state["exit"] is not None:
                        break
                if state["failure_reason"] == "ipc":
                    break
                if getattr(guard, "eof", False):
                    state["failed"] = True
                    state["failure_reason"] = "worker"
                    break
                if not state["cleanup_started"] and not state["rejected"] and state["exit"] is None:
                    cleanup_requested = True
                    state["failed"] = True
                    try:
                        guard.request_cleanup()
                    except Exception:
                        state["failure_reason"] = state["failure_reason"] or "guard"
                        break
                    else:
                        state["failure_reason"] = state["failure_reason"] or "deadline"
            now = clock.monotonic()
            if cancellation["requested"]:
                if cancellation["deadline"] is None:
                    cancellation["deadline"] = min(hard_until, now + CLEANUP_SECONDS)
                total_until = cancellation["deadline"]
            remaining = max(0.0, total_until - now)
            until_work = max(0.0, work_until - now) if not cleanup_requested and not state["cleanup_started"] else remaining
            timeout = min(0.1, remaining, until_work)
            try:
                packet = guard.receive(timeout)
            except Exception:
                state["failed"] = True
                state["failure_reason"] = "ipc"
                break
            if getattr(guard, "interrupted", False):
                cancellation["requested"] = True
            if packet is None:
                if getattr(guard, "eof", False):
                    state["failed"] = True
                    state["failure_reason"] = state["failure_reason"] or "worker"
                    break
                continue
            try:
                accept(packet)
            except Exception:
                state["failed"] = True
                state["failure_reason"] = "ipc"
                break
            if state["rejected"]:
                break
            if state["exit"] is not None:
                break
        if clock.monotonic() >= total_until:
            state["failed"] = True
            state["failure_reason"] = state["failure_reason"] or "deadline"
    except Exception:
        state["failed"] = True
        state["failure_reason"] = state["failure_reason"] or "guard"

    try:
        exit_observed = stop_worker() if start_attempted else False
        if not exit_observed:
            state["failed"] = True
            state["failure_reason"] = state["failure_reason"] or "worker"
        if not state["ready"]:
            return 1
        retained = [{"kind": kind, "id": resource_id} for resource_id, kind in state["created"].items() if resource_id not in state["cleaned"]]
        uncertain_outcome = state["uncertain"] or any(value is None or value == "uncertain" for value in state["intents"].values())
        complete_ledger = len(state["created"]) == 3 and len(state["cleaned"]) == 3 and not uncertain_outcome and not retained
        summary = state["summary"]
        if summary is not None and not _valid_summary(summary, state):
            summary = None
            state["failed"] = True
            state["failure_reason"] = "ipc"
        summary_present = summary is not None
        success = (not state["failed"] and summary is not None and state["exit"] == 0 and exit_observed and
                   complete_ledger and summary["passed"] and state["cleanup_started"])
        if summary is None:
            summary = {"version": 1, "runId": state["run_id"], "result": None,
                       "cleanupComplete": False, "auditComplete": False,
                       "failure": state["failure_reason"] or "worker", "passed": False}
        report = {**summary, "workerExitObserved": bool(exit_observed), "retained": retained,
                  "createOutcomeUncertain": bool(uncertain_outcome)}
        report["passed"] = bool(success)
        if not success:
            report["cleanupComplete"] = bool(summary.get("cleanupComplete") and complete_ledger)
            report["auditComplete"] = bool(summary.get("auditComplete") and not state["failed"])
            if report["failure"] is None:
                report["failure"] = state["failure_reason"] or "guard"
        if exit_observed and isinstance(state["run_id"], str) and RUN_ID.fullmatch(state["run_id"]):
            reason = state["failure_reason"]
            if reason is None:
                parent_reason = "NONE"
            elif reason in {"interrupted", "ipc", "worker", "guard", "deadline"}:
                parent_reason = reason
            else:
                parent_reason = "UNKNOWN"
            sidecar = {"version": 1, "runId": state["run_id"], "parentReason": parent_reason,
                       "cleanupRequested": bool(cleanup_requested), "cleanupStarted": bool(state["cleanup_started"]),
                       "summaryPresent": summary_present, "workerExitObserved": True}
            try:
                if memory_sink is not None:
                    memory_sink(sidecar)
                elif isinstance(guard, PosixGuardBoundary):
                    root = pathlib.Path(__file__).resolve().parents[2]
                    target = root / "odd/probes/h1-real-e2e" / state["run_id"] / "supervisor-diagnostic.json"
                    payload = json.dumps(sidecar, sort_keys=True, separators=(",", ":")).encode()
                    _persist_sidecar_bounded(str(root), str(target), payload, sidecar_process_factory)
            except Exception:
                pass
        try:
            report_sent = bool(guard.emit(report))
        except Exception:
            report_sent = False
        return 0 if success and report_sent else 1
    except Exception:
        return 1
    finally:
        if start_attempted and not stop_attempted:
            stop_worker()
        for number, handler in previous_signals.items():
            try:
                signal.signal(number, handler)
            except (OSError, ValueError):
                pass
        try:
            guard.close()
        except Exception:
            pass


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="Accidental-execution gate; separate human permission is still required.")
    parser.add_argument("--cleanup-owned", action="store_true", help="Require cleanup of newly created, daemon-verified immutable IDs only.")
    parser.add_argument("--qualification", required=True, help="Project-local strict v1 PostgreSQL identity/path qualification JSON.")
    args = parser.parse_args(argv)
    return supervise(args)


if __name__ == "__main__":
    raise SystemExit(main())
