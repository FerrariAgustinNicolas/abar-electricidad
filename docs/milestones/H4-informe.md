# H4 — Checkout, pedidos y simulación de pagos

**Estado: PARCIAL — requiere decisión y auditoría externa.** H4.1–H4.4 tienen implementación local; R1/R2 se corrigieron y revalidaron. El navegador reprodujo **R3: método de reintento visible distinto del enviado**. No se aplica otra corrección automática ni se declara H4 aprobado. Review nativo del **contrato** tiene ACK; Review nativo del **runtime** permanece pendiente, sin consentimiento ni ACK propios.

## 1. Base, aislamiento y commits

- Base local verificada: `main` / `origin/main` / `h3-approved^{commit}` = `d08adc17efbdd62cd847fea7c16d1371a14436f3`; árbol `1dc52587aa56909f6256ed36eb1b05eaa8508dce`. Correspondencia con PR49 según la base aprobada; no se consultó ni modificó GitHub en esta ejecución.
- Rama: `codex/h4-orders-demo-payments`. Worktree nuevo: `/Users/agustin/Repos/personal/abar-electricidad-worktrees/h4-orders-demo-payments`.
- Checkout original: `/Users/agustin/Repos/personal/abar-electricidad`, rama `feat/h1-change-password-review-blocks`, HEAD `9582df938c35ddb251b2446a568e32d9f60e9206`. H1-informe modificado, prompts/scripts/testing y `.review-worktrees` no rastreados preservados. No se trasladó su índice ni WIP.
- Los14 worktrees previos se preservaron; total15 tras crear H4. Antes/después del desarrollo, hashes del WIP original: diff binario `00cbe4677d1db6c9f1b7547dbf6d3e59bc966b67c3ebec99e8a19f09be5271e7`; manifiesto de archivos no rastreados `460a142af5b5425291f3253bcde1b5141da7e9e1e483b710e7faad88f4be969f`. El segundo omite directorios de worktrees, comprobados por inventario Git; no se presenta como hash recursivo de esos checkouts.

| Unidad local | Commit exacto |
|---|---|
| Prompt copiado selectivamente, original intacto | `0bd1bd8268443e5a68dfb52a2f39ccb8aec90acc` |
| Freeze contractual0.7.0, antes de workers | `2fc9ceef8b67081d0a8b6904ea541995a35962df` |
| Implementación y pruebas H4 | `dd31ba9a8c70aaf62a3adc6f96d7e1171bddb737` |
| Tanda única R1/R2 y regresiones | `826c17057993e2108118f8431555f71f5f92e751` |

**HEAD técnico final:**826c170; árbol `a45f95bedaa125c7896cfca5780bbc3ca7f54624`. El commit documental que contiene este informe se identifica por `git log`/entrega, no mediante una referencia autorreferente. No push, PR, merge, tags, reset destructivo ni borrado de worktrees.

## 2. Alcance y ownership real

| Bloque | Entregado localmente | Limitación |
|---|---|---|
| H4.1 | Alta desde quote persistido, snapshots, comprador, términos, pago/intento/eventos/jobs, token y replay cifrado, transacción | Sin aprobación externa/productiva |
| H4.2 | Checkout tipado, dirección condicional, resumen servidor, aceptación explícita, protección de intención, resultados/lookup | R3 afecta selección visible en resultado; recuperación tras reload desconocido es parcial |
| H4.3 | APPROVED/PENDING/REJECTED, historial, reintento/cambio, puntero vigente, idempotencia canónica | R3 impide declarar correcto todo el flujo UI de métodos |
| H4.4 | Token por header, lookup mínimo limitado, demanda impaga administrativa por presentación | Limiter local demo, no cuota distribuida |

Orquestador padre: Git, contrato, integración, README, navegador e informe. `h4_map` leyó completos el prompt y todas sus fuentes referenciadas (plan, H3 prompt/informe/cierre, decisiones H2/H3, OpenAPI, Prisma, README, mapa Figma) y entregó mapa acotado. CodeGraph init falló una vez; se usó lectura acotada como fallback.

