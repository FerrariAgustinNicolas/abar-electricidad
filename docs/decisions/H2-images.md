# H2 local PNG storage and coordinated cleanup

The image storage unit validates and publishes local PNG files behind a small interface. It does not expose an upload endpoint on its own; authenticated catalog/gallery integration is a separate work unit. No remote image retrieval, arbitrary file manager or SVG upload is implemented.

## Validation and publication

- PNG only, at most 5 MiB, dimensions 1–4096 pixels, bounded decoded raster size.
- Validate chunk ordering, critical/reserved bits, CRCs, palette indices, row filters and complete consumption of exactly one zlib stream. Reject APNG and trailing content.
- Server-generated UUID keys, exclusive temporary writes, private file permissions and atomic rename. Read/delete reject non-key paths; reads validate stored content again.
- Publication is not a database transaction. The catalog caller must hold `lockCatalogImages` across file publication and metadata commit, and remove unpublished files after rollback without removing already committed images.

## Cleanup contract

After a backend build, `node backend/scripts/h2-image-cleanup.mjs` requires explicit `H2_IMAGE_CLEANUP_OWNED=1`, `H2_IMAGE_CLEANUP_DATABASE_URL` and `CATALOG_IMAGE_DIRECTORY`. It accepts only the named loopback fixture databases and removes at most 100 unreferenced UUID PNG files per invocation. It holds the same transaction advisory lock as publishers before reading metadata or deleting files. Missing directories are empty; other filesystem errors propagate.

These environment checks are safeguards, not proof that a database or directory is disposable. Verify ownership independently before supplying them. Never point the cleanup tool at existing inventory or unrelated files. A crash may leave an inaccessible orphan; repeated cleanup is idempotent. Temporary-file recovery beyond UUID PNG orphan cleanup is not implemented.

## Observed evidence and limits

- PNG regression tests observed RED before the independent B2 correction and pass afterward. They cover unknown critical chunks, valid ancillary metadata, reserved-bit violations, animation, CRCs, bounds, invalid filters and incomplete/trailing zlib data.
- Independent B3 verification observed actual upload/cleanup serialization on owned PostgreSQL; successful image publication remained readable with exact bytes. Dedicated coordination and HTTP regression evidence is retained under ignored `odd/checks/h2-integration` and will accompany catalog integration.
- Fresh backend build/lint pass. Parent repeated the combined catalog/H1 metadata command: 125 tests across four suites pass. This is not a fresh positive seed or complete historical H1 persistence run.

## Delivery and rollback

Storage, coordination helper, PNG tests, cleanup command and this record form one reusable work unit. HTTP gallery, seeds and frontend remain separate. Removing this unit does not delete persisted files or metadata; any data cleanup requires explicit ownership and authorization. No dependency version change or remote operation is included.

Risk: items 1, 2 and 4 — local file deletion/publication, untrusted image validation and publication/cleanup ordering. Independent integration Verify is recorded; native Review applies to the exact local commit separately.
