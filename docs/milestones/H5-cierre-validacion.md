# H5 — Cierre complementario de validación

**Resultado: validaciones complementarias ejecutadas; H5 conserva estado global PARCIAL hasta decisión externa sobre Review nativo.** No se establecieron bloqueantes P1/P2 en la revisión independiente; responsive/teclado acotados y las dos pruebas nuevas de expiración H1 dieron resultados conformes. **No hay aprobación de integración/publicación ni excepción nativa concedida. Se detiene para auditoría externa.**

## 1. Candidatos y alcance exactos

| Referencia | Identidad |
|---|---|
| Rama/worktree reutilizados | `codex/h5-manual-confirmation-orders` — `/Users/agustin/Repos/personal/abar-electricidad-worktrees/h5-manual-confirmation-orders` |
| Base H4, main/origin/main/h4-approved sin mover | `e435c222d4c7245faad0a125c0ff6438e05425c3` |
| Runtime revisado y probado visualmente | `7712c45ac8c98a04644d2e6bcbdf68c5abec70ce`; árbol `ce1218d765d5a60891b92b6084c9a07ab83747da` |
| HEAD documental de entrada | `c0f87b402cec0a5a7c0df5b9f6391ab3a71408ba`; no diferencias de producción desde7712 |
| Único cambio de código complementario | `eb9aaca31c2494d2c72a2defb192de289db8379b`, árbol `adaddebef9ee273ebcbc7ced499e452cfcd31f57`; **27 líneas de pruebas**, sin cambios de runtime/Prisma/contrato/UI |

Este documento y la evidencia se entregan en commit documental posterior, identificado por `git log -1 --format='%H %T' -- docs/milestones/H5-cierre-validacion.md` y por la respuesta de entrega; no se inventa un hash autorreferente. El [informe H5 original](H5-informe.md) y sus77 evidencias no se modifican. [Manifiesto SHA256 complementario](evidence/H5-cierre/manifest.json):67 archivos de evidencia, incluidos46 PNG; el manifiesto no se incluye a sí mismo.

La autorización fue exclusivamente revisión de código, validación visual/teclado, prueba temporal y documentación. Se reutilizaron dependencias y compilados backend previamente verificados de H5. Angular necesitó el arranque local de desarrollo para servir su fuente sin cambios; **no se reconstruyó todo el backend ni se repitieron las suites masivas**. Las pruebas nuevas usan fuente TypeScript mediante Jest.

## 2. Review independiente del runtime

Primero se contrastaron el logbook, Engram, el informe y los artefactos previos: había **Verify independiente de ejecución** y tres resultados nativos admitidos, pero no un Review independiente completo de código del runtime con estas conclusiones registradas. No se atribuyó alcance adicional a ese Verify ni se dio por terminada la lente nativa ausente.

Se ejecutó un nuevo **Review de solo lectura**, agente independiente gpt-6.1-sol/medium (`odd-verify`), skills exactas cargadas (`paths-injected`). Inspección inmutable con `git show 7712c45:<path>`/`git diff e435c22 7712c45`, sin tests/builds, modificaciones ni operaciones nativas. CodeGraph seguía sin índice tras el fallo previo documentado; se conservó el fallback de lectura acotada. El padre contrastó el punto de entrada/replay con líneas115–140 del servicio.

**P1: ninguno establecido. P2: ninguno establecido.** No significa ausencia absoluta de defectos; es una revisión acotada a las preocupaciones autorizadas. [Handoff completo](evidence/H5-cierre/runtime-code-review.md), con líneas del candidato7712:

| Preocupación | Evidencia de código |
|---|---|
| Autoridad H1 y revalidación transaccional | `backend/src/orders/admin-orders.service.ts:115,127,187`; `backend/src/auth/admin-users.service.ts:354–389,410–441` |
| Locks compatibles con ajuste/apertura H2 | `admin-orders.service.ts:128–158`; `backend/src/stock/stock.service.ts:168–175,190–205,252–259`: todas las presentaciones ordenadas antes de balances; no se encontró dependencia H2 inversa hacia Order |
| Idempotencia y débito único por Payment | `admin-orders.service.ts:119–137`; `backend/src/orders/orders.service.ts:204–237`; migración `20261021000100_h5_manual_confirmation/migration.sql:22–30` |
| Atomicidad, incluidas entradas anidadas | `admin-orders.service.ts:126–189`, en particular164–165 para StockOperation/StockEntry: fallos propagados dentro de una única transacción, sin catch que confirme parcialmente |
| Confirmaciones, reintentos y cancelaciones concurrentes | `admin-orders.service.ts:128–149,169–174`; `orders.service.ts:145–161`: lock del agregado antes de leer pago/intento, control de versión y rechazo PAID |
| Errores públicos y privacidad | `backend/src/orders/admin-orders.controller.ts:7–44`; `backend/src/catalog-shared/catalog-error.ts:16–30`; `orders.service.ts:121–132,179–189`; jobs mínimos en `admin-orders.service.ts:175–182` |

