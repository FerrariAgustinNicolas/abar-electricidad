# H6 — Local DEMO notification and settings contract

OpenAPI 0.9.0 is the single normative contract. This initial candidate freezes routes and DTOs only; it does not implement H6 runtime.

## Authority and compatibility

- The H6 prompt takes precedence over the older plan sketch: payment methods use GET/PATCH `/api/v1/admin/payment-methods/{code}`.
- `CheckoutPolicy` remains the only authority for tariff, enabled delivery modes, methods and optimistic version. Settings reads include all three fixed DEMO methods, including disabled ones.
- `H6SettingsWrite` replaces the editable settings atomically at `expectedVersion`; method writes share that same policy version. Overflow beyond signed bigint is rejected in runtime, without floating-point conversion.
- No setting write changes existing quote responses or order snapshots. H4 rejects stale quotes; users explicitly accept a new quote. H5 confirmation remains governed by historical attempts and snapshots.
- Existing H1–H5 closed DTOs and operation schemas are unchanged. Public contact has its own minimal endpoint. No H7 routes are added.

## Durable dispatch design (implementation pending)

- One Prisma owner adds lifecycle fields and `ORDER_CANCELLED_ADMIN` additively, after this freeze; historical migrations are immutable. No synthetic backfill of missing business events.
- States: PENDING -> PROCESSING -> SENT, RETRY_WAIT or FAILED. Claims use database locks and a recoverable lease; at most five attempts per cycle and a bounded foreground run.
- Retry accepts only an expected version for the existing eligible job. It never changes recipient/payload, recreates a business event or modifies order/payment/stock. A repeated stale request conflicts without another side effect.
- SMTP is outside the business transaction and restricted to validated loopback Mailpit. Finite retries and safe error categories never leak SMTP responses or environment values.
- A crash after SMTP acceptance but before database acknowledgement can duplicate delivery. Business jobs are deduplicated; exactly-once SMTP is NOT claimed.
- Templates are fixed per kind, DEMO-labelled, plain text and exclude addresses, internal notes, access credentials and real banking details.

## Contact and local environment

P06 is not commercially confirmed. Contact emails use `example.test`; UI and mail must label all commercial contact as DEMO. WhatsApp is manual only and omitted when empty. No external SMTP, real providers, real banking data or production claims.

## Verification status

Initial H6 contract tests observed RED against H5 (missing routes/version/closed schemas). Static regression and independent verification are recorded in the task log. Runtime proof remains pending until implemented and exercised on owned PostgreSQL/Mailpit.
