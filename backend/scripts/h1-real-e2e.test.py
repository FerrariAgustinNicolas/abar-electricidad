"""Deterministic, fake-only contract tests for the host H1 E2E controller.

These tests intentionally have not been executed under the code-only grant.
"""
import importlib.util
import io
import json
import pathlib
import shutil
import subprocess
import tarfile
import sys
import tempfile
import time
import unittest
from unittest.mock import patch


MODULE_PATH = pathlib.Path(__file__).with_name("h1-real-e2e.py")
SPEC = importlib.util.spec_from_file_location("h1_real_e2e", MODULE_PATH)
harness = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = harness
SPEC.loader.exec_module(harness)


class FakeFS:
    def __init__(self, files=None):
        self.files = dict(files or {})
        self.writes = []

    def read_bytes(self, path):
        return self.files[path]

    def write_private(self, path, data):
        self.writes.append((path, data))

    def reserve_run(self, root, run_id):
        self.reserved = (root, run_id)

    def collect_sources(self, _root):
        return {name: b"synthetic authored input" for name in harness.REQUIRED_INPUTS}

    def is_symlink(self, path):
        return False

    def is_file(self, path):
        return path in self.files


class FakeDocker:
    def __init__(self, *, fail_create_at=None, ambiguous_create_at=None):
        self.calls = []
        self.created = []
        self.stopped = []
        self.removed = []
        self.fail_create_at = fail_create_at
        self.ambiguous_create_at = ambiguous_create_at
        self.observed = {}
        self.execution = []
        self.result_transform = lambda value: value
        self.deadlines = []

    def set_deadline(self, value):
        self.deadlines.append(value)

    def require_dependencies(self):
        self.calls.append(("dependencies",))

    def start(self, resource_id):
        self.calls.append(("start", resource_id))
        item = self.observed[resource_id]
        item["running"] = True
        config = item["config"]
        if "networkName" in config and "network" in config:
            item["networks"][config["networkName"]]["NetworkID"] = config["network"]

    def execute(self, resource_id, program, stdin):
        self.execution.append((resource_id, program, stdin))
        if program == harness.PG_BOOTSTRAP_SOURCE:
            return b""
        request = json.loads(stdin)
        self.payload = request["payload"]
        result = {"version": 1, "runId": self.payload["runId"],
                  "checks": [{"name": name, "passed": True} for name in harness.CHECK_NAMES],
                  "productChecks": [{"name": name, "passed": True} for name in harness.PRODUCT_CHECK_NAMES],
                  "productPassed": True, "passed": True}
        result = self.result_transform(result)
        return ("H1_REAL_E2E_RESULT=" + json.dumps(result) + "\n").encode()

    def create(self, kind, name, image, labels, config):
        self.calls.append(("create", kind, name, image, dict(labels), config))
        index = len([call for call in self.calls if call[0] == "create"])
        if index == self.fail_create_at:
            raise harness.DockerCallError("create failed")
        if index == self.ambiguous_create_at:
            raise harness.DockerCallError("ambiguous response", ambiguous=True)
        resource_id = ("a" * 63) + str(index % 10)
        self.created.append(resource_id)
        self.observed[resource_id] = {
            "id": resource_id,
            "name": name,
            "image": image,
            "labels": dict(labels),
            "running": False,
            "members": [],
            "kind": kind,
            "config": config,
            "internal": kind == "network",
            "driver": "bridge" if kind == "network" else "",
            "networks": ({config["networkName"]: {"NetworkID": "", "EndpointID": ""}}
                         if kind == "container" and "networkName" in config else {}),
        }
        if kind == "container" and config.get("network") in self.observed:
            self.observed[config["network"]]["members"].append(resource_id)
        return resource_id

    def inspect(self, resource_id, *, kind="container"):
        return self.observed.get(resource_id)

    def assert_isolated(self, resource_id, config, *, expected_running):
        item = self.observed[resource_id]
        if item["config"] != config or item["running"] is not expected_running:
            raise harness.OwnershipError("configuration or stage mismatch")
        if "networkName" not in config:
            return
        networks = item["networks"]
        if set(networks) != {config["networkName"]}:
            raise harness.OwnershipError("network name mismatch")
        network_id = networks[config["networkName"]]["NetworkID"]
        if (expected_running and network_id != config["network"]) or \
                (not expected_running and network_id not in ("", config["network"])):
            raise harness.OwnershipError("network identity mismatch")

    def stop(self, resource_id, timeout):
        self.stopped.append((resource_id, timeout))
        self.observed[resource_id]["running"] = False

    def remove(self, resource_id, *, kind="container"):
        self.removed.append(resource_id)
        self.observed.pop(resource_id, None)
        for observed in self.observed.values():
            if resource_id in observed["members"]:
                observed["members"].remove(resource_id)

    def network_members(self, resource_id):
        item = self.observed.get(resource_id)
        return [] if item is None else list(item["members"])


class FakeClock:
    def __init__(self, now=100.0):
        self.now = now
        self.sleeps = []

    def monotonic(self):
        return self.now

    def time(self):
        return 1800000000.0 + self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


class FakeRng:
    def __init__(self):
        self.calls = 0

    def token_bytes(self, count):
        self.calls += 1
        return bytes([self.calls % 256]) * count