### Advertencias y riesgo residual (sin corrección automática)

1. **Falta inyección directa de fallo StockEntry.** El test original `backend/test/h5-orders.e2e-spec.ts:188–195` inyectaba StockOperation, evento y NotificationJob; no StockEntry por separado. El rollback de entrada tiene soporte estructural en la escritura anidada transaccional; **no se presenta como un nuevo test ejecutado**. No se demostró defecto productivo. Añadir ese probe requeriría ampliar la validación autorizada.
2. **Ventana temporal de respuesta de replay histórico.** `admin-orders.service.ts:133` devuelve replay antes de la revalidación final de línea187. Tras validar H1 al entrar, una sesión podría expirar durante la espera posterior por Order y recibir un replay ya iniciado. No añade escrituras de negocio y no omite autenticación inicial/lock de revocación. **Hipótesis no reproducida, no clasificada P1/P2**. Si se exige rechazo de replay también después de esa espera, la propuesta es autorizar primero una reproducción focalizada y definir esa política; no se modificó código.

La prueba temporal siguiente cubre solicitudes iniciadas con sesión ya expirada; **no pretende resolver la segunda advertencia**.

## 3. Expiración temporal H1: prueba dirigida

Nueva prueba parametrizada `backend/test/h5-orders.e2e-spec.ts:220–246`, commit `eb9aaca`. Dos fixtures: vencimiento absoluto con timestamps vencidos y vencimiento por inactividad con límite absoluto todavía futuro. Sesiones canónicas activas/no revocadas, nonce/cookie H1 válidos. Primero GET privado200 con esa sesión como control positivo; luego timestamps persistidos en el pasado respecto del reloj real. No fake clock, política/config H1 reducida ni bypass de seguridad.

Para cada fixture se intentó por HTTP una confirmación y una cancelación válidas en dos pedidos impagos: **ambas401 `SESSION_EXPIRED`**. Hash antes/después de filas completas de Order, Payment, saldos/versiones, StockOperation, StockEntry, eventos, NotificationJob y replay. Igualdad exigida después de **cada** rechazo, no solo conteos de una tabla.

| Expiración | Confirmación / cancelación | SHA256 de estado de negocio, antes = después |
|---|---|---|
| Absoluta |401 /401 | `f68c3b79ed058cef05ce4e6dbbfb42775dd19eecda083c93673dd732a7e3ec1b` |
| Inactividad |401 /401 | `634c219de809a479bf4a157bc7fc4f27202c014536c8d3db7b7061b53189e5ed` |

[Log final](evidence/H5-cierre/expiry-final.log). **2 pass,13 filtradas/no ejecutadas, exit0**, no se cuentan las filtradas como aprobadas. La BD h5_orders fue nueva, propia y PostgreSQL17.11-bookworm real; el guard existente comprobó ID/owner/imagen/mounts/loopback. No se usaron bases ajenas. La migración de fixture aplicó las siete migraciones; no se reejecutó el test histórico de upgrade ni sus otras13 pruebas.

## 4. Navegador real, responsive y accesibilidad acotada

Chrome for Testing **127.0.6533.88**, headless real, perfil nuevo exclusivamente propio; versión comprobada con `Browser.getVersion`. Angular `127.0.0.1:43176`→Nest `127.0.0.1:43175`→BD propia nueva h5_browser. Login H1 real por UI con PasswordHasher canónico; comprador/operador `.test`, sin cookies/tokens/contraseñas exportados. Cada ancho tuvo pedidos ficticios separados; no se modificaron pedidos previos ni se recreó el checkout completo, ya probado en H5.

