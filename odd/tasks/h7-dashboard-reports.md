# H7 — Dashboard and basic reports

Sanitized historical implementation log. Original candidate references and historical permissions below are provenance only; current authorization is limited to preparing a sanitized candidate for new external validation. No publication is authorized. Private paths, unrelated worktree identifiers and native control material are omitted. Original raw log remains on the untouched audited branch.
Base: 8ff38e932eae7a09ffb1c531d4d040d4ca6ed9e8; branch: codex/h7-dashboard-reports. Local-only work-unit commits; publishing and PR topology deferred because explicitly prohibited.
Runners: Node 24, backend Jest, frontend Angular/Vitest, owned PostgreSQL and browser. Forecast: 1800–2600 authored lines; cohesive small native-review candidates, no artificial line compression.

## Specs
S1. “Antes de implementar, verificá Git, referencias, tags, índices, ramas y worktrees. Preservá íntegramente el WIP original y los 17 worktrees existentes al cierre de H6.”
S2. “Autorizo ejecutar exclusivamente **H7.1–H7.3**, conforme a `docs/milestones/H7-prompt.md`.” The complete normative scope and Q01–Q16 are retained verbatim in that file and L1 below.
S3. “Congelá primero el contrato OpenAPI H7 y coordiná cualquier cambio de Prisma con un único responsable.”
S4. “Priorizá la exactitud de las métricas, la distinción entre pedidos creados y pagos confirmados, los snapshots históricos, la moneda ARS y las cantidades separadas por presentación.”
S5. “La validación debe utilizar datos ficticios con resultados esperados definidos de antemano, PostgreSQL real y comprobaciones de consistencia entre API, interfaz y CSV.”
S6. “Ejecutá Review y Verify independientes. Planificá revisiones nativas por unidades pequeñas y registrá los resultados reales.”
S7. “No modificar reglas de pagos, confirmaciones, stock ni notificaciones H1–H6.” “No implementar funcionalidades de H8.” “No hacer push, PR, merge ni tags.”
S8. “Al finalizar, generá `docs/milestones/H7-informe.md` con pruebas, resultados, candidatos exactos y deuda restante.” “Detenete para auditoría externa.”

## Tasks
- T1 [S1,S3,S7] inline — COMPLETE cdcebfc42dc67a0547a62631d965a970ca381cb6: preservation manifest and contract freeze; parent owns OpenAPI and Prisma. No migration anticipated.
- T2 [S2,S4,S7] delegated — CANDIDATE ed55dce8ac972143916b0b58a65682bb415b8c31; functional/independent Verify passed, native approved and ACK burned: backend exact read-only aggregate API, normalizer, CSV and tests; writer trigger: parallel backend/UI units with disjoint surfaces.
- T3 [S2,S4,S7] delegated — CANDIDATE commit 857dac2a82f690eb3c8e1586c646bd9d2b541b4d/tree4fb0e6ec886530eb604304d3ae469a0b6893718c; independent Review correction resolved, native approved and ACK burned: Angular dashboard/report/filter/CSV and tests; independent of backend implementation via frozen contract.
- T4 [S5,S6,S7] inline integration + delegated verification — COMPLETE with explicit limitations: predefined dataset, owned PG, API/CSV/browser, regressions and independent Review/Verify. Risk items 2 (admin/CSV security), 3 (shared contract validation).
- T5 [S1,S6,S8] inline — COMPLETE for local handoff, external audit pending: exact candidates, final preservation check and H7 report; stop for external audit.

## Log
L1 — 2026-10-22: User authorized local H7.1–H7.3 only, with original request S1–S8 above and full supplied milestone prompt verbatim:

# ABAR Electricidad — H7 · Dashboard y reportes básicos

**Hito solicitado:** H7.1–H7.3, exclusivamente para la versión académica de la Práctica Supervisada (PS).  
**Referencia funcional:** `docs/plan.md`, en particular §§ 2, 5, 7–10, 12–15, 17–18 y los casos Q20, Q26, Q27 y Q30.  
**Fuentes técnicas:** implementaciones y decisiones de H1–H6, especialmente H4 (snapshots/intent), H5 (pago confirmado/stock) y H6 (política comercial).  
**Informe exigido:** `docs/milestones/H7-informe.md`.  
**Estado al autorizar:** H0–H6 integrados y aprobados **para uso académico**; H7 no iniciado. No hay certificación productiva.

## 1. Puerta de entrada y protección del trabajo existente

Repositorio `FerrariAgustinNicolas/abar-electricidad`.

