# H6 — Notifications and commercial settings
Base: 9588535ebbc1de3758e84377bf7ad0198be4d455; branch: codex/h6-notifications-settings. Local commits only; publication and PR topology deferred by explicit prohibition.
Runners: Node v24.18.1 / npm 11.16.0; Jest, Vitest, owned PostgreSQL and Mailpit. Forecast: several cohesive units above 400 total authored lines; do not shrink implementation for the heuristic.

## Specs

### S1

## 1. Puerta de entrada y preservación

Repositorio `FerrariAgustinNicolas/abar-electricidad`.

- PR #51 de H5 mergeado sin reescritura.
- `main` y `origin/main` esperados: `9588535ebbc1de3758e84377bf7ad0198be4d455`.
- Árbol del merge aprobado: `62cf2ce6e407492e4a186e7af443983904049c58`.
- Tag anotado `h5-approved`, apuntando al merge anterior.
- Había **16 worktrees** tras H5. Conservar ramas, HEAD, índices, archivos no rastreados y WIP ajeno, incluido el checkout original de H1.

Antes de escribir: verificar raíz/origin/HEAD/índice, `main`/`origin/main`, tag anotado con su commit subyacente, árboles y todos los worktrees. No hacer limpieza, reset, checkout en el original, `git add -A` indiscriminado ni movimientos destructivos. Si no coincide la base, detenerse e informar.

Leer completos: `docs/plan.md`, `README.md`, `docs/milestones/H5-prompt.md`, `H5-informe.md`, `H5-cierre-validacion.md`, `docs/decisions/H5-manual-confirmation.md`, `docs/decisions/H4-orders-payments.md`, `docs/decisions/H3-quote.md`, `docs/decisions/H1-auth.md`, `docs/figma-map.md`, `contracts/openapi.yaml`, `contracts/CHANGELOG.md`, `backend/prisma/schema.prisma`, `compose.yaml`, `.env.example`, la validación de entorno y los módulos de pedidos/checkout/stock. Contrastar las proyecciones históricas con **el código real de H5**.

Crear rama y worktree **nuevos** desde el `main` aprobado (por ejemplo `codex/h6-notifications-settings`). Si este prompt está sin versionar en el checkout original, incorporarlo selectivamente a H6 sin alterar el original. Registrar hash de WIP y referencias protegidas.


### S2

## 2. Reglas y límites comerciales

- Pagos exclusivamente **simulados**. Un intento `APPROVED` no es un pago comercial `PAID`. La confirmación administrativa H5 es la única que descuenta stock; H6 **no cambia esa regla**.
- P01 confirmada: cancelar solo un pedido impago y con motivo; prohibida cancelación de pagados, refunds o reintegros automáticos.
- P02/P03 confirmadas: pedidos sin expiración comercial automática, snapshots históricos inmutables, comprador y términos demo ya definidos.
- C08: tarifa fija de entrega coordinada **configurable** y inicialmente $0; el retiro no cobra tarifa. Ninguna edición H6 cambia pedidos creados ni sus importes congelados.
- C09: avisos básicos por **email** al comprador y administrador. WhatsApp sigue siendo contacto manual, sin API ni mensajes automáticos.
- **P06 no confirmada comercialmente:** email administrador, horarios, textos y teléfonos reales no se inventan; usar `example.test`, nombres y datos ficticios etiquetados DEMO y Mailpit. No enviar correos externos ni presentar textos de demostración como información aprobada del negocio.
- **P05 sigue pendiente para uso real**: la demo conserva compatibilidad de H3 (`DEMO_PAY_ON_PICKUP` solamente con `PICKUP`; `DEMO_TRANSFER` y `DEMO_SIMULATION` según modalidades habilitadas). No activar comercialmente entregas o cobros reales.
- P07 sigue pendiente: no sustituir catálogo/precios reales ni cargarlos silenciosamente.

No pedir nuevas decisiones comerciales para implementar con **fixtures falsos y configuración técnica local**; si aparece una regla que obligue a inventar una condición comercial no cubierta, detener solo ese frente y elevar alternativas.


### S3

## 3. Estado técnico existente y contrato H6

Hoy existen:

1. `CheckoutPolicy` (H3), autoridad actual para `feeMinor`, `quoteTtlSeconds`, `enabledDeliveryModes`, `paymentMethods`, `version`; `CheckoutQuote.response` y `Order` conservan snapshots históricos.
2. `NotificationJob` H4/H5, con `kind`, `recipient`, `dedupeKey`, `payload`, `state=PENDING`; ya se crean **dentro de las transacciones de negocio**, pero no se despachan ni rastrean intentos SMTP.
3. Eventos: pedido creado (comprador/administrador), pago confirmado (comprador/administrador), listo (comprador), cancelación (en H5 actualmente comprador). El plan §10.10 también prevé aviso al administrador al cancelar: revisar y, si falta, incorporar **la generación transaccional deduplicada `ORDER_CANCELLED_ADMIN` en el origen de H5**, con migración aditiva y pruebas. No generar correos históricos ficticios ni un job después del commit sin trazabilidad.
4. Mailpit local en `compose.yaml`: SMTP loopback `127.0.0.1:1025`, UI `127.0.0.1:8025`. No asumir que está levantado, ni eliminar/reiniciar volúmenes o servicios ajenos.