class HostControllerContractTests(unittest.TestCase):
    def qualification(self, **overrides):
        result = {
            "version": 1,
            "image": harness.POSTGRES_IMAGE,
            "uid": 999,
            "gid": 999,
            "dataPath": "/var/lib/postgresql/data",
            "socketPath": "/var/run/postgresql",
        }
        result.update(overrides)
        return result

    def controller(self, *, docker=None, fs=None, clock=None, rng=None):
        result = harness.LifecycleController(
            docker=docker or FakeDocker(),
            filesystem=fs or FakeFS(),
            clock=clock or FakeClock(),
            rng=rng or FakeRng(),
            project_root="/project",
            output=lambda _record: None,
        )
        result.run_id = "a" * 32
        result.started = result.clock.monotonic()
        result.deadline = result.started + harness.WORK_SECONDS
        return result

    def test_import_is_effect_free(self):
        with patch.object(harness.secrets, "token_bytes", side_effect=AssertionError("RNG on import")):
            with patch.object(harness.subprocess, "Popen", side_effect=AssertionError("process on import")):
                with patch.object(harness.pathlib.Path, "read_bytes", side_effect=AssertionError("file read on import")):
                    with patch.object(harness.os, "open", side_effect=AssertionError("file create on import")):
                        SPEC.loader.exec_module(harness)

    def test_missing_execution_grant_fails_before_rng_or_filesystem_write(self):
        fs, rng, docker = FakeFS(), FakeRng(), FakeDocker()
        with self.assertRaises(harness.AdmissionError):
            self.controller(fs=fs, rng=rng, docker=docker).run(
                execute=False,
                cleanup_owned=False,
                qualification_path="/project/qualification.json",
            )
        self.assertEqual(rng.calls, 0)
        self.assertEqual(fs.writes, [])
        self.assertEqual(docker.calls, [])

    def test_bad_qualification_fails_closed_before_resources_or_rng(self):
        fs = FakeFS({"/project/qualification.json": b'{"version":1}'})
        rng, docker = FakeRng(), FakeDocker()
        with self.assertRaises(harness.AdmissionError):
            self.controller(fs=fs, rng=rng, docker=docker).run(
                execute=True,
                cleanup_owned=True,
                qualification_path="/project/qualification.json",
            )
        self.assertEqual(rng.calls, 0)
        self.assertEqual(docker.calls, [])
        self.assertEqual(fs.writes, [])

    def run_fake(self, *, docker=None, fs=None, clock=None):
        docker = docker or FakeDocker()
        fs = fs or FakeFS({"/project/qualification.json": json.dumps(self.qualification()).encode()})
        output = []
        controller = self.controller(docker=docker, fs=fs, clock=clock)
        controller.output = output.append
        result = controller.run(execute=True, cleanup_owned=True, qualification_path="/project/qualification.json")
        return result, controller, docker, fs, output

    def test_qualified_supervisor_connects_one_pipeline_and_cleans_recorded_ids(self):
        result, controller, docker, fs, output = self.run_fake()
        self.assertTrue(result["passed"])
        self.assertTrue(result["cleanupComplete"])
        self.assertTrue(result["auditComplete"])
        self.assertEqual(len(docker.created), 3)
        self.assertEqual(docker.removed, list(reversed(docker.created)))
        self.assertEqual(len(docker.execution), 2)
        self.assertEqual(docker.execution[0][1], harness.PG_BOOTSTRAP_SOURCE)
        self.assertEqual(docker.execution[1][1], harness.BOOTSTRAP_SOURCE)
        payload = json.loads(docker.execution[1][2])["payload"]
        self.assertEqual(docker.execution[0][2], (payload["runId"] + "\n" + payload["secrets"]["bootstrapPassword"] + "\n").encode())
        self.assertEqual(payload["database"]["host"], "h1-pg-" + controller.run_id)
        self.assertEqual(payload["deadlineAt"], int((controller.clock.time() + 45) * 1000))
        self.assertEqual(output, [result])
        self.assertGreater(len(fs.writes), 6)
        for index, (path, body) in enumerate(fs.writes):
            self.assertTrue(path.startswith("/project/odd/probes/h1-real-e2e/" + controller.run_id + "/"))
            self.assertEqual(json.loads(body)["sequence"], index)
        for secret in payload["secrets"].values():
            self.assertNotIn(secret, json.dumps(docker.calls))
            self.assertNotIn(secret, json.dumps(output))
            self.assertTrue(all(secret.encode() not in body for _, body in fs.writes))
        self.assertEqual(len({path for path, _ in fs.writes}), len(fs.writes))
        self.assertEqual(docker.deadlines, [controller.started + 45, controller.started + 60])

    def test_repeated_run_is_rejected_without_new_resources_or_output(self):
        _, controller, docker, fs, output = self.run_fake()
        counts = (len(docker.calls), len(fs.writes), len(output))
        with self.assertRaises(harness.AdmissionError):
            controller.run(execute=True, cleanup_owned=True, qualification_path="/project/qualification.json")
        self.assertEqual((len(docker.calls), len(fs.writes), len(output)), counts)

    def test_failed_startup_still_cleans_previously_recorded_resources_without_adoption(self):
        docker = FakeDocker(ambiguous_create_at=2)
        result, _, docker, _, output = self.run_fake(docker=docker)
        self.assertFalse(result["passed"])
        self.assertIsNone(result["result"])
        self.assertEqual(len(docker.created), 1)
        self.assertEqual(docker.removed, docker.created)
        self.assertEqual(docker.execution, [])
        self.assertEqual(len(output), 1)
        self.assertEqual(len([call for call in docker.calls if call[0] == "create"]), 2)

    def test_work_timeout_reserves_cleanup_deadline_and_does_not_rerun_pipeline(self):
        clock, docker = FakeClock(), FakeDocker()
        original = docker.execute
        def expire(resource_id, program, stdin):
            if program == harness.BOOTSTRAP_SOURCE:
                clock.now += 45
                raise TimeoutError("raw private child diagnostic")
            return original(resource_id, program, stdin)
        docker.execute = expire
        result, _, _, _, output = self.run_fake(docker=docker, clock=clock)
        self.assertFalse(result["passed"])
        self.assertEqual(result["failure"], "deadline")
        self.assertTrue(result["cleanupComplete"])
        self.assertNotIn("private", json.dumps(output))
        self.assertEqual(len(docker.created), 3)
        self.assertEqual(len(docker.removed), 3)

    def test_bad_or_failed_fixture_result_is_never_promoted_to_success(self):
        def unknown(value):
            return {**value, "checks": [{"name": "untrusted.secret", "passed": True}]}
        def failed(value):
            value["checks"][0]["passed"] = False
            return {**value, "passed": False}
        for transform in (unknown, failed):
            with self.subTest(transform=transform.__name__):
                docker = FakeDocker()
                docker.result_transform = transform
                result, _, _, _, _ = self.run_fake(docker=docker)
                self.assertFalse(result["passed"])
                self.assertTrue(result["cleanupComplete"])
                self.assertEqual(len(docker.execution), 2)

    def test_ownership_mismatch_denies_destruction_and_success(self):
        docker = FakeDocker()
        original = docker.execute
        def corrupt(resource_id, program, stdin):
            output = original(resource_id, program, stdin)
            if program == harness.BOOTSTRAP_SOURCE:
                docker.observed[resource_id]["image"] = "sha256:" + "f" * 64
            return output
        docker.execute = corrupt
        result, _, _, _, _ = self.run_fake(docker=docker)
        self.assertFalse(result["passed"])
        self.assertFalse(result["cleanupComplete"])
        self.assertNotIn(docker.created[-1], docker.removed)

    def test_audit_failure_after_create_keeps_id_for_bounded_cleanup(self):
        class BrokenAudit(FakeFS):
            def write_private(self, path, data):
                if json.loads(data)["event"] == "created":
                    raise OSError("private filesystem diagnostic")
                super().write_private(path, data)
        fs = BrokenAudit({"/project/qualification.json": json.dumps(self.qualification()).encode()})
        result, _, docker, _, output = self.run_fake(fs=fs)
        self.assertFalse(result["passed"])
        self.assertFalse(result["auditComplete"])
        self.assertEqual(docker.removed, docker.created)
        self.assertNotIn("private filesystem", json.dumps(output))

    def test_qualification_requires_pinned_image_nonzero_ids_and_exact_schema(self):
        for patch in ({"uid": 0}, {"gid": 0}, {"image": "latest"}, {"extra": True}):
            with self.subTest(patch=patch):
                with self.assertRaises(harness.AdmissionError):
                    harness.validate_qualification(self.qualification(**patch))

    def test_symlinked_or_out_of_project_qualification_is_rejected(self):
        fs = FakeFS({"/outside/q.json": json.dumps(self.qualification()).encode()})
        fs.is_symlink = lambda path: path == "/project/link.json"
        controller = self.controller(fs=fs)
        for path in ("/project/link.json", "/outside/q.json", "../outside/q.json"):
            with self.subTest(path=path):
                with self.assertRaises(harness.AdmissionError):
                    controller.load_qualification(path)

    def test_product_fixture_and_audit_migration_are_required_public_archive_inputs(self):
        inputs = {
            "backend/scripts/h1-product-e2e.mjs": b"product fixture input",
            "backend/prisma/migrations/20261009000300_h1_admin_audit/migration.sql": b"audit migration input",
        }
        for name in inputs:
            self.assertIn(name, harness.REQUIRED_INPUTS)
            self.assertTrue(harness.archive_path_allowed(name))
        class SourceFS(FakeFS):
            def collect_sources(self, _root):
                return {**{name: b"required" for name in harness.REQUIRED_INPUTS}, **inputs}
        archive = harness.collect_build_archive(SourceFS(), "/project")
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:") as packed:
            self.assertEqual({name: packed.extractfile(name).read() for name in inputs}, inputs)
        for name in inputs:
            self.assertIn(json.dumps(name), harness.BOOTSTRAP_SOURCE)

    def test_created_container_projection_is_accepted_then_connected_identity_is_rechecked(self):
        controller = self.controller()
        controller.qualification = harness.validate_qualification(self.qualification())
        network_id = "b" * 64
        pg_config, _app_config = controller.container_configs(network_id)
        network_name = "h1-net-" + controller.run_id
        pg_config.setdefault("networkName", network_name)
        container_id = "c" * 64
        projection = {
            "id": container_id, "kind": "container", "name": "h1-pg-" + controller.run_id,
            "image": harness.POSTGRES_IMAGE, "labels": controller._labels(), "running": False,
            "user": "999:999", "entrypoint": ["/bin/bash"], "readonly": True, "privileged": False,
            "publishAll": False, "caps": ["ALL"], "security": ["no-new-privileges"],
            "pids": 128, "memory": 512 * 1024 * 1024, "cpus": 1000000000,
            "binds": None, "portBindings": {}, "tmpfs": dict(item.split(":", 1) for item in pg_config["tmpfs"]),
            "mounts": [], "networkMode": network_id, "logDriver": "none",
            "networks": {network_name: {"NetworkID": "", "EndpointID": ""}},
        }
        docker = harness.DockerCLI(controller.clock, controller.deadline, lambda _record: None)
        docker.inspect = lambda observed_id, kind="container": dict(projection) if observed_id == container_id else None
        def start(observed_id):
            self.assertEqual(observed_id, container_id)
            projection["running"] = True
            projection["networks"][network_name]["NetworkID"] = network_id
            projection["networks"][network_name]["EndpointID"] = "d" * 64
        docker.start = start
        stages = []
        original_assert = docker.assert_isolated
        def assert_stage(observed_id, config, **kwargs):
            observed_network = projection["networks"].get(network_name, {})
            stages.append((kwargs.get("expected_running"), projection["running"],
                           observed_network.get("NetworkID")))
            return original_assert(observed_id, config, **kwargs)
        docker.assert_isolated = assert_stage
        controller.docker = docker
        controller.owned.append({"id": container_id, "kind": "container", "name": projection["name"],
                                 "image": harness.POSTGRES_IMAGE, "labels": controller._labels()})
        controller._start_owned(container_id, pg_config)
        self.assertEqual(stages, [(False, False, ""), (True, True, network_id)])
        for observed_network_id in ("", "e" * 64):
            projection["running"] = True
            projection["networks"] = {network_name: {"NetworkID": observed_network_id, "EndpointID": "d" * 64}}
            with self.subTest(running_network_id=observed_network_id), self.assertRaises(harness.OwnershipError):
                docker.assert_isolated(container_id, pg_config, expected_running=True)
        projection["running"] = False
        projection["networks"] = {"h1-net-" + "f" * 32: {"NetworkID": "", "EndpointID": ""}}
        with self.assertRaises(harness.OwnershipError):
            docker.assert_isolated(container_id, pg_config, expected_running=False)
        projection["networks"] = {
            network_name: {"NetworkID": "", "EndpointID": ""},
            "h1-net-" + "f" * 32: {"NetworkID": "", "EndpointID": ""},
        }
        with self.assertRaises(harness.OwnershipError):
            docker.assert_isolated(container_id, pg_config, expected_running=False)
        projection["networks"] = {network_name: {"NetworkID": "", "EndpointID": ""}}
        projection["networkMode"] = "f" * 64
        with self.assertRaises(harness.OwnershipError):
            docker.assert_isolated(container_id, pg_config, expected_running=False)

    def test_archive_collector_rejects_forbidden_paths_and_nonbyte_entries_after_required_inputs(self):
        for name, value in (("backend/src/generated/client.ts", b"generated"),
                            ("backend/src/link.ts", ("symlink", "target")),
                            ("../outside.ts", b"outside")):
            with self.subTest(name=name):
                class SourceFS(FakeFS):
                    def collect_sources(self, _root):
                        entries = super().collect_sources(_root)
                        entries[name] = value
                        return entries
                with self.assertRaisesRegex(harness.AdmissionError, "unsafe archive entry"):
                    harness.collect_build_archive(SourceFS(), "/project")

    def test_frozen_hash_and_engine_mode_are_checked_without_chmodding_source(self):
        fs = FakeFS({"service": b"service", "engine": b"engine"})
        service_hash = harness.hashlib.sha256(b"service").hexdigest()
        engine_hash = harness.hashlib.sha256(b"engine").hexdigest()
        cases = ((0o500, service_hash, engine_hash, "non-executable"),
                 (0o600, "0" * 64, engine_hash, "service hash mismatch"),
                 (0o600, service_hash, "0" * 64, "engine hash mismatch"))
        for mode, service, engine, error in cases:
            with self.subTest(mode=mode, error=error):
                with self.assertRaisesRegex(harness.AdmissionError, error):
                    harness.verify_frozen_inputs(fs, service_path="service", engine_path="engine",
                                                 service_sha256=service, engine_sha256=engine, engine_mode=mode)
        self.assertEqual(fs.writes, [])

    def test_failed_or_ambiguous_create_is_never_adopted(self):
        for field in ("fail_create_at", "ambiguous_create_at"):
            with self.subTest(field=field):
                docker = FakeDocker(**{field: 1})
                with self.assertRaises(harness.LifecycleError):
                    self.controller(docker=docker).create_owned(
                        "container", "h1-pg-test", harness.POSTGRES_IMAGE, "a" * 32,
                        {"safe": True},
                    )
                self.assertEqual(docker.created, [])
                self.assertEqual(docker.calls[0][0], "create")

    def test_inspection_requires_immutable_id_exact_name_image_and_labels(self):
        docker = FakeDocker()
        controller = self.controller(docker=docker)
        resource_id = controller.create_owned(
            "container", "h1-pg-test", harness.POSTGRES_IMAGE, "a" * 32, {}
        )
        controller.inspect_owned(resource_id, "container", "h1-pg-test", harness.POSTGRES_IMAGE, "a" * 32)
        docker.observed[resource_id]["name"] = "foreign"
        with self.assertRaises(harness.OwnershipError):
            controller.inspect_owned(resource_id, "container", "h1-pg-test", harness.POSTGRES_IMAGE, "a" * 32)

    def test_foreign_network_member_prevents_network_destruction(self):
        docker = FakeDocker()
        controller = self.controller(docker=docker)
        network_id = controller.create_owned(
            "network", "h1-net-test", "", "a" * 32, {}
        )
        docker.observed[network_id]["members"] = ["f" * 64]
        self.assertFalse(controller.cleanup_network(network_id, "h1-net-test", "a" * 32))
        self.assertNotIn(network_id, docker.removed)

    def test_timeout_stops_by_recorded_immutable_ids_with_bounded_cleanup_no_retry(self):
        docker, clock = FakeDocker(), FakeClock()
        controller = self.controller(docker=docker, clock=clock)
        resource_id = controller.create_owned(
            "container", "h1-app-test", harness.APP_IMAGE, "a" * 32, {}
        )
        docker.start(resource_id)
        clock.now += 46
        controller.cleanup_owned()
        self.assertIn(resource_id, [item[0] for item in docker.stopped])
        self.assertLessEqual(sum(timeout for _, timeout in docker.stopped), 15)
        self.assertEqual(len([c for c in docker.calls if c[0] == "create"]), 1)

    def test_result_requires_fixture_worker_allowlist_and_rejects_unknown_names(self):
        run_id = "a" * 32
        valid = {"version": 1, "runId": run_id, "checks": [], "passed": True}
        with self.assertRaises(harness.ResultError):
            harness.validate_result(valid, run_id, known_secrets=[])
        with self.assertRaises(harness.ResultError):
            harness.validate_result({**valid, "extra": "unknown"}, run_id, known_secrets=[])
        with self.assertRaises(harness.ResultError):
            harness.parse_result_output(b"diagnostic H1_REAL_E2E_RESULT={}", run_id, known_secrets=[])

    def test_payload_matches_l4_and_contains_distinct_synthetic_secrets(self):
        rng = FakeRng()
        payload = harness.make_payload("a" * 32, 123456789, rng)
        self.assertEqual(set(payload), {"version", "runId", "deadlineAt", "database", "secrets"})
        self.assertEqual(payload["deadlineAt"], 123456789)
        self.assertEqual(payload["database"]["host"], "h1-pg-" + "a" * 32)
        values = list(payload["secrets"].values())
        self.assertEqual(len(values), len(set(values)))
        self.assertEqual(len(payload["secrets"]["csrfKey"]), 43)
        self.assertTrue(all(len(value) == 64 for key, value in payload["secrets"].items() if key != "csrfKey"))
        encoded = harness.encode_stdin_request(b"archive", payload)
        self.assertIn(payload["secrets"]["applicationPassword"].encode(), encoded)
        argv, env = harness.container_invocation("c" * 64, payload["secrets"])
        self.assertNotIn(payload["secrets"]["applicationPassword"], argv)
        self.assertNotIn(payload["secrets"]["applicationPassword"], env.values())

    def test_payload_secrets_are_not_present_in_docker_argv_or_environment(self):
        secrets = {"applicationPassword": "a" * 64, "csrfKey": "b" * 43}
        args, environment = harness.container_invocation("c" * 64, secrets)
        for secret in secrets.values():
            self.assertNotIn(secret, args)
            self.assertNotIn(secret, environment.values())


