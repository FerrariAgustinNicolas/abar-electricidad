# H2 runtime integration boundary

H2 modules reuse H1 administrator authentication through the additive `AdminUsersService.authorizeCatalog` facade. It returns only the actor ID and a transaction recheck closure; no session token or cryptographic state leaves H1. Mutations call the closure before business locks. Reads retain the existing unrestricted-session policy, and writes retain Origin/CSRF and transaction-time revocation/password restrictions.

## Single contract source

`copy-catalog-contract.mjs` packages the frozen normative OpenAPI as a code-owned JSON resource, plus the source SHA256, in `dist/resources/catalog`. Build, development start and test scripts prepare that resource. Production startup reads the packaged resource, never an environment-selected contract or upload path. AJV 8.18.0 is now a production dependency at the already pinned version; the offline lock update changes classification only.

`CatalogEndpoint` attaches the frozen metadata to each actual controller method. It does not insert synthetic paths into generated Swagger. JSON and multipart bodies use Nest's explicit schema and consumes metadata. Runtime request validation uses the same closed schemas, without coercion, default insertion or property removal. Cross-record business rules remain the services' responsibility.

## Verification boundary

A real-controller Swagger test reproduced an absent request schema when OpenAPI `content` was passed directly to `ApiBody`. Explicit media/schema adaptation changed that probe from RED to GREEN. Shared validator/error/auth tests currently pass (65 tests); complete application parity, integration and independent verification remain pending. The facade scaffolding was written before its focused tests; those tests are post-write coverage, not claimed RED evidence.

H1 exception contracts and controllers are unchanged. H2 filters sanitize unexpected failures, preserve canonical H1 authorization error metadata, and return `Cache-Control: no-store`. No credentials, database messages or filesystem paths are returned.

Risk: items 2 and 5 (shared canonical authorization facade and production dependency/resource packaging). This is not a security approval or a global H2 acceptance statement.

Independent scoped Verify reproduced a Nest-transformed upload-limit mismatch (413 with SERVICE_UNAVAILABLE). One correction recognizes HTTP 413 after transformation; a real FileInterceptor regression test observed RED then GREEN. The original independent probe and focused recheck passed. Baseline/candidate full suites retain the same 22 pending H2 runtime-parity failures; they are not H1 debt. Logs are retained in ignored odd/checks/h2-shared/independent-verify.
