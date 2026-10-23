# H7 — Exact academic DEMO reporting

Contract freeze: OpenAPI 0.10.0, dashboard-reports-v1. This is a local candidate, not approval or production financial reporting. Only H7.1–H7.3 are authorized.

## Metric authority

- Confirmed sale: Payment.status=PAID AND confirmedAt in the selected local [from,to) interval. Neither an APPROVED demo attempt nor delivery creates another sale.
- Creations: Order.createdAt in the same interval; current states and current attempt methods, not historical state reconstruction. Filters methodCode/orderStatus/paymentStatus apply to both dimensions. PENDING filters can produce creations but never sales.
- Historical subtotal, fee and total come from Order. Item amounts/labels/units come from OrderItem. Do not join attempts/events/jobs into the aggregate fanout. Assert total=subtotal+fee. Use exact integer arithmetic throughout; ticket rounds half up by quotient/remainder, zero for an empty period.
- Group presentations by stable product/presentation IDs plus historical unit/roll length. Latest confirmed snapshot label wins; tie break orderId and itemId ascending. Sort by amount descending then stable identifiers. Never sum UNIT, METER and ROLL quantities.

## Period and limits

Required API calendar dates, years 2000–2099, valid Gregorian dates, maximum 366 local days. Convert IANA America/Argentina/Buenos_Aires local midnights to UTC independently of process timezone. Dashboard starts at the current local calendar month and ends at the next local month. Series fill gaps with zeros.

Reject unknown, repeated and nested query values. Up to 10000 presentation groups; fail safely rather than silently truncate. Counts must fit JSON safe integers; money and presentation quantities are decimal integer strings. A repeatable database snapshot keeps report sections mutually consistent, followed by H1 authority revalidation immediately before return.

## CSV reconciliation

OpenAPI export description defines the exact 24 columns and row order. UTF-8/no BOM, comma, CRLF, double-quote every cell and double embedded quotes. All monetary columns are exact integer ARS MINOR units. The totals section contains authoritative grand totals; sections are alternate views, not additive to each other. Presentation rows never repeat delivery fees.

The orders row uses count=createdCount and four explicit unpaid/rejected-count columns; quantity is reserved for presentations. CSV is a sectioned reconciliation format, not a per-customer ledger. Formula/control-leading text is prefixed with an apostrophe before RFC-style quoting. The three operations return no PII and are no-store; CSV has a static filename and nosniff.

## Ownership and boundaries

The parent owns OpenAPI, shared contract-validator extensions and Prisma. No migration required: existing persisted facts suffice. Backend and Angular writers may run on disjoint surfaces only after freeze. No H1–H6 rule, applied migration, SMTP/outbox behavior or H8 feature may change. Independent Review and Verify and real PostgreSQL/API/CSV/browser evidence remain required.


## Local implementation limits

Aggregate money is checked against signed 64-bit minor units; an exceeded capacity returns sanitized 503, never rounded/truncated data. Presentation quantities remain exact unbounded integer strings; JSON counts must fit the safe integer range. The synthetic fixture changes current catalog price/name and current delivery policy after freezing order facts. State-change probes update only the disposable fixture, not the H5 transition implementation.