class AuditDirectoryContractTests(unittest.TestCase):
    def test_private_sidecar_write_uses_exclusive_no_follow_mode(self):
        import contextlib
        class FakeStream:
            def write(self, data): self.data = data
            def flush(self): pass
            def fileno(self): return 13
            def __enter__(self): return self
            def __exit__(self, *_args): pass
        stream = FakeStream()
        fs = harness.HostFilesystem(str(pathlib.Path(harness.__file__).resolve().parents[2]))
        @contextlib.contextmanager
        def parent(_path):
            yield 12, "supervisor-diagnostic.json"
        with patch.object(fs, "_parent", parent), patch.object(harness.os, "open", return_value=13) as opened, \
             patch.object(harness.os, "fdopen", return_value=stream) as fdopen, \
             patch.object(harness.os, "fsync") as fsync:
            fs.write_private(str(fs.root / "odd/probes/h1-real-e2e" / ("a" * 32) / "supervisor-diagnostic.json"), b"safe")
        flags = opened.call_args.args[1]
        self.assertTrue(flags & harness.os.O_EXCL)
        self.assertTrue(flags & harness.os.O_NOFOLLOW)
        self.assertEqual(opened.call_args.args[2], 0o600)
        self.assertEqual(fdopen.call_args.args[0], 13)
        self.assertEqual(fsync.call_count, 2)

    def test_private_sidecar_collision_is_not_overwritten(self):
        import contextlib
        fs = harness.HostFilesystem(str(pathlib.Path(harness.__file__).resolve().parents[2]))
        @contextlib.contextmanager
        def parent(_path):
            yield 12, "supervisor-diagnostic.json"
        with patch.object(fs, "_parent", parent), patch.object(harness.os, "open", side_effect=FileExistsError), \
             patch.object(harness.os, "fdopen") as fdopen:
            with self.assertRaises(FileExistsError):
                fs.write_private(str(fs.root / "odd/probes/h1-real-e2e" / ("a" * 32) / "supervisor-diagnostic.json"), b"replacement")
        fdopen.assert_not_called()

    def test_public_reservation_fsyncs_each_new_directory_and_its_parent_without_overwrite(self):
        root = pathlib.Path("/project")
        # All filesystem syscalls are fake; this does not create a directory or inspect the host.
        with patch.object(harness.pathlib.Path, "resolve", return_value=root), \
             patch.object(harness.os, "open", side_effect=[10, 11, 12, 13, 14]) as opened, \
             patch.object(harness.os, "mkdir") as mkdir, \
             patch.object(harness.os, "fsync") as fsync, \
             patch.object(harness.os, "close") as close:
            fs = harness.HostFilesystem("/project")
            fs.reserve_run("/project", "a" * 32)
        self.assertEqual([call.args[0] for call in mkdir.call_args_list],
                         ["odd", "probes", "h1-real-e2e", "a" * 32])
        self.assertEqual([call.args[0] for call in fsync.call_args_list], [11, 10, 12, 11, 13, 12, 14, 13])
        self.assertEqual([call.args[0] for call in close.call_args_list], [14, 13, 12, 11, 10])
        self.assertTrue(all(call.args[1] & harness.os.O_NOFOLLOW for call in opened.call_args_list))


