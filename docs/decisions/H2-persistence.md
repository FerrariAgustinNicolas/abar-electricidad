# H2 persistence: additive schema and real PostgreSQL checks

H2 adds catalog/presentation/image and audited stock tables without replacing, dropping or rewriting H1 tables. This is a model/migration unit, not delivery of catalog or stock endpoints.

## Model

- Category and Product use opaque UUIDs, unique slugs, logical active flags and positive optimistic versions. Optional SKU remains unique when present. Attributes are a bounded JSON array, not generated variants.
- ProductPresentation is unique by product/unit. ROLL alone requires a positive integer length; UNIT/METER reject a length. Prices use PostgreSQL bigint, independent of unit. One active default maximum is enforced by a partial unique index and check; the service must enforce that every editable product has exactly one active default.
- StockBalance has a unique presentation FK, nonnegative integer quantity and positive version. StockOperation retains actor, required reason, type, timestamp, idempotency key, request hash, metadata and original result. The unique actor/key pair covers both operation types. StockEntry has a unique operation/presentation pair, signed nonzero delta and nonnegative resulting quantity/version.
- ProductImage uses safe generated PNG keys, positive bounded bytes/dimensions, alt text and order. A partial index enforces at most one primary. Product-level locking/versioning and the image service must enforce the eight-image bound and replacement-primary policy.
- New catalog/audit FKs restrict physical deletion. The AdminUser back-relation is Prisma metadata only; existing H1 columns and migrations are unchanged.

## Migration and checks

`20261020000100_h2_catalog_stock/migration.sql` is additive and contains effective PostgreSQL checks, FK/unique constraints and proportionate indexes. Prisma schema validation and client generation both exited 0 at version 7.10.0.

The installed `prisma migrate diff --from-schema ... --to-schema ... --script` returned exit 0 with **empty output** despite the nonempty schema delta. That output was rejected as migration evidence. The reviewed SQL was authored explicitly and tested against a new owned PostgreSQL 17.11 container, not an application database. No claim of Prisma drift reconciliation is made from the empty output.

`node --test backend/scripts/h2-schema.test.mjs` requires explicit `H2_TEST_DATABASE_URL`, `H2_TEST_OWNED=1`, loopback host, database `h2_schema` and user `h2_runner`. Without that explicit fixture, it reports SKIPPED and never reads DATABASE_URL or selects a default database.

Observed real test (exit 0, zero skips):

- All H1 migrations followed by H2 apply to a new empty schema.
- H2 applies above an H1 schema containing an administrator, with H1 row hashes unchanged.
- Reject negative stock/price, invalid/missing ROLL length, length on METER, duplicate presentation/default/slug, missing FK, physical deletion with dependents, unsafe image key/oversized image and duplicate primary, duplicate actor/idempotency key and zero stock entry.
- Preserve 19-digit money exactly as a decimal string; rejected commands leave original H1 hashes and stock balances unchanged.

The container used only tmpfs and a random loopback port, was labeled with a generated owner identity, and was stopped only after matching that label. No existing container, volume, account, session or DB was reset or removed. Local evidence is under `odd/checks/h2-schema/`.

## Pending, not PASS

Independent verification of this unit; deterministic non-destructive seeds; runtime authorization and stock transaction/idempotency/concurrency tests; application-level default/gallery/immutability invariants; migration drift diagnosis; full builds/H1 regressions and UI integration remain pending. The SQL constraint checks do not prove an implemented stock service or browser flow.
