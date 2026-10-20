# H2 database-backed catalog runtime

CatalogModule connects the frozen H2 public and administrator API to PostgreSQL, the shared H1 authorization policy and local PNG storage. This unit adds categories, products, presentations, gallery integration and fictional seeds; it does not add reservations, carts, checkout, orders or payments.

## Public and administrator boundaries

Public Home, categories, products, detail and images return only visible records. Search includes descriptive product attributes; presentation, availability and price filters must match the same presentation. Selected prices are independent ARS minor-unit strings. Ordering and pagination have deterministic tie-breakers. Public representations contain availability labels, not numeric balances, thresholds or stock versions.

Administrator reads and mutations reuse the canonical H1 session policy. Authorization is checked again inside transactions and after administrator reads. Mutations require the existing origin/CSRF controls; catalog versions reject stale writes. Product edits cannot supply stock quantities, erase audit history or change used presentation units/roll lengths. Category deactivation rejects active products; array order defines category positions without introducing another request field.

Product PATCH remains the frozen complete editable payload plus expectedVersion, not arbitrary partial replacement. Presentation IDs are retained; omitted or deactivated presentations must not silently erase audit history. Features remain descriptive key/value attributes, with no combinatorial variant engine.

## Gallery transaction and failure policy

The catalog publishes only bounded validated PNG content using server-generated keys. Maximum eight images and one primary image are enforced with database coordination. All cooperating publishers, seed gallery creation and orphan cleanup use the same advisory-lock helper. The publication lock spans filesystem publication and metadata commit; rollback removes unpublished files. A failed post-commit response must not delete a committed image. Public image reads require a visible owning product; administrator reads require H1 authorization.

The already reviewed storage unit defines PNG validation and cleanup limits. The committed PostgreSQL regression in this unit pauses a real publication, observes cleanup waiting on the lock, releases publication and verifies retained readable bytes after metadata commit.

## Fictional seed and ownership

After `npm run build` in backend, `node scripts/h2-seed.mjs` requires explicit `H2_SEED_OWNED=1`, `H2_SEED_DATABASE_URL` and an absolute `CATALOG_IMAGE_DIRECTORY`. Only the named loopback fixture databases are accepted. Independently verify that both targets are owned and disposable before supplying them: environment names and loopback addresses are not ownership receipts.

The seed creates missing fictional categories/products only. Repetition leaves existing prices, balances, catalog edits, gallery files and all H1 accounts/sessions untouched. Examples include closed rolls of 80 m and 50 m, independent meter/roll prices, hidden/out-of-stock/low-stock records, a two-image gallery, long content and records without images. No existing database is a default seed target.

## Observed checks

| Check | Observed result |
| --- | --- |
| Fresh backend build and lint | exit 0 each; source hashes unchanged |
| Focused catalog/images, H1 login metadata and Swagger tests | 125 tests / 4 suites pass; parent repeated the command |
| Swagger parity | Actual H1/H2 controllers, public security, body schemas, errors and DELETE are compared against the frozen contract |
| Independent original B1–B7 recheck | All pass; full Jest 1,216 pass / one skip, real HTTP/PG probes and PNG cases pass |
| Dedicated publication/cleanup PostgreSQL regression | One positive owned-fixture pass; its database-nonexistence prerequisite is distinct from the broader HTTP fixture |
| Positive seed preservation regression | One pass / no skips on a separately verified new owned fixture; edited values and H1 records preserved |
| Latest default seed command | One explicit skip because no owned PostgreSQL fixture was supplied; not a new positive run |

Exact commands, ownership receipts, hashes, omissions and logs are retained under ignored `odd/checks/h2-integration` and `odd/checks/h2-catalog/final-checks`. These are observed development checks, not production certification. The initial implementation had no observed pre-write RED; the independent B1–B7 reproductions and targeted corrections do have retained failure/recheck evidence. No invented RED is claimed.

## Delivery and rollback

The coherent unit keeps HTTP behavior, gallery/seed integration, registration, Swagger metadata and their tests together. Its size exceeds the advisory work-unit line budget because splitting the controller/service from their authorization, persistence and gallery regression tests would leave an incomplete delivery. Frontend and final audit reporting remain separate.

Remove CatalogModule registration, its runtime files, seeds and corresponding Swagger-test/metadata additions to remove this runtime surface. Do not delete persisted catalog, stock or H1 data as a rollback shortcut. Schema and stock behavior remain separate reviewed units. Native Review is candidate-specific; the final H2 report must distinguish approved units, omitted checks and unresolved advisories.

Risk: items 1, 2, 3 and 4 — persisted metadata/files, H1-authorized routes, shared Swagger projection and transactional coordination. Independent Verify is recorded; this exact work unit requires its own native review decision.
