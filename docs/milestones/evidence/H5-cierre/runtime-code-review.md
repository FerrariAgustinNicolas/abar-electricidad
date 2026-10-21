# Independent runtime code Review — H5 complementary closure

Reviewer: independent odd-verify, gpt-6.1-sol/medium. skill_resolution: paths-injected.
Immutable candidate: 7712c45ac8c98a04644d2e6bcbdf68c5abec70ce; tree ce1218d765d5a60891b92b6084c9a07ab83747da.
Baseline: e435c222d4c7245faad0a125c0ff6438e05425c3.
Method: read-only git show/git diff. No tests, builds, native lifecycle, network, fixes or cleanup.

## Findings

No candidate-caused P1/P2 blocker established. This is a bounded code Review, not additional execution proof or an external approval.

| Concern | Candidate-relative file/line evidence |
|---|---|
| H1 entry/transaction/final authority | backend/src/orders/admin-orders.service.ts:115,127,187; backend/src/auth/admin-users.service.ts:354–389,410–441 locks/rechecks AdminUser/AuthSession, expiry, revocation, active, password-change and CSRF |
| Sorted compatible H2/H5 lock order | admin-orders.service.ts:128–158; backend/src/stock/stock.service.ts:168–175,190–205,252–259: Order/Payment then all sorted presentations then sorted balances; no H2 reverse Order dependency found |
| Scoped replay and unique Payment debit | admin-orders.service.ts:119–137; backend/src/orders/orders.service.ts:204–237; backend/prisma/migrations/20261021000100_h5_manual_confirmation/migration.sql:22–30: unique paymentId, composite FK and link/type check |
| All-or-nothing writes | admin-orders.service.ts:126–189: balances, nested operation/entries, payment/order, event/jobs and replay in one awaited transaction; nested StockEntry failure propagates at164–165 |
| Concurrent confirm/retry/cancel | admin-orders.service.ts:128–149,169–174; orders.service.ts:145–161: same aggregate Order lock before fresh state, version/current attempt membership, paid cancellation refusal, historical retry replay does not mutate pointer |
| Safe errors and private projections | backend/src/orders/admin-orders.controller.ts:7–44; backend/src/catalog-shared/catalog-error.ts:16–30; orders.service.ts:121–132,179–189; admin-orders.service.ts:175–182: session-only admin authority, code/message/requestId, no public admin notes/stock/address, minimal jobs |

## Warnings and residual risks

1. **StockEntry fault injection gap:** backend/test/h5-orders.e2e-spec.ts:188–195 individually injects StockOperation/OrderEvent/NotificationJob, not StockEntry. Rollback is structurally supported by the nested transactional write; direct injected entry-failure execution was not performed. Not a demonstrated production defect.
2. **Historical replay temporal response window:** admin-orders.service.ts:133 returns stored replay before final temporal recheck at187. H1 is checked at transaction entry, but expiry during a later Order-lock wait could precede the replay response. No new business writes occur; initial authentication/revocation locking still applies. Not reproduced in this review, not classified P1/P2. If strict post-wait replay-expiry rejection is required, authorize a focused reproduction first; no automatic fix.
3. Existing concurrency tests were inspected, not rerun. New temporal-expiry tests and browser proof are separate parent work. The unavailable native resilience lens remains unavailable.

## Coverage

S11 code Review supplied; S14 preserved by issuing no native operation; S15 only this report component. No global H5 approval/integrability claim.

Risk: items1,2,4 — stored data, authorization and concurrent effects. No code edits.

## Key Learnings

1. H5 serializes order mutations before reading the payment's current attempt.
2. H2 and H5 acquire all presentation locks before acquiring balance locks.
3. Payment-linked SQL uniqueness independently prevents duplicate confirmation operations.
4. StockEntry rollback has structural support but lacks its own inspected fault-injection case.
