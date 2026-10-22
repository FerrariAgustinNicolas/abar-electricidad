# H6 notification dispatch

H6 dispatches existing transactional notification jobs to the local Mailpit fixture only. It does not create or change orders, payments, stock, or historical notification recipients.

## Dispatch boundary

| Concern | Rule |
| --- | --- |
| Claim | One due job per short PostgreSQL transaction, using `FOR UPDATE SKIP LOCKED`; a 60-second UUID lease fences completion. |
| Recovery | Expired leases are reclaimed; an expired fifth attempt becomes `FAILED` with `LEASE_EXPIRED`. |
| Attempts | Five attempts per cycle maximum. Transient failures wait 30 seconds, 2 minutes, 10 minutes, then 30 minutes; permanent rejections and exhausted cycles become `FAILED`. |
| Manual retry | Version-checked `RETRY_WAIT`/`FAILED` only. It resets the cycle count, preserves lifetime attempts, and never creates another notification job or business event. |
| SMTP | Hard-coded loopback destination (`127.0.0.1`), validated Mailpit port, fixed `orders@example.test` sender, five-second total deadline, plain text only. Non-`example.test` recipients fail closed. |
| Content | Fixed per-kind DEMO subject/body; only a validated order number is read from payload. Addresses, notes, links, tokens, and other payload fields are not rendered. |

SMTP occurs only after the claim transaction commits. A process failure after Mailpit accepts a message but before the database records `SENT` can cause redelivery after lease expiry; SMTP cannot guarantee exactly-once delivery. Job deduplication and claim fencing do not eliminate that transport ambiguity.

`NotificationDispatcher.run(maxJobs)` is a bounded foreground operation (`1..20` claims). The application integration must expose the intended local operator command; it must not start an unbounded background worker or use external SMTP.
