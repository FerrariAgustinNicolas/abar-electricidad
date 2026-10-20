# Independent H4 Review

Review actor `h4_review`, gpt-6.1-sol / medium; skills loaded by exact paths. Source inspected only in immutable trees, without source/DB/Git mutations.

## Original candidate — blockers

Commit `dd31ba9a8c70aaf62a3adc6f96d7e1171bddb737`, tree `fa97f0caccb92c98155d7dcdc81f9502afbff3ea`.

- R1: expiry during an in-flight creation cleared the checkout before the response became unknown. Isolated component probe: five original tests passed, the additional Subject/timer probe failed. Same-key recovery became inaccessible.
- R2: a case-insensitive UUID identified one PostgreSQL order, but raw spelling produced separate idempotency scopes. Same token/key/body, lowercase then uppercase: different attempts, sequence2→3. Review reproduced using a UUID-normalizing double; Verify corroborated through real HTTP/PostgreSQL.

## One unified correction and targeted recheck

Commit `826c17057993e2108118f8431555f71f5f92e751`, tree `a45f95bedaa125c7896cfca5780bbc3ca7f54624`.

- R1 resolved in source: submitting and unknown states protect both effect/timer invalidation; committed regression covers pending response→TTL→transport error→same-key recovery. Verify:6/6.
- R2 resolved in source: canonical resource identity precedes fingerprint/scope/lock/access/event/response. Possession and expiry are checked before replay. Verify: exact same attempt/response for UUID spellings, only two attempts including initial, pointer unchanged, different body409.
- No new broad sweep; no external-audit approval. Original failure evidence remains valid for its original candidate.

## Later browser finding

Parent CUA smoke on826c170 established R3 after the bounded correction: visible retry method can differ from the method sent after asynchronous option loading, including after reload. See method-mismatch.json and screenshots. This was not silently fixed, waived or included in the earlier Review verdict. Global H4 remains partial.