Workers `h4_backend` y `h4_frontend`, gpt-6-luna/high, ownership backend y frontend disjunto. Backend fue único escritor de Prisma. Padre autorizó explícitamente expansiones de tests Swagger/auth/stock y configureApplication; no se mezclaron escritores en un archivo. `h4_review` y `h4_verify`, gpt-6.1-sol/medium, inspeccionaron árboles inmutables en scratch, sin cambios fuente. Skills exactas work-unit-commits/cognitive-doc-design cargadas, `paths-injected`. Seguimiento local ignorado `odd/tasks/h4-orders-demo-payments.md`, espejo Engram del mismo tema; sin nuevos modelos/herramientas globales.

## 3. Contrato y decisiones

OpenAPI3.0.3 candidato **0.7.0**, `orders-demo-v1`; H1–H3 conservan operaciones y restricciones. Única extensión a schema previo: `StockRow.requestedUnpaidQuantity` opcional para compatibilidad, emitido por H4. Nuevas operaciones: términos demo, crear pedido, consulta protegida, lookup y crear intentos. La lectura de términos evita romper PublicSettings cerrado de H3. Ejemplo ficticio `.test`, sin accessToken utilizable. DTOs frontend alineados con la misma norma; Swagger real sin diferencias semánticas.

[Decisión H4](../decisions/H4-orders-payments.md), [CHANGELOG](../../contracts/CHANGELOG.md). `DEMO_PAY_ON_PICKUP` conserva el nombre canónico H3, sin alias incompatible. No hubo desviación incompatible aprobada ni cambio retrospectivo de informes H0–H3.

**P02/P03: confirmadas por el usuario el20/10/2026 para la versión académica.** Pedido sin vencimiento comercial automático ni edición de líneas/precios/tarifa; quote con TTL técnico independiente. Nombre/apellido/email/teléfono obligatorios; dirección/localidad solo COORDINATED, instrucciones opcionales. Versión exacta `demo-2026-10-20-v1`, checkbox explícito y texto provisional visible. No aprobación legal del cliente/tutor. P01/P04/P05/P06/P07/P09/P10 conservan sus estados aplicables previos; el marcador histórico H0 no se atribuye como decisión actual.

## 4. Persistencia y protección

Migración aditiva `20261020200000_h4_orders`, posterior a `20261020190000_h3_checkout_quotes`; ninguna migración histórica reescrita. Tablas Order, OrderItem, Payment, PaymentAttempt, OrderEvent, OrderIdempotencyKey, NotificationJob; versión interna de pedido y snapshots monetarios `bigint`. Unicidad de quote/número/pago/secuencia/ámbito-clave/dedupe, FKs RESTRICT y CHECK de importes/cantidades/modalidad/escenario/estados. H4 solo admite Order RECEIVED y pago PENDING/REJECTED; H5 requerirá su evolución explícita.

- Creación serializada/transaccional; replay confirmado antes de caducidad del quote, identidad/cantidades desde snapshot persistido, revalidación coherente de política/catalogo/precio/saldo. Una orden por quote. Fallo de job provoca rollback completo, no un pedido parcial.
- AccessToken opaco; SHA-256 en Order para posesión, expiración de acceso separada. Replay completo cifrado AES-256-GCM con AAD ámbito/clave/fingerprint; clave32bytes por entorno privado `H4_REPLAY_KEY_BASE64`, nunca versionada ni regenerada por arranque. Clave ausente/inválida falla cerrado. Replays e historial duraderos; no ventana inventada para duplicados. Rotación/migración de clave operativa no implementada.
- `H4_ACCESS_TTL_SECONDS` y `H4_DEMO_SIMULATION_ENABLED` son configuración servidor, no query flags. Header `X-Order-Access-Token`, no URL/log/localStorage. Navegador conserva solo credencial mínima en memoria/sessionStorage; carrito solo IDs/cantidades. Marcador de resultado desconocido: quoteId/clave, sin formulario comprador.
- Jobs comprador/administrador ficticio/configurado en la misma transacción, PENDING y dedupeKey. No se envió correo ni se implementó H6 completo.
- APPROVED es resultado de intento, **no** cobro: pago comercial PENDING y pedido RECEIVED. REJECTED es recuperable y no cancela. Intentos anteriores conservados; replay antiguo no actualiza puntero vigente. Demanda suma pedidos impagos, incluidos rechazos recuperables, por presentationId; puede superar saldo sin restarlo. Sin exactitudes de stock públicas.

## 5. Evidencia reproducible y candidatos