- PR #52 (`feat(h6): notifications and commercial settings for academic integration`) integrado mediante merge, sin squash ni rebase.
- `main` remoto verificado: `8ff38e932eae7a09ffb1c531d4d040d4ca6ed9e8`.
- Árbol H6 aprobado y verificado: `ca6565085fc6abe6d403c299b3e8680aa019132d`.
- Tag anotado `h6-approved` publicado y apuntando al merge anterior.
- Antes de H6 existían 16 worktrees protegidos; durante H6 se creó uno nuevo, total **17 al cierre de su implementación**. Inventariar la cantidad real actual y preservar todos, sin suponer que ninguna otra sesión cambió el estado.
- H6 terminó con `contracts/openapi.yaml` versión **0.9.0**. Mantener los contratos y reglas H1–H6; las anotaciones históricas de `runtime-stage` son metadatos legados, no evidencia de disponibilidad ni autorización para reescribir historia.

Antes de modificar archivos:

1. Verificar raíz, `origin`, rama, HEAD, árbol, índice, `git status`, referencias remotas y el objeto/tag subyacente `h6-approved`. Si la base no coincide, detenerse y comunicar la discrepancia.
2. Registrar manifiesto verificable de ramas/worktrees, índice, diff y archivos no versionados del checkout original. **No ejecutar checkout, reset, clean, borrados ni staging indiscriminado** sobre el WIP existente.
3. Leer completos `docs/plan.md`, `docs/milestones/H6-prompt.md`, `H6-informe.md`, `docs/decisions/H6-notifications-settings.md`, `docs/decisions/H5-manual-confirmation.md`, `docs/decisions/H4-orders-payments.md`, `docs/decisions/H3-quote.md`, `docs/decisions/H1-auth.md`, `docs/figma-map.md`, `contracts/openapi.yaml`, `contracts/CHANGELOG.md`, `backend/prisma/schema.prisma`, README y los módulos vigentes de orders/payments/admin/checkout/settings.
4. Contrastar modelos/rutas reales, no inferir funcionalidades a partir del plan. En particular, `Payment.status=PAID` y `confirmedAt` existen desde H5, `OrderItem` conserva snapshots históricos, y `PaymentAttempt.APPROVED` **no** equivale a pago confirmado.
5. Crear una **rama y un worktree H7 independientes** desde `main` aprobado (por ejemplo `codex/h7-dashboard-reports`). Incorporar `docs/milestones/H7-prompt.md` selectivamente a H7 si fue copiado al checkout original sin versionar; nunca incluir el WIP ajeno.

## 2. Alcance estricto

Implementar **solo**:

| Bloque | Entregable | Criterio de salida |
|---|---|---|
| H7.1 | Consultas y agregaciones de dashboard/reporte con API NestJS, OpenAPI y PostgreSQL reales | Métricas derivadas de hechos persistidos, matemáticamente reconciliadas, con períodos/unidades claros |
| H7.2 | Dashboard `/admin` o `/admin/dashboard`, reportes `/admin/reportes`, filtros y descarga CSV | UI real protegida por H1, reutilización de estilos y componentes; cifras iguales a la API/CSV |
| H7.3 | Dataset conocido, pruebas independientes, regresiones y navegador | Valores esperados explicitados y verificados; nunca se cuentan impagos o simulaciones como ventas |

No implementar contabilidad, facturación, impuestos, gateway real, reintegros, paneles BI externos, motor de analítica, tracking de clientes, nuevas reglas comerciales ni funcionalidades H8. No modificar la transacción de confirmación H5 ni el SMTP/outbox H6 para facilitar reportes.

## 3. Reglas comerciales y autoridad de métricas

**Reglas innegociables:**