Congelar **primero** OpenAPI 0.9.0 (o versión incremental justificada) como fuente normativa única. Extender contract/DTO, ejemplos, CHANGELOG, validador y documentación sin romper H1–H5. Mantener marcadores históricos necesarios sin presentar estados antiguos como disponibilidad actual. Separar módulos de gestión comercial, notificaciones y negocio existentes. No modificar esquemas de un worker mientras otro los genera.

Exponer, en alcance H6, GET/PATCH `/api/v1/admin/settings`, GET/PATCH `/api/v1/admin/payment-methods/{code}`, GET `/api/v1/admin/notifications`, POST `/api/v1/admin/notifications/{id}/retry`, con rutas/DTO/códigos exactos congelados. Definir la lectura pública mínima de contacto si se requiere para `/contacto` (puede ser campo aditivo o endpoint estrecho); preservar los DTOs cerrados anteriores mediante nueva versión/endpoint justificado, no agregar propiedades sin pruebas. No crear rutas H7.

Sesión H1 real en todas las lecturas admin; Origin + CSRF en mutaciones, restricciones de contraseña pendiente, revocación y expiración. Revalidar identidad cuando corresponda; `Cache-Control: no-store` y errores saneados. El guard Angular nunca es autoridad. No aceptar cambios libres de status de notificación, pagos, cantidades, pedidos o stock.


### S4

## 4. H6.1 — Despacho durable de notificaciones

Implementar despachador de jobs **persistente y acotado** a Mailpit local: estados operativos necesarios, intentos, `nextAttemptAt`, fecha de envío, último error **saneado** y claim/lease recuperable tras caída. Definir máquina de estados, retry/backoff **finito**, límites por corrida, manejo de fallos permanentes, timestamps y reintento manual. Migración aditiva posterior a H5, con constraints/índices y sin reescribir migraciones históricas.

- **Nunca enviar SMTP dentro de la transacción de creación/confirmación/cancelación del pedido.** El job se inserta con el evento de negocio; un worker independiente reclama tras el commit, registra resultado y libera/recupera claims vencidos.
- Evitar que dos despachadores reclamen el mismo job concurrentemente (transacción, locking `SKIP LOCKED` o alternativa equivalente verificable). Reintento manual no crea otro evento de pedido/pago ni otro `NotificationJob` por `dedupeKey`.
- Reconocer el límite real de SMTP: un fallo entre la aceptación del mensaje y la actualización `SENT` puede ocasionar **duplicación al reintentar**; no afirmar exactly-once SMTP. Garantizar unicidad de job de negocio y ejecución concurrente coordinada, no imposibles garantías de entrega.
- Entregar un modo de ejecución claro para la demo (comando puntual o worker explícito con parada segura). No introducir colas distribuidas, cron cloud, servicios externos ni jobs de background no solicitados.
- Reutilizar solo plantillas definidas por `kind`, con asunto/texto fijo parametrizado por datos validados del job; tratar todo campo como texto escapado, no HTML ejecutable; no publicar dirección/domicilio/notas internas/tokens de acceso. Ningún enlace con credencial de posesión ni datos bancarios. Etiquetar mensajes como DEMO.
- Aislar SMTP: entorno local Mailpit únicamente y host/puerto loopback validados; configuración fail-closed ante intento de host externo. Sin API de envío a destinatarios arbitrarios, archivos adjuntos, campañas o SMTP productivo. Si se necesita una dependencia, justificarla, fijar versión y correr pruebas.
- Mantener destinatario y contexto histórico del job aunque cambie configuración futura. Si falta destinatario de administrador en fuentes previas, admitir solo valor ficticio/en entorno y documentar precedencia. No crear PII nueva innecesaria.


### S5

## 5. H6.2 — Configuración comercial y métodos

Crear la UI administrativa y backend real de `/admin/configuracion` y `/admin/metodos-pago`, basados en el mismo estado del servidor. Implementar una **única fuente de verdad** para tarifa y métodos: extender/adaptar `CheckoutPolicy` existente, no introducir una segunda tarifa o lista de métodos que pueda desincronizar H3–H5. Solo crear estructura adicional mínima para contacto/horarios si el modelo existente no los admite.

- Campos técnicos: datos de contacto/comerciales demo, modalidades `PICKUP` / `COORDINATED` habilitadas, tarifa fija ARS en unidades menores como cadena, versión optimista, métodos demo activos/compatibles e instrucciones ficticias; cualquier horario/dirección no confirmado queda claramente etiquetado y nunca se asume real.
- CAS por `expectedVersion` y respuesta 409 ante versión vieja; validación estricta de longitud, dinero no negativo dentro de `bigint`, códigos de método fijos y compatibilidad. Evitar que una edición deje **cero combinaciones válidas** de entrega y pago; devolver `NO_VALID_CHECKOUT_COMBINATION`. Sin habilitar `DEMO_PAY_ON_PICKUP` para entrega coordinada. No permitir elegir proveedores reales ni activar simulación mediante un parámetro del navegador.
- Cambiar tarifa/método debe afectar **cotizaciones nuevas**, con aceptación explícita al re-cotizar; no recalcular silenciosamente `CheckoutQuote`/`Order` existentes. H4 rechazará un quote obsoleto cuando corresponda. H5 seguirá pudiendo confirmar intentos históricos válidos según su snapshot/regla y stock, aunque el método se haya deshabilitado para compras nuevas. Nuevos reintentos H4 deben respetar configuración vigente.
- Los métodos e instrucciones se recuperan del servidor; no persistir secretos, cuentas bancarias reales ni tarifas desde Angular. Mostrar cambio de versión, errores 401/403/409, estados de carga/guardado, borradores ante conflictos y permisos.
- No construir un CRM, calendario complejo, mapa de logística o módulo completo de precios/tarifas por zona. Una tarifa plana basta.


