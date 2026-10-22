# H6 commercial policy authority

`CheckoutPolicy` remains the single authority for the flat ARS delivery fee,
allowed delivery modes, demo payment methods, contact fields and optimistic version.
No second pricing or payment-method store is introduced.

## Writes and compatibility

- H1-authenticated administrators mutate the existing singleton under a row lock
  and `expectedVersion` CAS. Conflicting writes return 409 without overwriting.
- Money is a canonical non-negative decimal string within signed bigint bounds.
  Pickup remains free; coordinated delivery uses the configured flat fee.
- Disabled methods are excluded from new quotes and payment retries. Legacy rows
  without `enabled` retain their prior enabled meaning; the closed H3 public
  method DTO never gains this internal flag.
- A write cannot leave zero usable mode/method combinations. Server-owned
  simulation capability is considered; the browser cannot enable that capability.
  An enable-simulation write while the server flag is off returns the frozen
  `400 VALIDATION_ERROR` and does not change the policy or its version.
- Existing quotes and order snapshots are not rewritten. H4 revalidates old
  quotes; H5 may confirm an eligible historical attempt after its method is
  disabled for new purchases. H5 remains the only stock-debit authority.

## Demo contact and security

The narrow public contact endpoint exposes only contact, version and `demo`.
Administrator reads require a real H1 session; writes additionally require Origin
and CSRF checks and recheck identity inside the transaction. Responses are no-store.
Contact email is fictional `example.test`; other unconfirmed fields stay labelled
DEMO. WhatsApp is an optional validated manual link, not an automated channel.

## Evidence boundary

Service, HTTP and owned PostgreSQL acceptance tests cover validation, CAS,
legacy DTO projection, public contact, stale quotes, current-policy retries and
historical confirmation. Browser and independent immutable validation are recorded
separately in the H6 milestone report; this decision is not their approval.