Versiones observadas: Node26.4.0/npm11.17.0; Nest11.2.7, Angular21.2.25, Prisma7.10.0, TypeScript5.9.3; PostgreSQL17.11-bookworm. Node observado no se confunde con el requisito documental Node24; no se cambió el stack ni se instalaron herramientas globales.

| Comando / prueba | Resultado y candidato |
|---|---|
| `node --test scripts/*contract*.test.mjs` | Freeze: RED inicial; primera integración23/24 por fixture legacy, corregido24/24 exit0; padre repitió24/24 antes de dd31 |
| `npm --prefix backend run contract:validate` | exit0, OpenAPI+12 ejemplos en freeze; Verify dd31 exit0 |
| `npm --prefix backend run prisma:validate` / `prisma:generate` / `build` / `lint` | Writer exit0; Verify dd31 exit0; builds backend/frontend826 exit0 |
| `npm --prefix backend test -- --runInBand` | Writer1245pass/1skip,30 suitespass/1skip; antes7fallos de proyección Swagger H1/H3, corregidos sin retirar sus assertions. No suite de miles repetida en Verify |
| `npm --prefix backend test -- --runInBand --testPathPatterns='environment.spec|stock.service.spec|configure-application.openapi.spec|auth/login.service.spec|test/h4-orders.spec.ts'` | Verify dd31:132/132,5suites, exit0; primer intento EPERM de loopback retenido |
| `npm --prefix frontend test -- --watch=false` | Writer/Verify dd31:110/110,26archivos, exit0; no saltos |
| `npm --prefix frontend run lint` / `run build` | exit0 en writer/Verify. Primer build sandbox134/EPERM retenido; build autorizado de un worker/external-output exitoso |
| `node backend/scripts/h4-orders-postgres.mjs` → `npm --prefix backend run test:e2e -- --runInBand --testPathPatterns=h4-orders.e2e-spec.ts` | Verify dd31:11/11, exit0, fixture nuevo propio, HTTP y PostgreSQL reales; no skip exitoso sin fixture |
| Prisma `migrate deploy` con config explícita y URL privada propia | Verify dd31:clean6/6; H3histórico5 y upgrade H4 con6 ledger exitosos; ambos exit0 |
| `validateH1Semantics(normative, actualSwagger)` | dd31:[]diferencias para todas las operaciones; health200 y dependencia inaccesible503 saneado |
| `npm --prefix frontend test -- --watch=false --include=src/app/features/checkout/checkout-page.component.spec.ts` |826:6/6 exit0 padre y Verify; R1 RED observado antes |
| Probe HTTP casing/idempotencia + builds en archivo inmutable826 | exit0; mismo intento/respuesta/puntero,2intentostotales incl.inicial; otro cuerpo409; R2 real RED previo conservado |
| Diferencial validador H3 main versus nuevo validador sobre inputs H3 | ambos exit0; stdout/stderr idénticos, digest stdout `114c7e2b5a8a97baba140a586d0aa2a4b637836c8c33799c06030bc8431e4941` |

Las variables privadas `H4_ORDERS_*` se inyectaron al subproceso sin imprimirlas. El fixture valida labels, UUIDowner, loopback, imagen17.11, tmpfs y ausencia de binds/mounts antes de SQL. Runner exige bases nuevas; no resetea existentes. La CLI Prisma se probó por separado de aplicar SQL crudo. Su primer probe de copia falló por codificación JSON del fixture; se retuvo FAIL y una base nueva con probe corregido aprobó. Logs seguros: [Verify inicial](../testing/h4/verify-initial.md), [recheck](../testing/h4/verify-targeted.md), [Review](../testing/h4/review.md).

**Frontera de evidencia:** no se atribuye la suite completa dd31 al commit826. Migración/contrato y todo fuera del delta de4archivos permanecieron idénticos;826 tuvo builds y recheck dirigido R1/R2, no una nueva aprobación global. Timeout y reloj se probaron determinísticamente; no se afirma inyección de timeout en el navegador. El skip unitario y los guards de fixtures históricos no se convierten en PASS de integración.

### Fallos y reparaciones conservados