### S6

## 6. H6.3 — Integración pública, administración y Mailpit

Implementar la consulta pública de contacto `/contacto` si el contrato y el plan lo requieren; mostrar datos etiquetados DEMO hasta la carga real. WhatsApp como vínculo/manual solamente si existe un dato válido configurado, sin envío automático. Header/footer: no reemplazar con datos reales supuestos. Reusar tokens y estructura Angular del proyecto.

Panel `/admin/notificaciones`: lista real paginada, filtros por estado/pedido/período, error seguro/intent count/fecha, acción de reintento **solo para estados elegibles**. No ofrecer edición del destinatario histórico ni botón de «Enviar cualquier email». No mostrar payloads sensibles ni secretos en UI.

Verificar en Mailpit con entorno **propio** (preferiblemente PostgreSQL/Mailpit efímeros etiquetados/loopback; si está usando Compose alguien más, no intervenir) al menos estos eventos:

- Pedido creado → comprador y administrador (2 jobs/mensajes).
- Pago confirmado manualmente → comprador y administrador (2).
- READY → comprador (1).
- Cancelación impaga → comprador y administrador (2, tras completar la brecha del contrato/creador si existía).
- Intentos APPROVED/PENDING/REJECTED, replays, navegación/recarga y DELIVERED no generan nuevos avisos injustificados ni alteran stock.

Demostrar Mailpit UI/API o recibos saneados con destinatarios ficticios, asuntos, estados y conteos. Documentar que el envío SMTP se produjo después del commit de negocio. No enviar correo exterior, no exponer secretos en capturas.


### S7

## 7. Pruebas obligatorias, Review y Verify

Matriz de aceptación propuesta H6-Q01–Q16:

1. Upgrade limpio y desde H5 **poblado** con jobs preexistentes; no reescribir datos/historia, Prisma sin drift.
2. `CheckoutPolicy` sigue siendo autoridad única de tarifa/métodos; no estado divergente tras actualizaciones.
3. $0 inicial; cambios a tarifa positiva, pickup cero; overflow/negativos/decimales inválidos rechazados.
4. Métodos demo habilitados por modalidad; combinaciones inválidas y `NO_VALID_CHECKOUT_COMBINATION` en 409; no opciones falsas.
5. Dos administradores actualizan la misma versión: solo uno gana; conflictos muestran borradores sin sobrescribir.
6. Quote fresco refleja tarifa/métodos nuevos; quote viejo se rechaza o pide reaceptación según H3/H4; pedidos antiguos conservan snapshots e importes exactos.
7. Intento histórico válido es confirmable aunque método se desactive para nuevos pedidos; nuevos reintentos respetan política vigente.
8. H1 autorización: 401 (sin sesión/expirada/revocada), 403 (CSRF/Origin/password change), ningún dato admin filtrado.
9. Creación/confirmación/READY/cancelación generan exactamente los jobs esperados, con dedupe, dentro del commit; rollback no deja jobs huérfanos.
10. Mailpit recibe los emails esperados; envío solo local, contenido etiquetado DEMO y sin PII sensible/tokens/notas privadas.
11. SMTP fallido: pedido/pago/stock correctos; job conserva error saneado, se reintenta con límites y luego llega a SENT.
12. Dos despachadores compiten sin procesar simultáneamente el mismo job; claim expirado se recupera tras caída.
13. Fallo entre SMTP aceptado y ACK de BD: registrar explícitamente posibilidad de duplicado, sin mentir sobre exactly-once.
14. Reintento admin elegible protegido y idempotente; reintento de SENT/no elegible devuelve conflicto; no duplica Order/Payment/StockOperation.
15. UI real Angular→NestJS→PostgreSQL→Mailpit; escenarios admin/configuración/métodos/notificaciones/contacto; responsive360/768/1440 y teclado/foco/error. Zoom nativo200% es deuda si no se comprueba de verdad.
16. Regresión H1–H5 dirigida: CSRF/sesión, quote H3, H4 intentos/snapshots, H5 débito único, reintentos y cancelaciones. Hashes de inventario y pedidos antes/después de envíos, errores y replays.

Ejecutar comandos reproducibles con Node/npm exactos observados; OpenAPI/Swagger, Prisma validate/generate/migrate y drift, build/lint/test frontend/backend, fixtures PostgreSQL + Mailpit **propios** y pruebas de concurrencia/inyección de fallos. Conservar RED/FAIL iniciales y sus correcciones, skips, diferencias de entorno y hashes de candidatos. No convertir pruebas omitidas/CI inexistente en PASS.

Revisión independiente de código sobre contrato, configuración/versiones, outbox/claim/lease/reintentos/SMTP, control de accesos, HTML/headers, PII y compatibilidad H3–H5. Verify independiente sobre candidatos inmutables; distinguirlo de Review nativo. El Review nativo H5 runtime estuvo incompleto por transporte de lente resiliencia: **no heredar su excepción**, ni fabricar ACK. Planificar candidaturas cohesionadas pequeñas desde temprano, cada una con su consentimiento y límite de autoridad, y detener frente a un `next_action:stop` o `lens_context_budget_exceeded`; no forzar/alterar lifecycle ni reescribir historia para obtener un PASS.


### S8

## 8. Organización, evidencia y detención