1. **Venta confirmada** = `Payment.status = PAID` **y** `Payment.confirmedAt` válido, producto de la confirmación manual H5. El momento de atribución al período es **`confirmedAt`**, no el registro del pedido, ni su fecha de entrega, ni la ejecución de un `PaymentAttempt`.
2. Un intento simulado `APPROVED` con pago comercial `PENDING` **no** suma ingresos, cantidad de ventas ni artículos vendidos. Tampoco `PENDING`, `REJECTED`, reintentos, presupuestos, jobs SMTP o cancelaciones impagas.
3. Los **pedidos creados** se contabilizan por `Order.createdAt`, como una métrica distinta de ventas. Los pedidos activos impagos (RECEIVED, pago PENDING o REJECTED) y los cancelados se distinguen explícitamente. Un pedido pagado aún PREPARING/READY no vuelve a venderse al entregarse.
4. **Importes históricos:** subtotal de productos = suma de `Order.subtotalMinor` de ventas confirmadas; entrega = suma de `Order.deliveryFeeMinor` de ese mismo conjunto; total cobrado = suma de `Order.totalMinor`; debe cumplirse `total = subtotal + entrega`. No recomputar precios desde ProductPresentation ni tarifa desde CheckoutPolicy vigente. No usar float en operaciones monetarias; `bigint` o decimal exacto y serialización `{amountMinor:string,currency:'ARS'}`.
5. **Ticket promedio** = total confirmado / número de pedidos con pago confirmado; para cero pedidos, 0 y una indicación de período vacío. Definir y documentar una política técnica determinista de redondeo al centavo (unidad menor), probar casos de residuo y no usar float.
6. **Unidades comerciales:** UNIT, METER y ROLL nunca se suman en una única “cantidad vendida” indiferenciada. Reportar unidades explícitamente por presentación (`presentationId`, unidad, longitud de rollo cuando corresponda). Para ranking global puede compararse **importe** de venta; no mezclar cantidades de metros, rollos y unidades. Cada OrderItem aporta su cantidad y subtotal histórico exactamente una vez.
7. **Método de pago:** para ventas confirmadas, clasificar por el intento vigente que quedó confirmado por H5 (`Payment.currentAttemptId`), no por un intento anterior ni por simulaciones no confirmadas. El resultado demo no altera la fuente de verdad comercial.
8. **Snapshots:** cambios posteriores de precio, nombre del producto, categoría, tarifas, métodos o dirección no alteran importes ni datos históricos de pedidos ya creados. Si un nombre histórico varía, definir agrupación por IDs estables y etiquetado histórico documentado, sin reescribir snapshots.
9. **P01 vigente:** cancelar pagos confirmados no está habilitado. No incluir abonos/reintegros ficticios ni cifras negativas supuestas.
10. Las cifras son de una **DEMO académica**. No presentar como facturación, contabilidad, ingresos bancarios cobrados en realidad o rendimiento financiero real del negocio.

### Períodos y filtros

- Zona comercial: **`America/Argentina/Buenos_Aires`** (IANA). Aceptar fechas calendario locales `YYYY-MM-DD`, con **inicio incluido y fin exclusivo**. Convertir límites a UTC para consultar `timestamptz`, sin hacer comparaciones de strings ni asumir la zona horaria del servidor.
- API y UI deben mostrar claramente `desde` y `hasta (exclusivo)`. Un intervalo ejemplo para octubre es `[2026-10-01, 2026-11-01)` en la zona comercial. Verificar eventos cercanos a medianoche local.
- Rango inválido, fechas ambiguas o demasiado extensas deben ser rechazadas con código y error saneados; adoptar/documentar un límite técnico razonable (p. ej. 366 días) antes del freeze, sin inventar una nueva política comercial.
- La propuesta de plan es período + método + estado. **Evitar un `status` ambiguo**: si se admiten filtros de estado, distinguir `orderStatus` y `paymentStatus` y documentar cómo se aplican. La base de ventas sigue siendo estrictamente PAID; un filtro PENDING jamás convierte impagos en ventas.
- Definir un valor inicial de período explícito para el dashboard (p. ej. mes calendario actual local) y probar el reloj/fecha de referencia. No consultar “todos los años” de forma ilimitada por defecto.
- Los gráficos/series se agrupan por día calendario local, con huecos en cero donde corresponda y límites de volumen. No inventar retrospectivas de estados anteriores: los desgloses de `Order.status` son de **estado actual**, aun si el pedido se creó dentro del período.

## 4. Contrato OpenAPI H7: congelar antes del paralelismo

Mantener **`contracts/openapi.yaml` como única fuente normativa**, extensión aditiva de H6 0.9.0 (versión candidata 0.10.0 o sucesora justificada). Añadir marcador del freeze H7 y registrar `contracts/CHANGELOG.md`, sin modificar H1–H6 arbitrariamente.

Operaciones solicitadas por el plan:

1. `GET /api/v1/admin/dashboard` — indicadores operativos y series para un período, con etiquetas de zona, estados y moneda claros.
2. `GET /api/v1/admin/reports/sales` — detalle agregado y desglose de ventas, pedidos, estados, métodos, entregas y presentaciones.
3. `GET /api/v1/admin/reports/sales/export` — CSV del **mismo filtro y modelo de métricas**; formato y columnas documentados, verificablemente reconciliables con el JSON.

Antes de codificar, congelar DTOs cerrados, fechas/filtros, respuestas 200/400/401/403/503 y `Cache-Control: no-store` (y headers pertinentes del CSV). Autorización: **sesión administrativa H1 real en backend**, revalidación de acceso antes de devolver información; un guard Angular por sí solo nunca concede lectura.

Modelos sugeridos, ajustables antes del freeze si mejoran la precisión:

- `ReportPeriod`: límites de fecha local, zona y semántica `[from,to)`.
- `SalesTotals`: `confirmedOrderCount`, `productsSubtotal`, `deliveryFees`, `confirmedTotal`, `averageTicket`; dinero como strings de unidades menores ARS.
- `OrderIndicators`: `createdCount` por fecha de creación, `activeUnpaidCount`, `rejectedCurrentAttemptCount`/`rejectedPaymentCount` claramente diferenciados y estados actuales con nombres explícitos.
- `SalesSeriesPoint`: día local, número de confirmaciones e importe confirmado.
- `SalesByMethod`: código del método del intento vigente confirmado, conteo e importe.
- `PresentationSales`: `productId`, `presentationId`, unidad UNIT/METER/ROLL, longitud de rollo si aplica, cantidad entera de esa presentación, ingreso en unidades menores y etiqueta histórica justificada.
- `SalesReport` y `Dashboard` deberían **compartir el mismo cálculo** de fuente, filtros y redondeo. No implementar dos algoritmos divergentes.

No devolver clientes, teléfonos, emails, domicilios, notas internas, tokens, claves de idempotencia, referencias secretas, datos SMTP ni payloads de notificación. Incluso en endpoints admin, usar solo los campos requeridos por las métricas.

Si el contrato H6 contiene marcadores históricos desactualizados, **no darles semántica actual** ni modificar validadores antiguos sin analizar el impacto. Una reconciliación informativa acotada puede documentarse; no usar H7 para “arreglar” incidentalmente todo el contrato pasado.

## 5. H7.1 — Backend y agregaciones

- Preferir **consultas agregadas sobre las tablas ya existentes**: `Order`, `OrderItem`, `Payment`, `PaymentAttempt`, sin segunda fuente de ventas ni nueva tabla de dashboard. Una migración/índice adicional solo si se justifica con un plan y pruebas limpias/upgrade desde H6; no reescribir migraciones aplicadas.
- Conectar `OrderItem` al pago **confirmado** y su fecha correspondiente. Garantizar que joins de intentos, entradas de stock, eventos o notificaciones **no multipliquen filas/importes** (una orden con múltiples líneas, intentos y correos sigue siendo una sola venta).
- Agregaciones de dinero con `bigint` o SQL `numeric` exacto y serialización decimal; detectar límites, division by zero y cantidades enteras fuera de rango seguro del JSON. No usar `parseFloat` ni `Number` para importes.
- Evitar N+1, lecturas de todos los pedidos en memoria si existen mejores agregaciones con Prisma/SQL parametrizado, consultas sin acotar y dependencias nuevas de analítica. No recurrir a raw SQL interpolando filtros.
- Recibir y validar todos los filtros por un solo normalizador/servicio reutilizable para dashboard/JSON/CSV. Mensajes y errores saneados, sin SQL/stack ni PII.
- Los pedidos creados y las confirmaciones tienen **distintas columnas temporales**. Mostrar/etiquetar esos conteos por separado; la compatibilidad de filtros entre dimensiones debe documentarse y probarse.
- Orden estable de series/rankings por importe, luego identificadores; resolver empates, períodos vacíos y cero ventas de manera predecible.
- Reutilizar módulo/código H1 para autorización, errores y logs seguros; no cambiar login, sesiones, CSRF ni rutas públicas existentes.

## 6. H7.2 — Dashboard, reportes y exportación

- Integrar rutas administrativas reales, por ejemplo `/admin` (dashboard) y `/admin/reportes`; actualizar el menú del layout administrativo sin eliminar enlaces existentes. Reutilizar estilos, formato de dinero, fechas y componentes actuales de Angular.
- Dashboard: indicadores principales (ventas confirmadas, importe, productos/entrega separados, ticket promedio, pedidos nuevos, impagos), serie temporal comprensible y estados. Los totales deben corresponder **a la API**, nunca calcularse desde estado de carrito o mocks.
- Reporte: filtro de rango/método/estado según contrato, desglose por unidad/presentación, cantidades separadas, ordenamiento consistente, vista vacía, error seguro y posibilidad de descargar el CSV generado por el backend.
- El CSV será **UTF-8**, con encabezados/columnas fijos, delimitación/escape bien definidos y neutralización de **fórmulas de hoja de cálculo** en cualquier texto controlable por usuario (prefijos `=`, `+`, `-`, `@`, tabulación/control). No incluir PII, archivos locales ni rutas sensibles. Los importes se exportan como **cadenas decimales exactas** y se documenta su unidad, sin pasar por `number` flotante.
- Demostrar que CSV y JSON usan los mismos filtros/fechas y que los importes/conteos exportados se reconcilian con los indicadores, sin multiplicar tarifas de entrega por cantidad de líneas. Si se exporta detalle por renglón, especificar cómo representar la tarifa de la orden **solo una vez**.
- Cancelar/resolver solicitudes tardías y evitar sobrescribir filtros/resultados recientes con respuestas antiguas. Manejar 401/403/503 y navegación de expiración H1 correctamente.
- Responsive 360/768/1440, tablas con scroll interno accesible, teclado/foco, formatos ARS, estados loading/error/empty, gráficos legibles en texto. No agregar librerías grandes de charting o BI sin necesidad justificada.
- No exponer un “dashboard de ventas reales”: identificar DEMO y, si hay datos ficticios, presentarlos como tales. No mostrar métricas falsas cuando backend devuelve error.

