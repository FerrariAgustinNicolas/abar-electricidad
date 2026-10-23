# H8 — Access-first payment-attempt replay

Status: **approved external technical exception for R4 only; H8 remains PARTIAL**. This is not native approval, publication authorization, or academic closure. Scope: `POST /api/v1/public/orders/{id}/payment-attempts` only.

## Decision
Current same-order token authorization precedes every private idempotent replay, including recovery from previously supported uniqueness/serialization conflicts. This deliberately changes legacy behavior: authorization takes priority over replay availability after access expires or its lookup becomes unavailable.

| Condition | Result | Business effects |
|---|---|---|
| Valid current same-order token, same key/body | Exact original status/body | No duplicate effect |
| Expired, invalid or cross-order token, even with historical response |403 `ORDER_ACCESS_INVALID` | No new attempt, key, order, payment, event or stock change |
| Authorization read unavailable |503 `SERVICE_UNAVAILABLE`, no replay | No new effect |
| Valid access, same key/different body |409 `IDEMPOTENCY_CONFLICT` | No new effect |

Technical token expiry does not cancel or expire the commercial order. Order creation has a different access mechanism: its replay is unchanged. No DTO, response-code set, transaction isolation, encryption, session permission or commercial rule is changed here.

## Tradeoff and ambiguous outcomes
A durable idempotency record prevents repeating the commercial operation, but it does not grant perpetual access to its private response. The caller can lose replay availability while the original committed facts remain valid. **An authorization error after a timeout does not prove that the original operation was not committed.** Do not create a new key or a second order to infer failure. Reconcile the existing order through authorized channels; the minimal public lookup does not restore the private token. This decision introduces no token-renewal or recovery feature.

## Native finding retained without ACK
`R4-legacy-conflict-replay-regression` remains **correction_required / BLOCKER / no ACK** in the native provider. The external auditor explicitly accepts its compatibility impact for access-first; the finding is not deleted, downgraded, or represented as native approval. Its complete text and proof references remain in [H8 validation closure](../milestones/H8-cierre-validacion.md#review-verify-y-estado-nativo-real).

No production code is weakened to satisfy the reviewer. Do not automatically repeat the same native Review. Independent documentary Review/Verify only check this clarification and its evidence; they cannot issue a native ACK or approve H8 globally.

## Contract and evidence
The OpenAPI change is descriptive only, scoped to this operation's description and Idempotency-Key description. Existing valid-access replay,403/503/409, no duplicated business facts and unchanged commercial expiry are tested in the bounded H8 corrective evidence. Expired-token-plus-conflict recovery remains unit-mocked coverage; the expired HTTP PostgreSQL test exercises normal transaction validation, not a forced simultaneous real conflict. See the closure and [Q matrix](../milestones/H8-matriz-trazabilidad.md) for precise fresh/historical/partial/not-run status.