**Viewports CSS360×900,768×900 y1440×900**, deviceScaleFactor1, devicePixelRatio1 y visualViewport.scale1. Es **reflow por ancho, NO zoom nativo al200%**. Cada escena midió `innerWidth`, `clientWidth`, `scrollWidth`, body, scrollers internos y elementos fuera del documento. [36 escenas principales](evidence/H5-cierre/responsive-results.json), [9 escenas adicionales](evidence/H5-cierre/responsive-additional-results.json), [pan por teclado](evidence/H5-cierre/keyboard-pan-results.json).

| Ancho | Ancho documento máximo / viewport | Resultado de escenas y controles |
|---|---|---|
|360 |360 /360 | Sin overflow del documento; tablas con scroll horizontal interno, controles utilizables |
|768 |768 /768 | Sin overflow del documento; controles sin exceder ancho disponible |
|1440 |1440 /1440 | Sin overflow del documento; listado, detalle y stock utilizables |

**46 mediciones/capturas,0 overflow del documento.** Los scrollers de tablas pueden ser más anchos internamente: no se confunde eso con ausencia de contenido recortado. A360, las tablas de stock/movimientos miden326px de viewport y843/704px de contenido; se alcanzaron con Tab y mostraron foco. La tabla de stock respondió a10 ArrowRight: **scrollLeft0→400**. [Captura de pan/foco](evidence/H5-cierre/responsive-360-stock-keyboard-pan.png). Las tres capturas iniciales llamadas `movements` tenían un ancla genérica de stock-tools; se conservaron, **no se usan como prueba de movimientos**. Las capturas `movements-correct-anchor` usan `#movements-title` y sí muestran el historial.

### Capturas por superficie

| Superficie |360px |768px |1440px |
|---|---|---|---|
| Listado administrativo | [captura](evidence/H5-cierre/responsive-360-list.png) | [captura](evidence/H5-cierre/responsive-768-list.png) | [captura](evidence/H5-cierre/responsive-1440-list.png) |
| Detalle | [captura](evidence/H5-cierre/responsive-360-detail.png) | [captura](evidence/H5-cierre/responsive-768-detail.png) | [captura](evidence/H5-cierre/responsive-1440-detail.png) |
| Revisión de pago | [captura](evidence/H5-cierre/responsive-360-payment-review.png) | [captura](evidence/H5-cierre/responsive-768-payment-review.png) | [captura](evidence/H5-cierre/responsive-1440-payment-review.png) |
| Cancelación/revisión | [captura](evidence/H5-cierre/responsive-360-cancel-review.png) | [captura](evidence/H5-cierre/responsive-768-cancel-review.png) | [captura](evidence/H5-cierre/responsive-1440-cancel-review.png) |
| Notas e historial final | [captura](evidence/H5-cierre/responsive-360-history-final.png) | [captura](evidence/H5-cierre/responsive-768-history-final.png) | [captura](evidence/H5-cierre/responsive-1440-history-final.png) |
| Entregado | [captura](evidence/H5-cierre/responsive-360-delivered.png) | [captura](evidence/H5-cierre/responsive-768-delivered.png) | [captura](evidence/H5-cierre/responsive-1440-delivered.png) |
| Stock | [captura](evidence/H5-cierre/responsive-360-stock.png) | [captura](evidence/H5-cierre/responsive-768-stock.png) | [captura](evidence/H5-cierre/responsive-1440-stock.png) |
| Movimientos | [captura](evidence/H5-cierre/responsive-360-movements-correct-anchor.png) | [captura](evidence/H5-cierre/responsive-768-movements-correct-anchor.png) | [captura](evidence/H5-cierre/responsive-1440-movements-correct-anchor.png) |
| Error de saldo | [captura](evidence/H5-cierre/responsive-360-insufficient-error.png) | [captura](evidence/H5-cierre/responsive-768-insufficient-error.png) | [captura](evidence/H5-cierre/responsive-1440-insufficient-error.png) |
| Error seguro de lectura | [captura](evidence/H5-cierre/responsive-360-safe-read-error.png) | [captura](evidence/H5-cierre/responsive-768-safe-read-error.png) | [captura](evidence/H5-cierre/responsive-1440-safe-read-error.png) |

### Interacciones y límites de la comprobación

