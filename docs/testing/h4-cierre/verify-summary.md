# Independent H4 complementary Verify

Candidate: 0a1d296a3791ebb3e8f09aace1ce30ed08e03e2b; tree 904c895866f78651530b5b6826e3468b1a81df6c. Baseline: 5d1d5647dc679c1d2d648cd135465cd6d254ea08. Exact git archive, no repository writes or Git mutation.

## Observed commands
- `npm --prefix frontend test -- --watch=false`: exit 0, 118/118, 26 files.
- `npm --prefix frontend test -- --watch=false --include=src/app/features/orders/order-result-page.component.spec.ts --include=src/app/features/checkout/checkout-page.component.spec.ts`: exit 0, 14/14.
- Same candidate regression specs on separate baseline archive: exit 1, 4 failed/10 passed; candidate exit 0. Baseline failures are async option synchronization, reload selection, stale methods response, incompatible-option rejection; checkout recovery assertions pass at baseline.
- `npm --prefix frontend run lint`: exit 0.
- `npm --prefix frontend run build`: exit 0, production output served.
- Initial bare TypeScript compile: exit 2, generated Prisma client absent from git archive. `npm --prefix backend run prisma:generate` then `npm --prefix backend run build`: exit 0; source unchanged.
- `node verify-http.cjs`: final exit 0. Real quote201/create201; same-key replay byte-equivalent JSON; APPROVED/PENDING/REJECTED methods and statuses matched PostgreSQL; incompatible pickup-on-coordinated and manual-with-scenario rejected without changing persistence hash; no stock change, paid0.
- Harness failures retained: first singular quote path404; corrected canonical `/checkout/quotes`. First PAID enum comparison invalid (H4 enum excludes PAID); corrected read-only cast-to-text comparison. Two synthetic probe orders remain, not duplicates of one intention; each has its own quote and key. No source fix inferred from harness errors.

## Specs
- S1-S4: read whole task/log and prior report; unchanged backend/contracts confirmed by three-file diff; historical claims not rerun globally.
- S5: PASS scoped deterministic+HTTP proof. Actual visual/HTTP/DB correspondence still requires parent's real CUA traversal.
- S6: PASS deterministic fail-closed reload/no-key-generation/no-resend; same-key HTTP replay exact. Browser unknown-response reload remains pending parent traversal; proxy supports one-shot response drop only after actual create201.
- S7: PARTIAL until parent's CUA and separate Review/native lifecycle; independent Verify checks above passed. No thousands-of-backend-tests rerun, no native approval asserted.
- S8: Parent closure report/native status/audit stop pending. Worker did not publish, change source, remove WIP, or touch branch/worktree state.

## Runtime and cleanup ownership
Live production frontend: http://127.0.0.1:53242; backend loopback53241. Metadata runtime-private.json. Owned PIDs5517/5518. Fixture /private/tmp/abar-h4-fixture.i99ymw2b; container3d13ea63e2101ed84340bcf8b0ba5cd85967a29eca9f75260f19e18bed94c7a8 ownerfc00dd63-89d6-4333-88dc-24e891aaeac8, tmpfs/no mounts, explicit local Docker socket. Parent owns cleanup. Baseline scratch /private/tmp/abar-h4-verify-baseline.SGPkaH. Candidate scratch /private/tmp/abar-h4-independent.2jhM5H. No scratch deleted.

## Safe parent readback
Run `node /private/tmp/abar-h4-independent.2jhM5H/readback.cjs` with cwd candidate scratch. It outputs only orderNumber/attemptId/methodCode/status/sequence, order/key/paid counts and stock hash, no contacts/headers/tokens/DB URL. proxy-sanitized.jsonl matches attempt HTTP fields. stock-before.json records hash91e3c2b89339929770079cd3680459e1c82c9920883c9dee1bc6b4507c4f529e. Touch drop-create-response.flag in candidate scratch immediately before desired unknown-create scenario; proxy renames consumed flag only after actual upstream201.

Risk: item4 (asynchronous response ordering). skill_resolution: paths-injected.