Usar orquestador Gentle-AI/Codex existente sin cambiar modelos/configuraciones globales. Un responsable de OpenAPI y Prisma; congelar contrato antes de paralelizar. Backend jobs+despacho y backend config pueden trabajar en unidades cohesionadas con dueño claro; frontend puede trabajar después del freeze sobre superficie disjunta. Evitar PRs ceremoniales y repetir miles de suites tras CSS/documentos. No ampliar el alcance para cerrar una heurística de líneas.

Versionar `docs/decisions/H6-notifications-settings.md`, nuevos schemas/migración(es), componentes, tests, README, ejemplos y `contracts/CHANGELOG.md`. No reescribir retrospectivamente informes H0–H5. Incorporar evidencia saneada sin credenciales ni correos personales reales.

Entregar `docs/milestones/H6-informe.md` con: base/HEAD/árbol exactos, worktrees/WIP conservados, qué ya existía/qué se agregó, rutas/DTO/migración, configuración demo, matriz Q01–Q16 por candidato/exits, hashes de invariantes, evidencia Mailpit/PG/browser, errores y límites, Review/Verify independientes, resultado **real** de Review nativo, deuda y dictamen propio CUMPLE/PARCIAL/NO CUMPLE. Registrar también horas **efectivamente trabajadas**, sin atribuir horas estimadas como realizadas (PS2 establece un total comprometido de 200 horas).

No hacer push, PR, merge a `main`, tag, borrado de worktrees/WIP ni iniciar H7. **Detenerse para auditoría externa de H6 en este chat.**


## Tasks
- T1 | S1–S3,S8 | inline (single OpenAPI/Prisma owner) | complete: contract f37cbf20 approved/acknowledged; additive schema real clean/populated upgrade/drift passed | da5d3d98 schema/runtime
- T2 | S4,S6–S7 | delegated (parallel independent T2/T3; disjoint edit surfaces) | complete within scope: durable local dispatch, real tests, independent Review/Verify and native acknowledged | da5d3d98,d9c08fa,71b8293,c6e2db8
- T3 | S5,S7 | delegated (parallel independent T2/T3; disjoint edit surfaces) | complete within scope: independent/native Review and Verify approved/acknowledged | dd6823f,09edd57,e151ee7
- T4 | S5–S7 | inline or parallel independent UI after freeze | complete within scope: independent/native Review and Verify approved/acknowledged, browser with recorded zoom debt | b70067a,0fb85fb,a3560e4
- T5 | S7–S8 | independent Review and Verify | complete with explicit skips/debt: owned runtime, final immutable checks and native acknowledgements | evidence in H6-informe
- T6 | S8 | inline | complete: Spanish report/evidence, preservation comparison, PARCIAL dictamen and external-audit stop | passive closure commit

## Log
L1 — 2026-10-22: Original request

Comenzamos H6 — Notificaciones y configuración comercial de ABAR Electricidad.

Base aprobada: PR #51 integrado; main / origin/main 9588535ebbc1de3758e84377bf7ad0198be4d455; árbol 62cf2ce6e407492e4a186e7af443983904049c58; tag anotado h5-approved publicado.

Autorizo ejecutar **únicamente H6.1–H6.3**, conforme a `docs/milestones/H6-prompt.md`.

Leé el documento completo y las fuentes referenciadas antes de implementar.

Verificá Git, ramas, tags, índices y worktrees. Preservá íntegramente el WIP original y los 16 worktrees existentes. Creá rama y worktree nuevos desde main. Incorporá el prompt selectivamente si todavía no está versionado.

Congelá primero el contrato OpenAPI H6 y coordiná Prisma con un único responsable.

**Prioridades:**

- Despacho durable de los trabajos de notificación creados por H4/H5.
- SMTP exclusivamente local mediante Mailpit.
- Reintentos y recuperación ante errores sin modificar pedidos, pagos o stock.
- Administración segura de tarifa, métodos y contacto.
- Preservación de presupuestos y pedidos históricos.
- Pruebas PostgreSQL/Mailpit reales, Review y Verify independientes.

No enviar emails externos ni utilizar datos comerciales reales no confirmados.

No implementar pagos reales, reembolsos, nuevas reglas de descuento de stock, dashboard ni reportes H7.

No hacer push, PR, merge ni tags. No iniciar H7.

Al finalizar, generá `docs/milestones/H6-informe.md`, con evidencias, commits y árboles exactos, resultados de Review/Verify y deuda pendiente.

Detenete para auditoría externa.

L2 — Preflight: main/origin/main/tag peeled commit and tree match supplied values; tag object annotated. Original index a4672ce4e4af78116ae4dffabcc060cdd1ef3372996701f17b60c8592ae643a3; original worktree files 591397b4213a2eae909709d522e509fa84d327e224a0329360e4d963e67e0951. All 16 protected worktrees captured in /private/tmp/abar-h6-preservation.json (local-only evidence). Origin verified without contacting remote. RDD globally on, unchanged. Full required source read completed by h6_source_map after correcting truncated first pass. Prompt {code} GET wins over older plan collection sketch. Parent owns OpenAPI and Prisma exclusively.

L3 — Initial contract candidate: OpenAPI 0.9.0; all H1–H5 operation schemas preserved. RED: three H6 tests fail against H5 (missing routes/version/schemas), exit 1. First integrated run exposed version pins in H3/H5 validators and legacy H1 fixture cleanup; corrected explicitly. GREEN: 34/34 contract tests, static contract validates 16 JSON examples. npm ci used offline cache and ignore-scripts in new worktree only. Escalated shell initially selected Node v26.4.0 for first missing-module RED; all subsequent checks pin PATH to Node v24.18.1/npm11.16.0. No dependency manifest changes. Risk: item 3 (shared contract-validator/version dispatch consumed by previous milestone checks). Independent verification required before native review. Prisma untouched.