class BoundedTransportTests(unittest.TestCase):
    def invoke(self, *, stdin=None, stdout=None, stderr=None, expire=False, fail_audit=False, isolated_client=True):
        # All descriptors, selectors, clocks and processes are fake; no OS pipes or clients.
        from types import SimpleNamespace
        clock, events, writes = FakeClock(), [], []
        class Stream:
            def __init__(self, number): self.number = number
            def fileno(self): return self.number
            def close(self): pass
        class Process:
            pid = 12345
            returncode = None
            def __init__(self):
                self.stdin = Stream(10) if stdin is not None else None
                self.stdout, self.stderr = Stream(11), Stream(12)
            def poll(self): return self.returncode
            def wait(self, timeout): self.returncode = 0; return 0
            def kill(self): self.killed = True
        process = Process()
        class Selector:
            def __init__(self): self.entries = {}
            def register(self, stream, _mask, channel):
                self.entries[stream] = SimpleNamespace(fileobj=stream, data=channel)
            def unregister(self, stream): self.entries.pop(stream)
            def get_map(self): return self.entries
            def select(self, _timeout):
                if expire:
                    clock.now += 46
                    return []
                return [(entry, 0) for entry in list(self.entries.values())]
            def close(self): pass
        chunks = {11: list(stdout or []) + [b""], 12: list(stderr or []) + [b""]}
        def read(fd, _count): return chunks[fd].pop(0)
        def write(_fd, data): writes.append(bytes(data)); return len(data)
        def audit(record):
            events.append(record)
            if fail_audit: raise harness.LifecycleError("synthetic audit failure")
        cli = harness.DockerCLI(clock, clock.monotonic() + 45, audit, isolated_client=isolated_client)
        with patch.object(harness.subprocess, "Popen", return_value=process) as popen, \
             patch.object(harness.selectors, "DefaultSelector", Selector), \
             patch.object(harness.os, "set_blocking"), \
             patch.object(harness.os, "read", side_effect=read), \
             patch.object(harness.os, "write", side_effect=write), \
             patch.object(harness.os, "killpg") as kill:
            error = None
            try:
                if fail_audit:
                    result = cli.create("network", "h1-net-test", "", {"h1.e2e.run": "a" * 32, "h1.e2e.unit": "real-e2e"}, {})
                else:
                    result = cli.execute("c" * 64, harness.BOOTSTRAP_SOURCE, stdin or b"")
            except (harness.DockerCallError, TimeoutError) as exc:
                error, result = exc, None
            return result, error, events, writes, popen.call_args, kill.call_args

    def run_actual_emitter_through_controller(self, *, timeout_after_diagnostics=False, include_pg_category=False):
        node = shutil.which("node")
        self.assertIsNotNone(node)
        stages = ["check." + name for name in harness.CHECK_NAMES + harness.PRODUCT_CHECK_NAMES]
        driver = harness.BOOTSTRAP_SOURCE.split("function silence(", 1)[0]
        driver += "\nfor (const stage of " + json.dumps(stages) + ") emitStage(stage, 'start');\n"
        driver += "emitStage('check.unknown', 'start'); emitStage('check.migration.scope', 'error', []);\n"
        if include_pg_category:
            module_url = pathlib.Path(__file__).with_name("h1-real-e2e.mjs").resolve().as_uri()
            driver += ";(async () => { const {waitForPostgres} = await import(" + json.dumps(module_url) + ");"
            driver += " class FakeClient { async connect() { const error = new Error('private'); error.code = 'ECONNREFUSED'; throw error; } async end() {} }"
            driver += " await waitForPostgres(FakeClient, {database:{host:'fake',port:5432,name:'fake',bootstrapRole:'fake'},secrets:{bootstrapPassword:'private'},runId:'" + "a" * 32 + "',deadlineAt:Date.now()+1}, category => emitStage('postgres_ready','error','RUNTIME_ERROR',category)).catch(() => {}); })();"
        emitted = subprocess.run([node, "-e", driver], capture_output=True, timeout=10)
        self.assertEqual(emitted.returncode, 0)

        from types import SimpleNamespace
        result_value = {"version": 1, "runId": "a" * 32,
                        "checks": [{"name": name, "passed": True} for name in harness.CHECK_NAMES],
                        "productChecks": [{"name": name, "passed": True} for name in harness.PRODUCT_CHECK_NAMES],
                        "productPassed": True, "passed": True}
        stdout = ("H1_REAL_E2E_RESULT=" + json.dumps(result_value) + "\n").encode()
        clock, fs, events = FakeClock(), FakeFS({"/project/qualification.json":
                json.dumps(HostControllerContractTests().qualification()).encode()}), []
        progress_state = {"run_id": None, "cleanup_started": False, "intents": {}, "created": {},
                          "cleaned": set(), "diagnostic_count": 0,
                          "diagnostic_elapsed": {"remote": None, "host": None}}
        def progress(record):
            packet = harness.PosixGuardBoundary._progress_packet(record)
            if packet is not None and packet.get("event") == "diagnostic_stage":
                harness._validate_progress(packet, progress_state)
                events.append(record)
        docker = FakeDocker()
        controller = harness.LifecycleController(docker=docker, filesystem=fs, clock=clock,
            rng=FakeRng(), project_root="/project", output=lambda _summary: None, event_sink=progress)
        controller.started = clock.monotonic()
        controller.deadline = controller.started + harness.WORK_SECONDS

        class Stream:
            def __init__(self, number): self.number = number
            def fileno(self): return self.number
            def close(self): pass
        class Process:
            pid = 54321
            def __init__(self):
                self.stdin, self.stdout, self.stderr = Stream(20), Stream(21), Stream(22)
                self.returncode = None
            def poll(self): return self.returncode
            def wait(self, timeout): self.returncode = 0; return 0
            def kill(self): self.returncode = -9
        process = Process()
        channels = {21: [stdout, b""], 22: [emitted.stderr] if timeout_after_diagnostics else [emitted.stderr, b""]}
        class Selector:
            def __init__(self): self.entries = {}
            def register(self, stream, mask, channel):
                self.entries[stream] = SimpleNamespace(fileobj=stream, data=channel, events=mask)
            def unregister(self, stream): self.entries.pop(stream)
            def get_map(self): return self.entries
            def select(self, _timeout):
                if timeout_after_diagnostics and 22 in channels and len(channels[22]) == 0 and self.entries:
                    clock.now += 46
                    return []
                return [(key, key.events) for key in self.entries.values()]
            def close(self): pass
        def read(fd, _count):
            chunk = channels[fd].pop(0)
            if fd == 22 and not chunk:
                self.assertEqual(sum(item["clock"] == "remote" for item in events), 24 + int(include_pg_category))
            return chunk
        def write(_fd, data): return len(data)
        cli = harness.DockerCLI(clock, controller.started + harness.WORK_SECONDS,
                                lambda record: controller._transport_record(record), isolated_client=False)
        original_execute = docker.execute
        def execute(resource_id, program, stdin):
            if program == harness.PG_BOOTSTRAP_SOURCE:
                return b""
            docker.payload = json.loads(stdin)["payload"]
            result = {**result_value, "runId": docker.payload["runId"]}
            marker = ("H1_REAL_E2E_RESULT=" + json.dumps(result) + "\n").encode()
            channels[21] = [marker, b""]
            return cli.execute(resource_id, program, stdin)
        docker.execute = execute
        with patch.object(harness.subprocess, "Popen", return_value=process), \
             patch.object(harness.selectors, "DefaultSelector", Selector), \
             patch.object(harness.os, "set_blocking"), patch.object(harness.os, "read", side_effect=read), \
             patch.object(harness.os, "write", side_effect=write), patch.object(harness.os, "killpg"):
            summary = controller.run(execute=True, cleanup_owned=True, qualification_path="/project/qualification.json")
        journal = [json.loads(body) for _path, body in fs.writes if json.loads(body).get("event") == "diagnostic_stage"]
        return emitted.stderr, events, journal, progress_state, summary

    def test_actual_emitter_check_ids_flow_through_execute_controller_journal_and_parent_admission(self):
        emitted, events, journal, state, summary = self.run_actual_emitter_through_controller()
        self.assertTrue(summary["passed"])
        self.assertEqual(sum(item["clock"] == "remote" for item in events), 24)
        self.assertEqual(sum(item["clock"] == "host" for item in events), 2)
        self.assertEqual(len(journal), 26)
        self.assertEqual(state["diagnostic_count"], 26)
        self.assertTrue(all(item["stage"] in {"check." + name for name in harness.CHECK_NAMES + harness.PRODUCT_CHECK_NAMES} or item["clock"] == "host" for item in journal))
        self.assertNotIn(b"check.unknown", emitted)

    def test_actual_emitter_frames_persist_when_transport_times_out_after_partial_progress(self):
        _emitted, events, journal, state, summary = self.run_actual_emitter_through_controller(timeout_after_diagnostics=True)
        self.assertFalse(summary["passed"])
        self.assertEqual(summary["failure"], "deadline")
        self.assertEqual(sum(item["clock"] == "remote" for item in events), 24)
        self.assertEqual([(item["stage"], item["phase"]) for item in events if item["clock"] == "host"],
                         [("docker_exec", "start"), ("docker_exec", "error")])
        self.assertEqual(len(journal), 26)  # Accepted remote frames remain journaled at timeout.
        self.assertEqual(state["diagnostic_count"], 26)

    def test_stdin_is_bounded_streamed_and_not_in_child_environment_or_argv(self):
        value = b"synthetic-private" * 8000
        result, error, events, writes, called, killed = self.invoke(stdin=value)
        self.assertIsNone(error)
        self.assertEqual(result, b"")
        self.assertEqual(b"".join(writes), value)
        self.assertTrue(all(len(chunk) <= 65536 for chunk in writes))
        self.assertNotIn("synthetic-private", repr(called))
        self.assertNotIn("synthetic-private", json.dumps(events))
        self.assertIsNone(killed)

    def test_output_flood_and_deadline_kill_only_new_client_and_never_publish_raw_output(self):
        for options in ({"stdout": [b"x" * 16384] * 4 + [b"private"]}, {"expire": True}):
            with self.subTest(options=options.keys()):
                result, error, events, _, _, killed = self.invoke(**options)
                self.assertIsNone(result)
                self.assertIsNotNone(error)
                self.assertEqual(killed.args, (12345, harness.signal.SIGKILL))
                self.assertNotIn("private", json.dumps(events))

    def test_bootstrap_javascript_syntax(self):
        node = shutil.which("node")
        self.assertIsNotNone(node)
        checked = subprocess.run([node, "--check"], input=harness.BOOTSTRAP_SOURCE,
                                 text=True, capture_output=True, timeout=10)
        self.assertEqual(checked.returncode, 0, "embedded bootstrap must parse")
        self.assertEqual(checked.stderr, "")

    def test_actual_bootstrap_emitter_writes_jsonl_newline_to_reserved_stderr(self):
        node = shutil.which("node")
        self.assertIsNotNone(node)
        emitted = subprocess.run([node, "-e", harness.BOOTSTRAP_SOURCE], input=b"{}",
                                 capture_output=True, timeout=10)
        self.assertEqual(emitted.stdout, b"")
        lines = [line for line in emitted.stderr.splitlines() if line.startswith(harness.DIAGNOSTIC_PREFIX)]
        self.assertGreaterEqual(len(lines), 2)
        self.assertTrue(emitted.stderr.endswith(b"\n"))

    def test_actual_remote_postgres_category_reaches_parent_through_emitter_collector_and_journal(self):
        _emitted, events, journal, state, summary = self.run_actual_emitter_through_controller(include_pg_category=True)
        self.assertTrue(summary["passed"])
        categorized = [item for item in events if "pgErrorCategory" in item]
        self.assertEqual(len(categorized), 1)
        self.assertEqual({key: categorized[0][key] for key in ("event", "clock", "stage", "phase", "errorClass", "pgErrorCategory")},
                         {"event": "diagnostic_stage", "clock": "remote", "stage": "postgres_ready",
                          "phase": "error", "errorClass": "RUNTIME_ERROR", "pgErrorCategory": "CONNECTION_REFUSED"})
        self.assertEqual(len([item for item in journal if item.get("pgErrorCategory") == "CONNECTION_REFUSED"]), 1)
        self.assertEqual(state["diagnostic_count"], 27)

    def test_diagnostic_frames_stream_partial_timeout_and_reject_unsafe_metadata(self):
        accepted = []
        collector = harness.DiagnosticFrameCollector(accepted.append)
        valid = b'H1_DIAG_V1 {"version":1,"event":"stage","clock":"remote","stage":"fixture_run","phase":"start","elapsedMs":4}'
        collector.feed(valid[:17])
        collector.feed(valid[17:] + b"\n")
        invalid = [
            b'{"version":1,"event":"stage","clock":"remote","stage":"fixture_run","phase":"start","elapsedMs":true}',
            b'{"version":1,"event":"stage","clock":"remote","stage":"fixture_run","phase":"end","elapsedMs":3}',
            b'{"version":1,"event":"stage","clock":"remote","stage":"fixture_run","phase":"error","elapsedMs":5,"errorClass":"secret"}',
            b'{"version":1,"event":"stage","clock":"remote","stage":"fixture_run","phase":"end","elapsedMs":5,"extra":"secret"}',
            b'{"version":1,"version":1,"event":"stage","clock":"remote","stage":"fixture_run","phase":"end","elapsedMs":5}',
            json.dumps({"version": 1, "event": "stage", "clock": "host", "stage": "postgres_ready", "phase": "error", "elapsedMs": 5, "errorClass": "RUNTIME_ERROR", "pgErrorCategory": "CONNECTION_REFUSED"}).encode(),
            json.dumps({"version": 1, "event": "stage", "clock": "remote", "stage": "fixture_run", "phase": "error", "elapsedMs": 5, "errorClass": "RUNTIME_ERROR", "pgErrorCategory": []}).encode(),
        ]
        for body in invalid:
            collector.feed(b"H1_DIAG_V1 " + body + b"\n")
        collector.feed(b"H1_DIAG_V1 " + b"x" * 600 + b"\n")
        collector.feed(b'H1_DIAG_V1 {"version":1')
        collector.finish()
        self.assertEqual(len(accepted), 1)
        self.assertEqual(accepted[0]["elapsedMs"], 4)
        self.assertEqual(collector.accepted, 1)
        self.assertEqual(collector.partial, bytearray())

    def test_untyped_remote_error_class_is_discarded_and_later_valid_frame_survives(self):
        accepted = []
        collector = harness.DiagnosticFrameCollector(accepted.append)
        bad_values = [[], {}, True, 1]
        for bad in bad_values:
            body = {"version": 1, "event": "stage", "clock": "remote", "stage": "fixture_run",
                    "phase": "error", "elapsedMs": 5, "errorClass": bad}
            collector.feed(harness.DIAGNOSTIC_PREFIX + json.dumps(body).encode() + b"\n")
        valid = {"version": 1, "event": "stage", "clock": "remote", "stage": "fixture_run",
                 "phase": "error", "elapsedMs": 6, "errorClass": "RUNTIME_ERROR"}
        collector.feed(harness.DIAGNOSTIC_PREFIX + json.dumps(valid).encode() + b"\n")
        self.assertEqual(collector.accepted, 1)
        self.assertEqual(accepted[0]["errorClass"], "RUNTIME_ERROR")

    def test_shared_diagnostic_budget_never_emits_more_than_128_including_host_events(self):
        frames = []
        for elapsed in range(129):
            body = {"version": 1, "event": "stage", "clock": "remote", "stage": "fixture_run",
                    "phase": "start", "elapsedMs": elapsed}
            frames.append(harness.DIAGNOSTIC_PREFIX + json.dumps(body).encode() + b"\n")
        _result, error, records, *_ = self.invoke(stderr=frames)
        self.assertIsNone(error)
        accepted = [record for record in records if record.get("event") == "diagnostic_stage"]
        self.assertEqual(len(accepted), 128)
        self.assertEqual(sum(record.get("clock") == "host" for record in accepted), 1)
        self.assertEqual(sum(record.get("clock") == "remote" for record in accepted), 127)

    def test_guarded_client_shares_worker_group_and_timeout_does_not_kill_that_group(self):
        _, error, _, _, called, killed = self.invoke(expire=True, isolated_client=False)
        self.assertIsNotNone(error)
        self.assertFalse(called.kwargs["start_new_session"])
        self.assertIsNone(killed)

    def test_audit_failure_cannot_drop_successful_create_id_before_controller_receives_it(self):
        resource = ("d" * 64 + "\n").encode()
        result, error, _, _, _, _ = self.invoke(stdout=[resource], fail_audit=True)
        self.assertIsNone(error)
        self.assertEqual(result, "d" * 64)


