# H1 — Informe parcial de contrato y fundamentos

**CONTRACT UNIT FROZEN · FOUNDATION IMPLEMENTATION STARTED · AUTH ENDPOINTS NOT IMPLEMENTED · EXTERNAL AUDIT PENDING.** La preparación contractual pasó Review y Verify; la configuración C01 está revisada/verificada/commiteada y la política independiente está preparada, sin integración runtime. La autenticación sigue pendiente. Esto **no declara H1 CUMPLE**, aprobado, cerrado ni listo para auditoría final.

## Identidad y alcance

- Baseline H0 aprobado: `2428f2b918d97c5a48dabc438b0b3bf89030c7fb` (`h0-approved`).
- Tracker local: `feat/h1-auth`; slice actual: `feat/h1-auth-02-policy`, base/HEAD `7f4df80ceba00dfd495ca6cac25c6c6035168770` (C01 verificado). Estrategia elegida: feature-branch-chain; commit/review/Verify independiente de política pendientes del padre, sin identidad inventada. Prompt autorizado: `1e9cd1e44b919738da8c9d1262b436b8a354af17`. Commit de preparación contractual: `b6eed95359fa4a4ede13d62ced034508f57c1015`, tree `8267b798b01d6171b3cdcaa0f4a5052c59bfac4d`. `main` permanece sin cambios; no push, merge ni tag H1.
- Snapshot de bytes de `contracts/openapi.yaml`, SHA256: `94122791de8ce646bcbe342b6bc7d33833ce0b0e9e7121055f6601a22ba80a2f`. Es **digest contractual**, no hash de commit ni target de revisión nativa; recalcular si cambian los bytes.
- Norma OpenAPI 3.0.3, versión 0.4.0, milestone `H1-contract-freeze`, runtime-stage `h0`, status `candidate`. Nueve operaciones auth/admin más health; solo health corre hoy. [Decisión y fuentes](../decisions/H1-auth.md), [historial](../../contracts/CHANGELOG.md), [uso](../../README.md).

La unidad contractual preservada contiene OpenAPI, validador/test y cuatro ejemplos nuevos saneados (`admin-session`, `admin-user`, `admin-users`, `auth-error`), además de documentación. Esa unidad no cambió backend, Angular, Prisma, migraciones, dependencias ni configuración. C01 agregó parser independiente/tests; el slice actual agrega solo política independiente/tests y actualiza decisión/informe, sin registrar módulos ni cambiar H0. El modelo, bootstrap, login y gestión administrativa son dirección pendiente, no runtime construido.

## Evidencia disponible y límites

El explorer `murf6fch-j-wlly` completó las siete fuentes; `murf70ic-k-6xzs` verificó OWASP/NIST y metadata de dependencias, con Docker/servicios healthy **en ese momento**, no disponibilidad continua. La revisión `review-adce1fdd7f44ebac` aprobada/ack consumido cubre solo el prompt; `review-e7eb83b58607d1b3`, aprobada/ack consumido, cubre solo el snapshot de test de 37 líneas con SHA256 `9b945c224e141130f6c24a6adc65d8289c5a1bfdc32e3439006cfb4575f91688`, no norma ni runtime.

El writer original `murfr4n6-m-3ge6` dejó RED (7 pass, 2 fail); la reanudación `murfzmbe-n-u8pe` y scout `murgeyx2-o-k97c` tuvieron timeout, sin causa demostrada. Los escritos posteriores se preservaron y el verificador independiente de solo lectura `murgmnca-p-abe0` confirmó el GREEN actual siguiente, sin cambios de archivos ni reparación de configuración.

| Comando / comprobación | Resultado y alcance |
|---|---|
| `node --test scripts/h0-contract-validate.test.mjs` | PASS reportado por verificador, exit 0, 11 pass, 0 fail/skipped/cancelled; validador, no auth runtime. |
| `npm --prefix backend run contract:validate` | PASS reportado por verificador, exit 0; OAS 3.0.3 y 7 JSON externos. |
| `git diff --check` | PASS independiente sobre el commit contractual, exit 0. |
| `npm --prefix backend run contract:validate:live -- --stage=h0` | **PASS**, exit 0: subset transicional Swagger/health, PostgreSQL 200 y 503 saneado; no certifica H1. |
| `npm --prefix backend run contract:validate:live` | **PENDING / NOT APPLICABLE hasta implementación H1**: por defecto stage=h1 exige operaciones hoy ausentes; no se espera PASS del runtime H0. |
| Review nativa de unidad normalizada completa | **APPROVED**, cuatro lentes, `review-53bf61d7c6af9c27`; acuse exacto consumido del snapshot workspace. |
| Build/lint/unit/e2e H1, Prisma generate/validate y migración limpia | **PENDING / NOT APPLICABLE a esta edición documental**, ejecutar sobre implementación futura. |
| Argon carga/benchmark/concurrencia, bootstrap, login/sesión/CSRF/revocación/users con PostgreSQL real | **PENDING**, ninguna evidencia funcional H1. |
| Angular integrado, smoke H1 y navegador 360/768/1440, teclado/foco/zoom/contraste | **PENDING**, placeholders H0 no acreditan autenticación ni verificación visual. |