L4 — User correction authorization (verbatim): Sí, autorizo corregir únicamente el límite bigint del contrato, agregar la prueba exacta de frontera y retomar la misma revisión nativa, sin ampliar el alcance de H6 ni publicar nada.
L5 — Native review finding R3-fee-overflow-contract: the former 19-digit regex accepted 9223372036854775808. Plan captured once at 60 lines, budget 200. Exact boundary regression observed RED (exit 1) before correction. Only H6 fee schemas, their regression test, directly related decision wording and this log changed; no Prisma/runtime/UI or publication. Same lineage review-dc6fdf239d5151fa retained. Runtime harness N/A: contract-only correction; rollback boundary is this correction commit. Risk: item 3 (H6 contract money constraint).
L6 — GREEN: focused H6 tests 5/5; contractual suite H0/H2–H6 36/36, no failures/skips; OpenAPI plus 16 examples validated; git diff --check exit 0. Correction before commit: 26 additions/4 deletions, within forecast 60 and native budget 200. Verification against immutable correction commit and native targeted validation pending.

L7 — Contract freeze completed: correction commit f37cbf20c2b39d7e4994c03c552472ae209b73e1 tree 7a3b80117813aeaef0d6c9e15c9cde6d0df523aa; scoped independent Verify resolved R3 with 2,076 public DTO checks. Same native lineage review-dc6fdf239d5151fa approved; exact ACK confirmed acknowledged/authority burned for target sha256:f255b44f6383243f3d8033d26d137d7371b06d59b90a6728135afc490ae9aab6. Four informational advisories remain, not authorized scope expansion.
L8 — User continuation (verbatim): Continuá con la implementación pendiente de H6.1–H6.3 según el prompt, sobre el contrato aprobado y en el mismo worktree. Mantené un único responsable de Prisma, ejecutá las pruebas reales y Review/Verify independientes, sin publicar nada.
L9 — Schema owner: parent only. Add contact JSON to existing CheckoutPolicy; no second tariff/method source. Add notification lifecycle with per-cycle attemptCount <=5, lifetime totalAttemptCount, lastAttemptAt, nextAttemptAt, sentAt, safe lastError, leaseToken/leaseUntil and version. Old recipients/payloads/history preserved; missing cancellation-admin events are not backfilled. Manual retry resets cycle count only, preserves lifetime count. Initial static schema tests RED exit 1; clean and populated-H5 PostgreSQL upgrade proof pending. Risk: items 1/4 (additive persisted schema and leases).

L10 — Unit handoffs: T2 focused notification/Nest DI 9/9 and owned PostgreSQL/Mailpit 4/4; initial accidental broad Jest invocation failed from unbuilt auth resources/sandbox listeners, not counted as PASS. T3 service/checkout 16/16; real PostgreSQL CAS/history/auth HTTP 3/3 plus H3 HTTP 3/3. T4 initial routes RED 2 failures, GREEN focused 12/12, lint/build passed; normalized readable formatting and added sentAt display regression, lint/focused checks rerun; manual browser proof pending.
L11 — Owned fixtures: PostgreSQL17.11-bookworm + Mailpit1.31.3, newly labelled loopback-only; clean eight-migration deployment and populated H5 upgrade PASS, historical hash before/after 10dd5a5f883246c7492a33a280176be03abdfd0b61a4bbd8191a09ff0dfe700e. Drift clean/upgrade exit0. Parent env SMTP tests RED9 failures then GREEN19/19; H6-only JSON parser behavior RED4 failures then GREEN4/4; bounded foreground CLI tests GREEN7/7 after missing-entry RED. H5 runner excludes H6 when constructing historical H4 upgrade baseline, and H5 ledger assertion preserves seven historical migrations while permitting exactly the additive H6 migration. Full integration/independent verification pending.