class ExactResultContractTests(unittest.TestCase):
    def result(self):
        return {"version": 1, "runId": "a" * 32,
                "checks": [{"name": name, "passed": True} for name in harness.CHECK_NAMES],
                "productChecks": [{"name": name, "passed": True} for name in harness.PRODUCT_CHECK_NAMES],
                "productPassed": True, "passed": True}

    def test_all_fifteen_dotted_ids_and_single_marker_are_accepted(self):
        value = self.result()
        self.assertEqual(len(value["checks"]), 15)
        encoded = ("H1_REAL_E2E_RESULT=" + json.dumps(value) + "\n").encode()
        self.assertEqual(harness.parse_result_output(encoded, "a" * 32, []), value)

    def test_rejects_missing_duplicate_reordered_extra_and_wrong_typed_result_fields(self):
        base = self.result()
        variants = [
            {**base, "version": True}, {**base, "passed": 1}, {**base, "extra": "private"},
            {**base, "checks": base["checks"][:-1]},
            {**base, "checks": [base["checks"][0]] * 15},
            {**base, "checks": list(reversed(base["checks"]))},
            {**base, "checks": [{"name": name, "passed": 1} for name in harness.CHECK_NAMES]},
        ]
        for value in variants:
            with self.subTest(value=value):
                with self.assertRaises(harness.ResultError):
                    harness.validate_result(value, "a" * 32, [])
        for raw in (b"diagnostic\n", b"\xff", b"x" * 16385,
                    b'H1_REAL_E2E_RESULT={"version":1,"version":1}\n'):
            with self.assertRaises(harness.ResultError):
                harness.parse_result_output(raw, "a" * 32, [])

    def test_archive_paths_and_frozen_pair_locator_remain_correct(self):
        self.assertEqual(harness.SERVICE_RELATIVE, "backend/src/auth/change-password.service.ts")
        self.assertEqual(harness.SPEC_RELATIVE, "backend/src/auth/change-password.service.spec.ts")
        for path in ("../outside.ts", "/absolute.ts", "backend/src/generated/client.ts",
                     "backend/src/auth/x.spec.ts", "backend/.env", "backend/node_modules/x.ts",
                     "backend/src/link/../../escape.ts", "backend/src/a\\b.ts"):
            self.assertFalse(harness.archive_path_allowed(path), path)
        self.assertIn("backend/tsconfig.build.json", harness.REQUIRED_INPUTS)
        self.assertIn("backend/prisma.schema.config.ts", harness.REQUIRED_INPUTS)
        self.assertIn("backend/scripts/copy-auth-resources-cli.mjs", harness.REQUIRED_INPUTS)


class DockerArgumentContractTests(unittest.TestCase):
    def test_temporary_bootstrap_adds_scoped_scram_rule_before_start(self):
        # Only filesystem/tool boundaries are replaced; execute the actual shell program.
        with tempfile.TemporaryDirectory(prefix="h1-hba-regression-") as temporary:
            root = pathlib.Path(temporary)
            for name in ("bin", "data", "socket"):
                (root / name).mkdir()
            loopback = "host all all 127.0.0.1/32 scram-sha-256\n"
            tools = {
                "initdb": "printf 'host all all 127.0.0.1/32 scram-sha-256\\n' > \"$H1_TEST_ROOT/data/pg_hba.conf\"",
                "pg_ctl": 'cat "$H1_TEST_ROOT/data/pg_hba.conf" > "$H1_TEST_ROOT/at-start"',
                "createdb": "exit 0",
            }
            for name, body in tools.items():
                tool = root / "bin" / name
                tool.write_text("#!/bin/bash\nset -euo pipefail\n" + body + "\n")
                tool.chmod(0o700)
            source = harness.PG_BOOTSTRAP_SOURCE
            for original, target in (("/usr/lib/postgresql/17/bin", root / "bin"),
                                     ("/var/lib/postgresql/data", root / "data"),
                                     ("/var/run/postgresql", root / "socket"),
                                     ("/tmp/h1-bootstrap", root / "h1-bootstrap")):
                source = source.replace(original, str(target))
            run_id, password = "a" * 32, "b" * 64
            result = subprocess.run(["/bin/bash", "-ceu", source],
                input=(run_id + "\n" + password + "\n").encode(), capture_output=True, timeout=5,
                env={"PATH": "/usr/bin:/bin", "H1_TEST_ROOT": temporary})
            self.assertEqual(result.returncode, 0)
            self.assertEqual(result.stdout, b"")
            self.assertEqual(result.stderr, b"")
            roles = ",".join("h1_" + name + "_" + run_id for name in ("bootstrap", "migration", "app", "observer"))
            expected = loopback + "host h1_db_" + run_id + " " + roles + " samenet scram-sha-256\n"
            self.assertEqual((root / "at-start").read_text(), expected)
            self.assertEqual((root / "data/pg_hba.conf").read_text(), expected)
            self.assertEqual((root / "h1-bootstrap.pw").read_text(), password + "\n")

    def test_stop_uses_supported_timeout_without_deprecation_stdout(self):
        cli = self.transport()
        identity = "c" * 64
        def actual_shaped_output(args, **kwargs):
            cli.calls.append((args, kwargs))
            notice = b"Flag --time has been deprecated, use --timeout instead\n" if "--time" in args else b""
            return notice + (identity + "\n").encode()
        cli._call = actual_shaped_output
        cli.stop(identity, 1)
        self.assertEqual(cli.calls, [(["stop", "--timeout", "1", identity], {"timeout": 2})])

    def test_stop_still_rejects_mismatched_immutable_acknowledgement(self):
        cli = self.transport()
        with patch.object(cli, "_call", return_value=("d" * 64 + "\n").encode()):
            with self.assertRaises(harness.DockerCallError) as observed:
                cli.stop("c" * 64, 1)
        self.assertTrue(observed.exception.ambiguous)

    def transport(self):
        class RecordingCLI(harness.DockerCLI):
            def _call(self, args, **kwargs):
                self.calls.append((args, kwargs))
                return ("c" * 64 + "\n").encode()
        cli = RecordingCLI(FakeClock(), 200, lambda _record: None)
        cli.calls = []
        return cli

    def test_create_has_nonroot_readonly_no_pull_internal_mount_and_resource_limits(self):
        cli = self.transport()
        controller = HostControllerContractTests().controller()
        controller.qualification = harness.validate_qualification(HostControllerContractTests().qualification())
        pg, app = controller.container_configs("b" * 64)
        for image, config in ((harness.POSTGRES_IMAGE, pg), (harness.APP_IMAGE, app)):
            cli.create("container", "h1-test", image, controller._labels(), config)
            args = cli.calls[-1][0]
            for token in ("--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--pids-limit", "--memory", "--cpus", "--pull", "never", "--log-driver", "none"):
                self.assertIn(token, args)
            self.assertNotIn("--publish", args)
            self.assertNotIn("--privileged", args)
            self.assertNotEqual(config["user"], "0:0")
            self.assertEqual(config["network"], "b" * 64)
            self.assertFalse(any("docker.sock" in token for token in args))
        mount = cli.calls[-1][0]
        self.assertIn("type=volume,source=" + harness.DEPENDENCY_VOLUME + ",target=/deps,readonly,volume-nocopy", mount)
        self.assertNotIn("--mount", cli.calls[0][0])
        self.assertEqual(len(pg["tmpfs"]), 3)
        cli.create("network", "h1-net", "", controller._labels(), {})
        self.assertIn("--internal", cli.calls[-1][0])

    def test_program_and_stdin_are_separate_and_exec_uses_full_id(self):
        cli = self.transport()
        cli.execute("c" * 64, harness.BOOTSTRAP_SOURCE, b"synthetic private stdin")
        args, kwargs = cli.calls[-1]
        self.assertEqual(args[:3], ["exec", "-i", "c" * 64])
        self.assertEqual(kwargs["stdin"], b"synthetic private stdin")
        self.assertNotIn("synthetic private stdin", " ".join(args))
        self.assertIn("/deps/correction-1/node_modules", harness.BOOTSTRAP_SOURCE)
        self.assertNotIn('require("tar")', harness.BOOTSTRAP_SOURCE)


class FakeGuardBoundary:
    """Scheduled packets and clock ticks only; never forks, signals or opens FDs."""
    def __init__(self, clock, packets=(), *, exit_observed=True, writable=True):
        self.clock, self.packets = clock, list(packets)
        self.calls, self.reports = [], []
        self.eof = False
        self.interrupted = False
        self.exit_observed, self.writable = exit_observed, writable
        self.timeouts = []
        self.raise_receive = False
        self.raise_emit = False

    def start(self, args, started):
        self.calls.append(("start", started, args.execute, args.cleanup_owned, args.qualification))

    def receive(self, timeout):
        self.timeouts.append(timeout)
        if self.raise_receive: raise OSError("synthetic receive failure")
        until = self.clock.now + timeout
        if self.packets and self.packets[0][0] <= until:
            at, packet = self.packets.pop(0)
            self.clock.now = max(self.clock.now, at)
            if packet == "EOF": self.eof = True; return None
            if packet == "INTERRUPT": self.interrupted = True; return None
            return packet
        self.clock.now = until
        return None

    def request_cleanup(self): self.calls.append(("cleanup", self.clock.now))
    def stop(self, until):
        self.calls.append(("stop_group_before_reap", self.clock.now, until))
        return self.exit_observed
    def emit(self, report):
        if self.raise_emit: raise OSError("synthetic emit failure")
        self.reports.append(json.dumps(report, sort_keys=True, separators=(",", ":")) + "\n")
        return self.writable
    def close(self): self.calls.append(("close", self.clock.now))