## 7. H7.3 — Dataset conocido y pruebas obligatorias

Construir **un fixture aislado con datos sintéticos** que incluya al menos:

1. Dos o más pedidos PAID en fechas `confirmedAt` conocidas, uno con varios OrderItems y diferentes presentaciones; al menos uno con tarifa de entrega positiva.
2. Un pedido con intento simulado `APPROVED` pero pago PENDING; otro con intento REJECTED recuperable; otro cancelado impago. Ninguno de ellos debe aportar a ventas/importe ni a ranking de productos vendidos.
3. Pedido creado en un día/período pero confirmado en otro; corroborar que cuenta como pedido nuevo en la fecha de creación y venta en la de confirmación.
4. Cambio posterior de producto/precio/tarifa sin cambiar snapshots; ranking y totales históricos intactos.
5. UNIT, METER y ROLL del mismo producto o productos relacionados, con cantidades distintas; nunca suma heterogénea de unidades.
6. Borde del período en la medianoche local y resultados para período vacío; fechas inválidas y fin exclusivo.
7. Múltiples intentos, eventos y NotificationJobs por pedido para demostrar **ausencia de multiplicación** de importes por joins.
8. Distintos estados de pedido (PREPARING, READY, DELIVERED, RECEIVED, CANCELLED), aun cuando la fecha de pago difiera de la creación.
9. Etiquetas de texto con prefijos de fórmula para confirmar el escape del CSV, sin ejecutar hojas de cálculo externas.
10. Dos filtros simultáneos, exportación CSV y JSON, roundtrip de período y orden estable de filas/rankings.

Registrar **antes de ejecutar** los valores esperados del dataset: conteos, subtotal, entrega, total, ticket medio, series, estado/impago y cantidades/importe por presentación. Verificar las mismas cifras en SQL/Prisma, API JSON, CSV y navegador; no generar las expectativas copiando las respuestas del propio sistema.

Matriz mínima H7-Q01–Q16:

| ID | Caso | Evidencia exigida |
|---|---|---|
| Q01 | Base limpia + upgrade desde H6 poblado | Migraciones/Prisma sin drift; datos H1–H6 intactos |
| Q02 | Estado APPROVED de simulador, pago PENDING | Venta y facturación DEMO confirmada = 0 |
| Q03 | Venta PAID y cambios de estado READY/DELIVERED | Contabiliza una vez por confirmedAt |
| Q04 | Pedido creado antes del período, pagado dentro | Venta dentro, creación fuera |
| Q05 | Pedido creado dentro, pagado después | Creación dentro, venta fuera |
| Q06 | Período vacío/solo impagos/cancelados | Cero ventas/ticket cero, sin NaN/división cero |
| Q07 | Subtotal, entrega, total, ticket | Igualdad matemática exacta; redondeo explícito probado |
| Q08 | Múltiples líneas, intentos, jobs | Sin duplicación de conteo ni importes |
| Q09 | UNIT/METER/ROLL | Rangos y cantidades separados por presentación |
| Q10 | Filtros método/estado + bordes BA | Coherentes, con límites `[from,to)` |
| Q11 | Cambiar precio, producto y tarifa tras venta | Snapshots y cifras históricas idénticas |
| Q12 | Admin sin sesión, expirada, revocada, cambio de clave | 401/403, sin fuga de PII y con no-store |
| Q13 | CSV exacto, escape/inyección de fórmula | Mismas cifras/filtros que JSON, columnas estables |
| Q14 | Frontend real con backend y PG | Métricas de pantalla coinciden con API; sin mocks |
| Q15 | Visual 360/768/1440, teclado/foco/errores | Capturas y mediciones; zoom nativo se declara no ejecutado si aplica |
| Q16 | Regresiones H1–H6 proporcionadas | No se alteran pagos, stock, jobs, tarifas históricas ni sesión |

Pruebas: builds, lint, unitarias, tests de contrato/Swagger, E2E con **PostgreSQL real** y cuentas/fixtures propios; comparación de hashes de hechos de negocio antes/después de llamadas de reportes para verificar que son estrictamente **solo lectura**. Probar errores, intervalos, filtros, agregaciones, CSV y seguridad. Si no hay migración nueva, registrar explícitamente **no migration required** y validar las existentes, sin inventar una nueva tabla.

El runner puede reutilizar infraestructura H5/H6 de fixtures **solo si se prueba propiedad, aislamiento, puertos loopback, etiquetas e inexistencia de datos de otros proyectos**. No resetear ni borrar recursos externos. Conservar resultados de pruebas inicialmente fallidas, skips y comandos exactos; ningún `NOT RUN` es PASS.

