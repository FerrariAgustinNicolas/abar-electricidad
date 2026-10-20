# H3 — Authoritative demo quote contract

OpenAPI 0.6.0 adds cart-quote-v1 to H2 0.5.0 without changing H1/H2 paths or DTOs. External audit is pending; this is not commercial approval.

## Frozen choices
- DeliveryMode remains PICKUP / COORDINATED. Methods: DEMO_PAY_ON_PICKUP (PICKUP only), DEMO_TRANSFER and DEMO_SIMULATION (either enabled mode). Instructions are fictitious; P05 is unresolved for real operation.
- Backend-owned singleton CheckoutPolicy persists enabled modes/methods, feeMinor and TTL (default 600 seconds, 60–3600). Initial coordinated fee is 0 ARS; pickup is always zero. H6 may add administration, not overwrite historical quote snapshots.
- Request accepts 1–100 entries, UUID presentationId and integer quantity 1–1000000 only. Duplicates aggregate before quantity/stock checks. Deterministic presentationId ordering. No client price/name fields.
- Monetary math uses bigint, max 9223372036854775807 minor units per line/subtotal/total; serialize decimal strings only. QuoteResponse carries exact unitPrice/lineTotal, immutable product/unit/config snapshots, policyVersion, stateFingerprint and expiresAt. Persist the complete response plus canonical reference-state fingerprint.
- Read a coherent PostgreSQL snapshot and insert CheckoutQuote; never lock or update StockBalance, StockOperation or StockEntry. No future availability guarantee. No PII, buyer form, order, payment, credential or simulator endpoint.
- Re-quote explicitly with the same POST; never automatic retries of uncertain writes. Angular invalidates expired or obsolete requests, compares authoritative summaries, and requires explicit acceptance. Reloaded carts always need a new quote and explicit acceptance. Only IDs/quantities live in versioned cart storage.
- Public errors: 400 VALIDATION_ERROR; 409 INSUFFICIENT_STOCK / PRODUCT_UNAVAILABLE / METHOD_UNAVAILABLE / DELIVERY_UNAVAILABLE; 429 RATE_LIMITED; 503 SERVICE_UNAVAILABLE. Reuse H2 safe envelope. Public routes require no admin CSRF. Bounded process-local rate limiting is demo protection, not a distributed production quota.

## Scope and evidence
No H4/H5/H6 complete, order creation, payment, stock reservation, roll conversion, publication or historical migration edits. Figma nodes 9:2 and 9:89 are documented references, not newly inspected. DIF09 corrected arithmetic is 39700, not 30500. Runtime and independent Review/Verify evidence belongs in H3-informe.md.

## Independent review advisories

The fingerprint identifies reference state (catalog and backend policy), not the complete quote identity: quantities remain in the immutable persisted response. H4 must validate the stored quote snapshot and its ID, not trust a matching fingerprint as proof of quantities. The demo limiter is process-local and malformed JSON rejected by the bounded parser does not consume the controller quota. Resolving cart metadata currently scans public catalog pages; this is a scaling debt, not a monetary authority.