class IndependentGuardContractTests(unittest.TestCase):
    def options(self, **overrides):
        from types import SimpleNamespace
        values = {"execute": True, "cleanup_owned": True, "qualification": "odd/qualification.json"}
        values.update(overrides)
        return SimpleNamespace(**values)

    def events(self, *, completed=True):
        run_id = "a" * 32
        result = ExactResultContractTests().result()
        events = [(100.1, {"type": "ready", "outputSafe": True})]
        resources = [("network", "h1-net-", "", "b" * 64),
                     ("container", "h1-pg-", harness.POSTGRES_IMAGE, "c" * 64),
                     ("container", "h1-app-", harness.APP_IMAGE, "d" * 64)]
        for index, (kind, prefix, image, resource_id) in enumerate(resources):
            base = {"type": "progress", "runId": run_id, "kind": kind, "name": prefix + run_id, "image": image}
            events.append((101 + index, {**base, "event": "create_intent"}))
            events.append((101.1 + index, {**base, "event": "created", "id": resource_id}))
        if not completed: return events
        events.append((104, {"type": "progress", "runId": run_id, "event": "cleanup_started"}))
        for index, (kind, _, _, resource_id) in enumerate(reversed(resources)):
            events.append((104.1 + index / 10, {"type": "progress", "runId": run_id,
                          "event": "cleaned", "id": resource_id, "kind": kind}))
        summary = {"version": 1, "runId": run_id, "result": result, "cleanupComplete": True,
                   "auditComplete": True, "failure": None, "passed": True}
        events.extend([(105, {"type": "result", "value": summary}), (105.1, {"type": "exit", "code": 0})])
        return events

    def run_guard(self, packets=(), **kwargs):
        clock = FakeClock()
        boundary = FakeGuardBoundary(clock, packets, **kwargs)
        with patch.object(harness.signal, "signal", return_value=None):
            code = harness.supervise(self.options(), boundary=boundary, clock=clock)
        return code, clock, boundary

    def test_diagnostic_stage_progress_is_admitted_without_changing_legacy_ledger(self):
        packet = {"type": "progress", "runId": "a" * 32, "event": "diagnostic_stage",
                  "clock": "remote", "stage": "fixture_run", "phase": "start", "elapsedMs": 7}
        state = {"run_id": None, "cleanup_started": False, "intents": {},
                 "created": {}, "cleaned": set(), "diagnostic_count": 0,
                 "diagnostic_elapsed": {"remote": None, "host": None}}
        harness._validate_progress(packet, state)
        self.assertEqual(state["run_id"], "a" * 32)
        self.assertEqual(state["diagnostic_count"], 1)
        self.assertEqual(state["diagnostic_elapsed"]["remote"], 7)
        self.assertEqual(state["intents"], {})
        self.assertEqual(state["created"], {})
        self.assertEqual(state["cleaned"], set())

    def test_parent_progress_accepts_every_exact_check_stage_and_rejects_unknown(self):
        state = {"run_id": None, "cleanup_started": False, "intents": {}, "created": {},
                 "cleaned": set(), "diagnostic_count": 0,
                 "diagnostic_elapsed": {"remote": None, "host": None}}
        stages = ["check." + name for name in harness.CHECK_NAMES + harness.PRODUCT_CHECK_NAMES]
        for elapsed, stage in enumerate(stages):
            packet = {"type": "progress", "runId": "a" * 32, "event": "diagnostic_stage",
                      "clock": "remote", "stage": stage, "phase": "start", "elapsedMs": elapsed}
            harness._validate_progress(packet, state)
        self.assertEqual(state["diagnostic_count"], 24)
        unknown = {"type": "progress", "runId": "a" * 32, "event": "diagnostic_stage",
                   "clock": "remote", "stage": "check.unknown", "phase": "start", "elapsedMs": 24}
        with self.assertRaises(harness.ResultError):
            harness._validate_progress(unknown, state)
        self.assertEqual(state["diagnostic_count"], 24)

    def test_untyped_error_class_is_rejected_without_state_mutation(self):
        state = {"run_id": "a" * 32, "cleanup_started": False, "intents": {}, "created": {},
                 "cleaned": set(), "diagnostic_count": 0,
                 "diagnostic_elapsed": {"remote": None, "host": None}}
        for value in ([], {}, True, 1):
            packet = {"type": "progress", "runId": "a" * 32, "event": "diagnostic_stage",
                      "clock": "remote", "stage": "fixture_run", "phase": "error",
                      "elapsedMs": 1, "errorClass": value}
            before = (state["diagnostic_count"], dict(state["diagnostic_elapsed"]))
            with self.subTest(value=value), self.assertRaises(harness.ResultError):
                harness._validate_progress(packet, state)
            self.assertEqual((state["diagnostic_count"], state["diagnostic_elapsed"]), before)

    def test_diagnostic_progress_rejections_leave_counters_and_legacy_state_unchanged(self):
        state = {"run_id": "a" * 32, "cleanup_started": False, "intents": {},
                 "created": {}, "cleaned": set(), "diagnostic_count": 1,
                 "diagnostic_elapsed": {"remote": 7, "host": None}}
        invalid = [
            {"type": "progress", "runId": "a" * 32, "event": "diagnostic_stage", "clock": "remote", "stage": "fixture_run", "phase": "end", "elapsedMs": 6},
            {"type": "progress", "runId": "a" * 32, "event": "diagnostic_stage", "clock": "remote", "stage": "fixture_run", "phase": "end", "elapsedMs": True},
            {"type": "progress", "runId": "a" * 32, "event": "diagnostic_stage", "clock": "remote", "stage": "fixture_run", "phase": "error", "elapsedMs": 8, "errorClass": "private-message"},
            {"type": "progress", "runId": "a" * 32, "event": "diagnostic_stage", "clock": "remote", "stage": "fixture_run", "phase": "end", "elapsedMs": 8, "extra": "private"},
            {"type": "progress", "runId": "a" * 32, "event": "diagnostic_stage", "clock": "host", "stage": "postgres_ready", "phase": "error", "elapsedMs": 8, "errorClass": "RUNTIME_ERROR", "pgErrorCategory": "CONNECTION_REFUSED"},
            {"type": "progress", "runId": "a" * 32, "event": "diagnostic_stage", "clock": "remote", "stage": "postgres_ready", "phase": "error", "elapsedMs": 8, "errorClass": "RUNTIME_ERROR", "pgErrorCategory": []},
        ]
        for packet in invalid:
            before = json.dumps({key: value for key, value in state.items() if key != "cleaned"}, sort_keys=True)
            with self.subTest(packet=packet), self.assertRaises(harness.ResultError):
                harness._validate_progress(packet, state)
            after = json.dumps({key: value for key, value in state.items() if key != "cleaned"}, sort_keys=True)
            self.assertEqual(after, before)
        self.assertEqual(state["cleaned"], set())

    def test_default_production_persistence_tracks_validated_worker_summary_presence(self):
        clock = FakeClock()
        class ProductionFakeBoundary(FakeGuardBoundary, harness.PosixGuardBoundary):
            pass
        class FakeFilesystem:
            def __init__(self, root): self.root = root
            def write_private(self, path, data): writes.append((path, json.loads(data)))

        def run(packets):
            nonlocal clock
            clock = FakeClock()
            boundary = ProductionFakeBoundary(clock, packets)
            writes.clear()
            class CompletedSidecarProcess:
                def __init__(self, root, target, data): self.args = (root, target, data)
                stdin = None
                returncode = 0
                def communicate(self, _request, timeout):
                    self.assert_timeout = timeout
                    FakeFilesystem(self.args[0]).write_private(self.args[1], self.args[2])
                    return None, None
            with patch.object(harness, "HostFilesystem", FakeFilesystem), \
                 patch.object(harness.signal, "signal", return_value=None):
                code = harness.supervise(self.options(), boundary=boundary, clock=clock,
                                         sidecar_process_factory=lambda root, target, data:
                                         CompletedSidecarProcess(root, target, data))
            self.assertEqual(len(writes), 1)
            self.assertTrue(writes[0][0].endswith("/supervisor-diagnostic.json"))
            return code, boundary, writes[0][1]

        writes = []
        missing_code, missing_boundary, missing_sidecar = run(self.events(completed=False))
        self.assertEqual(missing_code, 1)
        self.assertEqual(json.loads(missing_boundary.reports[0])["failure"], "deadline")
        self.assertIs(missing_sidecar["summaryPresent"], False)

        valid_code, valid_boundary, valid_sidecar = run(self.events())
        self.assertEqual(valid_code, 0)
        self.assertEqual(json.loads(valid_boundary.reports[0])["passed"], True)
        self.assertIs(valid_sidecar["summaryPresent"], True)

    def test_supervise_emits_safe_sidecar_to_injected_memory_sink_after_worker_exit(self):
        clock = FakeClock()
        boundary = FakeGuardBoundary(clock, self.events())
        captured = []
        with patch.object(harness.signal, "signal", return_value=None):
            code = harness.supervise(self.options(), boundary=boundary, clock=clock, memory_sink=captured.append)
        self.assertEqual(code, 0)
        self.assertEqual(captured, [{"version": 1, "runId": "a" * 32, "parentReason": "NONE",
            "cleanupRequested": False, "cleanupStarted": True, "summaryPresent": True,
            "workerExitObserved": True}])
        self.assertEqual(len(boundary.reports), 1)

    def test_supervisor_sink_failure_does_not_change_public_report_or_exit(self):
        plain_code, _clock, plain = self.run_guard(self.events())
        clock = FakeClock()
        boundary = FakeGuardBoundary(clock, self.events())
        with patch.object(harness.signal, "signal", return_value=None):
            code = harness.supervise(self.options(), boundary=boundary, clock=clock,
                                     memory_sink=lambda _record: (_ for _ in ()).throw(OSError("private sink failure")))
        self.assertEqual(code, plain_code)
        self.assertEqual(boundary.reports, plain.reports)
        self.assertEqual(boundary.calls, plain.calls)

    def test_parent_sidecar_reason_does_not_rewrite_child_failure(self):
        events = self.events()
        child = events[-2][1]["value"]
        child["result"]["checks"][0]["passed"] = False
        child["result"]["passed"] = False
        child["failure"] = "fixture"
        child["passed"] = False
        clock, boundary, captured = FakeClock(), None, []
        boundary = FakeGuardBoundary(clock, events)
        with patch.object(harness.signal, "signal", return_value=None):
            code = harness.supervise(self.options(), boundary=boundary, clock=clock, memory_sink=captured.append)
        self.assertEqual(code, 1)
        report = json.loads(boundary.reports[0])
        self.assertEqual(report["failure"], "fixture")
        self.assertEqual(captured[0]["parentReason"], "NONE")
        self.assertTrue(captured[0]["summaryPresent"])

    def test_supervisor_does_not_emit_sidecar_without_observed_worker_exit(self):
        clock = FakeClock()
        boundary = FakeGuardBoundary(clock, self.events(), exit_observed=False)
        captured = []
        with patch.object(harness.signal, "signal", return_value=None):
            code = harness.supervise(self.options(), boundary=boundary, clock=clock, memory_sink=captured.append)
        self.assertEqual(code, 1)
        self.assertEqual(captured, [])

    def test_parent_sidecar_persistence_is_bounded_before_report_emission(self):
        clock = FakeClock()
        class ProductionFakeBoundary(FakeGuardBoundary, harness.PosixGuardBoundary):
            pass
        boundary = ProductionFakeBoundary(clock, self.events())
        class SlowWorker:
            stdin = None
            returncode = None
            def __init__(self): self.terminated = False; self.timeouts = []
            def communicate(self, _request, timeout):
                self.timeouts.append(timeout)
                clock.sleep(timeout)
                raise subprocess.TimeoutExpired("synthetic-sidecar", timeout)
            def kill(self): self.terminated = True; self.returncode = -9
            def wait(self, timeout):
                self.timeouts.append(timeout)
                clock.sleep(timeout)
                return self.returncode
        worker = SlowWorker()
        persistence_started = []
        def factory(_root, _target, _data):
            persistence_started.append(clock.now)
            return worker
        with patch.object(harness.signal, "signal", return_value=None):
            code = harness.supervise(self.options(), boundary=boundary, clock=clock,
                                     sidecar_process_factory=factory)
        self.assertEqual(code, 0)
        self.assertEqual(len(boundary.reports), 1)
        self.assertTrue(worker.terminated)
        self.assertEqual(worker.timeouts, [harness.SIDECAR_WRITE_SECONDS, harness.SIDECAR_STOP_SECONDS])
        self.assertLessEqual(clock.now - persistence_started[0],
                             harness.SIDECAR_WRITE_SECONDS + harness.SIDECAR_STOP_SECONDS)

    def test_sidecar_stall_kills_and_reaps_only_its_helper_and_parent_exits_bounded(self):
        with tempfile.TemporaryDirectory(prefix="h1-sidecar-stall-") as temp:
            # Match the canonical project root used by the production filesystem guard.
            root = pathlib.Path(temp).resolve(strict=True)
            run_id = "a" * 32
            target = root / "odd/probes/h1-real-e2e" / run_id / "supervisor-diagnostic.json"
            target.parent.mkdir(parents=True)
            marker = target.with_name("fsync-entered")
            parent_code = r'''import importlib.util, json, pathlib, subprocess, sys, time
source, root, target, marker = sys.argv[1:]
spec = importlib.util.spec_from_file_location("h1_real_e2e_test_parent", source)
harness = importlib.util.module_from_spec(spec); sys.modules[spec.name] = harness; spec.loader.exec_module(harness)
worker_code = r"""import base64, importlib.util, json, os, pathlib, signal, sys, time
spec=importlib.util.spec_from_file_location("h1_real_e2e_test_child",sys.argv[1])
module=importlib.util.module_from_spec(spec); sys.modules[spec.name]=module; spec.loader.exec_module(module)
request=json.load(sys.stdin)
def blocked_fsync(_descriptor):
 pathlib.Path(sys.argv[2]).write_text("entered")
 signal.signal(signal.SIGTERM,signal.SIG_IGN)
 while True: time.sleep(0.05)
os.fsync=blocked_fsync
module.HostFilesystem(request["root"]).write_private(request["target"],base64.b64decode(request["data"],validate=True))
"""
helper = None
def factory(_root, _target, _data):
 global helper
 helper = subprocess.Popen([sys.executable,"-I","-S","-B","-c",worker_code,source,marker],
                           stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,close_fds=True)
 return helper
started=time.monotonic()
result=harness._persist_sidecar_bounded(root,target,b"safe",factory)
print(json.dumps({"result":result,"pid":helper.pid,"returncode":helper.returncode,
                  "elapsed":time.monotonic()-started}),flush=True)
'''
            started = time.monotonic()
            parent = subprocess.Popen(
                [sys.executable, "-I", "-S", "-B", "-c", parent_code,
                 str(pathlib.Path(harness.__file__).resolve()), str(root), str(target), str(marker)],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True)
            stdout, stderr = parent.communicate(timeout=2)
            elapsed = time.monotonic() - started
            self.assertEqual(parent.returncode, 0, stderr.decode())
            result = json.loads(stdout)
            self.assertTrue(marker.is_file(), "child never reached the private-write fsync boundary")
            self.assertEqual(target.read_bytes(), b"safe")
            self.assertEqual(result["result"], "stalled_reaped")
            self.assertEqual(result["returncode"], -9)
            self.assertLess(elapsed, 2)
            self.assertLess(result["elapsed"], 1)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_spawned_sidecar_helper_preserves_private_exclusive_write(self):
        with tempfile.TemporaryDirectory(prefix="h1-sidecar-write-") as temp:
            # Match the canonical project root used by the production filesystem guard.
            root = pathlib.Path(temp).resolve(strict=True)
            target = root / "odd/probes/h1-real-e2e" / ("a" * 32) / "supervisor-diagnostic.json"
            target.parent.mkdir(parents=True)
            self.assertEqual(harness._persist_sidecar_bounded(str(root), str(target), b"safe"), "written")
            self.assertEqual(target.read_bytes(), b"safe")
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertEqual(harness._persist_sidecar_bounded(str(root), str(target), b"replacement"), "failed")
            self.assertEqual(target.read_bytes(), b"safe")

    def test_valid_completed_pipeline_emits_exact_report_and_reaps_without_filesystem_or_daemon_in_parent(self):
        # These boundaries must never be called by the timer process, even for admission.
        with patch.object(harness, "HostFilesystem", side_effect=AssertionError("parent filesystem")), \
             patch.object(harness, "DockerCLI", side_effect=AssertionError("parent daemon")), \
             patch.object(harness.secrets, "token_bytes", side_effect=AssertionError("parent randomness")):
            code, clock, guard = self.run_guard(self.events())
        expected = self.events()[-2][1]["value"]
        expected = {**expected, "workerExitObserved": True, "retained": [], "createOutcomeUncertain": False}
        self.assertEqual(code, 0)
        self.assertEqual(guard.reports, [json.dumps(expected, sort_keys=True, separators=(",", ":")) + "\n"])
        self.assertLess(clock.now, 145)
        self.assertEqual([call[0] for call in guard.calls], ["start", "stop_group_before_reap", "close"])

    def test_stalled_admission_requests_cleanup_once_at_exact_work_deadline(self):
        code, clock, guard = self.run_guard()
        self.assertEqual(code, 1)
        self.assertEqual(clock.now, 160)
        cleanup_calls = [call for call in guard.calls if call[0] == "cleanup"]
        self.assertEqual(len(cleanup_calls), 1)
        self.assertEqual(cleanup_calls[0][1], 145)
        self.assertIn(0, guard.timeouts)
        self.assertEqual(guard.reports, [])

    def test_stalled_admission_before_ready_ends_at_total_deadline_without_attempt_or_report(self):
        code, clock, guard = self.run_guard()
        self.assertEqual(code, 1)
        self.assertEqual(clock.now, 160)
        self.assertEqual([call[0] for call in guard.calls], ["start", "cleanup", "stop_group_before_reap", "close"])
        self.assertEqual(guard.calls[1][1], 145)
        self.assertEqual(guard.reports, [])

    def test_stalled_archive_or_fsync_retains_recorded_ids_and_cannot_claim_daemon_cleanup(self):
        code, clock, guard = self.run_guard(self.events(completed=False))
        self.assertEqual(code, 1)
        self.assertEqual(clock.now, 160)
        value = json.loads(guard.reports[0])
        self.assertEqual(value["failure"], "deadline")
        self.assertFalse(value["passed"])
        self.assertFalse(value["cleanupComplete"])
        self.assertFalse(value["auditComplete"])
        self.assertIsNone(value["result"])
        self.assertEqual({item["id"] for item in value["retained"]}, {"b" * 64, "c" * 64, "d" * 64})
        self.assertEqual(len([call for call in guard.calls if call[0] == "start"]), 1)

    def test_stalled_cleanup_is_not_restarted_and_still_cut_at_sixty(self):
        events = self.events(completed=False) + [(104, {"type": "progress", "runId": "a" * 32, "event": "cleanup_started"})]
        code, clock, guard = self.run_guard(events)
        self.assertEqual(code, 1)
        self.assertEqual(clock.now, 160)
        self.assertFalse(any(call[0] == "cleanup" for call in guard.calls))
        self.assertFalse(json.loads(guard.reports[0])["cleanupComplete"])

    def test_uncertain_create_never_adopted_by_name(self):
        events = self.events(completed=False)[:2]  # ready then intent, no returned ID
        code, _, guard = self.run_guard(events)
        self.assertEqual(code, 1)
        report = json.loads(guard.reports[0])
        self.assertTrue(report["createOutcomeUncertain"])
        self.assertEqual(report["retained"], [])
        self.assertFalse(report["cleanupComplete"])

    def test_explicit_uncertain_create_is_not_adopted_or_counted_as_cleaned(self):
        run_id = "a" * 32
        intent = {"type": "progress", "runId": run_id, "event": "create_intent",
                  "kind": "container", "name": "h1-pg-" + run_id, "image": harness.POSTGRES_IMAGE}
        uncertain = {"type": "progress", "runId": run_id, "event": "create_uncertain",
                     "kind": "container", "name": "h1-pg-" + run_id}
        code, _, guard = self.run_guard([
            (100.1, {"type": "ready", "outputSafe": True}),
            (101, intent), (101.1, uncertain),
        ])
        self.assertEqual(code, 1)
        report = json.loads(guard.reports[0])
        self.assertTrue(report["createOutcomeUncertain"])
        self.assertEqual(report["retained"], [])
        self.assertFalse(report["cleanupComplete"])
        self.assertFalse(report["passed"])

    def test_malformed_secret_bearing_progress_and_summary_are_not_forwarded(self):
        for packet in ({"type": "progress", "runId": "private-password"},
                       {"type": "result", "value": {"private": "private-password"}}):
            with self.subTest(packet=packet):
                code, _, guard = self.run_guard([(100.1, {"type": "ready", "outputSafe": True}), (101, packet)])
                self.assertEqual(code, 1)
                self.assertNotIn("private-password", "".join(guard.reports))
                self.assertFalse(json.loads(guard.reports[0])["passed"])
                self.assertEqual(json.loads(guard.reports[0])["failure"], "ipc")

    def test_interrupt_and_boundary_exceptions_still_stop_worker_before_close(self):
        code, _, guard = self.run_guard([(100.1, {"type": "ready", "outputSafe": True}), (101, "INTERRUPT")])
        self.assertEqual(code, 1)
        self.assertLess([call[0] for call in guard.calls].index("stop_group_before_reap"),
                        [call[0] for call in guard.calls].index("close"))
        self.assertEqual(json.loads(guard.reports[0])["failure"], "interrupted")
        handlers, signal_calls = {}, []
        def fake_signal(number, handler):
            signal_calls.append((number, handler))
            old = handlers.get(number, "original")
            handlers[number] = handler
            return old
        class ParentCancelled(FakeGuardBoundary):
            def start(self, args, started):
                super().start(args, started)
                handlers[harness.signal.SIGINT](harness.signal.SIGINT, None)
        clock = FakeClock()
        cancelled = ParentCancelled(clock)
        with patch.object(harness.signal, "signal", side_effect=fake_signal):
            self.assertEqual(harness.supervise(self.options(), boundary=cancelled, clock=clock), 1)
        cleanup = [call for call in cancelled.calls if call[0] == "cleanup"]
        self.assertEqual(len(cleanup), 1)
        self.assertEqual(cleanup[0][1], 100)
        self.assertLessEqual(clock.now, 115)
        self.assertTrue(any(handler == "original" for _, handler in signal_calls))
        code, _, rejected = self.run_guard([
            (100.1, {"type": "ready", "outputSafe": True}),
            (101, {"type": "rejected"}),
        ])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(rejected.reports[0])["failure"], "admission")
        code, _, premature = self.run_guard([(100.1, {"type": "ready", "outputSafe": True}), (101, "EOF")])
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(premature.reports[0])["failure"], "worker")
        class PartialStart(FakeGuardBoundary):
            def start(self, args, started):
                super().start(args, started)
                raise OSError("synthetic partial start")
        clock = FakeClock()
        partial = PartialStart(clock)
        with patch.object(harness.signal, "signal", return_value=None):
            self.assertEqual(harness.supervise(self.options(), boundary=partial, clock=clock), 1)
        names = [call[0] for call in partial.calls]
        self.assertIn("stop_group_before_reap", names)
        self.assertLess(names.index("stop_group_before_reap"), names.index("close"))
        for failure in ("receive", "emit"):
            with self.subTest(failure=failure):
                clock = FakeClock()
                guard = FakeGuardBoundary(clock, [(100.1, {"type": "ready", "outputSafe": True})])
                setattr(guard, "raise_" + failure, True)
                with patch.object(harness.signal, "signal", return_value=None):
                    code = harness.supervise(self.options(), boundary=guard, clock=clock)
                self.assertEqual(code, 1)
                names = [call[0] for call in guard.calls]
                self.assertIn("stop_group_before_reap", names)
                self.assertLess(names.index("stop_group_before_reap"), names.index("close"))

    def test_unobserved_worker_exit_or_blocked_output_does_not_return_success(self):
        for kwargs in ({"exit_observed": False}, {"writable": False}):
            with self.subTest(kwargs=kwargs):
                code, _, guard = self.run_guard(self.events(), **kwargs)
                self.assertEqual(code, 1)
                if not kwargs.get("exit_observed", True):
                    report = json.loads(guard.reports[0])
                    self.assertFalse(report["passed"])
                    self.assertFalse(report["workerExitObserved"])

    def test_result_before_ledger_identity_is_rejected_and_never_promoted(self):
        events = self.events(completed=False)
        ready = events[0]
        result_a = ExactResultContractTests().result()
        summary_a = {"version": 1, "runId": "a" * 32, "result": result_a,
                     "cleanupComplete": True, "auditComplete": True, "failure": None, "passed": True}
        run_b = "e" * 32
        for conflict in (
            {"type": "progress", "runId": run_b, "event": "create_intent",
             "kind": "network", "name": "h1-net-" + run_b, "image": ""},
            {"type": "result", "value": {**summary_a, "runId": run_b}},
        ):
            with self.subTest(conflict=conflict["type"]):
                events = [ready, (101, {"type": "result", "value": summary_a}), (101.1, conflict)]
                code, _, guard = self.run_guard(events)
                self.assertEqual(code, 1)
                report = json.loads(guard.reports[0])
                self.assertFalse(report["passed"])
                self.assertEqual(report["failure"], "ipc")
                self.assertFalse(report["cleanupComplete"])
                self.assertFalse(report["auditComplete"])
                self.assertFalse(report["createOutcomeUncertain"])
                self.assertEqual(report["retained"], [])
                self.assertEqual([call[0] for call in guard.calls].count("cleanup"), 0)
                self.assertEqual([call[0] for call in guard.calls].count("start"), 1)

    def test_qualified_parent_exceptions_emit_one_sanitized_recovery_report(self):
        run_id = "a" * 32
        known = [("network", "h1-net-", "", "b" * 64),
                 ("container", "h1-pg-", harness.POSTGRES_IMAGE, "c" * 64)]
        packets = [(100.1, {"type": "ready", "outputSafe": True})]
        for index, (kind, prefix, image, resource_id) in enumerate(known):
            base = {"type": "progress", "runId": run_id, "kind": kind,
                    "name": prefix + run_id, "image": image}
            packets.extend([(101 + index, {**base, "event": "create_intent"}),
                            (101.1 + index, {**base, "event": "created", "id": resource_id})])
        packets.append((103, {"type": "progress", "runId": run_id, "event": "create_intent",
                              "kind": "container", "name": "h1-app-" + run_id, "image": harness.APP_IMAGE}))

        class QualifiedFailure(FakeGuardBoundary):
            def __init__(self, clock, failure):
                super().__init__(clock, packets)
                self.failure = failure
            def receive(self, timeout):
                if self.clock.now >= 145 and self.failure == "drain_receive":
                    raise OSError("private synthetic receive secret")
                if self.clock.now >= 145 and self.failure == "drain_validation":
                    self.failure = "drain_validation_delivered"
                    return {"type": "progress", "runId": "e" * 32, "event": "cleanup_started"}
                return super().receive(timeout)
            def request_cleanup(self):
                self.calls.append(("cleanup", self.clock.now))
                if self.failure == "cleanup_signal":
                    raise OSError("private synthetic signal secret")

        for failure in ("drain_receive", "drain_validation", "cleanup_signal"):
            with self.subTest(failure=failure):
                clock = FakeClock()
                boundary = QualifiedFailure(clock, failure)
                with patch.object(harness.signal, "signal", return_value=None):
                    code = harness.supervise(self.options(), boundary=boundary, clock=clock)
                self.assertEqual(code, 1)
                self.assertEqual(len(boundary.reports), 1)
                report_text = boundary.reports[0]
                self.assertNotIn("private synthetic", report_text)
                report = json.loads(report_text)
                self.assertEqual(report, {"version": 1, "runId": run_id, "result": None,
                    "cleanupComplete": False, "auditComplete": False, "failure": "guard" if failure == "cleanup_signal" else "ipc",
                    "passed": False, "workerExitObserved": True,
                    "retained": [{"kind": "network", "id": "b" * 64}, {"kind": "container", "id": "c" * 64}],
                    "createOutcomeUncertain": True})
                names = [call[0] for call in boundary.calls]
                self.assertEqual(names.count("start"), 1)
                self.assertEqual(names.count("stop_group_before_reap"), 1)
                self.assertLess(names.index("stop_group_before_reap"), names.index("close"))
                self.assertNotIn("cleanup", names if failure == "drain_receive" else [])

    def test_summary_rejects_untrusted_failure_strings_and_extra_fields(self):
        state = {"run_id": "a" * 32}
        summary = {"version": 1, "runId": "a" * 32, "result": None,
                   "cleanupComplete": False, "auditComplete": False,
                   "failure": "secret child diagnostic", "passed": False}
        self.assertFalse(harness._valid_summary(summary, state))
        self.assertFalse(harness._valid_summary({**summary, "extra": "private"}, state))

    def test_cli_still_forwards_existing_flags_and_exit_code_without_unrequested_new_options(self):
        for code in (0, 1):
            with self.subTest(code=code):
                with patch.object(harness, "supervise", return_value=code) as supervise:
                    self.assertEqual(harness.main(["--execute", "--cleanup-owned", "--qualification", "odd/q.json"]), code)
                options = supervise.call_args.args[0]
                self.assertTrue(options.execute)
                self.assertTrue(options.cleanup_owned)
                self.assertEqual(options.qualification, "odd/q.json")

    def test_progress_reaches_guard_before_fallible_audit_and_shared_start_is_not_reset(self):
        events = []
        class ObservedAudit(FakeFS):
            def write_private(self, path, data):
                record = json.loads(data)
                if record["event"] == "created":
                    self_event = events[-1]
                    if self_event["id"] != record["id"]:
                        raise AssertionError("created ID not published before audit")
                super().write_private(path, data)
        clock = FakeClock(now=105)
        fs = ObservedAudit({"/project/qualification.json": json.dumps(HostControllerContractTests().qualification()).encode()})
        controller = harness.LifecycleController(docker=FakeDocker(), filesystem=fs, clock=clock,
            rng=FakeRng(), project_root="/project", output=lambda _value: None,
            started_at=100, event_sink=events.append)
        result = controller.run(execute=True, cleanup_owned=True, qualification_path="/project/qualification.json")
        self.assertTrue(result["passed"])
        self.assertEqual(controller.started, 100)
        self.assertEqual(controller.deadline, 145)
        self.assertEqual(len([event for event in events if event["event"] == "created"]), 3)
        self.assertTrue(any(event["event"] == "cleanup_started" for event in events))
        self.assertNotIn("secrets", json.dumps(events))

    def test_missing_flags_do_not_fork_read_or_emit_and_regular_file_output_is_rejected(self):
        clock = FakeClock()
        guard = FakeGuardBoundary(clock)
        code = harness.supervise(self.options(execute=False), boundary=guard, clock=clock)
        self.assertEqual(code, 1)
        self.assertEqual(guard.calls, [])
        self.assertEqual(guard.reports, [])
        code, _, guard = self.run_guard([(100.1, {"type": "rejected"})])
        self.assertEqual(code, 1)
        self.assertEqual(guard.reports, [])


