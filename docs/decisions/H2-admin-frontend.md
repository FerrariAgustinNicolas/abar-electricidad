# H2 administrator catalog and stock frontend

The Angular administrator area now manages categories, products, presentation prices, galleries and audited stock operations through the real H2 API. Existing H1 route guards, session service, login/password-change destinations and server-side authorization remain authoritative. No client-side permission list replaces them.

## Forms and catalog editing

Reactive forms use exactly `@angular/forms@21.2.25`, matching the existing Angular core/common/platform-browser pins. The explicitly authorized package was obtained anonymously from public npm; no existing credentials were used. Other dependency versions, resolved URLs and integrity values remain unchanged. The existing standard-schema package becomes a runtime dependency transitively without a version change. No framework migration or extra state library is introduced.

Category management supports editing, activation and array-based ordering with expected versions. Product editing preserves complete editable payload semantics, presentation IDs, descriptive attributes and independent minor-unit prices. A successful save rehydrates server-assigned presentation IDs before later writes. Conflicts retain draft data; leaving a dirty product form requires confirmation. Gallery actions use versioned multipart/metadata endpoints, authenticated image reads and server-enforced PNG limits.

## Stock and failure handling

Stock lists and audit history are presentation-specific. Adjustments require nonzero integer delta and reason; manual openings require a positive whole-roll quantity, reason, versions and explicit confirmation with before/after preview. Opening pairs are loaded independently of the visible stock filter/page, so a ROLL-only table does not hide its METER counterpart.

The browser sends cookie credentials, canonical CSRF headers and a stable idempotency key for an explicit stock retry. It never computes authoritative credited meters, recomposes closed rolls, alters balances through product PATCH or silently replays a failed mutation. H1 401 responses expire local session state and restore the protected return destination. CSRF conflicts require explicit session refresh and a new user action; drafts remain. Password-change-required state follows the existing H1 flow.

## Observed evidence

Independent verification closed the original filtered opening-pair, H1 expiry/CSRF and server-assigned-ID regressions, alongside the public frontend blockers. The integrated source passed 70 tests across 15 files, production build, lint and byte-exact fallback asset verification after copy changes. A final neutral-language adjustment to the new client's local session-error text is passive copy; no meaningful behavior-changing RED applies to that wording. Exact committed-unit verification is recorded separately.

The real owned browser fixture exercised H1 login/logout and anonymous guards, a manual 80 m opening from 2 closed rolls/35 m to 1/115 with exactly two entries, price editing without stock changes, gallery upload/primary selection and category ordering. Native browser-confirm interruption was reconciled against the fixture database without repeating the operation. These are actual development observations, not a claim that every admin form/browser edge case or formal viewport/keyboard/contrast check passed. No fresh Figma inspection was available.

## Delivery and rollback

This unit keeps the administrator API client, category/product/stock screens, reactive-form dependency and tests with their protected route/navigation registration. Public UI and backend behavior remain previously delivered units. The local feature branch has no publishing authorization. Removing these added admin routes/files and the Forms dependency removes this UI without deleting catalog, stock or H1 data; restore shared navigation and the ProductPatch explanatory comment with that rollback.

Risk: items 2, 3 and 5 — H1 session/CSRF handling, shared administrator routing and a pinned dependency addition. Server policy is unchanged; independent functional verification and native candidate review are separate evidence.
