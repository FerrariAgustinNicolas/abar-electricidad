# H2: additive catalog and stock contract

OpenAPI candidate **0.5.0** freezes catalog/stock DTOs before implementation fronts start. Runtime H2 is **pending**, not verified. H1 operations, response constraints, session cookies, CSRF, existing migrations and unresolved later-milestone decisions remain unchanged.

## Scope and review boundary

- Normative input: [H2 prompt](../milestones/H2-prompt.md), sections 3–8 and 11–14.
- Single API source: [OpenAPI](../../contracts/openapi.yaml). The additive surface contains 21 operations: 19 business endpoints requested by H2 and two necessary authenticated/visibility-controlled image reads.
- H1 historical freeze markers remain present for compatibility. Version 0.5.0 and `x-abar-h2-freeze: catalog-stock-v1` select the closed H2 allowlist in the existing validator. `x-abar-h2-runtime-stage: pending` prevents a contract freeze from being mistaken for delivered functionality.
- No checkout, carts, reservations, orders or payments. The existing projected H0/H1 schemas for later milestones are not implementation authority.
- This coherent contract candidate exceeds the advisory 400-line work-unit heuristic: schemas, endpoints, examples and tests must agree at the same boundary. No code golfing or arbitrary DTO/endpoint PR fragmentation. Only local commits; a future PR size exception/topology remains an external-audit decision, not permission to publish.

## DTO and query decisions

| Concern | Frozen behavior |
|---|---|
| Money | Existing `{amountMinor: string, currency: 'ARS'}`; backend must enforce PostgreSQL signed-bigint range, no float calculations. |
| Public inventory | Only `AVAILABLE`, `LOW_STOCK`, `OUT_OF_STOCK` and `sellable` per presentation; never quantity, threshold, stock version or movements. |
| Low stock | Quantity 0 is out of stock; positive quantity <= threshold is low stock; larger is available. |
| Presentation | One each UNIT/METER/ROLL, integer quantities; ROLL has configurable positive length. Distinct prices/balances; at most three presentations per product. |
| Product writes | Create sets balances to zero. Edit sends the complete catalog form and expected product version, never stock. Keep existing presentation IDs; deactivate instead of dropping them. Unit/length with movements is immutable. Exactly one active default presentation. |
| Category edit | Partial fields plus expected version. Block deactivation while active products exist. Reorder sends the complete category ID/version snapshot, rejecting additions/removals or stale versions. |
| Search | Literal case-insensitive substring over name, brand, SKU, descriptions and technical attribute keys/values. No regex execution. Public visibility applies even to direct slug/image reads. |
| Matching | Unit, availability and min/max price must match the SAME active presentation. Select active default if it matches; otherwise cheapest matching presentation (UNIT/METER/ROLL then ID tiebreakers). `displayPresentationId` tells cards which price/unit to show; detail retains all visible active presentations. |
| Sort/page | `name-asc`, `name-desc`, `price-asc`, `price-desc`; price uses the selected display presentation. Product ID is final tiebreaker. Page starts at 1; size defaults 20, maximum 100. |
| Home | Active categories, at most 12 featured products and 12 products with a LOW_STOCK presentation; presentation identity always travels with price/availability. |
| Gallery edits | Product version coordinates upload, metadata update and deletion. Delete takes required `expectedVersion` query parameter and returns updated AdminProduct (200), as do metadata updates. |
| Binary image reads | Public route resolves product slug and image ID, only if visible. Admin route resolves product/image ownership and requires the ordinary unrestricted H1 session. Neither exposes a filesystem path. |
| Empty image | API primary image is null; UI uses a bundled fallback. No external image provider or remote fetching. |

The `sellable` flag is an informational stock/visibility control, NOT an implemented purchase capability. H2 quantity UI remains integer-only, with no functional cart action. H2 has no unpaid-demand value or synthetic order statistics.

## Stock transaction contract

- An adjustment takes presentation ID, signed nonzero integer delta, required reason and expected stock version. Resulting quantities remain within 0..2,147,483,647. A roll opening takes product ID, positive integer roll count, reason and expected ROLL/METER stock versions.
- Backend loads the ROLL length and both presentation IDs; no client meters field. Both must belong to the same product. Opening N rolls debits N closed rolls and credits N × stored length meters; the one operation has exactly two entries. UNIT/METER/ROLL cannot be substituted and meters cannot be converted back.
- Planned implementation uses one PostgreSQL transaction and deterministic presentation-ID lock order, atomic balance/version checks and audit entries. It must recheck H1 authorization inside mutation transactions and pass real concurrent PostgreSQL tests. No SERIALIZABLE assumption is made by this contract.
- Idempotency is scoped to authenticated administrator across adjustment/opening endpoints. Canonical validated body and operation type determine fingerprint; same key/body returns original status/body even when supplied versions are now stale; another body/type returns 409. Both successful balance change and replay result are persisted atomically with audit. No in-memory-only key cache. Failed transactions must leave neither partial balances nor a successful replay record.
- Reason/author/time and per-presentation delta/result/version are included in admin operation views. No credentials/session nonce is stored in audit metadata. Keys/audit remain retained in H2; no invented expiration-based duplicate window.
- Category/product/presentation and stock versions have separate purposes: a catalog price edit never changes stock versions or balances. Gallery edits coordinate with product version.

## Local image strategy (frozen before parallelism)

**PNG only** for H2 uploads: maximum 5 MiB encoded, dimensions 1..4096 per axis, maximum eight images per product. This intentionally trades JPEG convenience for a smaller decoding/security surface without introducing an imaging dependency. Accept file contents only after complete PNG structure/CRC, decompression and decoded-raster/dimension validation, with bounded decoded allocation (at most 64 MiB raster plus filter bytes). Signature-only or browser-MIME-only validation is insufficient. Reject SVG, GIF, JPEG, animation, arbitrary remote URLs and malformed/truncated PNGs.

Use a small local-storage interface, server-generated opaque names, no caller path concatenation, no remote download and no host paths in JSON. Store metadata only after a validated temporary file is durably published; compensate file creation on DB failure. If deletion succeeds in DB but file removal fails, leave an inaccessible orphan and perform idempotent bounded cleanup; never serve files just because their disk key exists. Upload and main-image selection must serialize through the product version/lock. Keep exactly one primary when images remain, choose the first ordered remaining image after primary deletion. Verify these policies in implementation; they are not yet proven here.

## Verification status for this contract candidate

- Node 24.18.1 / npm 11.16.0. Both backend/frontend `npm ci --offline --no-audit --no-fund` exited 0. npm withheld unapproved lifecycle scripts; install success does not imply Prisma generation, native-module readiness or builds.
- RED observed before adding schemas/routes; focused contract tests then GREEN, 6/6.
- Existing contract suite plus new tests: 17/17, exit 0. Existing H1 static/fixture assertions were preserved, not weakened.
- `npm --prefix backend run contract:validate`: exit 0; OpenAPI 3.0.3 and ten JSON examples validate.
- Independent Verify and native Review are separate pending checks on the exact committed candidate.
- Runtime Swagger parity, migrations, PostgreSQL transactions/races, uploads, API, UI/browser and all functional H1 regressions remain pending implementation. No runtime or visual PASS is claimed.
