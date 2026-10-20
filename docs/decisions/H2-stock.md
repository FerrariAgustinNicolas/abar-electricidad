# H2 audited stock operations

The stock module adds real administrator reads, adjustments and manual roll openings above the unchanged H1 session/CSRF policy. Only UNIT, METER and closed ROLL integer balances exist; no reservation, checkout, order, payment or automatic conversion is implemented.

## Transaction boundary

1. Validate the closed frozen request, integer bounds, reason and idempotency key.
2. Authenticate through H1; recheck the same authorization first inside the transaction.
3. Replay a persisted operation for the same administrator/key and normalized body/type before checking stale stock versions. Different body/type returns 409.
4. Lock presentation IDs, then balance IDs, in stable sorted order. Recheck replay after the presentation locks.
5. Apply nonnegative bounded balances, versions, audit entries and the original replay response in one PostgreSQL transaction.

Opening uses the stored ROLL length and the same product's METER presentation. Opening N closed rolls writes exactly two entries: -N rolls and +(N × configured length) meters. It cannot reconstruct a closed roll. Price and catalog versions are not stock inputs.

Catalog and stock locks share the presentation-ID order; stock never acquires a Product lock after presentations. H1 administrator/session locks precede business locks. Reads do not create balances and recheck authorization after querying; canonical H1 failures retain their 401/403 semantics.

## Observed verification

- Focused stock suite: 6 tests pass, including post-read and transaction-time H1 error propagation regressions. Those propagation probes observed RED before correction.
- Independent owned PostgreSQL/HTTP acceptance passed 100 m and 75 m arithmetic, competing last-roll openings, opening versus adjustment, concurrent duplicate replay, stale-version replay, changed-body/cross-type conflicts and rejected-operation state hashes.
- The larger corrected backend snapshot passed 1,216 Jest tests (one retained skip); its explicit owned stock/general e2e run passed 12 tests with four separately declared H1/conditional omissions. This is not a claim that every historical H1 persistence harness ran.
- Parent stock spot-check: 6 tests pass. Logs and independently inspected disposable-container receipts remain in ignored `odd/checks/h2-integration`.
- Real browser fixture: one 80 m opening changed 2 closed rolls/35 meters into 1/115, one operation with two entries. Subsequent price/gallery edits left those quantities and stock versions unchanged. The fixture was stopped and removed; no existing inventory was used.

## Work-unit and rollback boundary

This coherent unit includes `backend/src/stock`, its unit/owned-PG regression tests, and the StockModule application registration. Catalog/image/seed/frontend delivery is separate. The frozen OpenAPI already describes the complete H2 candidate; partial earlier contract/runtime gaps are not approved-H1 debt or global acceptance.

Removing the StockModule registration and these new files removes this runtime surface without rewriting H1 history. Do not delete persisted audit or balance data as a rollback shortcut. No push, main merge or tag is part of this unit.

Risk: items 1, 2 and 4 — persisted audited balances, administrator authorization and concurrent transactions. Independent Verify is observed; native Review of this exact commit remains pending until its own candidate lifecycle completes.