- Por ancho: revisión con Enter, checkbox con Space y confirmación con Enter; nota de texto plano con Enter; PREPARING→READY→DELIVERED; motivo, revisión, vuelta con Enter y cancelación impaga. Las notas con `<img ...>` se muestran como texto, no contenido ejecutado.
- **9 checks Tab/Tab/Shift+Tab** en listado/detalle/stock: retorno al control anterior, foco visible `:focus-visible`, outline sólido3px. Además se recorrió con Tab el stock móvil, incluidos ambos scrollers; no se observó atrapamiento en ese recorrido. Los botones de acciones recibieron foco dirigido antes de Enter; **no se afirma un flujo completo exclusivamente con Tab de extremo a extremo**.
- Escape se comprobó en el select nativo de movimientos a los tres anchos: conserva valor y foco. En la revisión **inline**, no hay diálogo/modal ni contrato de cierre con Escape; no cerró y se usó la acción explícita Volver. No se declara incumplimiento de un diálogo inexistente.
- Error de saldo visible con `role=alert` y confirmación deshabilitada a los tres anchos. Ruta de pedido inexistente: mensaje seguro visible, sin SQL, PII ni saldo. Controles stock habilitados medidos: visibles y ninguno más ancho que el documento.
- Inspección visual directa de capturas360/768/1440, además de mediciones. No prueba de lectores de pantalla, contraste instrumental, otros navegadores, dispositivos físicos ni zoom nativo200%. **No es certificación WCAG completa.**

[Lectura final de negocio del navegador](evidence/H5-cierre/browser-final-business.json):3DELIVERED/PAID/v5,3CANCELLED/PENDING/v2,3insuficientes RECEIVED/v1. UNIT30/v1→27/v4, METER100/v1 y ROLL5/v1 intactos, exactamente3operaciones PAYMENT_CONFIRMATION/3entradas/3notas. Doce jobs PENDING; sin envío externo. SHA256 final de saldos `39415b978292208aa868d784fbadf9418f004443176b6c9ea4f010bacf2f47dd`. Los v5 incluyen la nota agregada, no un débito extra.

## 5. Comandos, resultados y fallos conservados

Node26.4.0/npm11.17.0, Jest existente/TypeScript5.9.3, PostgreSQL17.11-bookworm y Chrome127 indicados; no instalaciones ni actualización global. Scripts temporales fuera del worktree, fixture privado no versionado. El target reutiliza el protocolo de propiedad de `backend/scripts/h5-postgres.mjs`; su ejecución completa no se repitió.

| Ejecución efectuada | Resultado |
|---|---|
| Setup PostgreSQL nuevo propio + migrate deploy, dos bases aisladas | exit0; [ledger](evidence/H5-cierre/migration.log), [browser ledger](evidence/H5-cierre/browser-migration.log) |
| `npm --prefix backend run test:e2e -- --runInBand --testPathPatterns=h5-orders.e2e-spec.ts --testNamePattern='H5 complementary temporal'`, con H5_DATABASE_URL/H5_CONTAINER_ID/H5_OWNER del fixture propio |2pass/13filtradas, exit0; [log](evidence/H5-cierre/expiry-final.log) |
| Desde backend: `node node_modules/eslint/bin/eslint.js test/h5-orders.e2e-spec.ts` | exit0; [log](evidence/H5-cierre/targeted-lint-final.log) |
| `node /private/tmp/h5-complement-browser.cjs` | flujo principal exit0,36escenas; [log](evidence/H5-cierre/browser-run.log) |
| `node /private/tmp/h5-complement-browser-extra.cjs` | escenas adicionales exit0,9mediciones; [log](evidence/H5-cierre/browser-extra-final.log) |
| `node /private/tmp/h5-complement-keyboard-pan.cjs` | exit0,1medición; scroll0→400 y foco documentados |
| `gentle-ai review assess --cwd <H5-worktree> --agent codex --base-ref c0f87b402cec0a5a7c0df5b9f6391ab3a71408ba --committed-only --json` | nuevo test:medium/under_budget, review_due:false; [assessment](evidence/H5-cierre/test-native-assessment.json). **No es una operación lifecycle ni aprobación nativa.** |
| Revisión de links/manifiesto, diff check solo cambios fuente/documentales | checks estructurales; logs crudos conservan su whitespace original |