1. Primera PG:8/10fallaron con503. Causa: función advisory devuelvevoid incompatible con Prisma/P2010. Corrección a `SELECT 1 AS locked FROM pg_advisory_xact_lock(...)`. Un diagnóstico monkeypatched produjoP2028: probe inválido, no defecto del runtime.
2. Segunda PG:10/11, lookupPOST devolvía201. `@HttpCode(200)` corrige contrato. Tercera11/11.
3. Cuarta:10/11 por fixture que desactivaba presentación default, violando CHECKH3. Se cambió el fixture a Product.active; Verify sobre nuevo fixture aprobó11/11, sin debilitar constraint.
4. Review independienteR1/R2: corrección única826 y recheck dirigidoPASS. R3 de navegador es posterior, **no corregido ni dispensado**.

## 6. Navegador, stock e identidad histórica

CUA real sobre build826: producto→carrito→quote aceptado→checkout→pedido de retiro; segundo pedido COORDINATED con dirección ficticia; doble clic, reload de checkout exige nueva aceptación y conserva carrito, reload de resultado con credencial temporal, lookup correcto/incorrecto y APPROVED/REJECTED/PENDING diferenciados. Campo obligatorio, foco Tab y reflow360/768/1440 observados. [Detalle y R3](../testing/h4/browser.md), [manifiesto SHA256](../testing/h4/manifest.json), capturas en ese directorio. No se leen ni publican tokens. Solo datos ficticios.

- Hash histórico H3 antes/después upgrade CLI: `83cd671ceb6243c991d7cb771c5e6b97f7fb675f6cf6f5f9c0e9c72a6c69278e`, idéntico.
- Stock Verify antes/después create/intentos/replay: `4fc75d5a9c09a406cb4038ce273283ba1e622b6693608793463aeb0903c2c3e3`, idéntico.
- Stock browser antes/después dospedidos/intentos: `192da4f5bd43e7579dce81396002284bbe85fa3241fb058fd2ab8ae924ef48f6`, idéntico; paidCount0. Distinta serialización de Verify, no hashes intercambiables.

**Declaración acotada:** saldos, versiones, StockOperation y StockEntry quedaron idénticos antes/después de las operaciones H4 comprobadas, incluidos fallos/replays. No se reservó ni descontó stock, no hubo pago comercialPAID ni inicioH5. No equivale a prueba de cobro real ni a garantía universal de concurrencia/rendimiento productivo.

## 7. Review nativo y autoridad

Gentle-AI4.2.0, modoON/global conservado. Freeze contractual2fc: assesshigh/hot_path payments;9archivos964líneas. STATUS inicial falló pre_native por permisos, mutationnot_started; reintento autorizado exit0. STATUS→START exactos, consentimiento `granted` del usuario, dos capture-result concurrentes riesgo/legibilidad exit0.

Lineage `review-0146413da9fad68a`, target `sha256:d74440b9b9465924236fa80d444453f5cb69f75983bee39089a5e3dda61767ef`. Cierre approved sin blockers; dos observaciones informativas (mensaje de versión H3, heurísticas de rutas del validador). ACK exacto exit0, schema `gentle-ai.review-acknowledged/v1`, actionacknowledged, authorityburned, consumedrevision `sha256:2eb8705709458d7fb5ae8aa0a28a77ffe9b5cd4fc5dc61619ba4cc05217dd741`. No se reutilizó esa autoridad para runtime.

Runtime dd31: assesshigh, items1/2/4 concretos y escalamiento2,42paths2259líneas. Review/Verify independientes y corrección826 ejecutados **antes** de iniciar Review nativo runtime. Al aparecer R3 se detuvo el frente afectado: candidato no cerrado, revisión nativa runtime **PENDING**, sin START/consentimiento/ACK de ese candidato. No se desactivó protección ni se heredó excepción H3. Una revisión nativa posterior necesita candidato definitivo y consentimiento propio; no existe aprobación global de H4.

## 8. Matriz de aceptación y deudas

