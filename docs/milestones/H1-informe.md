# H1 — Informe parcial de contrato y fundamentos

**CONTRACT UNIT FROZEN · FOUNDATION IMPLEMENTATION STARTED · AUTH ENDPOINTS NOT IMPLEMENTED · EXTERNAL AUDIT PENDING.** La preparación contractual pasó Review y Verify; la configuración C01 está revisada/verificada/commiteada y la política independiente está preparada, sin integración runtime. La autenticación sigue pendiente. Esto **no declara H1 CUMPLE**, aprobado, cerrado ni listo para auditoría final.

## Identidad y alcance

- Baseline H0 aprobado: `2428f2b918d97c5a48dabc438b0b3bf89030c7fb` (`h0-approved`).
- Tracker local: `feat/h1-auth`; slice actual: `feat/h1-auth-05-argon`, base/HEAD `e65c4d620fd332ec8ffe0d470e7a723901edc5ba` (C04 verificado). Estrategia elegida: feature-branch-chain; Verify funcional independiente C05 GREEN, documentación normalizada antes del freeze; review nativa y commit pendientes del padre, sin identidad inventada. Prompt autorizado: `1e9cd1e44b919738da8c9d1262b436b8a354af17`. Commit de preparación contractual: `b6eed95359fa4a4ede13d62ced034508f57c1015`, tree `8267b798b01d6171b3cdcaa0f4a5052c59bfac4d`. `main` permanece sin cambios; no push, merge ni tag H1.
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

## Slice 05 — Argon standalone acotado; gates del padre pendientes

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

Normalización documental antes del freeze nativo; cambia los bytes de ambos documentos respecto de ese snapshot verificado, no los cuatro archivos funcionales protegidos. Edición pasiva sin RED conductual significativo: readback estructural y check focused de continuidad, no replay TDD. Review nativa y commit C05 **pendientes del padre**; sin transferencia de autoridad C04→C05 ni workspace→rango commiteado. Helper no conectado al runtime; distribución de recursos, PostgreSQL propio, sesiones/bootstrap/admin, frontend/navegador/full H1 LIVE y auditoría externa pendientes. FIFO con mocks/deferred no acredita carga nativa productiva; sin prueba de carga/peak/RSS ni permiso de elevar capacidad nativa.

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
2. Backend: configuración C01, política C02 y generador/resource C03 completados; C04 loader cerrado históricamente; revisar/verificar/commitear C05 Argon standalone preparado. Distribución e integración runtime del recurso/helper siguen pendientes. Continuar con protección del nonce, modelos/migraciones y bootstrap seguro. Runbook bootstrap pendiente; manual update del ejemplo de entorno solo si necesario, sin bypass.
3. Implementar y verificar H1, incluyendo pruebas reales PostgreSQL y navegador si disponible. Antes de handoff a auditoría, Review + Verify deben cubrir el **mismo candidato final**. El padre registra el resultado, sin inventar aprobación externa.

P01–P10 y horas siguen pendientes; rollout comercial cerrado. No se inicia H2 ni se modifica el informe histórico H0.