El verificador `murgx87h-r-mqb5` repitió los cinco checks antes del commit; `murh82fh-s-281n` los repitió sobre `b6eed95359fa4a4ede13d62ced034508f57c1015`: todos exit 0, 11/11 tests, 7 ejemplos y digest contractual idéntico. HEAD/tree sin cambios y árbol limpio inicial/final. LIVE informa cierre de sus hijos propios; sin confirmación independiente de PIDs ni cambios de Docker/entorno.

La revisión nativa aprobó el target workspace `sha256:f115791b46d8ead366abd86a499e51052a03add5539eea3e70247801773f527b`; su tree se comprobó idéntico al commit contractual antes de commitear. No se transfiere autoridad a otra identidad: ASSESS del rango commiteado informa `unknown` para su propia proyección y se aplicó su plan de Verify independiente. Advisory no bloqueante: `R3-security-scheme-drift`, `scripts/h0-contract-validate.mjs:391`; queda para seguimiento separado, sin corrección ni reapertura de esta revisión.

Edición documental sin RED conductual significativo. El RED/GREEN histórico del validador es evidencia aportada de snapshots previos/actuales, no pruebas nuevas ejecutadas por este writer ni verificación de código fuente H1.

## Slice 01 — Configuración C01 completada (evidencia histórica)