class PosixBoundaryFakeSyscallTests(unittest.TestCase):
    class FakeSocket:
        def __init__(self, descriptor): self.descriptor = descriptor
        def detach(self): return self.descriptor

    def test_public_supervise_latches_real_boundary_output_qualification(self):
        clock = FakeClock()
        packets = [json.dumps(item, separators=(",", ":")).encode() + b"\n"
                   for _, item in IndependentGuardContractTests().events()]
        writes = []
        def read(_fd, _size): return packets.pop(0) if packets else b""
        boundary = harness.PosixGuardBoundary(clock)
        class CompletedSidecarProcess:
            stdin = None
            returncode = 0
            def communicate(self, _request, timeout): self.timeout = timeout; return None, None
        with patch.object(harness.socket, "socketpair", return_value=(self.FakeSocket(31), self.FakeSocket(32))), \
             patch.object(harness.os, "set_blocking"), patch.object(harness.os, "fork", return_value=777), \
             patch.object(harness.os, "close"), patch.object(harness.os, "fstat"), \
             patch.object(harness.signal, "signal"), patch.object(harness.select, "select", side_effect=lambda *a: (([a[0][0]], [], []) if packets else ([], [], []))), \
             patch.object(harness.os, "read", side_effect=read), patch.object(harness.os, "killpg") as killpg, \
             patch.object(harness.os, "waitpid", return_value=(777, 0)), \
             patch.object(harness.os, "write", side_effect=lambda _fd, data: writes.append(bytes(data)) or len(data)):
            with patch.object(harness.os, "get_blocking", return_value=True):
                code = harness.supervise(IndependentGuardContractTests().options(), boundary=boundary, clock=clock,
                                         sidecar_process_factory=lambda _root, _target, _data:
                                         CompletedSidecarProcess())
        self.assertEqual(code, 0)
        self.assertTrue(boundary.output_safe)
        self.assertTrue(writes)
        self.assertEqual(killpg.call_args.args, (777, harness.signal.SIGKILL))

    def test_stream_truncation_and_flood_fail_closed(self):
        for chunks in ([b'{"type":'], [b"x" * (harness.MAX_IPC_BUFFER + 1)]):
            boundary = harness.PosixGuardBoundary(FakeClock())
            boundary.read_fd = 42
            reads = list(chunks) + ([b""] if len(chunks) == 1 and chunks[0] != b"x" * (harness.MAX_IPC_BUFFER + 1) else [])
            with self.subTest(size=len(chunks[0])), \
                 patch.object(harness.select, "select", return_value=([42], [], [])), \
                 patch.object(harness.os, "read", side_effect=reads):
                if chunks[0].startswith(b"{"):
                    self.assertIsNone(boundary.receive(0.1))
                    with self.assertRaises(harness.ResultError): boundary.receive(0.1)
                else:
                    with self.assertRaises(harness.ResultError): boundary.receive(0.1)

    def test_output_short_write_fails_and_restores_descriptor_mode(self):
        boundary = harness.PosixGuardBoundary(FakeClock())
        boundary.output_safe = True
        modes = []
        with patch.object(harness.os, "get_blocking", return_value=True), \
             patch.object(harness.os, "set_blocking", side_effect=lambda _fd, mode: modes.append(mode)), \
             patch.object(harness.os, "write", side_effect=lambda _fd, data: len(data) - 1):
            self.assertFalse(boundary.emit({"version": 1}))
        self.assertEqual(modes, [False, True])

    def test_stream_framing_accepts_fragments_and_coalesced_packets_then_eof(self):
        boundary = harness.PosixGuardBoundary(FakeClock())
        boundary.read_fd = 41
        first = json.dumps({"type": "ready", "outputSafe": True}, separators=(",", ":")).encode() + b"\n"
        second = json.dumps({"type": "exit", "code": 1}, separators=(",", ":")).encode() + b"\n"
        chunks = [first[:7], first[7:] + second, b""]
        select_calls = []
        with patch.object(harness.select, "select", side_effect=lambda *a: select_calls.append(1) or ([41], [], [])), \
             patch.object(harness.os, "read", side_effect=lambda *_a: chunks.pop(0)):
            self.assertIsNone(boundary.receive(0.1))
            self.assertEqual(boundary.receive(0.1), {"type": "ready", "outputSafe": True})
            before = len(select_calls)
            self.assertEqual(boundary.receive(0.1), {"type": "exit", "code": 1})
            self.assertEqual(len(select_calls), before)
            self.assertIsNone(boundary.receive(0.1))
        self.assertTrue(boundary.eof)


if __name__ == "__main__":
    unittest.main()
