# H1 — Informe parcial de contrato y fundamentos

**CONTRACT FROZEN · C01–C10 CLOSED · C11 OFFLINE OBSERVATIONS ONLY · AUTH ENDPOINTS NOT IMPLEMENTED · EXTERNAL AUDIT PENDING.** C11 parent ASSESS, functional Verify, native consent/review and local commit remain pending. This partial report does not declare H1 compliant, approved, closed or ready for final audit.

## Identidad y alcance (snapshot histórico pre-freeze C07)

Los estados pendientes y la identidad de este snapshot se conservan; el cierre C07
y la identidad C08 se registran más abajo, sin enmendar evidencia histórica.

- Baseline H0 aprobado: `2428f2b918d97c5a48dabc438b0b3bf89030c7fb` (`h0-approved`).
- Tracker local: `feat/h1-auth`; slice actual: `feat/h1-auth-07-runtime`, base/HEAD `777dbfac9df307a635e3f91fc9edac9bdb19e09f` (C06 cerrado). Estrategia elegida: feature-branch-chain; C07 prepara composición DI, con review nativa/Verify independiente/commit pendientes del padre. Prompt autorizado: `1e9cd1e44b919738da8c9d1262b436b8a354af17`. Commit de preparación contractual: `b6eed95359fa4a4ede13d62ced034508f57c1015`, tree `8267b798b01d6171b3cdcaa0f4a5052c59bfac4d`. `main` permanece sin cambios; no push, merge ni tag H1.
- Snapshot de bytes de `contracts/openapi.yaml`, SHA256: `94122791de8ce646bcbe342b6bc7d33833ce0b0e9e7121055f6601a22ba80a2f`. Es **digest contractual**, no hash de commit ni target de revisión nativa; recalcular si cambian los bytes.
- Norma OpenAPI 3.0.3, versión 0.4.0, milestone `H1-contract-freeze`, runtime-stage `h0`, status `candidate`. Nueve operaciones auth/admin más health; solo health corre hoy. [Decisión y fuentes](../decisions/H1-auth.md), [historial](../../contracts/CHANGELOG.md), [uso](../../README.md).

La unidad contractual preservada contiene OpenAPI, validador/test y cuatro ejemplos nuevos saneados (`admin-session`, `admin-user`, `admin-users`, `auth-error`), además de documentación. Esa unidad no cambió backend, Angular, Prisma, migraciones, dependencias ni configuración. C01 agregó parser independiente/tests y C02 política independiente/tests; C03 agregó solo generador/resource/notices offline y documentación; C04 prepara loader standalone, sin registro de módulos ni cambios H0. El modelo, bootstrap, login y gestión administrativa son dirección pendiente, no runtime construido.

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

## Slice 03 — Generador/resource offline preparados; gates pendientes

C02 quedó cerrado en `744e05eab1814ddfd2250312fc4abf91e23ff593`: review `review-60d828965e5a2a1e`, cuatro lentes aprobados y acknowledgement consumido; Verify independiente 56 política/341 configuración/406 unit en5 suites/5 mock e2e/11 tests contractuales/7 ejemplos, tree estable `3bec3ce7d6f14db8cb40ea1a1fda214e4a5e1f69`. Supersede los estados pendientes históricos arriba, **no aprueba C03**.

