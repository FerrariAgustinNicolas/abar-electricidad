# H4 real-browser smoke — partial

CUA in-app browser, temporary tab, production Angular build and real Nest/PostgreSQL from immutable826c170. No DOM state injection, network mocks, real customer data or token extraction. Temporary viewport override reset and tab closed.

## Observed

- Product→cart preserves presentation/quantity. Explicit server quote acceptance exposes checkout. Pickup order created via double-click, then cart observed empty. Coordinated delivery requires address/locality and displays the current server fee; a second fictitious order was created.
- Reload of checkout invalidates acceptance without clearing cart. Result reload uses the temporary credential in sessionStorage; credential never in URL or page text.
- APPROVED shows approved *attempt*, commercial pending and received order. REJECTED remains recoverable, then PENDING succeeds without creating a new order.
- Incorrect lookup contact gives a generic error; matching contact reveals only minimal status, no access credential. Input contacts were fictitious `.test` values.
- Checkout, approved result and lookup inspected at360/768/1440. document scrollWidth equals viewport width. Checkout blank-name field error and Tab→surname focus observed. Captures are real JPEGs; coordinated blank form/result also retained.
- Browser stock hashes before/after identical, paidCount0; JSON evidence uses a different serialization from Verify, so its digest is not compared against Verify's digest.

## R3 — reproduced, not corrected

1. Create pickup using DEMO_SIMULATION, open result.
2. Options arrive asynchronously: native select visibly chooses DEMO_PAY_ON_PICKUP, yet simulation scenario remains visible.
3. Reload reproduces the mismatch. Click Register demo attempt without changing that visible method.
4. Readback of the same fictitious order: actual current method DEMO_SIMULATION, PENDING, sequence5; commercial PENDING. method-mismatch.json records this observation without token/customer/address.

The issue is in order-result-page.component.ts `[value]` select synchronization with asynchronously populated options. Displayed choice and submitted method must agree. Proposed next bounded surface: that component and its spec; no contract/domain change is currently demonstrated necessary. No further automatic correction was started after the one independent-review correction batch.

## Not run / limitations

Native200%zoom and tool-based Figma comparison NOT RUN, no full WCAG certification. Browser timeout was covered by deterministic tests, not network-fault injection in this smoke. Contact fields in lookup captures are fictitious; no operational secrets or usable access tokens are present. Reflow is bounded proof, not universal accessibility/performance approval. R3 blocks complete result/retry acceptance.