Una sola unidad compilable: [`auth.config.ts`](../../backend/src/auth/auth.config.ts), [tests](../../backend/src/auth/auth.config.spec.ts) y [tabla operativa](../decisions/H1-auth.md#configuración-independiente-preparada-integración-futura). Defaults conservados (8 h/30 min/15 min y tasas congeladas), validación estricta de orígenes/Secure/números/flags, errores redactados e inmutabilidad defensiva. Sin lecturas globales al importar/validar, DB, HTTP, módulos, dependencias o cambios de norma. Los settings **no están conectados al runtime H0**.

Evidencia observada por este writer, comandos síncronos (timeout 180 s). Snapshot inicial histórico: GREEN 335/335 focused y 344/344 unit; los resultados actuales incluyen seis regresiones de wildcard canónico. Antes del guard post-URL, `%2A`, `%2a` y asterisco fullwidth canonicalizaron a `*.example.test` y fueron aceptados en development/production: RED real, exit 1, 6 failed/335 passed de 341. Se preservan las pruebas anteriores de userinfo vacío, query/fragment vacíos, dot-path y backslash; no se reescribe el parser ni cambia el contrato.

| Comando exacto | Resultado observado |
|---|---|
| `npm --prefix backend test -- --runInBand --runTestsByPath src/auth/auth.config.spec.ts` | RED: exit 1, 321 failed/321, stub tipado sin comportamiento. GREEN histórico: exit 0, 321/321 y luego 335/335. Regresión wildcard: RED exit 1, 6 failed/335 passed; GREEN actual exit 0, 341/341, 1 suite. |
| `npm --prefix backend run build` | Repetido tras regresión: exit 0; Prisma generate existente + TypeScript. |
| `npm --prefix backend run lint` | Repetido tras regresión: exit 0; sin errores. |
| `npm --prefix backend test -- --runInBand` | Actual: exit 0; 350/350 tests, 4/4 suites (histórico inicial: 344/344). |
| `npm --prefix backend run test:e2e -- --runInBand` | Repetido tras regresión: exit 0; 5/5 tests, 1/1 suite H0, no auth funcional. |
| `npm --prefix backend run contract:validate` | Repetido tras regresión: exit 0; OpenAPI 3.0.3 y 7 ejemplos JSON externos. |
| `git diff --check` | exit 0; comprobado tras escribir el informe, sin errores de whitespace. |

Prerrequisitos previos, no pruebas nuevas de este slice: probe Argon GREEN con 26 hashes, default elegido 1, sin dependencia Argon backend; fuente offline Pwdb 1M fijada y ambos avisos MIT resueltos, asset/generador aún no implementados (detalle en decisión). No se afirma capacidad de aplicación ni completitud de blocklist.

Conteo inicial histórico: 400 líneas cambiadas (382 agregadas, 18 retiradas). Conteo final observado: 412 líneas cambiadas (394 agregadas, 18 retiradas). La regresión legítima agrega tests/guard al mismo slice coherente y supera el advisory de 400 en 12 líneas, sin minificar ni omitir pruebas. Digest contractual verificado idéntico; HEAD/tracker y main/origin sin cambios. El estado pendiente de commit/review de ese snapshot quedó supersedido por la evidencia C01 siguiente, sin trasladar autoridad del freeze. Auth funcional/bootstrap/concurrencia PostgreSQL/full H1 LIVE **NOT APPLICABLE todavía**; integración, auditoría externa y cierre H1 siguen pendientes. No servicios, migraciones, navegador ni publicación para esta unidad.

C01 fue commiteado como `7f4df80ceba00dfd495ca6cac25c6c6035168770`. Review nativa `review-3792904812c14bb0`: aprobación de cuatro lentes y acknowledgement consumido. Verify independiente: 18 comandos exit 0, 341 tests de configuración, 350 unit/4 suites, 5 mock e2e, 11 tests contractuales y 7 ejemplos. Tree verificado y commiteado idéntico: `4f1079ebaa8dd07b45dd57b7dfa4efea93c44785`. Esta evidencia es **histórica y solo C01**, no aprobación de política ni certificación H1 runtime.

## Slice 02 — Política independiente preparada; gates del padre pendientes

[`password-policy.ts`](../../backend/src/auth/password-policy.ts) y [specs](../../backend/src/auth/password-policy.spec.ts): credencial NFC privada separada del digest público, Unicode bien formado, bounds posteriores a NFC y lookup síncrono obligatorio/fail-closed. Sin registro Nest, env global, filesystem/red, módulos, cuentas, Argon ni efectos HTTP. Tests sintéticos verifican receiver, redacción, igualdad completa y source14/alias15 e input128/key129; no acreditan cobertura real del asset ni no-encogimiento Unicode general.

Evidencia observada por este writer, comandos foreground con timeout 180 s:

| Comando exacto | Resultado observado |
|---|---|
| `npm --prefix backend test -- --runInBand --runTestsByPath src/auth/password-policy.spec.ts` | RED exit 1: 52 failed/4 passed, 56 total, stub tipado ejecutable; GREEN exit 0: 56/56, 1 suite. No fallo de import/runner. |
| `npm --prefix backend run build` | exit 0; Prisma generate existente + TypeScript. |
| `npm --prefix backend run lint` | exit 0; sin errores. |
| `npm --prefix backend test -- --runInBand` | exit 0; 406/406 tests, 5/5 suites; incluye 56 de política y 341 de configuración. |
| `npm --prefix backend run test:e2e -- --runInBand` | exit 0; 5/5 tests, 1 suite mock H0, no auth real. |
| `npm --prefix backend run contract:validate` | exit 0; OpenAPI 3.0.3 y 7 ejemplos externos. |
| `node --test scripts/h0-contract-validate.test.mjs` | exit 0; 11/11, sin fallos/skips/cancelados. |
| `git diff --check` | exit 0 tras edición documental; repetido sobre el handoff final. |
| `shasum -a 256 contracts/openapi.yaml` | exit 0; `94122791de8ce646bcbe342b6bc7d33833ce0b0e9e7121055f6601a22ba80a2f`, sin cambios de norma. |

Triangulación incluida en los 56 tests: pares y surrogates aislados, controles/noncharacters, NFC antes de bounds, case/whitespace privados, claves sin límites de credencial, lookup ausente/throw/getter/no booleano/Promise. No refactor conductual posterior a GREEN; full checks verifican el mismo código. Branch `feat/h1-auth-02-policy` y HEAD C01 preservados; solo cuatro paths autorizados cambiados. Aproximadamente 301 líneas authored (incluidos archivos nuevos y retiros documentales), bajo advisory 400. Commit, review nativa y Verify independiente del **nuevo candidato** pendientes del padre. Asset real, Argon/pool, servidor, PostgreSQL, bootstrap, navegador/full H1 LIVE y auditoría siguen pendientes. Sin nuevas descargas; ambos avisos MIT y probe Argon permanecen evidencia separada.

## Aceptación parcial y siguiente gate

| Criterios del prompt H1 | Estado |
|---|---|
| 1–9: login, persistencia, Argon, CSRF, autorización, must-change, users, última activa, revocación | PENDING implementación y pruebas. |
| 10: OpenAPI compatible con runtime H1 | Norma/static preparados; runtime H1 y LIVE completo PENDING. |
| 11–13: integración Angular/API, migraciones, build/lint/tests/smoke final | PENDING. |
| 14: Review + Verify del mismo candidato final | PENDING para H1 completo; la preparación contractual tiene review del snapshot y Verify del commit de tree idéntico. |
| 15: secretos/guardas | Sin nuevas credenciales en docs; guardas del candidato final PENDING. No se leen archivos de entorno ni se elude denegación H0. |
| 16: informe | Existe este informe **parcial**, no cierre H1. |
| 17: H2 no iniciado | Preservado; no alcance comercial nuevo. |

1. Freeze contractual completado y registrado; esta actualización del informe es documental y posterior al commit verificado, no otra certificación funcional. El tamaño >400 líneas es advisory de carga: mantener unidades siguientes coherentes/acotadas, no omitir/minificar salvaguardas.
2. Backend: configuración C01 completada; revisar/verificar/commitear política preparada. Pin/commit/licencias/digest offline ya resueltos, asset/generador pendientes. Continuar con protección del nonce, Argon/pool, modelos/migraciones y bootstrap seguro. Runbook bootstrap pendiente; manual update del ejemplo de entorno solo si necesario, sin bypass.
3. Implementar y verificar H1, incluyendo pruebas reales PostgreSQL y navegador si disponible. Antes de handoff a auditoría, Review + Verify deben cubrir el **mismo candidato final**. El padre registra el resultado, sin inventar aprobación externa.

P01–P10 y horas siguen pendientes; rollout comercial cerrado. No se inicia H2 ni se modifica el informe histórico H0.