## 8. Revisión y organización

- Congelar contrato H7 **antes** de paralelizar. Un solo responsable de `contracts/openapi.yaml` y Prisma. Backend de agregación y frontend en superficies disjuntas; el orquestador integra. Mantener pocos commits cohesionados, no abrir decenas de PRs ceremoniales.
- **Review independiente** con enfoque en cálculo exacto y ventanas temporales, joins repetidos, PII, autorizaciones/CSRF donde corresponda, lectura sin efectos, rankings por unidad y seguridad CSV. **Verify independiente** sobre candidatos inmutables, comparando contra resultados del fixture conocido.
- Planificar **Review nativo en candidatos pequeños desde el inicio**, atendiendo límites de contexto ya observados en H4/H5. Cada aprobación/ACK se limita a su candidato; no es aprobación global ni productiva. Respetar el mecanismo de consentimiento y no forzar frente a `next_action:stop`, transporte fallido o esquema no disponible. Documentar impedimentos sin fabricar ACK.
- Evitar repetir suites extensas tras cambios documentales. Si se modifica agregación/fechas/contrato, repetir las pruebas pertinentes; si cambia solo CSS, pruebas visuales/afectadas.
- Priorizar simpleza del MVP académico; no implementar un motor de reporting configurable ni usar BigQuery/Elastic/Redis/servicios externos.

## 9. Evidencias, reporte y barrera de salida

Versionar de forma selectiva:

- `docs/decisions/H7-dashboard-reports.md`: definiciones matemáticas, período/filtros, zona, tipado/CSV, política de redondeo y alcances.
- Nuevos controladores/servicios y pruebas backend; contrato y ejemplos/CHANGELOG; pantallas Angular, rutas y navegación.
- Migración **solo si** se justifica un cambio de datos/índices, respetando historia H1–H6; no crear por formalidad.
- README acotado, fixtures y evidencias con datos sintéticos, no PII real.
- `docs/milestones/H7-informe.md` con referencias de Git, árbol técnico/documental, inventario, estado de worktrees/WIP, criterios Q01–Q16, comandos y exit codes, conteos/hashes, evidencia PG/HTTP/CSV/browser, Review/Verify, revisión nativa y omisiones/deuda.

El informe debe distinguir **horas efectivamente dedicadas** de las 200 horas comprometidas en PS2. No convertir tiempo de ejecución de agentes ni estimaciones en horas trabajadas sin registro real y revisión humana.

**Prohibiciones y detención:** no hacer push, PR, merge, tag, modificaciones retroactivas de informes H0–H6, despliegue externo ni iniciar H8. No eliminar ramas/worktrees ni manipular el WIP original. Al finalizar el candidato, **detenerse para auditoría externa en este chat**. Esta autorización se limita a la implementación local de H7.1–H7.3.


L2 — Initial inspection: main/origin/main/annotated h6-approved peel all 8ff38e932eae7a09ffb1c531d4d040d4ca6ed9e8; tree ca6565085fc6abe6d403c299b3e8680aa019132d; original index empty; untracked H7-prompt.md and .review-worktrees/. Captured all 17 worktree HEAD/status/index/diff/untracked hashes before creating new H7 worktree. Remote refs are local tracking refs, not a fresh authenticated network verification (no remote session authorized). Manifest <LOCAL_PATH> copy versioned below. Do not touch other worktrees.
L3 — Explorer read required source documents and mapped current models/auth/routes. No schema change needed. Existing order UTC inclusive filters must NOT be reused for H7 local exclusive dates. Native review mode is ON; capabilities captured as v2.6, gentle-ai 4.2.0. Contract candidate will be assessed separately before implementation. Native consent is candidate-scoped and may require a human stop.