L12 — Functional recheck after one consolidated batch: backend build/lint exit0; Swagger/login failed fixtures corrected and targeted129/129pass; frontend full141/141+lint/build pass. Fresh H6 runner:11/11realPG/Mailpit tests plus clean/upgrade/drift pass; fresh H5 regression15/15pass after ledger count/order assertions corrected. Actual foreground CLI --limit1 claimed/sent1, business hash unchanged c4f725901a66dfdd67c8657ecec4e1be9261d3cbf66f78dbc39bc79153a50984. CLIhelp0/invalidlimit2 with connection-trap prove no connection. Initialfullbackend run1287pass9fail1skip; only failed129-test suites rechecked, not misreported as a full-suite rerun.
L13 — Real HTTP/PG/Mailpit business suite4/4pass: H1 notification authorization incl absent/expired/revoked/password-change, Origin/CSRF; actual H3quote/H4order create commits twojobs; H5confirmtwo,READYone,canceltwo (twoorders total9messages incl the cancelled order initial2). Each SMTP batch preserves hashes of orders/items/payments/attempts/stock/operations. Real SMTPport1 failure stops afterfive attempts, adminretryCAS preserves business data, lifetimecount6. Injected lostDBACK after SMTPacceptance:2businessjobs/3capturedmessages, unchanged business hash a84ca6e0d15b69adf8b2c1e4c45ec33806599c565d520a9e3695c5bd5633ab59. Initial missing-Origin mutation returned403 per H1; auth fixture corrected to send validOrigin before asserting missing-session401. Existing AJV unknown-email-format warnings observed and not expanded into unrelated H1/H4 changes.
L14 — Candidate boundaries: first runtime work unit is durable notifications plus required additive schema/owned harness/local environment, CLI, transactional cancellation gap and tests. T3 settings/checkout and T4 frontend drafts remain uncommitted in this worktree for their own reviewable units; no resetting/restoring them. First candidate retains the base Swagger projection fixture (H6 settings wiring pending) rather than import an uncommitted controller. Full combined draft projection129tests passes; immutable first-candidate Verify must report the inherited pending full-H6 projection honestly, not claim complete H6. Risk: items1/2/4/5 (persisted lifecycle, H1/SMTP security, leases/concurrency, local verification environment).
L15 — Runtime unit1 committed as da5d3d98a3e10393877530abc926bb0644e5cdbe, tree8a0554e947c6f1baf6e3c456d333d1b738d2f423. Independent immutable Verify: notification/schema scope PASS, H6 overall PARTIAL; build/lint pass, focused40/40, schema/contract7/7, real H6PG/Mailpit8/8, H5regression15/15, clean/populated-upgrade/drift pass. Business hash unchanged in independent CLI d89a76b100142a5fe1cd72529ff6de458b7516d954f8d296d3fcb00b2f809b18. Eight unchanged Swagger fixture failures reproduce on base; deferred settings/controller fixture is not full-H6 proof.
L16 — Independent Review blocker: validated administrator aliases with percent were accepted by environment but rejected as INVALID_JOB by dispatcher/transport. One consolidated correction aligns their shared recipient regex with the existing accepted configuration; environment and historical jobs unchanged. Regression observes RED1failed/5passed before fix, then GREEN30/30 across dispatcher/environment/notifications/module. No other Verify blocker. Rollback boundary: recipient regex and its regression only. Runtime unit remains pending targeted independent recheck and native review; settings/UI drafts preserved. Risk: item2 (local SMTP destination guard).
L17 — User granted native review for notification runtime candidate9c114d31458b2f16fcef1a4238fd4a9574633d6c4cef83b345d047f24e137de5. Four provider-issued captures ran concurrently in canonical order, lineage review-d228de13d61819f2. Reliability/resilience corroborated the same introduced blocker R3/R4-hardcoded-docker-socket. Native correction plan captured once at150lines (budget200). Correction removes developer-specific socket, resolves explicit local host or selected/active context metadata, rejects non-Unix endpoints before fixture operations, and pins subsequent operations to the resolved endpoint. Related README and resolver regressions only; settings/UI drafts untouched. REDmissingmodule observed before implementation, GREEN6/6 endpoint/schema tests; diffcheckpass. Independent real owned runner12/12tests3suites, clean/upgrade/driftPASS, historical before/after19d1a6badf319688abd668dbedbee25fbeee67f717a0c95ff69ebb3d35e15751; both new owned containers removed. Actual run explicitly pinned authorized local Docker endpoint. Risk:item5 (local integration runner environment selection). Native targeted validation pending; no publication.
L18 — Native recovery after correction-added paths explicitly returned scope_changed, successor review-aa7910b4557616a0 targetaccf51946d7d19b4049c8718ea50654ae031316b3db009428cccc4d81b69bcb9; exact recover executed. Provider reoffered four reviewer captures, run concurrently. Final capture reports new blocker R4-lost-ack-reported-success: finish returns LOST after completion DB failure/fencing loss, run omits it from counters, CLI prints success and exits0 although PROCESSING recovery remains. Parent source read confirms branch/output mismatch; prior real lostACK duplicate test supplies realistic path. No further correction applied: one bounded native correction already consumed; new findings do not authorize another automatic batch. Native state correction_required, no approval/acknowledgement. Needs user decision for a separately authorized narrow LOST-outcome/CLI regression correction. Current committed HEAD71b82939a549b14f3c786b8b702f4c092112f858 tree021000f8f0f29ea9f625f75f616075683e72779f. Settings/UI remain uncommitted/preserved, overallH6PARTIAL; no publishing or H7.
L19 — User authorization (verbatim): Sí, autorizo corregir únicamente el resultado incompleto del CLI, agregar la prueba de regresión y retomar la misma revisión nativa, sin ampliar el alcance de H6 ni publicar nada.
L20 — Authorized R4-lost-ack-reported-success correction only: CLI stops claiming when a claimed job has no confirmed SENT/FAILED/RETRY_WAIT outcome, preserves observed JSON counters, prints a fixed sanitized incomplete diagnostic and exits1. Dispatcher/database lifecycle and recovery unchanged. Existing entry exported for direct command-boundary regression. Initial test REDmissingexport (no assertions); unchanged-behavior entry exposure then meaningful RED1failed/8passed (expected exit1, gotunset). GREEN15/15 CLI/dispatcher tests and scopedESLintpass. Successful dispatch still retains prior output and no error. Related help/README updated. Native plan100lines, budget200; rollback boundary CLI and its test/docs only. Risk:item4 (foreground claim ordering after acknowledgement loss). Independent targeted verification and same native validation pending.
L21 — Independent targeted Verify resolved R4 with12actualNode24CLI subprocesses from immutable base/candidate: LOST andsuccess+LOST exit1, accurate counters, noextra claim, contextcloseonce; normal success/empty/confirmedfailure/retry stdout/stderr/exit identical. Noactualnetwork connections. ParentCLI9/9spotcheck and TypeScriptnoEmitpass. Native targeted validator approved same lineage review-aa7910b4557616a0; exact acknowledgement returned gentle-ai.review-acknowledged/v1 actionacknowledged authorityburned, target20815b31ffec7ff8f1c6d8da47afeecc13f22239bffa13b150f69c2659aa7d0a consumedrevision799bcf6d55dda50ba7c55856e3cea1b3d1a7c2be4f83d2ce242fd5831cfb54a9. Two informational advisories remain separate debt: hidden fixture failure cause and DBclaim error classifiedSMTP_UNAVAILABLE. No new corrections authorized/applied. CLI correction complete; overallH6 remains partial pending settings/UI immutable proof, browser andfinalreport. No publication or H7.
L22 — User resume authorization (verbatim): Continuá con lo pendiente de H6.1–H6.3 en el mismo worktree: configuración, interfaz, pruebas reales y Review/Verify independientes. Generá el informe final y detenete para auditoría externa, sin publicar nada.
L23 — Resume map confirms T3 may stand alone with SettingsModule/AppModule and Swagger wiring; frontend remains its own unit. Added missing direct public-contact HTTP coverage and integrated Q06/Q07 policy-change/old-quote/old-order/historical-confirmation/new-retry acceptance coverage to the existing owned business fixture. These pin already implemented draft behavior; earlier T3 RED/GREEN remains documented, no invented RED for coverage-only additions. Parent remains sole Prisma/OpenAPI owner. Risk:items2/3/4 (admin authorization, shared checkout policy/closed DTOs, version CAS).
L24 — T3 immutable Review/Verify blockers consolidated before one correction batch: (1) contract-valid empty contact fields rejected at PATCH, independently reproduced by real Q06/Q07; (2) previously accepted multiline persisted instructions rejected by newly tightened reads. RED4failed/11passed. Corrected required-vs-optional write checks while preserving control validation; persisted instruction reads narrowly permit CR/LF, all other controls and strict new-write checks retained. An initial broader removal proposal was rejected by auto-review before execution; the safer newline-only alternative was used. No historical row rewrite. GREEN18/18 settings/H3HTTP plus backendlintpass before added non-newline-control preservation assertion. Initial immutable fullunit1303pass1skip/build/lint/contracts passed, realH6 had13pass1fail at valid contact save; FAIL evidence retained. Risk:items2/3 (strict writes and legacy checkout compatibility).
L25 — T3 independent targeted recheck resolves both blockers: immutable09edd5768a6ab9dc044c4208021ebe0dc7c7f4b0 treee03f7edd29c56787614444f20e33230727e6d0e9 buildsbase/candidatepass, focused16/16, realH6PG/Mailpit14/14+clean/upgrade/driftPASS, historicalhash5dc6249b23db2621307ec0af2d0470543998ef9fc89e0b91b517fddccee60ed5 unchanged; CR/LF/CRLF publicDTO differentialbaseidentical, strictnewmultilinewrites400. Twoexactownedcontainers removed. Parent16/16spotcheckpass. Nativeassessmenthigh(sharedcheckoutcontract); nativeSTART requests candidate-specific consent, lineage review-b51f7910ee223d5d targetc9e7bd549e79277c7de6617707885a9dc5043154c68e1b78510f2cf9537df795, range c6e2db8..09edd57,11files813lines; frontenddraftsexcludedcanonicalinventory9be689daacf51d81a96527cc4f9526f41ceb576bc8f5ead54a876c13b79e9496. Pendinghumanchoice, no approval claimed.
L26 — User granted T3 native review; exactSTART and fourconcurrent captures on review-b51f7910ee223d5d. Risk/reliability corroborated R1-simulation-flag-bypass/R3-simulation-enable-bypasses-server-flag: a browser enable-simulation write succeeds while serverflagoff if another method remainsvalid. Nativeplan100/200lines captured once. RED1failed/17passed on enabling with flagoff versus flagon. Correction rejects only DEMO_SIMULATION enabledtrue with serverflagoff using frozen400VALIDATION_ERROR, before policy persistence; no historical checkout behavior or schema change. GREEN18/18, scopedlint/TypeScriptpass. RealHTTP regression pins no policy/version change; concurrent CAS test now uses two independently valid transfer edits instead of a newly forbidden simulation write. Risk:item2(server-owned capability guard). Native targeted validation pending.
L27 — T3 native targeted validation approved, exactacknowledgementconfirmed authorityburned lineage review-b51f7910ee223d5d target4cd09c09a7e53d7b6c8fad5c81e6be47ed0ebb5246871b1af7b74c284f69b2ad revision56a1d50269533bbc6f05e6066e5cbad0e0500e3389ffeac329deaa4ebf9894c0. IndependenttargetedVerify18/18settings +15/15realH6 clean/upgrade/driftPASS; twoowncontainersremoved. Advisory duplicated policy domain validators and120vs100label limits remains separate debt, noreopen.
L28 — Frontend T4 existing disjoint draft is now frozen as its own behavior unit: real credentialed H1/CSRF client, versioned settings/method forms with draft-preserving409, safe notification filters/paging/eligible202retry, publicDEMOcontact/manualWhatsApp, routes/navigation. Parent fullfrontend141/141pass. Prior RED/normalization evidence recorded inL9–L12; no new behavior invented. README links local routes. IndependentReview/Verify andrealbrowserproof pending. Risk:items2/3 (adminsession/CSRF integration and shared route/navigation behavior).
L29 — T4 immutable Review/Verify consolidated: automated141/141/lint/build passed, Review reproduced twoUIblockers (out-of-order method GET overwriteslatestselection/draft; editsduringPATCH overwrittenonsuccess). Onebatchcorrection: requestgeneration fences methodload success/error/loadingstate, selection blocked during save, save blocked duringload; editablecontrols/fieldset disabled duringpending save (and methodload), settingsreloadblocked duringsave. RED3failed141passed, GREEN144/144 after awaiting Angular model-control rendering in assertions; scopedfrontendlint passed before finaltest-only await adjustment. Regression covers deferred out-of-orderresponse, methodselectionduringPATCH, DOMdisabledcontrols and reenabling. Risk:item4(asyncUIordering/draftpreservation). Targeted independent recheck/browser/nativepending; nobackend/Prismachanges.
L30 — T4 independent targetedReview/Verify resolve both races on0fb85fb46e67160bcddf294c8c1a694edb1a78e7 tree15a40b6167bb64044574dd07dbea3d2dd5a2cd8d:144/144+lint/buildPASS, deferredprobespass; nofreshsweep. ActualbrowserIAB used becauseChromeconnectorunavailable. RealH1login withfictionaladmin, settingsfee1250/version2, overflow9223372036854775808disablessave, two-tabconflictversion2draft1500preservedaftersecondtab1750/version3, explicitreload1750; methodinstructionkeyboardEnterupdatesversion4. Notification21syntheticrows page2/filterFAILED/retry ->0FAILED, actualCLI20+1SENT andMailpit21, noSENTretrybutton; invalidorderfiltershowsfixedsafealert. PublicDEMOcontact loads noWhatsAppwhenunset. Twelve actualviewportchecks(settings/methods/notifications/contact x360/768/1440) page scrollWidth==innerWidth; table has intentional inner scrolling. KeyboardTabreachesdatefieldwithsolidoutline. Native200%zoomnotproved/debt; nofullWCAGclaim. ScreenshotsandJSONproof /private/tmp/abar-h6-browser-evidence, initialincorrect768/1440capturesfromsecondtabviewport replacedaftercheckinginnerWidth. Businesshashbefore==after a54aaa2253a341ddcba238484c4ef273faa532d155417218cabd6d5ea1440545. FixtureDBcredentials accidentally printed by setupworker were isolatedephemeralonly; do not reuse. Parentretiredexact2ownedprocessesand2labelcheckedcontainers afterbrowser. All16protectedHEAD/index/statusmatchoriginalbaseline,17registeredtrees; filesbytehashalgorithmnotrerun, nofullfilehashclaim. NativeUIconsentpending review-b5d59871b3fdb05a target3be2ea5d027179cbcddf771add4cf3a4950528ebb81474cd90474405e9cca84b,17files1000lines, noauthoritycreatedyet. OverallH6reportpendingnativeUIresult, no publication.
L31 — User granted nativeUIreview on review-b5d59871b3fdb05a; fourexactcapturesconcurrent. R3-retry-refresh-skipped deterministicblocker: competingfilter/page request duringpendingretry can suppress post-success refresh. Nativeplan100/200 captured once. RED1failed144passed. Scopedfix serializeslistload/retrybothdirections, disablesfilters/paging/allretrybuttonswhilebusied, releasesretryinterlockimmediatelybefore mandatoryrefresh. GREEN145/145+lint before finalretrybuttonbindingconsistentwithsameinterlock. Backend/SMTP unchanged; no secondbusinessjob. Risk:item4(asyncretry/listordering). Targetedindependent/nativevalidationpending; browserproofpriorcandidate remains applicable exceptnewinterlockcoveredautomatically.
L32 — NativeUItargetedvalidatorapproved; exactacknowledgementconfirmedauthorityburned review-b5d59871b3fdb05a targetb1c2868edc805ab2f7da39d13fb30617596632dd4cbb2ecadf7257cbdb78e037 revision869d45c0d452b741b7b4efc5ec7d6ec1236763bec9151e5fd59e9c0981bca18c. Independentfinalbackend a356 immutable: build/lint/Prismavalidate/contractsPASS;1310unitPASS1SKIP(H1last-activePGconcurrency envmissing),7/7schema/contract; frontend145/lint/buildPASS. No repeatedDockerafterunchangedbackend. Nativeadvisories recorded asdebt, no automaticfix. SpanishH6-informe generated withQ01–Q16,all12functionalcommit/treeidentities,nativeACKbindings,limits/hoursunknown andPARCIALacademicdictamen.17sanitizedbrowser/JSONevidencefilesplusSHAmanifest persisted docs/evidence/H6. Remainingown6cm3df/EMYQQucontainers(2each) labelcheckedretired; original16worktreesunchanged,17total. Passiveclosurestructuralreadbackvalidateslinks/hash/PNGJSON/commit-treepairs; nofullsuiteafterdocs. Stopforexternalaudit; no push/PR/merge/tags/H7.
L33 — Correction to L32 structural claim: the initial structural command actually FAILED on image signature; the shell did not stop and committed22c76728f0fb9237e71bcc7c20805afcd1290dea treeba5abeb9a831ba579fc341f06e1c95995fffeaf3. File inspection confirmed all14screenshots JPEG despite .png filenames. No source/runtime defect or image-byte modification: rename .jpg, update reportlinks/manifest, disclose initialfailure inreport. Subsequent structural readback PASS validates Q01–Q16/links/17evidenceSHA/JPEGJSON/12exactcommit-treepairs. No new functional suite or review reopening for this passive naming correction.