Fallos de harness conservados, sin convertirlos en PASS previos: primer fixture tenía label h5c sin label canónico h5; guard de propiedad rechazó ejecución (exit1,2fail/13filtradas). Se recreó **solo ese contenedor propio**, añadiendo el label esperado sin modificar el guard, y se repitieron solo los dos tests: [fallo](evidence/H5-cierre/expiry-first-fixture-failure.log). Lint desde raíz sin config local exit2→desde backend exit0 ([fallo](evidence/H5-cierre/targeted-lint-first.log)). Browser: Enter CDP sin char no envió login; después nativeVirtualKeyCode específico de macOS provocó una espera de captura/foreground y se terminó solo el harness propio; se corrigió el transporte del teclado, no el producto. Una captura404 esperaba erróneamente h1 inexistente; se cambió el selector del harness al alert. [Primer fallo](evidence/H5-cierre/responsive-first-failure.json), [parcial preservado](evidence/H5-cierre/responsive-second-partial.json), [fallo de ancla404](evidence/H5-cierre/responsive-extra-first-failure.json). No hubo cambio correctivo de runtime.

No se repitieron1252unitarias,131frontend,13casosH5previos ni una nueva prueba de concurrencia completa. No se atribuyen esos PASS históricos al nuevo delta. No CI/GitHub/SMTP/gateway, no H6, no excepciones de seguridad ni código productivo nuevo.

## 6. Estado nativo, WIP y parada

Lineage **`review-c62cd2c64c186b83`** conserva target `sha256:7530aca94e5f6e07ef55ad244f9c7d1055591485b26269b26539c9a01e8a2127`, candidato7712 y estado pendiente de resiliencia. Tres artefactos admitidos no completan las cuatro lentes. **Cero llamadas lifecycle, cero reintentos de resiliencia en este cierre, cero ACK/approved inventados.** Se compararon byte a byte hashes de17 archivos nativos privados antes/después; no se exportaron comandos ejecutables/tokens de autoridad. [Preservación y hashes](evidence/H5-cierre/native-preservation.json). El material versionado original tampoco cambió. La decisión de excepción sigue siendo externa.

[WIP/worktrees](evidence/H5-cierre/protected-worktrees.json):15/15 previos idénticos en HEAD, estado, índice, diff de trabajo y contenido de no rastreados; diff original SHA256 `00cbe4677d1db6c9f1b7547dbf6d3e59bc966b67c3ebec99e8a19f09be5271e7`. H5 solo añade el test autorizado y este paquete documental. No ramas/worktrees ajenos cambiados, limpieza Git, push, PR, merge ni tags. Base/tag H4 permanecen donde estaban.

[Recursos propios](evidence/H5-cierre/cleanup.json): se verificaron comandos/PGID de backend, Angular y Chrome con perfil propio antes de detener **solo esos grupos**; se verificaron ID/labels/imagen/mounts del PostgreSQL nuevo antes de retirarlo. Se preservó evidencia antes de retirar el scratch propio. Nada se eliminó de worktrees previos ni de la evidencia nativa.

| Criterio complementario | Dictamen propio |
|---|---|
| Review independiente exacto, sin corrección automática | CUMPLE acotado; sin P1/P2 establecido, dos advertencias explícitas |
|360/768/1440 y teclado solicitado | CUMPLE acotado;46mediciones, sin overflow de documento; no equivale a auditoría WCAG/zoom200% |
| Expiración H1/401/invariantes | CUMPLE;2casos,4mutaciones rechazadas, hashes iguales |
| Preservar bloqueo nativo | CUMPLE; sigue pendiente, sin excepción concedida |
| Evidencia/WIP/alcance y no publicación | CUMPLE; entrega local, se detiene para auditoría |
| Aprobar/integrar H5 | NO AUTORIZADO; estado global PARCIAL hasta decisión externa |

**Deuda restante:** bloqueo nativo de resiliencia; inyección directa StockEntry no ejecutada; política/probe de expiración durante espera de replay histórico no resueltos; accesibilidad fuera del alcance acotado no certificada. No se solicita ni ejecuta una corrección automática de estas advertencias. **Siguiente paso: auditoría externa en este chat; no iniciar H6.**

**Risk: none para código productivo nuevo** — no se cambió. El runtime revisado conserva **items1,2,3,4** (datos, autorización, contrato y concurrencia); este cierre no los elimina ni autoriza publicación.