| Criterio del prompt §9 | Estado | Evidencia/límite |
|---|---|---|
|1 Alta atómica y datos condicionados|CUMPLE|PG+browser retiro/entrega, términos/jobs|
|2 Rechazo de inválidos sin parciales|CUMPLE|validación+rollbackreal; validaciones técnicas no política comercial|
|3 Expiry/quoteúnico/replay/carrera|CUMPLE|PG+R2 corregido;scopeUUID normalizado|
|4 Revalidar precio/tarifa/estado/política/saldo|CUMPLE|casosPG; sin sustitución silenciosa|
|5 Sin expiración comercial ni reserva|CUMPLE|flujo/modelo,snapshots/stockhash|
|6 Rollback/transporte/rechazo|PARCIAL|rollbackreal y same-screen timeout; recuperación postreload desconocido limitada|
|7 Tres escenarios sinPAID/stockwrites|CUMPLE|PG+browser con selección explícita|
|8 Reintentos/historial/puntero|PARCIAL|backend/R2PASS;R3 selectorUI|
|9 Prohibiciones,token y demo deshabilitado|CUMPLE|PG y guards;H5inaccesible|
|10 Lookupmínimo/genérico/limiter|CUMPLE|PG+browser;no cuota distribuida ni benchmarktiempo|
|11 Posesión/expiración/seguridadH1|PARCIAL|PGy132regresiones;no nuevoE2Elogincompleto|
|12 Demanda impaga por presentación|CUMPLE|PG+unit, incl.rejects, demanda>saldosinreserva|
|13 Flujosfrontend y recovery|PARCIAL|dosflujosreales;timeoutdeterminístico,reloadunknownlimitado|
|14 Reaceptación/resultadosdemo|PARCIAL|cambiosconflictoPGyquoteUI;R3bloquea métodos coherentes|
|15 Checks/Swagger/regresiones|PARCIAL|checks acotados observados;Reviewruntimependiente,R3abierto|
|16 Browser360/768/1440|PARCIAL|reflow/foco/errores/capturas;zoom200%yFigmaNOTRUN|

Sin Figma/WCAG integral, zoomnativo200%, carga/rendimiento/distribución productivos. Limitaciones H2/H3 de escalabilidad y Review nativoH3 exceptuado siguen documentadas, no saneadas porH4. No se implementó confirmación manual, descuento de existencias, administración completa de pedidos, pagos reales niH5/H6completo.

## 9. Necesita decisión — R3 y cierre

R3 reproducido en826: al cargar resultados de DEMO_SIMULATION, el select visible queda en DEMO_PAY_ON_PICKUP aunque se muestra escenario demo. Tras reload y submit sin cambiarlo, PostgreSQL guarda DEMO_SIMULATION(sequence5), no la opción visible. Captura y JSON saneado conservados. No es una operación bancaria; tampoco es un PASS funcional.

La tanda independienteR1/R2 ya se consumió. **Nueva corrección R3 requiere decisión explícita**, acotada al componente de resultados y su spec para sincronizar opciones asíncronas y método enviado; todavía no se ha demostrado necesario cambiar contrato/dominio. Después corresponden recheck afectado y Review nativo runtime con consentimiento propio. Alternativamente este estado PARCIAL queda para auditoría externa; no se autoriza integración.

**Risk: items1 (persistencia/migración),2 (credenciales/PII/posesión),4 (idempotencia y ordenamiento asíncrono).** No se rebaja riesgo por los tests aprobados.

## 10. Recursos propios y detención

Se verificaron PID/cwd y se enviaron SIGTERM solo a los servidores propios de Verify/recheck; se validaron los cinco contenedores creados para H4 por ID completo, etiqueta owner/purpose, imagen17.11, tmpfs y ausencia de mounts/binds. Se detuvieron y retiraron únicamente esos contenedores, sin eliminar volúmenes o imágenes ajenas. [Registro saneado de ownership](../testing/h4/resource-cleanup.json). La pestaña propia se cerró y el viewport se restauró. Las credenciales privadas temporales se eliminaron con sus cinco directorios exactos después de copiar evidencia saneada; ningún `.env` del repositorio se escribió.

AJV advirtió formato email no soportado en el validador de catálogo; OrdersService aplica validación explícita y rechaza correo inválido. No se presenta esa advertencia como error ocultado ni como formato validado automáticamente por AJV. El caso skip unitario anterior permanece skip.

Se entrega evidencia para decisión/auditoría externa, **no autorización de integración ni aprobación de H4**. No se abrió otra tanda de corrección para R3. La revisión nativa del runtime sigue pendiente del candidato definitivo y su consentimiento separado.

Limpieza confirmada: seis procesos propios detenidos; scratch reportados retirados por ruta exacta y sin seguir symlinks de dependencias. Un directorio temporal de una provisión denegada no informó ruta; no se hizo barrido ni se afirma haberlo eliminado. El probe CLI previo se identificó por comando/cwd, si persistía, sin matar procesos ajenos. Registro: [scratch-cleanup.json](../testing/h4/scratch-cleanup.json).