L4 — Freeze implementation checks: initial RED exit 1 (missing H7 validator). First GREEN attempt failed from generator syntax; first contract integration suite 28/38 PASS, 10 FAIL because shared H3–H6 version gates had not yet recognized H7 and legacy fixture omitted new routes. Corrected only additive version recognition, fixture removal of H7 marker/routes, and current-version assertion. Then focused 2/2 PASS, full contract 38/38 PASS, static OpenAPI validator+16 examples PASS. All initial failure logs retained. Differential structured comparison: all 45 legacy path objects and 107 legacy schema objects unchanged. No runtime implementation yet. Monetary calculations/PG/browser and Swagger runtime comparison remain pending; no claim of H7 completion.
L5 — Cohesive contract candidate exceeds the advisory 400-line slice heuristic because three operations and shared closed schemas must be frozen together before writers. No code compression or artificial schema/route split. Local-only delivery remains explicit; PR chain topology cannot be selected or published under current prohibition.
L6 — Contract commit 671470c99cf2dbe87741de04cb53302b9d221a84. Follow-up readback caught a documentation contradiction in CSV orders row: replaced overloaded quantity/key wording with explicit count columns and added a regression test. Full contract suite now 39/39 PASS. Logs use .log and are repository-ignored: explicitly force-added exact H7 evidence paths only. Plain diff --check reports existing Markdown hard-break spaces copied verbatim from the supplied prompt/task log; preserve them. No runtime source or Prisma changes. Native assessment risk=high, item 3, review_due=true. Independent contract verification must precede native review.
L7 — Independent Verify of e080161 (fresh archived base/candidate, scratch <LOCAL_PATH> reproduced one item-3 blocker: legacy malformed version changed H6 validator stderr. Fixed by preserving exact prior diagnostic while allowing only frozen H7 extension; added public-interface regression. Focused H7 contract 4/4 PASS. Independent Verify also confirmed original 17 HEAD/status/index/diff hashes and original prompt hash unchanged; full contract 39/39 and OpenAPI/16 examples PASS before this correction. Follow-up is restricted to the single blocker, not another full sweep. Runtime and full-feature verdict remain pending.

L8 — User answered “granted”. Native lineage review-0301a7be05401e1f ran risk/readability/reliability concurrently. One confirmed blocker R3-cache-header-semantics corrected only scripts/h7-contract.mjs and its test (27 authored lines), plan70/budget200. RED5thtestFAIL, GREEN5/5, full41/41PASS. Native targeted validation approved, then exact acknowledge-approved returned acknowledged/authority=burned for target sha256:f341bb2222b782626a02f4d55ca022900daade40ace419d9ca7feee10737f137 on commit cdcebfc42dc67a0547a62631d965a970ca381cb6/tree08255694d028495aa0be1c6275c77e794e2d7a4c. No trailing STATUS or review restart. Advisories: local environment paths in preservation/log evidence must be scrubbed before any future authorized publication; legacy diagnostic wording intentionally preserved for compatibility. They do not reopen review.
L9 — Backend/UI independent writer units now authorized after freeze, disjoint allowed surfaces; parent owns AppModule/Swagger seam, OpenAPI/Prisma and all git. Backend reuses H1 authorizeCatalog+recheck and CatalogEndpoint/error filter. Frontend reuses AuthApi/currency/styles. No installs or H1–H6 rules. Native boundary now cdcebfc. Full-feature independent Review/Verify still pending.

L10 — Implementation/integration evidence before independent feature review: backend normalization/CSV units first RED on missing service, then 5 pass/3 PG skips; parent added real H1 recheck-error regression RED (503 replacing SESSION_EXPIRED) then GREEN. Backend H7-owned PostgreSQL first run failed frozen H4 terms check; parent corrected fixture terms and required synthetic confirmation actor, removed impossible PAID-with-null-confirmedAt (forbidden by H5 DB constraint, not bypassed), corrected independently calculated large total to 9007199254740998 and createdCount5. Next fresh run8/8PASS, then9/9PASS, final10/10PASS including READY/DELIVERED and current-policy drift. Eight migrations deploy, no schema drift, no migration required; populated H6 migration deploy no-op preserves hash. Current policy fee999999 never replaces historical500.
L11 — Frontend first RED missing modules; focused10pass/full151 then corrected parent-found deleted preexisting route test (restored exact HEAD), historicalgrouptrackkey and403navigation; full157PASS on Node24. Parent found CSV errorBlob403 edge, writer reproduced RED and fixed (Blob.text/FileReader); focused14PASS/lint/buildPASS. Initial Node26 run and denied default dist write explicitly superseded by successful Node24 checks. No framework dependencies changed.
L12 — Swagger initial RED5fail then metadata-onlyremaining1fail; parent added ReportsController/Service to projection and updated document version0.10.0;58/58PASS. Fullbackendunit attempt blockedEPERM beforeJest/build; authorized scoped escalation then buildPASS, unit1312PASS+1skip+1FAIL staleH6metadataexpectation. Parent updated only docdescription/version assertion; focused login+Swagger132/132PASS. Fullsuite final independent rerun remains pending. Backend lintPASS. Initial failures retained.
L13 — Real H1 login/API/Angular against exclusive H7 tmpfsPG: initial parent launch omitted proxyflag (returnedHTML), corrected ONLY launcher; real login200. HTTP19checks including no-session401, revoked401, expired401,passwordchangeflag403, invalid/duplicate/nestedfilters400, sameJSONdashboard/report, twofiltersJSON/CSV, emptyperiod and allCSVheadersPASS. BrowserCSV byte-identical to API; confirmedtotal15000/products14500/fee500/ticket7500; created5/activeunpaid2/cancelled1. Businessfact SHA256 unchanged. IAB screenshots1440/768/360 with no page overflow, internal table scroll at360 (544>294), keyboardTab reachesCSVbutton, twofilter9500, emptyzero, safe400errorwithoutstalefigures. Zoom native200%/fullWCAG NOT RUN. Local API/UI and retained PG removed after exact PID/cwd/processgroup/container ownership checks; final PG runner cleans its own new container. No SMTP dispatch.
L14 — Tooling deviation: writer inadvertently used npx jest from repositoryroot; it announced an external npmcache download at <LOCAL_PATH> and failedconfigurationexit1. No package/lock/worktree changes, no retry or cache deletion. All subsequent tools use cached binaries. Native future publication would require privacy scrub of environment-path evidence; publication is prohibited.

L15 — Backend commit ed55dce8ac972143916b0b58a65682bb415b8c31/treeff54bb41cfb10e262c9ef94c7bd42b7fd085032a; frontend staged, not committed (one trailing EOF blank line normalized before snapshot). Full technical index tree0e23b8b8be42ca10395a5156bb509712f8d86d2d independently verified: backend1313PASS1SKIP afterscratchbuild, frontend159PASS,contract41PASS,ownedPG10PASS,migrations/driftclean; legacy45paths107schemasunchanged andCLIparity0/1/1. No new HTTP/browser session claimed by verifier.
L16 — Independent Review reproduced asyncBlobhandler staleerror/navigation afterfilter/newrequestsuccess. Oneboundedwriterbatch RED7pass2fail, GREEN9/9/lintPASS; correctedimmutableindex tree1a7504cd1f7d429ba95714c323b9c1ff8092bb33. Independent limitedrecheck usedactualarchivedcomponent/helper/deferredBlob: probeexit0,9/9PASS, no stalestate/navigation. No fullsuite/browserrerun afterconcurrency-onlycorrection. Riskitem4. NonblockingfixturePICKUP-positivefee realismwarning retained, not scope-expanded.
L17 — docs/milestones/H7-informe.md created as truthful PENDING localcandidate report, includingQ01–Q16, realresults, failures, exacttrees/commit andnohoursclaim. Final17originalHEAD/status/index/diff/untrackedhashes+oldbranches/tags/remotesunchanged,18totalworktrees. One transient<TRANSIENT_NATIVE_REF> ref no longer present; not restored or causally attributed. No publication. Backend nativeassessment first required explicituntrackedselection; an earlypreflightwithlensesbeforeselection returnedcorrect_request/no mutation. Technicalevidence staging/explicitcommittedscope will keepfrontendanddocs outofbackendcandidate. Neednativebackendconsent, thenfrontendunitcommit/evaluation, finaldocs andexternalstop.

L18 — User `granted` for backend. Four native captures concurrently admitted; approved without correction, six informational warnings retained in report. Exact ACK burned authority for lineage review-bd4e3911c9569e41/target sha256:9d9cf81b8e2d49bc5ff1fd3b05f95a58b92f55b2ba2969535cd567124b074d4a. Parent spotcheck frontend9/9PASS. Frontend plus README committed separately857dac2a82f690eb3c8e1586c646bd9d2b541b4d/tree4fb0e6ec886530eb604304d3ae469a0b6893718c (706authoredlines, coherent behavior not artificially split). Native assessment high/escalationitem4, START consentmedium; exact consent invocations in <LOCAL_PATH> target sha256:529ef67d42cd0e65538375bf71b62533a22733c12d4676f042c07198b9dc8c88, lineage review-047ff832a270e9ae. Waiting for human choice, no frontend review run yet.

L19 — User `granted` for frontend. Four exact native captures admitted concurrently in provider order; approved without findings/correction. ACK authority burned lineage review-047ff832a270e9ae/target sha256:529ef67d42cd0e65538375bf71b62533a22733c12d4676f042c07198b9dc8c88/revision cdbfc187f4a08c9082dfca5bea0978ea56ec2d7e12d1b71ecaf2eca4ff73488f. Final preservation repeats17/17unchanged,18total,persistentrefsunchanged; same missingtransientref retained honestly. Initial comparison setup errors (refs string/statusuntrackedgrouping) corrected to baseline format, no protected mutation. Final report records candidate commits, proof, warnings, skips and unavailable zoom/WCAG; local implementation stops for external audit, no publication or H8. Documentary closure contains no source changes.

L20 — User `granted` for documentarycandidate7228cc51051eb16dc70542728a954662d52c54ca. ExactSTART returned gentle-ai.review-integration.failure/v2 lens_context_budget_exceeded; mutation_outcome not_started, noauthority, noACK. Terminalstop obeyed; no retries,truncation,review bypass or historyrewrite. Exactfailure and limitation appended to report. Technicalfreeze/backend/frontend remainapproved; documentaryproof unavailable for thisrange. Finalhandoff is qualified and stopped for external audit, not publication. Additional note-onlycommit records actualunavailability; no furthernative lifecycle action. Risk:none for this passive limitation record.