C03 entrega scripts Node standalone, binario de full SHA256 ordenados/únicos, manifest canónico y ambos avisos MIT completos. Sin cuentas/passwords bootstrap, loader, Argon, runtime fetch, dependencias, package/build/module/HTTP/DB/frontend ni cambios contractuales. Corpus público raw solo en cache ignorado; nunca se versiona plaintext. [Reproducción, procedencia, framing y límites](../decisions/H1-auth.md#generador-offline-independiente-slice-03).

Fuente SHA256 `e9a88f67aafe65496682dc374559ee714e978bee50314767494c3e37a18c9fc8`, 8.755.171 bytes; UTF8 fatal, 1.000.000 LF/filas, cero CR, LF terminal y sin BOM inicial. Filtro key NFC→defaultlower mínimo15, sin límite superior ni NFC posterior. Unicode17 requerido, con fundamento independiente acotado, no afirmación universal. **5.406 elegibles / 5.329 únicos / 170.528 bytes**, medidos con filtro final; igualdad numérica con conteo histórico no lo convierte en autoridad. Resource SHA `7a85af89d0f800cc94cbe81ad5a11de7590da24a5ed33c6a5bc5e7f0abea1eb0`; manifest SHA `581027ae246da0bacf0d71a65a35edad5a20a71c5fcfe2d810513b128bfdb510`.

Avisos verificados completos antes de aceptar artifacts: Pwdb 1069 bytes/SHA `4088d581cba171b1aa6f880ad3fb5327e2d6de415621cf8b80685ac506c0cae1`; SecLists 1072 bytes/SHA `3dbdc93d5f8829de0941744841730a09c106d0732e5ae0e98ca1d77be7ded66c`. Manifest registra URL/commit/copyright/licencia MIT de ambos.

| Comando exacto | Evidencia observada del writer C03 |
|---|---|
| `node --test scripts/h1-password-blocklist.test.mjs` | RED exit1, 10failed/0passed sobre stub ejecutable (no import/runner fallido); GREEN exit0, 10/10. Triangulación UTF8/framing/BOM/CR/UTF16/NFC/lower/expansión/bounds/full digests/order/unique/canonical/Unicode. |
| `node scripts/h1-password-blocklist.mjs --source odd/probes/h1-blocklist/source.txt` | exit0 dos ejecuciones; hashes binario/manifest capturados en variables shell y comparados idénticos, sin archivos temporales. |
| `npm --prefix backend run build` | exit0; Prisma generate + tsc existente, **no copia resources**. |
| `npm --prefix backend run lint` | exit0. |
| `npm --prefix backend test -- --runInBand` | exit0, 406tests/5suites. |
| `npm --prefix backend run test:e2e -- --runInBand` | exit0, 5tests/1suite mock H0. |
| `npm --prefix backend run contract:validate` | exit0, 7 ejemplos externos. |
| `node --test scripts/h0-contract-validate.test.mjs` | exit0, 11/11. |
| `git diff --check` | exit0, repetido tras documentación final. |
| `shasum -a 256 contracts/openapi.yaml` | exit0, SHA contractual intacto `94122791de8ce646bcbe342b6bc7d33833ce0b0e9e7121055f6601a22ba80a2f`. |
| `shasum -a 256 backend/resources/auth/LICENSE.pwdb.txt backend/resources/auth/LICENSE.seclists.txt backend/resources/auth/password-blocklist.bin backend/resources/auth/password-blocklist.manifest.json` | exit0, los cuatro SHA coinciden con evidencia arriba. |

Conteo authored: 373 líneas agregadas/retiradas, incluidos notices completos; binario y manifest generado excluidos. Sin refactor conductual posterior a GREEN. Solo ocho paths fuente autorizados más cache ignorado; branch/HEAD base conservados, sin stage/commit/push. Una separación cohesiva ya aplicada: loader y trust anchor/distribución runtime quedan para otra unidad. Review nativa/Verify independiente/commit de este candidato siguen **pendientes del padre**. No cobertura exhaustiva, certificación NIST, aprobación H1 ni cierre de auditoría.

## Slice 04 — Loader standalone preparado; gates del padre pendientes

C03 histórico quedó cerrado en `2bcb43b94671ac4b4f63790586ae0df2bd789a75`, tree estable `5f217cd8836e7cd5cb4b3217e7d9d51f1bc8cc1d`. Review `review-a8d94eecea756ad2`: cuatro lentes aprobados/acuse consumido. Verify independiente: 10 generador/406 unit/5 mock e2e/11 contractuales/7 ejemplos y full checks; reproducción en memoria íntegra. Supersede estados pendientes históricos C03, **no aprueba C04**. Warning no bloqueante `R3-001` en tests del generador19–21 queda como seguimiento separado; sin corrección ni reapertura aquí.

C04 entrega [loader](../../backend/src/auth/password-blocklist.ts) y [80 tests](../../backend/src/auth/password-blocklist.spec.ts), más documentación en estos dos paths. [Anclas, errores, ruta explícita y distribución pendiente](../decisions/H1-auth.md#loader-offline-independiente-slice-04). Importar no lee assets; lookup no hace I/O. Fábrica pura copia buffers, autentica manifest raw antes de parsear, exige esquema exacto y hash/count/order/unique del recurso. Carga filesystem acotada exige notices íntegros y cierra descriptors incluso ante fallos. Sin env, constructor/bypass, pins configurables ni allow-all.

Evidencia nueva observada por este writer; comandos foreground timeout180 s:

| Comando exacto | Resultado observado C04 |
|---|---|
| `npm --prefix backend test -- --runInBand --runTestsByPath src/auth/password-blocklist.spec.ts` | RED exit1, 18 failed/62 passed, stub tipado ejecutable; GREEN exit0, 80/80. Un error TS inicial de overload del mock fue corregido antes del RED, no cuenta como RED conductual. |
| `npm --prefix backend run build` | exit0, Prisma generate + tsc; no copia resources. |
| `npm --prefix backend run lint` | exit0. |
| `npm --prefix backend test -- --runInBand` | exit0, 486/486 tests, 6/6 suites. |
| `npm --prefix backend run test:e2e -- --runInBand` | exit0, 5/5 mock H0, 1 suite; no auth real. |
| `node --test scripts/h1-password-blocklist.test.mjs` | exit0, 10/10. |
| `npm --prefix backend run contract:validate` | exit0, OAS3.0.3/7 ejemplos externos. |
| `node --test scripts/h0-contract-validate.test.mjs` | exit0, 11/11. |

Triangulación: first/middle/last, no-miembro público reconfirmado por scan; pertenencia del ejemplo público débil establecida antes de rechazo `blocked`, caso sintético no-miembro validado con receiver. Copias corruptas, tipos/longitudes, manifest alterado/self-consistent nuevo hash, digest inválido, inmutabilidad y no-mutación. Order/duplicate negativos cierran en hash guard: **no aíslan independientemente la rama de orden**. Mocks filesystem cubren cuatro archivos faltantes/oversized/nonfile/truncated/grown/changed/read-error, lecturas parciales y stat/close error; restauración automática, sin mutar artifacts ni crear temporales. No refactor conductual posterior a GREEN.

| Comprobación final exacta | Resultado observado C04 |
|---|---|
| `git diff --check` | exit0; repetido tras informe final. |
| `shasum -a 256 contracts/openapi.yaml` | exit0; `94122791de8ce646bcbe342b6bc7d33833ce0b0e9e7121055f6601a22ba80a2f`, intacto. |
| `shasum -a 256 backend/resources/auth/password-blocklist.bin backend/resources/auth/password-blocklist.manifest.json backend/resources/auth/LICENSE.pwdb.txt backend/resources/auth/LICENSE.seclists.txt` | exit0; los cuatro SHA completos coinciden con las anclas C03 arriba, sin cambios. |
| `node -e "const {loadPasswordBlocklist}=require('./backend/dist/auth/password-blocklist.js');const path=require('node:path');const lookup=loadPasswordBlocklist(path.resolve('backend/resources/auth'));console.log(JSON.stringify({compiledLoad:true,synchronous:typeof lookup.hasDigest('0'.repeat(64))==='boolean'}));"` | exit0; `{"compiledLoad":true,"synchronous":true}`; carga explícita real, no build-copy claim. |

Conteo final: 395 líneas authored (389 agregadas/6 retiradas), exactamente cuatro paths autorizados, staged vacío y branch/HEAD base conservados. Assets/contrato intactos; sin corpus, env, DB, red, scripts nuevos ni cambios de módulos/dependencias/build. Review nativa, Verify independiente y commit C04 siguen pendientes del padre; no distribución runtime, Argon/dependencia, PG propio, sesiones/bootstrap/admin, frontend/navegador ni full H1 LIVE acreditados.

## Slice 05 — Argon standalone acotado; cierre registrado

C04 histórico cerrado en `e65c4d620fd332ec8ffe0d470e7a723901edc5ba`, tree `b946b83a84fbef3534cba4517acac3b83c549cf9`, review `review-2898763254cded6d` cuatro lentes aprobados/acuse consumido. Verify independiente: 80 loader/486 unit/6 suites/15 comandos y probe compilado explícito. Supersede pendientes históricos C04, **no aprueba C05**. C03 `R3-001` sigue informacional separado, sin fix/reapertura.

C05 agrega dependencia exacta `argon2@0.45.1` y [helper](../../backend/src/auth/password-hasher.ts)/[86 tests](../../backend/src/auth/password-hasher.spec.ts), sin registro ni endpoints/DB/cuentas. [PHC fijo, NFC sensible a case, snapshot, FIFO y límites](../decisions/H1-auth.md#argon-acotado-independiente-slice-05). Historia retenida del writer original, no ejecución nueva ni replay TDD: instalación normal exit0, seis paquetes agregados/806 auditados/cero vulnerabilidades reportadas. El writer terminó con assistant-error sin handoff final; causa desconocida. Warning allow-scripts de seis paquetes no cubiertos: `@parcel/watcher`, `@prisma/engines`, `@scarf/scarf`, `prisma`, `unrs-resolver`, `argon2`; registrado sin aprobar, rebuild, ignore-scripts ni cambios globales.

| Comando exacto (foreground timeout180s) | Evidencia histórica retenida C05 |
|---|---|
| `npm --prefix backend install argon2@0.45.1 --save-exact` | exit0 normal; warning arriba. |
| `npm --prefix backend test -- --runInBand --runTestsByPath src/auth/password-hasher.spec.ts` | RED conductual exit1: 83 failed/1 passed; GREEN exit0:84/84, triangulación final86/86. Stub inicial con throw provocó rechazo no manejado del harness (exit1), corregido a stub tipado resolvente antes del RED; no se cuenta como RED. |
| `npm --prefix backend run build` | exit0, repetido tras ajuste lint; Prisma generate + tsc existente. Aviso de actualización Prisma, sin actualizar. |
| `npm --prefix backend run lint` | Inicial exit1: dos no-unexpected-multiline del spec y no-control-regex; ajustes locales de layout/guard ASCII, repetido exit0. Sin reparar configuración global ni bypass. |
| `npm --prefix backend test -- --runInBand` | exit0,572/572 tests,7 suites. |
| `npm --prefix backend run test:e2e -- --runInBand` | exit0,5/5 mock H0,1 suite; no auth real. |
| `node --test scripts/h1-password-blocklist.test.mjs` | exit0,10/10. |
| `npm --prefix backend run contract:validate` | exit0,OAS3.0.3/7 ejemplos. |
| `node --test scripts/h0-contract-validate.test.mjs` | exit0,11/11. |

Tres tests nativos reales (**cinco hashes exitosos: 2+1+2**) cubren salts distintos incluso entre instancias, match/mismatch, NFC equivalente/case/whitespace, uno y128 puntos de código astrales sin truncamiento, type/version/factores/salt16/hash32. Mocks de exports reales/deferred prueban límites1–4, capacidad0/16/64, FIFO compartida/no robo de slot, mutación del caller sin efecto, inputs/PHC antes de cola, throws/rechazos y outputs inválidos de ambos métodos. No fixtures privadas en snapshots/logs; asserts sobre booleanos/metrología/errores constantes. Ajuste lint no cambia contrato; focused86 volvió a GREEN antes de full checks.

El handoff histórico contó seis hashes combinados, pero sobrestimó el conteo focused nativo: son cinco; el probe compilado añade **un hash separado**, con `compiledHash:true`, `match:true`, `mismatch:false`. Verify independiente actual `musb0v7p-1n-cnwe` **GREEN**: 86 focused, 572 unit/7 suites, 5 mock e2e H0, 10 generador, 11 contractuales, 7 ejemplos, build/lint/diff y pins íntegros de contrato/resource/manifest/ambos notices. Todas las invocaciones terminaron sin error de comando reportado; **no se expusieron códigos numéricos de salida**, por lo que los exit0 históricos de la tabla no se atribuyen a esta verificación. Branch `feat/h1-auth-05-argon`, HEAD `e65c4d620fd332ec8ffe0d470e7a723901edc5ba`, cuatro modificaciones tracked y dos archivos hasher untracked, staged vacío y SHA256 de los seis archivos estables antes/después de Verify.

Normalización documental antes del freeze nativo; cambia los bytes de ambos documentos respecto de ese snapshot verificado, no los cuatro archivos funcionales protegidos. Edición pasiva sin RED conductual significativo: readback estructural y check focused de continuidad, no replay TDD. C05 cerrado: commit `497648503b8f357c7488dac4e10082dd70420f6b`, branch `feat/h1-auth-05-argon`; review `review-cbe322421715bff4`, cuatro lentes APPROVED y acuse exacto consumido. Verify independiente final y commit comparten tree `96087c61dad61f5d9c077c0cb0d957e44e281aa0`, postcommit limpio. Normalización documental conservó los cuatro SHA funcionales; bridge independiente confirmó continuidad focused86/diff/contrato/tree. Supersede pendientes pre-freeze, sin transferencia automática workspace→rango commiteado ni H1 completo. Helper no conectado al runtime; PostgreSQL propio, sesiones/bootstrap/admin, frontend/navegador/full H1 LIVE y auditoría externa pendientes. FIFO con mocks/deferred no acredita carga nativa productiva; sin prueba de carga/peak/RSS ni permiso de elevar capacidad nativa.

## Slice 06 — Empaquetado offline completo; cierre registrado

Unidad limitada a package/build, biblioteca copier, CLI explícito, tests y estos dos documentos (seis paths). [Rutas, autenticación y límites](../decisions/H1-auth.md#empaquetado-offline-completo-slice-06). Sin lockfile/dependencias, pins/source resources, DI, env, HTTP, Prisma/config ni frontend modificados. Prerrequisitos compilados C04/C05 ya disponibles antes del RED; no build preparatorio ni datos privados. Fixtures bajo prefijo temporal propio `abar-auth-packaging-`, limpiadas únicamente por sus tests.

Historia primera escritura: RED conductual exit1,13 failed/1 passed contra no-op → GREEN14/14 (exit numérico GREEN no expuesto). Error inicial de instrumentación import no cuenta como RED. La igualdad argv/path falló ante symlink macOS; el reemplazo por `import.meta.main` funcionó en24.18.1, pero introdujo dependencia de API disponible desde24.2, incompatible con política Node24.x sin patch floor. No ejecución real de24.0/24.1.

Verify previo independiente `musgneyk-1u-jjry`: todos los comandos exit0 explícitos,572 unit/7 suites,5 mock/1 suite,7 ejemplos, pins/probes y cinco SHA fuente completos estables. Su filtro omitió agregados de tres suites Node: no se atribuyen conteos14/10/11 al independiente. Evidencia previa no certifica candidato corregido.

Corrección: CLI separado llama biblioteca incondicionalmente, rechaza argumentos y redacta fallos; core no tiene branch CLI ni I/O al importar. Regresión sobre copia temporal elimina `import.meta.main` y verifica su ausencia antes de exigir los cuatro artefactos autenticados/byte-exactos. Simula ausencia de API en24.18.1, no certifica otras patches ni reduce soporte.

| Comando exacto (foreground, timeout180s) | Evidencia nueva del writer, candidato corregido C06 |
|---|---|
| `node --test backend/scripts/copy-auth-resources.test.mjs` | RED exit1:1 failed/14 passed; old-gated CLI exit0, pero falta artefacto. GREEN exit0:15/15, sin skips/cancelados; agregados Node retenidos. |
| `node --check backend/scripts/copy-auth-resources.mjs && node --check backend/scripts/copy-auth-resources-cli.mjs && node --check backend/scripts/copy-auth-resources.test.mjs` | exit0, tres parsers. |
| `npm --prefix backend run build` | exit0; Prisma generate + tsc + nuevo CLI explícito, destino autenticado. |
| `npm --prefix backend run lint` | exit0; alcance ESLint TS existente, no lint dedicado de mjs. |
| `npm --prefix backend test -- --runInBand` | exit0,572/572 unit,7 suites; no incremento TS. |
| `npm --prefix backend run test:e2e -- --runInBand` | exit0,5/5 mock H0,1 suite; no auth/PG real. |
| `node --test scripts/h1-password-blocklist.test.mjs` | exit0,10/10. |
| `npm --prefix backend run contract:validate` | exit0,7 ejemplos externos. |
| `node --test scripts/h0-contract-validate.test.mjs` | exit0,11/11. |

Triangulación en15, conservando los14 casos anteriores: cada binario/manifest/notice faltante o corrupto falla antes de copia; bytes completos de cuatro archivos, cwd ajeno/repetición/archivo ajeno preservado; corrupción de destino inducida en fixture cierra tras copia; import sin assets/loader no lee recursos, API/CLI redactadas y flags rechazados. Sin mutación de fuente real ni candidato generado. Prueba positiva usa loader real compilado, no pins sintéticos ni certificado exclusivamente mock.

SHA256 de contrato intacto `94122791de8ce646bcbe342b6bc7d33833ce0b0e9e7121055f6601a22ba80a2f`; `shasum -a 256` sobre contrato y cuatro fuentes/cuatro archivos empaquetados terminó exit0: los cuatro pares coinciden con SHA C03 completos arriba. Binario170528 bytes, manifest y ambos MIT1069/1072 bytes íntegros. Probe real `node -e` con C04 compilado y ruta fija `backend/dist/resources/auth`: exit0, solo `{"packagedLoad":true,"synchronous":true}`. Comparación adicional byte a byte confirma cuatro archivos idénticos y avisos completos (exit0). No hash de credencial ni lectura env. `git diff --check` pasó exit0; scope final seis paths: tres tracked modificados y tres scripts nuevos, staged vacío/HEAD base conservado. Conteo authored250 líneas (46 agregadas/8 retiradas tracked +196 nuevas), bajo advisory400.

C06 cerrado en `777dbfac9df307a635e3f91fc9edac9bdb19e09f`: review `review-60c6c78737ad0617`, cuatro lentes APPROVED/acuse exacto consumido. Verify fresco independiente `mushhol4-1w-wrrm`: todos los comandos exit0 explícitos; 15 packaging, 572 unit/7 suites, 5 mock H0, 10 generador, 11 contractuales, 7 ejemplos; tres node--check, build/lint/diff y pins. Cuatro pares fuente/empaquetado byte-idénticos, MIT completos1069/1072 y loader compilado GREEN. Tree verificado/commiteado `1a976b69e5d2f39fc6482b51d9daa8270557933d`, postcommit limpio. Supersede pendientes históricos pre-freeze, sin inventar stage del writer ni transferir aprobación workspace→rango commiteado/fullruntime. C05 permanece cerrado497/four ACK/Verify96087; su aprobación tampoco aprueba C07.

## Slice 07 — Composición DI preparada; gates del padre pendientes

Exactamente cinco paths: módulo runtime, spec, AppModule y estos dos documentos. [Diseño y prerrequisito build](../decisions/H1-auth.md#composición-runtime-nest-slice-07). Una fábrica singleton por contenedor toma snapshot raw env, valida C01, carga C04 desde destino empaquetado fijo y construye un único hasher C05/FIFO compartida. Wrapper/config/orígenes inmutables; hasher no congelado. Sin I/O de recursos ni construcción al importar; ConfigModule conserva ignoreEnvFile:true. No modificaciones de main, e2e, dependencias, recursos, contrato ni HTTP.

Evidencia nueva observada por writer C07, foreground timeout180s:

| Comando exacto | Resultado observado |
|---|---|
| `npm --prefix backend run build` | exit0 antes del RED (stub compilable + packager) y después de implementación; Prisma generate + tsc + packager C06. |
| `npm --prefix backend test -- --runInBand --runTestsByPath src/auth/auth-runtime.module.spec.ts` | RED conductual exit1:24 failed/2 passed,26 total; GREEN exit0:26/26; repetido después de ajuste de layout lint,26/26. Un error inicial TS del tipo de fixture env fue corregido antes del RED:0 tests, no evidencia conductual. |
| `node --test backend/scripts/copy-auth-resources.test.mjs` | exit0,15/15; sin skips/cancelados. |
| `node --check backend/scripts/copy-auth-resources.mjs && node --check backend/scripts/copy-auth-resources-cli.mjs && node --check backend/scripts/copy-auth-resources.test.mjs` | exit0. |
| `npm --prefix backend run lint` | Inicial exit1:dos no-unexpected-multiline en spec; ajuste solo layout, repetido exit0. |
| `npm --prefix backend test -- --runInBand` | exit0,598/598 tests,8 suites (572 previos +26 C07). |
| `npm --prefix backend run test:e2e -- --runInBand` | exit0,5/5 mock H0,1 suite. |
| `node --test scripts/h1-password-blocklist.test.mjs` | exit0,10/10. |
| `npm --prefix backend run contract:validate` | exit0,7 ejemplos. |
| `node --test scripts/h0-contract-validate.test.mjs` | exit0,11/11. |

Triangulación dentro de26: import sin efectos; raw AUTH knobs y snapshot defensivo; singleton/hasher compartido, contenedores distintos e inmutabilidad; rechazo de unknownAUTH/NODE_ENV/origen producción/capacidad inválida antes de devolver aplicación. Ocho negativos source de loader mock solo aíslan frontera privada. Once casos del mismo spec ejecutan Node con JS compilado real, módulo AuthRuntimeModule únicamente, cuatro assets públicos y dependencias normales en fixture temporal propio `abar-auth-runtime-`; cwd ajeno y ruta relativa al código, sin public path override ni PG. Positivo comprueba identidad/hasher/lookup booleano; dos config inválidas y falta/corrupción de cada archivo rechazan creación con mensajes seguros. No logs de env, hashes, instancias ni causas. Cleanup solo de fixture propio.

La creación real usa `NestFactory.create(...,{logger:false,abortOnError:false})`: negativos confirman `returned:false,listened:false,rejected:true,safe:true`; positivo `returned:true,listened:false,shared:true,lookupBoolean:true`. El listen no se invoca y los negativos no pueden alcanzarlo porque la creación rechaza. El flujo main existente queda intacto. Esto es prueba genuina del artefacto **AuthRuntimeModule standalone**, no del arranque completo AppModule/DB ni endpoints H1. Build previo obligatorio para test/start/start:dev; watch no empaqueta. Node24.x sin cambio;24.0/24.1 no ejecutados.

Checks finales del writer: `git diff --check` exit0; contrato SHA94122791…ba80a2f intacto, cuatro pins fuente/empaquetado coincidentes y bytes idénticos, MIT completos1069/1072 (asserts Node y shasum/cmp/wc, exit0). Branch/HEAD base777 estables, index vacío; tres tracked modificados y dos módulos/spec nuevos untracked, exactamente cinco paths. Conteo authored287 líneas agregadas/retiradas, sin minificación ni expansión de scope.

Review nativa C07, Verify independiente y commit **PENDING** del padre. PG propio, sesiones/bootstrap/admin, Angular/navegador, carga/RSS, full H1 LIVE y auditoría siguen pendientes.

## Slice 08 — Frontera Prisma CLI preparada; gates pendientes (historical snapshot)

C07 **CLOSED**: commit `71e6abf590721466a6ea8572a948a69174964437`, tree
`9af840430c1291a22fcef538eb929ddc2bf29f94`; review `review-10051ed7f7701d1d`, cuatro
lentes APPROVED y ACK exacto BURNED. Target consumido
`sha256:840ccab527cb3750a75b4f6787d691f26c0de09c6b54bb8dca0fbaa28c013a81`, revisión
`sha256:1f64263dcc1b58b8e5fa3e2d5814a032a428e7bded6368e257378ca8b9e5dd77`.
Verify independiente ALL exit0: 26 runtime, 598 unit/ocho suites, 15 packaging,
cinco mock e2e, 10 generador, 11 contractuales/siete ejemplos, build/lint/tres parses,
diff/pins/cinco SHA estables. Once fixtures compilados de AuthRuntimeModule no
certifican arranque productivo AppModule/DB ni full H1. Los snapshots anteriores
quedan históricos, sin replay de aprobación ni autoridad transferida a C08.

C08: branch `feat/h1-auth-08-cli-guard`, base `71e6abf590721466a6ea8572a948a69174964437`.
Siete paths fuente: default config, nuevo schema config, package, test CLI y tres
documentos. [Decisión y límites](../decisions/H1-auth.md#c07-cerrado-frontera-cli-c08-preparada).
Solo la selección explícita sin datasource permite generación/validación/build;
la selección por defecto falla con mensaje fijo. No cambia schema/output/deps.

RED observado con loader instalado, sin CLI: exit1, 0 passed/1 failed; el config
anterior cargaba cuando debía denegar. GREEN loader: exit0, 3/3, incluidas variantes
sin/con URL heredada sintética no secreta. Un assert inicial exigía ausencia de
propiedad; defineConfig normaliza datasource omitido a undefined: se corrigió el
assert, no el contrato ni el config. Después del GREEN, negativas CLI reales:
exit0, 6/6 totales, generate/validate/migrate status terminan exit1 con solo el error
fijo envuelto por Prisma y sin dispatch output. HOME/XDG/TMP/Jiti/commands.json
permanecen en fixtures propios ignorados; no config global ni bypass de checkpoint.
No certificación de sandbox/red: prueba acotada al orden del CLI instalado.

ASSESS/review nativa/Verify independiente/commit C08 **PENDING**. Provisión,
guard de propiedad, runner/config confiable de migraciones y certificación PostgreSQL
real C09+ **PENDING**, sin ejecutar la autorización futura de recurso nuevo/exclusivo
`postgres:17.11-bookworm`, sin Compose/H0/bases existentes ni borrado automático.

## Slice 08 closed; Slice 09 offline contract candidate

C08 **CLOSED**: commit `80e32a754512011a4c51a42198a55bb56d34a2c4`, tree
`46cce4da053ee60c902cf0d2ac0d7611c183204b`; seven paths, 238 additions/15 deletions.
Native `review-ce3c99e320c9a121`: four APPROVED lenses, exact ACK BURNED for target
`sha256:2359dc60432ca0e101a2eaf2417d2321809e54ddc96f4b18b1ff516c91b4b989`, consumed
revision `sha256:2a056a368ad2199e53073a9eea0c42a0c5b11cb9912072f3e9f175b77180e1af`.
Independent verification: 18 functional checks, all exit 0, and exact BASE71
eight-file generated-client SHA equality, final exit 0. Preserve the late worker
baseline ordering, failed baseline fixture attempts and public-demo-URL output
deviation; no actual environment files/private credentials were read. npm update
notices do not certify network silence. Advisory R3-001 at CLI test lines 98–124
remains separate, description unavailable; no invented correction or receipt replay.
Historical pending snapshots above remain unchanged evidence, not current gates.

C09 branch `feat/h1-auth-09-owned-contract`, base C08. Four reviewable paths:
[offline core](../../backend/scripts/h1-owned-postgres.mjs),
[Node tests](../../backend/scripts/h1-owned-postgres.test.mjs) and these two documents.
[Contract, persistent-recovery decision and official constraints](../decisions/H1-auth.md#c08-closed-c09-offline-ownership-contract).
No public command, Docker/PG adapter, datasource config, real-state access,
provisioning, child migration/application effects, package/dependency changes or
C01–C08 reruns. Tests exercise private filesystem fixtures and injected evidence,
not actual Docker ownership, database freshness or full-H1 behavior.

Observed test-first evidence: nonthrowing importable stub and valid fixture shapes
preceded RED exit 1 (2 behavioral failures, 0 passed, 51 deferred/skipped). First
full run: 52 passed/1 failed; child-execution coverage exposed a root-resolution
mistake that wrote generated fixture pairs one directory above the repository,
under `/Users/agustin/Repos/personal/odd/probes/h1-owned-postgres/fixtures/`.
The writer corrected both roots and added a pre-write repository-root assertion;
out-of-scope fixtures were not inspected or deleted and require parent handling.
This is a scope deviation, not a claimed clean fixture certificate. Corrected
GREEN: 53/53, exit 0. Expanded filesystem/invalid-input coverage: 59/59, exit 0;
an intervening trailing-slash root assertion failure was setup, not behavioral RED.
Accessor triangulation RED: 1 failed/61 passed, exit 1, before rejecting state
accessors without invoking them. Uncertain-write lock-retention regression RED:
1 failed/61 passed, exit 1, before retaining the lock as an ambiguity barrier and
denying release/read/retry after a failed pair write. Final verification is reported
in the writer handoff; no future result or parent approval is predicted here.

Offline checks cover strict schemas/binding/lifecycle, private bounded descriptor
reads, malformed/unknown/oversize/UTF-8/nonfile/mode/hardlink/symlink failures,
exclusive pair writes preserving uncertain originals, stale/replaced locks,
generated IDs and exact container/image/labels/storage/mount/loopback identity,
authenticated role/DB/table inventory, final reinspection/order, rejected env/effect
hooks, fixed sensitive plan/redacted errors, and silent import/direct execution
with fixture-local HOME/XDG/TMP and no ambient private env/Node options.
Owner-mismatch, hostile directory races, crash durability, real freshness/roles,
real image/port isolation and installed Prisma execution are not certified.

### C09 CLOSED; incident24 preserved

C09 closed at `4cd1b752db62604aabe441613ef44876985e2bee`, tree
`2a5b26343507c2d3797cea5caee0095c05aa4d98`. Independent verification: 62 passing
tests, two parser checks and diff check, all exit 0. Four native reviewers APPROVED;
exact ACK consumed/BURNED; post-commit Git clean. Historical pending snapshots
above are superseded, not replayed or amended in earlier commits. Incident24's
wrong-root writes, initial failures and preserved external entries remain historical
deviations/nonblocking follow-up. C10 does not access, inventory or clean that
external namespace; it neither erases the incident nor claims hostile-race safety.

### C10 offline v2 credential/projection evolution

[Current schema/API and recovery decision](../decisions/H1-auth.md#c10-separate-roles-and-raw-password-file-projection-offline-v2).
Separate internally generated bootstrap image-init superuser and migration role
have distinct credentials. Only the nonprivileged migration credential reaches
the dedicated URL. Private retained JSON is separate from code-owned plaintext
`bootstrap-password.txt`; actual bounded fixture bytes must equal the bootstrap
password alone. JSON serialization is rejected, never relabeled as valid mount
evidence. Exact v2 pair/resource/run/projection identities and mount/volume/port
shapes deny unsupported inputs. Legacy v1 files require separately authorized
manual recovery; no conversion, overwrite, adoption or lock reclaim.

Containment checks precede fixture writes: script-relative two-parent root equals
canonical cwd, actual ancestors are directories/non-symlinks, and only fresh unique
in-repository fixture descendants are used. No real state, environment files,
Docker/PG/network/Prisma CLI, service, generated assets or package changes.

Observed behavioral RED against the importable C09 API: 62 passed / 2 failed,
exit 1; failures were v2 generation and fail-closed v1 validation, not setup/import.
GREEN after implementation and triangulation: 108 passed / 0 failed, exit 0,
no cancelled/skipped/todo. Regressions retain C09 barriers with explicit v2 version,
role and mount expectations; new cases cover actual plaintext/private files,
JSON/equal-credential rejection, cross-version/run binding, unsupported shapes,
legacy bytes/lock preservation and bootstrap-role/final-projection denial. Final
foreground regression/parser/diff results and four-file stable SHA256 evidence
are returned in the writer handoff. No C01–C08 reruns or real-PG certificate.

C10 parent ASSESS, independent Verify, native review/ACK and local work-unit commit
remain **PENDING**. Writer performs no staging, commit or review lifecycle. Source
documents and normalized fake evidence do not certify real mounts/UID permissions,
authentication/grants, image/daemon behavior, ownership or freshness. Actual
volume-creation/freshness provenance, real adapters, installed Prisma behavior and
true-service checks remain future gates. No automatic cleanup or resource adoption.
H1 authentication, sessions/admin and browser gates remain open; consumed C09
(or earlier) authority cannot be reused.

## C10 closed; C11 offline Docker observations prepared

C10 closure supersedes historical pending notes above: commit
`779db7b062b536190f1518dd3fe7d68c6abbc94f`, tree
`cb6df8038042157d57042d78a56d9a9ca683aac9`; independent 108/108 tests,
both Node parser checks and diff check exit 0. Native four reviewers APPROVED,
exact acknowledgement BURNED, post-commit clean, no push. The initial count-capture
gap and separately authorized corrective TAP run remain historical evidence,
without amendments or authority transfer. Parent full textual mirror readback
completed; remote newline byte-fidelity was not claimed.

C11 adds only the pure [parser](../../backend/scripts/h1-owned-postgres-docker-observations.mjs)
and [in-memory tests](../../backend/scripts/h1-owned-postgres-docker-observations.test.mjs).
The [exact contract and local-policy distinctions](../decisions/H1-auth.md#c10-closure-and-c11-observation-only-contract)
pin Moby v28.0.0 / Engine API v1.48. Expected ten-field comparisons confer no
authority. Exact `{ container, volume }` output preserves observed labels, literal
mount sources, configured image reference versus observed image ID, and optional
timestamp (null when absent). It is detached/deeply frozen, not a current kernel
resource, URL, command, execution plan or owned/fresh/created/reused decision.
Unknown raw keys are ignored without evaluating accessors; selected own data fields
and complete string maps are checked. Faults expose only a fixed redacted Error.
Strict local warning/mount/loopback-port/volume policies are not universal wire
requirements or real-daemon compatibility certification; hostile proxies/runtime
remain outside the threat model. Same-name volumes still provide no allocation proof.

Observed RED: importable neutral stub, 7 tests / 1 pass / 6 behavioral failures,
0 suites/cancelled/skipped/todo, exit 1. GREEN and triangulation: 96 tests / 96 pass,
0 failures/suites/cancelled/skipped/todo, exit 0. Only synthetic trusted fixtures
are serialized in tests; raw runner output is captured in memory and suppressed.
Final foreground tests, two syntax checks, diff check and four stable SHA256 hashes
are reported in the writer handoff, not replaced with invented lint evidence.

No C01–C10 suites/reviews rerun, Docker/socket/network/service contact, environment
files, fixtures on disk, external incident access, dependencies or generated output.
No kernel integration or live PostgreSQL certificate. Provenance, image/platform,
mount permissions, authentication/grants, freshness and execution remain future gates.
Parent ASSESS, functional Verify, native consent/review and local commit are
**PENDING**; no writer staging/commit/tracker closure and no consumed authority replay.
A future guarded commit requires fresh human permission for identical accepted bytes.

## Aceptación parcial y siguiente gate (snapshot histórico C07)

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
2. Backend: configuración C01, política C02 y generador/resource C03 completados; C04 loader y C05 Argon cerrados; C06 empaquetado cerrado; C07 composición runtime del recurso/helper preparada requiere review/Verify/commit del padre. Continuar con protección del nonce, modelos/migraciones y bootstrap seguro. Runbook bootstrap pendiente; manual update del ejemplo de entorno solo si necesario, sin bypass.
3. Implementar y verificar H1, incluyendo pruebas reales PostgreSQL y navegador si disponible. Antes de handoff a auditoría, Review + Verify deben cubrir el **mismo candidato final**. El padre registra el resultado, sin inventar aprobación externa.

P01–P10 y horas siguen pendientes; rollout comercial cerrado. No se inicia H2 ni se modifica el informe histórico H0.

## C12.1 — Proyección offline de imagen Docker

Se añade [`parseDockerImageResponse`](../../backend/scripts/h1-owned-postgres-docker-image-observations.mjs)
y su prueba sintética en memoria. El DTO nuevo no consulta servicios ni realiza I/O:
conserva un identificador validado, el estado/conteo de tags, únicamente hashes de
RepoDigests, cadenas de plataforma y una categoría de `Config.User`. La salida se
separa de la entrada y queda profundamente congelada; los fallos usan un mensaje
fijo sin datos de entrada.

Los límites y validaciones son política local estricta, no garantías universales del
esquema de transporte Docker: SHA-256 lowercase exacto, máximo 4096 unidades UTF-16
por texto y 128 elementos por arreglo, registros plain/null-prototype y descriptores
propios de datos para campos seleccionados. Las pruebas cubren getters seleccionados
sin invocarlos, getters desconocidos ignorados, campos heredados/undefined, límites,
casos inválidos, redacción, inmutabilidad y congelación. Fixtures completamente
sintéticos; no se consultaron daemon, API, servicios, configuración, secretos ni bases.

Estos resultados no acreditan compatibilidad real de transporte/daemon, procedencia,
propiedad, frescura, localidad, plataforma en ejecución, UID/grants de PostgreSQL,
elegibilidad ni preparación completa H1. La corrida TAP enfocada observó 19 pruebas
aprobadas, cero fallidas/canceladas/omitidas/todo y cero suites; ambos chequeos de
sintaxis MJS y `git diff --check` pasaron. La observación operativa y el provisioning
real permanecen pendientes por separado; no se modifican el parser/kernel C11 ni sus
evidencias históricas.

## C13.1 — Transporte de observación de imagen por Unix HTTP

`backend/scripts/h1-owned-postgres-docker-transport.mjs` exporta únicamente
`observeDockerImage(input)`: un GET fijo al endpoint ImageInspect `v1.48` de
`postgres:17.11-bookworm` sobre un `socketPath` Unix absoluto explícito. La entrada
usa registros plain/null-prototype y descriptores propios de datos; accesores
seleccionados, `undefined` presente, límites enteros inválidos y otros errores se
redactan como la denegación congelada. Cada operación válida crea un Agent privado
nuevo, sin keep-alive, y envía `Host: localhost`, `Accept: application/json` y
`Connection: close`; no selecciona TCP/proxy, lee env/config, reintenta ni sigue
redirecciones.

La aceptación local requiere status 200, tipo JSON acotado, encoding ausente o
identity, y framing único por Content-Length exacto o chunked. Rechaza duplicados,
framing ambiguo, headers sobre el límite, trailers no vacíos, truncamiento,
UTF-8/JSON/BOM inválidos y exceso de bytes. Reserva un único buffer binario después
de validar headers, con límite configurable solo a la baja. El JSON pasa al proyector
C12 sin modificaciones; se devuelve solo su DTO congelado y separado, nunca el body
ni campos privados. Deadline monotónico cooperativo más timer; no puede interrumpir
CPU síncrona ni un event loop detenido y no limita todos los buffers/asignaciones de
Node. Se destruyen los recursos propios y se absorben errores tardíos hasta `close`,
sin afirmar cierre OS síncrono.

**TDD/evidencia del writer:** el stub async importable devolvía la denegación fija.
La primera corrida conductual de 9 tests observó 3 aprobados/6 fallidos, exit 1;
la ausencia de transporte no podía satisfacer la observación/redacción/request
esperados. Esa corrida también contenía una expectativa inválida que clasificaba un
campo desconocido ignorado como denegación; se corrigió y no se usa como prueba
individual de ese caso. Una corrida ampliada terminó exit 137 con una excepción de
fixture `ERR_HTTP_TRAILER_INVALID` al construir trailers incompatibles con
Content-Length; no fue RED de producción. Una corrida posterior de 13 tests produjo
12 aprobados/1 fallido por el mismo tipo de construcción inválida (`writeHead` con
Content-Length y Trailer). Se sustituyeron por framing/raw HTTP Unix controlados; no
se alteró producción para satisfacer fixtures defectuosos. **GREEN final:**
`node --test --test-reporter=tap backend/scripts/h1-owned-postgres-docker-transport.test.mjs`,
Node v24.18.1, exit 0, 13 tests aprobados, 0 fallidos/cancelados/omitidos/todo,
0 suites. Cubren entradas/accesores, request exacto y sin reintento/redirect, status,
headers/encoding/framing/trailers, Content-Length/chunked/multibyte/caps,
UTF-8/BOM/JSON/proyector, truncamiento/refusal, deadlines sin respuesta y trickle,
peer-close observado antes del teardown y llamadas/conexiones independientes.

En esa GREEN se registraron 32 directorios privados nuevos y 32 sockets Unix
autopropios (`/tmp/h1-c13-*`), cada uno con identidad `dev/ino`; los 32 recibos de
cleanup marcaron `removed`, incluidos los directorios con múltiples conexiones.
Las pruebas esperaron el evento de cierre de cada peer del servidor antes del
teardown; esa corrida no atribuía en todos los casos qué lado inició el cierre. El
hook final destruye solo recursos de fixture aún propios y usa límites finitos.
PID/PPID del runner: 22830/22829. Esta evidencia refiere solo a recursos de esta
corrida; los recursos históricos no registrados permanecen desconocidos y no fueron
inventariados, adoptados ni limpiados.

La documentación preserva los bytes anteriores mediante append-only. El alcance no
integra kernel/C12, provisioning, Docker/PG, H0, Compose, configuración ni recursos
persistentes. No certifica compatibilidad universal de daemon/Node, heap total,
preempción CPU, propiedad/frescura, PostgreSQL o H1 completo. Syntax-checks, diff
check, prefijos documentales y SHA de límites protegidos se reportan en el handoff
final del writer; Verify independiente y revisión nativa permanecen pendientes del
padre. No hubo stage, commit, push ni acción nativa.

### C13.1 — Correcciones de evidencia y ciclo de fixtures

Se mantuvo la implementación de transporte sin cambios. La expectativa de control
path que primero representaba backslash-plus-`0` como si fuera NUL falló como error
de la prueba, no de producción; se reemplazó por codepoints U+0000/U+0001/U+001F/
U+007F y una ruta hija sobrelímite. Una instrumentación inicial de peer-close también
falló porque Node marca `socket.writableEnded` al cerrar el socket destruido. Se
sustituyó por evidencia directa: los casos sin respuesta/trickle observan exactamente
una llamada a `ClientRequest.destroy()` del cliente y que el fixture no había emitido
`finish` antes del cierre del peer. Ambos casos pasan dentro del límite; el resto de
los casos solo exige peer close observado antes del teardown, sin atribuir iniciador.

El helper ahora registra el hook antes de crear recursos, rastrea y drena operaciones,
usa gates controlados para cancelación pre-creación, pre-listen y post-listen, aborta
un Unix listen en vuelo, y cerca continuaciones antes de lanzar acciones tardías.
El cleanup acotado verifica identidad/entradas, no invoca sus operaciones explícitas
`unlink`/`rmdir` ante metadatos inyectados distintos ni entradas imprevistas, y solo
demuestra la retirada después de restaurar la vista de sus recursos propios. Se ejercitaron errores controlados de
setup/handler y drenaje/close del servidor. El caso in-flight listen registró
`identity-unavailable`, close observado y eliminación del directorio vacío: no se
presenta como identidad de socket capturada.

**RED de corrección:** el assert transitorio de `writableEnded === false` falló en los
casos no-response/trickle (Node observó `true` al cerrar); no fue un fallo del
transporte. **GREEN final:** `node --test --test-reporter=tap
backend/scripts/h1-owned-postgres-docker-transport.test.mjs`, Node v24.18.1, PID/PPID
36784/36783, exit 0: 21 aprobadas, 0 fallidas/canceladas/omitidas/todo, 0 suites.
Se ejecutaron 43 directorios fixture nuevos; 40 identidades socket `dev/ino` fueron
capturadas, dos directorios fueron cancelados/fallaron antes de listen y un intento
de listen se abortó antes de capturar identidad. Los 43 directorios tuvieron retirada
confirmada; cada servidor iniciado cerró, y los cierres finales no dejaron peers u
operaciones pendientes. Recursos son solo los creados por ese PID/corrida; ningún
recurso histórico fue adoptado, enumerado ni limpiado. `node --check` para ambos
MJS y `git diff --check` se reportan tras esta actualización. La revisión
independiente y gates del padre continúan pendientes; sin commit ni acción nativa.

### C13.1 — Registro histórico: rerun del writer tras acotar fixtures

La corrida enfocada que entonces se calificó final posterior a los límites de
filesystem/cleanup se conserva como evidencia histórica: mismo comando TAP, exit 0,
13/13 aprobados, cero fallidos/cancelados/omitidos/todo, cero suites; PID/PPID
24462/24461. Sus 32 recibos de directorio/socket cerraron como `removed` tras observar
peers cerrados antes del teardown. `node --check` pasó en ambos archivos nuevos y
`git diff --check` terminó sin errores. Luego fue supersedida por 21/21 del writer
(PID 36784) y la verificación independiente recibida (PID 39085), ambas anteriores a
las correcciones adicionales documentadas debajo; ninguna inspeccionó recursos
históricos desconocidos ni cambió los gates de lifecycle, revisión o commit.

### C13.1 — Continuación: límites explícitos y fence post-chmod

Se añadió cobertura positiva explícita para `timeoutMs` 1/12000 y
`maxResponseBytes` 1/262144. Cada caso alcanzó exactamente una construcción de
`http.request` a través del observer de prueba y fue interceptado antes de red; la
denegación devuelta por el sentinel solo prueba aceptación de entrada y paso al
constructor, no éxito HTTP, deadline de 1 ms ni rendimiento. Las pruebas Unix
existentes siguen cubriendo la interacción real con el fixture propio.

La regresión controlada mantiene pendiente la finalización observada del `chmod`
real en el directorio propio hasta que la prueba cancela setup. **RED de fixture:**
sin el fence, la continuación antigua despachó exactamente un `private mode check`
`lstat` después de cancelar. El directorio propio se drenó y eliminó; no hubo listen,
peer ni operación pendiente. **GREEN:** `ensureSetupOpen(state)` ahora sigue al
`await` del `chmod` y precede al nuevo `lstat`; la misma prueba observó cero despachos
tardíos y cleanup `removed`, sin API ni seam de producción.

**Verificación final de este writer:**
`node --test --test-reporter=tap backend/scripts/h1-owned-postgres-docker-transport.test.mjs`,
Node v24.18.1, PID/PPID 41815/41814, exit 0: 23 aprobadas, cero
fallidas/canceladas/omitidas/todo, cero suites. Se crearon 45 directorios fixture
nuevos: 41 identidades Unix socket `dev/ino` capturadas; tres directorios no llegaron
a listen y un listen abortado cerró antes de capturar identidad. Los 45 directorios
propios se retiraron con identidad comprobada; todos los servidores iniciados
cerraron y las recepciones terminales observaron cero peers/operaciones pendientes.
Hubo además una cancelación pre-creación sin directorio. Estas cifras cubren solo
esta corrida, no recursos históricos o externos. Se preservan los límites conocidos:
el cap del buffer no es un límite de heap total y el deadline cooperativo no preempta
CPU síncrona/event-loop detenido. Los prefijos C12 y el checkpoint canónico permanecen
byte-idénticos. La corrida independiente PID 39085 precede estas correcciones; se
requiere una nueva verificación independiente. No se declara cierre nativo ni hubo
commit.

## C14.1 — Observador standalone de versión Docker

**Resultado del writer: implementación y auto-verificación acotada; revisión independiente, decisión native/RDD, cierre de tarea y commit siguen pendientes del padre/autorización separada.** Esta unidad no altera C13 ni convierte un reporte de versión en prueba de servicio real o readiness.

Se añadieron el módulo `backend/scripts/h1-owned-postgres-docker-daemon.mjs` y su prueba. El observador hace como máximo una petición Unix fija y devuelve solo el DTO congelado/redactado descrito en [la decisión C14.1](../decisions/H1-auth.md#c141--observaci%C3%B3n-aislada-de-versi%C3%B3n-docker-por-socket-unix). La política local de campos requeridos y formatos acotados es deliberadamente más estricta que la declaración OpenAPI upstream; versiones legacy, plataformas no conocidas y rangos API contradictorios se conservan como observaciones y no se interpretan como elegibilidad.

La prueba fixture crea únicamente directorios privados nuevos `/tmp/h1-c14-*` y servidores Unix propios. La corrección del manager drena operaciones y peers aceptados, y valida antes de cualquier `server.close()` que directorio y socket conservan sus identidades `dev:ino`, tipo y permisos esperados, y que el contenido del directorio coincide exactamente. Un mismatch preserva recursos y no despacha `close`, `unlink` ni `rmdir`; las faltas sintéticas llevan recibos `SYNTHETIC` separados y solo el controlador creador, con su diario exacto, realiza recuperación separada. La ausencia del pathname después del cierre solo se correlaciona con identidad prevalidada y ese `server.close()` controlado; por sí sola no prueba identidad de borrado ni elimina la limitación TOCTOU. Cancelaciones controladas durante la finalización de `mkdtemp` capturan la identidad de ese directorio ya creado antes de la siguiente cerca de setup; una operación pendiente de `chmod` se drena y su continuación no lanza el siguiente `lstat` ni listener al cerrar. No se contactaron Docker, PostgreSQL, servicios existentes, sockets externos ni TCP; no se inspeccionaron ni limpiaron recursos históricos.

**Cronología de evidencia (no retroactiva):** el primer writer muu8br8t-q-1kas observó su RED del stub y reportó self-check 12/12/11 directorios/10 sockets; esos datos quedan como auto-reporte histórico, no como aceptación independiente. El primer verificador muu90b11-r-vmp7 se asentó `BLOCKED` antes de `node --test`: runtime deliberadamente omitido, cero fixtures creados y TAP/exit/duración independientes no disponibles (no son ceros). Detectó el orden inseguro `server.close()` antes de identidad/contenido y recibos insuficientes de finalización tardía. El siguiente writer corrigió el manager; su corrida 19/19 es evidencia histórica de writer, no de aceptación independiente. El segundo verificador muueso3q-t-l2ij pasó la auditoría fuente y ejecutó la suite nueva una vez (Node v24.18.1, reporter default: 19/19, exit 0, 212.07 ms), pero devolvió `PARTIAL`: precisó gaps C (cap explícito de un byte sin prueba de `Buffer.alloc(1)`), E (el body UTF-8 servido no era el mismo que determinó cap/Content-Length) y H (las vistas sintéticas evaluaban guards adicionales posteriores, no el mismo predicado de comparación real). No encontró defecto productivo. Se conservan literalmente el RED inicial del stub, el skip seguro inicial y el error de sintaxis de test corregido antes de una suite posterior; ninguno se reetiqueta como RED de producción.

**Auto-verificación de esta corrección acotada:** Node v24.18.1. `node --test backend/scripts/h1-owned-postgres-docker-daemon.test.mjs`: 20 aprobados, 0 fallidos/cancelados/omitidos/todo, exit 0, 237.914958 ms. El body de un byte pasó framing HTTP real, asignó exactamente un `Buffer.alloc(1)` atribuido por stack al observer y luego recibió su denegación JSON fija; el cap explícito 262144 también observó su buffer propio. La prueba UTF-8 ahora sirve el mismo body multibyte cuyo `Buffer.byteLength` coincide tanto con Content-Length como con cap, y acepta DTO válido. Las vistas controladas recorren los mismos predicados privados usados primero sobre `lstat`/`readdir` reales: device, inode, type y permissions para directorio y socket, más contenido. Nueve recibos `SYNTHETIC` preservaron sin close/rmdir del manager y luego el controlador creador recuperó usando los IDs reales journaled; no son fallas físicas de inode/contenido. Se crearon y retiraron 30 directorios nuevos; 28 sockets capturaron `dev:ino` y cierre correlacionado tras prevalidación. Dos cancelaciones anteriores al listener crearon solo directorio; una cancelación post-listen capturó tarde el ID propio. En los recibos terminales: peers/operaciones pendientes 0, 28 close de listener, 30 rmdir y ningún uso de unlink. `node --version`, ambos `node --check` y `git diff --check` terminaron correctamente. El post-close `ENOENT` sigue correlacionado con identidad prevalidada y cierre controlado: no prueba por sí solo la identidad de inode borrado ni elimina TOCTOU. No se afirma fault físico, límite global de heap, preemption, daemon real o compatibilidad. Falta una tercera auditoría independiente fresca; no se declara aprobación native/RDD, cierre ni commit.

## C15.1 — Admisión pura de compatibilidad declarada

Se añadió `admitDockerObservations(input)` en `backend/scripts/h1-owned-postgres-docker-admission.mjs`, con pruebas deterministas únicamente sobre objetos sintéticos offline. La función acepta solo reportes declarados Linux cuya arquitectura coincida exactamente con la selección explícita de política y cuyo API fijo `1.48` esté dentro del mínimo presente y el máximo informado, ambos inclusivos. La comparación `major.minor` es numérica por componentes ASCII acotados, sin coerción a números de precisión limitada.

La ausencia del mínimo se deniega por **política local conservadora**, no porque se afirme como campo upstream obligatorio. Los resultados de éxito son DTOs nuevos, desacoplados y profundamente congelados; toda denegación es idéntica y redactada. Esto es una decisión local sobre declaraciones seleccionadas, no autoridad para crear recursos ni prueba de capacidad real, identidad, frescura, procedencia, aprovisionamiento o readiness. No se invocaron observadores HTTP ni servicios.

**Evidencia de esta unidad:** con Node v24.18.1, el RED inicial fue `node --test backend/scripts/h1-owned-postgres-docker-admission.test.mjs` (exit 1; 7 fallidas/1 aprobada; 33.802958 ms de test-runner), y el caso válido mostró una discrepancia de aserción entre el DTO esperado y la denegación del stub, no un error de import/setup/sintaxis. La corrida focal posterior a implementación pasó 8/8 pruebas (0 fallidas/canceladas/omitidas/todo; reporter default, no TAP literal; 32.403166 ms de test-runner). No se ejecutaron observadores HTTP ni fixtures/servicios. La verificación independiente, disposición native/RDD y entrega local permanecen pendientes del padre; no se declara cierre ni commit.

### C15.1 — Corrección probatoria acotada (solo pruebas)

Se amplió la prueba offline en `backend/scripts/h1-owned-postgres-docker-admission.test.mjs`; el módulo de admisión y esta decisión permanecen intactos. La matriz ahora tiene **16 grupos `node:test`**. En la corrida anotada abajo: longitudes numéricas 32/33 separadas para máximo y mínimo (4 decisiones); 7 rangos con componentes enormes/ceros iniciales aceptados y 3 rechazados; 16 cadenas numéricas malformadas; ocho contextos de registro × siete formas inválidas (56 denegaciones), ocho registros de prototipo nulo válidos, 17 slots seleccionados con getters observados cero veces, y getters desconocidos en ocho registros más seis campos conocidos pero fuera de alcance, también cero invocaciones. Se comprueban además arquitecturas coincidentes de longitud 64, arquitectura coincidente de longitud 65 denegada y cada uno de los tres slots de arquitectura con longitud 65 frente a otros dos de 64; entradas válidas, denegadas y con getter ignorado conservan descriptores/valores, y las salidas no comparten objetos con la entrada.

Los valores adyacentes `9007199254740992`/`9007199254740993` se prueban como componentes mayores y como menores enormes del mismo major, siempre como cadenas y dentro del límite total. La decisión pública fija `1.48`: por ello estos extremos prueban resultados end-to-end (máximos enormes admisibles y mínimos enormes no admisibles), **no** aíslan el ordenamiento privado de componentes ni una comparación min/max independiente. Similarmente, una arquitectura de 65 frente a tres tokens de 64 necesariamente difiere; las denegaciones cubren el límite compartido, pero no pretenden aislar cuál guard causó cada una. No se añadieron exports ni seams privados.

La herencia se prueba como custom-prototype no permitido y como falta de propiedad propia; no se afirma que un registro ordinario permitido pueda heredar campos seleccionados. Las pruebas de Proxy solo ejercitan fallos sintéticos de reflexión/revocación y no afirman aislamiento de Proxy. Las nuevas pruebas pueden comenzar GREEN contra el comportamiento correcto: no se fabricó un RED nuevo ni se reejecutó el stub histórico.

**Validación de la corrección:** Node v24.18.1; `node --test backend/scripts/h1-owned-postgres-docker-admission.test.mjs`, reporter default (no TAP literal), 16 grupos/16 aprobados, cero fallidos/cancelados/omitidos/todo, cero suites, exit 0, 41.32575 ms de duración reportada por el runner. Las limitaciones de cobertura privada/ordenamiento anteriores siguen explícitas; no se detectó defecto productivo. Revisión independiente funcional, disposición native y entrega local continúan pendientes, no son fallos de estas pruebas. No se contactaron Docker/PostgreSQL/servicios ni se usaron fixtures de filesystem/red.

## C16.1 — Verificador offline del grafo de identidad OCI suministrado

**Alcance:** se añadieron `backend/scripts/h1-owned-postgres-oci-identity.mjs` y su prueba sintética en memoria. El verificador sincronizado enlaza bytes exactos de índice, manifiesto seleccionado y configuración por SHA-256/tamaño. No recupera bytes ni importa un pin documental; la política explícita del llamador es una premisa de confianza, no una firma ni autorización. Se añadieron únicamente esta sección propia a la decisión y al informe; el prefijo anterior de ambos documentos se conserva byte por byte.

**TDD observado:** primero se creó un export importable que deniega sin lanzar y se escribió una expectativa positiva de identidad válida. `node --test backend/scripts/h1-owned-postgres-oci-identity.test.mjs` observó RED de comportamiento: 16 pruebas, 4 aprobadas y 12 fallidas, cero canceladas/omitidas/todo/suites, exit 1 (reporter default, no TAP literal; 38.683458 ms). Las fallas incluyeron DTO válido esperado frente a denegación fija; no fue error de importación, sintaxis o setup. Luego se implementó el verificador. Durante triangulación, una nueva prueba de accessor mostró que los campos `os`/`architecture` de la política se leían mediante acceso ordinario: esa prueba falló y pasó tras usar descriptores propios. Esa corrección es evidencia de triangulación, no se sustituye ni exagera el RED inicial.

**Contrato cubierto:** éxito OCI y Docker schema 2 con tipos de manifiesto/configuración emparejados; selección única de plataforma contando duplicados antes de idoneidad; descriptores y vínculos de digest/tamaño; variante explícita y comparación opcional de ID solo contra configuración; etiquetas válidas/no válidas; capas permitidas, URLs y artefactos rechazados. Las pruebas sintéticas incluyen límites de bytes, arrays, descriptores, capas, profundidad, strings UTF-8, claves y tokens; claves duplicadas escapadas en subárboles ignorados; UTF-8/BOM/JSON/sustitutos inválidos; getters seleccionados no invocados, getters desconocidos ignorados, errores de reflexión, brand/prototipos/tipos de backing, no mutación y salida congelada/desacoplada. La unicidad se prueba solo sobre descriptores estructuralmente admitidos con plataforma explícita. No se afirma prueba aislada del cap total redundante ni autenticidad/sandbox de Proxy.

**Auto-verificación inicial del writer (histórica, no aceptación independiente):** Node v24.18.1. La suite focal corrió 21/21, exit 0, reporter default y 47.645167 ms antes de que el verificador independiente comunicara tres defectos reales; no sustituye la evidencia posterior ni demuestra aceptación actual. No se ejecutaron suites amplias, builds, Docker, PostgreSQL, red, servicios, fixtures físicos ni inspección de configuración privada.

**Límites:** los blobs de capa no se suministran ni se comprueban, y no se demuestra sistema de archivos, rootfs, ejecución, uso real de Docker, firma del publicador, procedencia, frescura, propiedad ni elegibilidad de un recurso. La etiqueta de repositorio no se liga criptográficamente a los bytes. La salida solo describe una cadena de identidad sintácticamente enlazada entre datos suministrados; no certifica H1 ni permiso para descargar/provisionar.

### C16.1 — Corrección secuencial tras auditoría independiente bloqueada

El verificador independiente `muulenoz-17-o3re` quedó `BLOCKED`; por tanto su corrida previa 21/21 no es aceptación de este candidato corregido. Se añadieron tres regresiones públicas separadas, cada una con control positivo y cadena OCI completamente enlazada. Contra la implementación previa, `node --test backend/scripts/h1-owned-postgres-oci-identity.test.mjs` observó **24 pruebas, 21 aprobadas y 3 fallidas, exit 1**, reporter default (no TAP literal), 47.687 ms. Las tres diferencias fueron: prototipo personalizado en plataforma del llamador aceptado; clave JSON con sustituto alto aislado aceptada; valor JSON con sustituto alto aislado aceptado. No fueron fallas de setup/importación.

La corrección mínima exige registro permitido en la función de plataforma y exige que el siguiente code unit de un sustituto alto sea realmente un sustituto bajo. La corrida focal posterior pasó **28/28**, cero fallidas/canceladas/omitidas/todo, cero suites, exit 0, reporter default, 60.078625 ms. En el mismo candidato se incorporaron pruebas de UTF-8 4096/4097 para claves y valores; fixtures válidos de 8191, 8192 y 8193 tokens; subárbol desconocido con duplicados escapados reconstruyendo todos los digests/padres; y errores de manifiesto/configuración con sus vínculos ascendentes renovados. El 8192 es alcanzable mediante un objeto desconocido vacío de dos signos: se prueba como aceptación inclusive, no se repite la afirmación errónea de que la paridad lo vuelve imposible. Los distintos tipos de backing usan bytes OCI válidos antes de probar la denegación; el `Uint8Array` ordinario con accessors sombra pasa sin ejecutar ninguno.

La prueba runner y syntax/diff finales del candidato corregido se registrarán tras ejecutarse; la aceptación independiente fresca, disposición native y entrega local siguen pendientes. No se declara task DONE ni se stagea/commitea/publica. Se mantienen los límites de las secciones anteriores: política externa suministrada no es pin aprobado, firma ni procedencia; capas solo tienen metadatos; no hay recursos/servicios reales ni afirmación de elegibilidad.

### C16.1 — Continuación secuencial de cobertura Unicode (solo test y este apéndice)

Se añadieron tres casos al final de `backend/scripts/h1-owned-postgres-oci-identity.test.mjs`: clave JSON con par escapado real (línea 498), valor JSON con par escapado real (línea 510) y límites UTF-8 escapados de clave/valor (línea 522). El texto crudo de los dos primeros contiene los escapes ASCII `\\uD83D\\uDE00`; `JSON.parse` confirma un par válido U+1F600 (dos unidades UTF-16, cuatro bytes UTF-8). El tercer caso usa `\\u00e9` repetido 2048 veces y mide las claves/valores ya decodificados: 4096 bytes se aceptan y 4097 (añadiendo una `a`) se deniegan. Cada caso reconstruye digest y tamaño de configuración, manifiesto y descriptor/pin de índice, de modo que las aserciones observan la regla objetivo con el grafo válido.

Auto-verificación del writer: Node v24.18.1; `node --test backend/scripts/h1-owned-postgres-oci-identity.test.mjs`, reporter default (no TAP literal), 31 aprobadas, 0 fallidas/canceladas/omitidas/todo, 0 suites, exit 0, 64.3585 ms. La aceptación independiente de estos bytes permanece pendiente; esta continuación no cambia producción, no añade un RED de producción y no habilita revisión/entrega. Los cuatro archivos siguen siendo el alcance global de C16.1, aunque esta continuación solo escribió el test y este apéndice.
