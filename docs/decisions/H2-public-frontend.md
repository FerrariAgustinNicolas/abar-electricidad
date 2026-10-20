# H2 public catalog frontend

Home, catalog and product detail now consume the real public catalog API. No buyer session, numeric inventory exposure, cart, checkout or order is added. H1 authentication, administrative routes and health behavior remain in place.

## Interaction contract

- Home loads categories, featured products and low-stock products, with loading, empty and retry states.
- Catalog preserves search, category, presentation, availability, price, sort and pagination in query parameters. Route-driven requests are cancelable so obsolete results cannot replace newer filters. Category selection restores after asynchronous options arrive.
- Detail follows changing slug parameters on a reused route, shows the gallery and descriptive attributes, and keeps each presentation's independent price and availability together.
- The quantity control accepts positive integers in steps of one and restores its last valid value after fractional input. Purchase remains explicitly disabled; final order-stock validation belongs to later milestones.
- Monetary formatting uses BigInt minor units, not floating-point conversion of the amount. Public clients do not request credentials or bootstrap administrator authentication.
- The local fallback SVG is a bundled static application asset, not an allowed uploaded SVG. Production asset verification compares deployed bytes with the source asset.

## Design and verification evidence

Existing H0 tokens, Angular standalone components, signals, Router and HttpClient are reused. UI copy extends the project's Spanish interface. No additional state framework or visual framework is introduced. The documented Figma node references guided implementation; no new Figma inspection or pixel-perfect approval is claimed.

Independent frontend verification closed the original URL-category restoration, reused-detail-route and fractional-input blockers. The broader integrated frontend passed 70 tests across 15 files, build, lint and the production asset check after the final copy edits. These counts include the separately delivered administrator UI; an isolated public-commit check is recorded separately rather than pretending all admin code is in this unit.

Actual browser smoke against Angular, Nest and a newly owned PostgreSQL fixture exercised Home, query filters, detail, gallery, presentation-specific prices and public changes after administrator stock/price/image operations. Screenshots and sanitized evidence remain under ignored `odd/checks/h2-browser`. The temporary servers, fixture and credentials were removed. Formal 360/768/1440 viewport, full keyboard/contrast and fresh Figma comparison remain explicit gaps, not visual PASS claims.

## Work-unit boundary

This unit includes public routes, Home/catalog/detail behavior, HTTP client, formatting, fallback packaging and related tests. Administrator routes/forms/stock and the explicitly authorized pinned Angular Forms dependency remain a separate unit. Shared route staging preserves the administrator WIP without registering it prematurely.

Removing the new public routes, restoring the earlier Home/public navigation and removing these public-only files removes this UI surface; it does not change backend catalog or persisted inventory. Native review and final H2 audit remain candidate-specific. No publication is authorized by this work unit.

Risk: item 3 — shared routing and existing Home render behavior are extended while preserving H1 destinations and health checks. Independent functional evidence is retained; native review applies to the exact local commit separately.
