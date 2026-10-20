> Historical scratch locators below document provenance. Own reported scratch/processes were cleaned after exporting this evidence; permanent copies are in docs/testing/h4.

# Independent H4 Verify — BLOCKED
Candidate dd31ba9a8c70aaf62a3adc6f96d7e1171bddb737; tree fa97f0caccb92c98155d7dcdc81f9502afbff3ea.
Baseline d08adc17efbdd62cd847fea7c16d1371a14436f3; frozen contract 2fc9ceef8b67081d0a8b6904ea541995a35962df.
Skill resolution: paths-injected (work-unit-commits and cognitive-doc-design).
Scratch archive only; no source, stage, commit, native review, push, PR or tags.
Runtime Node26.4.0/npm11.17.0; Prisma7.10.0/Nest11.2.7/TS5.9.3/Angular21.2.25/PostgreSQL17.11-bookworm.

## Observed checks
- npm --prefix backend run prisma:validate: exit0.
- npm --prefix backend run build: exit0 (includes isolated schema generate).
- npm --prefix backend run lint: exit0.
- npm --prefix backend test -- --runInBand --testPathPatterns='environment.spec|stock.service.spec|configure-application.openapi.spec|auth/login.service.spec|test/h4-orders.spec.ts': first sandbox run exit1,41 loopback EPERM failures; authorized loopback rerun exit0,132/132,5suites.
- npm --prefix frontend test -- --watch=false: exit0,110/110,26files,0skips.
- npm --prefix frontend run build: first sandbox run134; NG_BUILD_MAX_WORKERS=1 authorized rerun exit0.
- npm --prefix frontend run lint: exit0.
- node --test scripts/h0-contract-validate.test.mjs scripts/h2-contract.test.mjs scripts/h3-contract.test.mjs scripts/h4-contract.test.mjs: exit0,24/24,0skips.
- node scripts/h0-contract-validate.mjs: exit0,OpenAPI3.0.3+12examples.
- fixture private environment -> node backend/scripts/h4-orders-postgres.mjs: exit0,11/11,0skips (includes corrected Product.active scenario).
- node cli-migration-proof.cjs: clean deploy6/6 exit0; historical5/5exit0; own scratch setup failed copying JSON array with pg encoding. Log retained, no candidate defect. Its error path leaves a pg process open (session7123).
- node cli-migration-proof-second.cjs: exit0, NEW h4_cli_upgrade2 database, historical5 + H4 deploy exit0; _prisma_migrations6 successful. H3 table-row hash before/after 83cd671ceb6243c991d7cb771c5e6b97f7fb675f6cf6f5f9c0e9c72a6c69278e.
- live validateH1Semantics normative vs /api/docs-json: [] differences, all operations.
- own healthy backend /health200 {status:ok}; owned unavailable dependency backend /health503 safe SERVICE_UNAVAILABLE/message/requestId only.

## Blocker
R2 reproduced through public HTTP: same order, token, key and body; lowercase UUID path then uppercase UUID path each201, different attempts sequence2 then3, persisted3 attempts including initial. Scope/fingerprint uses raw UUID spelling at backend/src/orders/orders.service.ts135-142. Expected replay same attempt for same semantic order scope. Probe live-probes.cjs; safe result live-probes.log. No token logged. Candidate S2/S3 partial, not PASS. Parent independent Review also reported frontend in-flight-expiry R1; this worker did not separately reproduce it.
Stock hash before/after own bounded create+approved retry+casing probe is identical 4fc75d5a9c09a406cb4038ce273283ba1e622b6693608793463aeb0903c2c3e3. Real11test suite separately asserts stock equality around all scenarios and whole persistence hash equality on injected503rollback. NoPAID proof true.

## Specification verdict
S1 PASS for immutable normative/static/live contract checks; historical freeze timeline owned by parent.
S2 PARTIAL/BLOCKED R2; R1 independently reported by Review. All listed automated suites pass but do not cover these defects.
S3 PARTIAL/BLOCKED idempotency semanticUUID edge; owned realPG migrations, preservation, protected token, rollback, rate, demand, noStock/noPaid passed.
S4 PENDING parent integration/report/browser/audit; no prohibited delivery operations performed.
No whole unchanged backend suite repeated. Browser delegated to parent via own live servers; native200%zoom/Figma comparison not run here.

## Owned resources retained for parent cleanup
Scratch /private/tmp/abar-h4-verify.nD9tVj.
Fixture /private/tmp/abar-h4-fixture.zjr9g23w/private-fixture.json mode0600.
Container2bdd1b863a592a3fe4ecdbc8cf01fc0b1487091b14b10babb6d2cc283da00b90 owner f0ba1ba7-69ec-483c-b77c-bf70aac74fb8;postgres17.11-bookworm;loopback50220;no mounts;tmpfs.
First denied fixture provisioner allocated private temporary directory but no container; path not printed. Parent may retain it.
Own servers: http://127.0.0.1:50490 frontend production static+sameorigin proxy PID91977;backend50489PID91975;unavailable-health50491PID91976. Safe metadata server-metadata.json mode0600. Ephemeral keys only process environments, no source .env.
