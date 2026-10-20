# Parent CUA real-browser verification

Exact production source: 0a1d296a3791ebb3e8f09aace1ce30ed08e03e2b. Actual Angular production build, NestJS and new owned local PostgreSQL; no mocked API responses. Synthetic contacts only.

Order ABAR-20261020-1577C586E7 (92adcd8c-c528-4f31-bbe4-09524fdcf433):

| Step | Visible method/scenario | HTTP method/scenario | PostgreSQL attempt/status |
|---|---|---|---|
| Initial async load | DEMO_SIMULATION / PENDING | DEMO_SIMULATION / PENDING | 3541c80c-bcee-4fc7-99d6-c3c03008b8b7 / PENDING |
| Explicit scenario | DEMO_SIMULATION / APPROVED | DEMO_SIMULATION / APPROVED | ec42de3e-c42c-41cc-9365-7e1edc390a9e / APPROVED |
| Explicit scenario | DEMO_SIMULATION / REJECTED | DEMO_SIMULATION / REJECTED | 50f4691d-4c66-4045-ac59-478a635ff895 / REJECTED |
| Explicit method | DEMO_PAY_ON_PICKUP; no scenario | DEMO_PAY_ON_PICKUP; no scenario | 459de74e-ec5b-4882-94cc-c72a87ec7a83 / PENDING |
| Result reload | DEMO_PAY_ON_PICKUP; no scenario | DEMO_PAY_ON_PICKUP; no scenario | 19771d7d-68b1-41e8-963d-d047bb1d2c3e / PENDING |

All POSTs201. APPROVED UI explicitly says no confirmed charge; order remains Recibido. No manual payment confirmation or stock reservation/decrement.

## Unknown creation, real committed response lost

Second browser intent used a new explicit quote. Owned proxy dropped exactly one successful upstream201 response after actual backend commit. UI displayed unknown outcome and same-request reconciliation, retained cart and disabled buyer edits. Before reload DB counts orders4/createKeys4/paid0. Reloaded /checkout displayed only fail-closed warning and minimal lookup link, no create form/button, no automatic resend. Before/after reload sanitized persisted readback was byte-identical (cmp exit0); final proxy entry remains exactly one dropped create201. No second order/key for that intention. Unit test independently spies crypto.randomUUID and asserts never called on resumed submission.

Stock hash before all probes/browser and after: 91e3c2b89339929770079cd3680459e1c82c9920883c9dee1bc6b4507c4f529e. Paid0 throughout.

## Limits

No automatic reconstruction after reload: guard stores only quoteId/idempotencyKey, not buyer body. Minimal lookup requires order number/contact and cannot restore private access; if original response containing number was lost, user may not possess that number. Guard is tab-session storage, not cross-device/cleared-storage reconciliation. No PII/token persistence was added. Existing order-access session behavior is unchanged, not new recovery storage.

## Tooling observations

One locator click returned no-node and one label lookup timed out despite AX-visible controls; fresh AX and native element actions succeeded. HTTP log confirms exactly one request per intended click. These were UI automation failures, not app defects. Late-response success/failure ordering is deterministically tested, not claimed as browser network-timing proof.
