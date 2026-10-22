# H6 — Informe para auditoría externa

**Fecha:** 22/10/2026. **Alcance:** H6.1–H6.3, ejecución local académica.
**Dictamen propio: PARCIAL**, con funcionalidad implementada y verificación local satisfactoria, pero con deudas explícitas de evidencia, accesibilidad y mantenimiento. No es certificación de producción ni autorización de publicación. Se detiene el trabajo para auditoría externa.

## 1. Identidad y preservación

| Elemento | Identidad verificada |
|---|---|
| Base H5, main, origin/main y tag anotado h5-approved subyacente | `9588535ebbc1de3758e84377bf7ad0198be4d455` |
| Árbol H5 aprobado | `62cf2ce6e407492e4a186e7af443983904049c58` |
| Rama H6 | `codex/h6-notifications-settings` |
| Worktree H6 | `/Users/agustin/Repos/personal/abar-electricidad-worktrees/h6-notifications-settings` |
| HEAD funcional final evaluado | `a3560e4b18e1271757a93f20a4859ae021617df2` |
| Árbol funcional final evaluado | `0ba49afb979816ea296c784f840c409440d26528` |

El commit posterior de cierre contiene únicamente este informe, evidencias y el registro de tareas. Sus identidades se informan en la entrega del chat; no se inserta un hash autorreferencial dentro del archivo que lo determina. Los resultados funcionales corresponden a los candidatos exactos de este informe, no a una ejecución posterior ficticia.

Se conservaron los 16 worktrees originales y se agregó solamente el worktree H6: 17 registrados. La comparación final de HEAD, hash de índice y salida Git status de los 16 originales no presenta diferencias. No se hizo reset, limpieza, cambio de rama, eliminación ni staging en el checkout original. El prompt no versionado se incorporó selectivamente a H6; el original y su `.review-worktrees/` permanecieron intactos.

Hashes originales de referencia: índice `a4672ce4e4af78116ae4dffabcc060cdd1ef3372996701f17b60c8592ae643a3`; archivos `591397b4213a2eae909709d522e509fa84d327e224a0329360e4d963e67e0951`. El segundo es la captura inicial: no se afirma una recomputación final equivalente del algoritmo de archivos. La prueba final reproducida compara HEAD/índices/status. Evidencia: [preservación](../evidence/H6/preservation-check.json).

No hubo push, PR, merge, tags, acceso remoto, despliegue ni H7. Se mantuvo un único responsable de OpenAPI/Prisma; los verificadores solo generaron el mismo esquema congelado en copias scratch aisladas.

## 2. Qué existía y qué se agregó

H3 ya mantenía CheckoutPolicy, CheckoutQuote y la cotización autoritativa. H4/H5 ya insertaban NotificationJob dentro de transacciones de pedidos/pagos. H5 ya confirmaba el pago manual y descontaba stock una sola vez; esa autoridad no cambió.

H6 agregó:

- Despachador foreground durable: claim por SKIP LOCKED, lease de 60 segundos, fencing por token/versión, recuperación y hasta cinco intentos por ciclo; backoff de 30/120/600/1800 segundos y límite de 20 trabajos por corrida.
- SMTP exclusivamente Mailpit identificado, host 127.0.0.1, destinatarios example.test, remitente fijo y plazo de cinco segundos. Mensajes de texto DEMO, sin notas, domicilio, teléfonos privados ni tokens de acceso. Sin HTML, adjuntos ni destinatarios arbitrarios.
- Estado operativo PENDING/PROCESSING/RETRY_WAIT/SENT/FAILED, contador acumulado y por ciclo, fechas y errores saneados; retry administrativo con CAS sobre el mismo job. El contador por ciclo reinicia; el histórico no.
- Generación transaccional deduplicada ORDER_CANCELLED_ADMIN, sin backfill de correos históricos ficticios.
- Gestión segura de tarifa fija, modalidades, métodos demo y contacto sobre la autoridad existente CheckoutPolicy. CAS serializa cambios de versión; la escritura no puede dejar cero combinaciones válidas ni habilitar simulación desde el navegador cuando el servidor la deshabilita.
- Interfaz real de configuración/métodos/notificaciones/contacto, con H1/CSRF, conflictos que preservan borradores, interlocks asíncronos y navegación existente reutilizada.

### Contrato y migración

OpenAPI 0.9.0 se congeló antes de implementar; se preservaron DTOs cerrados H1–H5. La migración aditiva es `backend/prisma/migrations/20261022000000_h6_notifications_settings/migration.sql`: agrega contacto a CheckoutPolicy y lifecycle/constraints/índices a NotificationJob, sin reescribir migraciones históricas ni payload/destinatario original. Los lectores respetan `enabled` interno sin filtrarlo al DTO público H3.

Rutas: GET/PATCH `/api/v1/admin/settings`; GET/PATCH `/api/v1/admin/payment-methods/{code}`; GET `/api/v1/admin/notifications`; POST `/api/v1/admin/notifications/{id}/retry` (202); GET `/api/v1/public/contact`. DTOs H6 cerrados, `expectedVersion`, códigos fijos y tarifa decimal exacta entre 0 y 9223372036854775807.

Los marcadores `x-abar-*-runtime-stage` del contrato conservan el estado del freeze anterior, incluido `contract-frozen-implementation-pending`; no prueban disponibilidad actual. Esta discrepancia documental queda identificada como deuda, sin alterar el contrato normativo ya revisado para maquillar el cierre. El estado ejecutado real es el de estas evidencias.

Cambios de política afectan cotizaciones nuevas; no reescriben quotes ni pedidos. H4 rechaza un quote obsoleto y aplica política vigente a nuevos reintentos. H5 confirma un intento histórico elegible aunque su método ya no se ofrezca a nuevas compras. Retiro cobra cero. No se agregaron pagos reales, refunds, descuento de stock adicional, dashboard ni reportes H7.

## 3. Matriz H6-Q01–Q16

| Caso | Resultado y evidencia observada |
|---|---|
| Q01 | CUMPLE local: migración limpia y H5 poblado, hash histórico idéntico y drift cero; runner propio en candidatos backend. |
| Q02 | CUMPLE local: CheckoutPolicy único, proyecciones pública/admin comparten fila y versión; no segunda tarifa persistida. |
| Q03 | CUMPLE local: tarifa inicial 0, positiva 750 en HTTP, pickup 0, frontera bigint exacta; UI bloquea máximo+1 y conserva strings fuera del rango seguro de Number. |
| Q04 | CUMPLE local: métodos/modalidades y zero-combination 409; enable-simulation con flag servidor apagado devuelve 400 sin modificar política. |
| Q05 | CUMPLE local: PostgreSQL mismo expectedVersion tiene un ganador; navegador de dos pestañas conserva borrador 1500 frente a versión del servidor con 1750, recarga solo explícita. |
| Q06 | CUMPLE local: quote fresco refleja tarifa/version nuevas; viejo rechazado QUOTE_CHANGED; quote y snapshots de pedidos no reescritos. |
| Q07 | CUMPLE local: retry nuevo con método deshabilitado devuelve METHOD_UNAVAILABLE y hash sin cambios; confirmación H5 histórica conserva importes/items y termina PAID. |
| Q08 | CUMPLE en rutas H6: H1 real, ausente/expirada/revocada 401; password pending/Origin/CSRF 403; no-store y proyecciones saneadas. No sustituye la prueba H1 de concurrencia omitida indicada abajo. |
| Q09 | CUMPLE para eventos create/confirm/READY/cancel y dedupe/rollback cubiertos: create2, confirm2, READY1, cancel2; flujo de dos pedidos recibe9 incluyendo el segundo create2. No se afirma una nueva comprobación browser individual de cada escenario APPROVED/PENDING/REJECTED. |
| Q10 | CUMPLE local: recibos Mailpit reales, example.test/DEMO sin payload privado; SMTP fuera de transacción de negocio; browser retry seguido de CLI produce21 SENT/21 recibos de fixture sintética. |
| Q11 | CUMPLE local: SMTP indisponible finito, FAILED/error seguro, retry CAS y posterior SENT; hash de negocio idéntico. |
| Q12 | CUMPLE local: competencia de dispatchers y recuperación de lease vencido en PostgreSQL real. |
| Q13 | CUMPLE con límite explícito: aceptación SMTP + pérdida de ACK produce posible duplicado (2 jobs/3 mensajes), sin mutar negocio; CLI incompleto ahora exit1 y detiene nuevos claims. No exactly-once. |
| Q14 | CUMPLE local: retry elegible202, repetición/no elegible/SENT409, sin nuevos pedidos/pagos/operaciones de stock; UI no ofrece retry para SENT. |
| Q15 | PARCIAL: Angular→Nest→PostgreSQL→Mailpit real; cuatro pantallas a360/768/1440, teclado/foco/error y conflicto real. Zoom nativo200% no comprobado; no certificación WCAG completa. Interlock final a356 se validó con pruebas/deferred probes, no otra sesión de navegador. |
| Q16 | PARCIAL: regresión backend1310 y frontend145, H5 real15/15 y compatibilidad H3/H4 dirigida; una prueba H1 PostgreSQL de último admin quedó omitida. No se ejecutó un nuevo E2E browser integral de todos los intentos H4 ni CI remota. |

## 4. Comandos y resultados

Node **v24.18.1**, npm **11.16.0**. Se fijó PATH a Node24 también en comandos elevados: la shell elevada inicialmente ofrecía Node26.4.0; no se mezclan esos resultados. Sin nuevas dependencias de SMTP ni cambios de lockfile para el envío.

| Comando / candidato | Resultado observado |
|---|---|
| `npm --prefix backend run build` / a356 | exit0, incluye Prisma generate del esquema congelado |
| `npm --prefix backend run lint` / a356 | exit0 |
| Backend cwd: `node node_modules/jest/bin/jest.js --config jest.config.js --runInBand --verbose` / a356 | exit0;1310PASS,1SKIP;36suites |
| `npm --prefix backend run prisma:validate` / a356 | exit0 |
| `npm --prefix backend run contract:validate` / a356 | exit0; OpenAPI y16ejemplos |
| `node --test backend/scripts/h6-schema.test.mjs scripts/h6-contract.test.mjs` / a356 | exit0;7/7 |
| `node backend/scripts/h6-postgres.mjs` / e151 | exit0;15/15,3suites;clean/upgrade/driftPASS; fixtures nuevas propias |
| `node backend/scripts/h5-postgres.mjs` / dd6823 | exit0;15/15; corrección posterior solo guard H6, sin H5 modificado |
| `npm --prefix frontend run lint` y `run build` / a356 | exit0/0, Verify independiente inmutable |
| `npm --prefix frontend test -- --watch=false` / a356 | exit0;145/145,34archivos |
| CLI real browser fixture `--limit20`, luego `--limit20` / 0fb backend=e151 | exit0/0;20SENT y1SENT,21recibos |
| CLI help / límite inválido, comprobaciones independientes | exit0/2, sin conexiones; pérdida ACK exit1, contexto cierra una vez; resultados normales iguales a base |

SKIP exacto: `admin last-active PostgreSQL concurrency (isolated H1 database only) › serializes concurrent attempts so exactly one of the two active administrators remains active`. No se suministró su entorno H1 aislado; no se presenta como PASS. Los tests H6 de autorización/concurrencia sí usaron PostgreSQL real. No se ejecutaron ni se afirman checks CI remotos.

### Errores iniciales conservados

Se observaron RED/FAIL y luego correcciones: límite bigint19dígitos (max+1); alias% válido rechazado; socketDocker personal fijo; CLI ACK incompleto exit0; contacto opcional vacío400; instrucciones históricas CR/LF503; habilitación de simulación con flagoff; carreras de selección/guardado y refresh tras retry. Las pruebas nuevas observaron RED antes de arreglar la conducta cuando fue aplicable. En el cierre documental se detectó que el navegador había devuelto JPEG aunque se guardó con extensión PNG; se renombraron las capturas sin alterar sus bytes y se regeneró el manifiesto. El primer comando de validación estructural falló antes del commit documental; la shell no cortó ese commit. Se conserva ese hecho y la corrección posterior, sin atribuirle PASS al primer intento. Los errores de runner/configuración de pruebas, tipos ausentes en scratch y espera de rendering Angular se clasificaron sin inventar ejecución de assertions.

El primer full backend de integración tuvo1287PASS/9FAIL/1SKIP, luego se corrigieron fixtures Swagger/login; el candidato settings inicial tuvo1303PASS/1SKIP pero H6 real13PASS/1FAIL por contacto. Esos FAIL no se borran ni se convierten en PASS: las ejecuciones posteriores indicadas arriba son las que cierran los defectos. En una corrección propuesta, auto-review rechazó eliminar todos los controles de instrucciones; no se ejecutó esa propuesta y se usó la alternativa estrecha CR/LF. Los warnings AJV heredados de email y el aviso informativo de nueva versión Prisma no motivaron ampliaciones de alcance.

## 5. Evidencia PostgreSQL, Mailpit y navegador

- Upgrade poblado antes/después (recheck09edd): `5dc6249b23db2621307ec0af2d0470543998ef9fc89e0b91b517fddccee60ed5`.
- Pérdida ACK SMTP,2jobs/3mensajes, hash negocio idéntico: `a84ca6e0d15b69adf8b2c1e4c45ec33806599c565d520a9e3695c5bd5633ab59`.
- CLI independiente de primera unidad, hash negocio idéntico: `d89a76b100142a5fe1cd72529ff6de458b7516d954f8d296d3fcb00b2f809b18`.
- Browser fixture sintética21jobs: hash antes/después `a54aaa2253a341ddcba238484c4ef273faa532d155417218cabd6d5ea1440545`; [JSON](../evidence/H6/dispatch-proof.json).
- [Mediciones viewport](../evidence/H6/viewport-proof.json):12mediciones, ancho efectivo confirmado y scrollWidth de página igual a360/768/1440. La tabla tiene scroll interno intencional.
- Capturas: [configuración móvil](../evidence/H6/settings-360.jpg), [conflicto](../evidence/H6/settings-conflict-360.jpg), [métodos escritorio](../evidence/H6/methods-1440.jpg), [notificaciones SENT](../evidence/H6/notifications-sent-1440.jpg), [contacto público](../evidence/H6/contact-1440.jpg). Todas las capturas/JSON tienen [SHA256](../evidence/H6/sha256.json).

El navegador disponible fue IAB; Chrome no estaba disponible como conector. Se comprobó login H1 real, fee/version, overflow deshabilitando guardado, conflicto entre pestañas con draft preservado, guardado de método por Enter, paginación, FAILED→retry→SENT, ausencia de retry para SENT, error seguro por filtro inválido y contacto público DEMO sin WhatsApp cuando no configurado. Tab alcanzó el campo fecha con contorno visible. No se abrieron mailto/WhatsApp ni se enviaron comunicaciones externas.

Los21jobs del browser son fixtures sintéticas para UI/paginación, no21 eventos comerciales reales. El conteo de eventos de negocio proviene de la suite HTTP independiente. El último interlock de notificaciones se comprobó mediante DOM/deferred tests y Verify inmutable; el recorrido visual se hizo en0fb, sin afirmar un nuevo browser pass tras a356.

Todas las bases/containers creadas para pruebas fueron propias, etiquetadas, loopback y efímeras, con imágenes locales PostgreSQL17.11-bookworm/Mailpit1.31.3 y pull=never. No se tocaron servicios ajenos. Un worker imprimió accidentalmente URLs de la fixture local en un resultado de herramienta; no se versionaron ni enviaron fuera, esas credenciales efímeras no se reutilizan y la fixture browser se retiró. Se eliminaron solo containers tras verificar ID/owner/tmpfs. Se detuvieron los dos procesos propios del browser y se retiraron también las fixtures persistentes propias anteriores.

## 6. Review, Verify y revisión nativa

Review independiente y Verify fueron actores separados del implementador y del proveedor nativo. Revisaron candidatos inmutables; las verificaciones usaron archivos temporales fuera del worktree. Cada reporte consolidó blockers antes de una tanda acotada; los rechecks independientes se limitaron a los hallazgos, sin loops de revisión ilimitados.

| Unidad | Review / Verify independiente | Nativo real |
|---|---|---|
| Contrato f37 | frontera exacta e interpretación de contrato verificadas | `review-dc6fdf239d5151fa`: APPROVED; ACK confirmado, autoridad burned |
| Notificaciones c6 | alias% resuelto, PG/Mailpit/H5 y CLI inmutables verificados | `review-aa7910b4557616a0`: APPROVED; ACK confirmado, autoridad burned; precedida por recuperación nativa explícita de `review-d228de13d61819f2` al agregar paths de la corrección del runner |
| Configuración e151 | contacto/multilínea resueltos; guard simulación y15PG/MailpitPASS | `review-b51f7910ee223d5d`: APPROVED; ACK confirmado, autoridad burned |
| Interfaz a356 | carreras resueltas;145/lint/build/deferredprobesPASS | `review-b5d59871b3fdb05a`: APPROVED; ACK confirmado, autoridad burned |

Identidades terminales confirmadas por `gentle-ai.review-acknowledged/v1`:

| Unidad | Target reconocido | Revisión consumida |
|---|---|---|
| Contrato | `sha256:f255b44f6383243f3d8033d26d137d7371b06d59b90a6728135afc490ae9aab6` | `sha256:d1582fd75b1da1cf26c955450709d20e0aa62f8a6e2e544204411eaed8573816` |
| Notificaciones | `sha256:20815b31ffec7ff8f1c6d8da47afeecc13f22239bffa13b150f69c2659aa7d0a` | `sha256:799bcf6d55dda50ba7c55856e3cea1b3d1a7c2be4f83d2ce242fd5831cfb54a9` |
| Configuración | `sha256:4cd09c09a7e53d7b6c8fad5c81e6be47ed0ebb5246871b1af7b74c284f69b2ad` | `sha256:56a1d50269533bbc6f05e6066e5cbad0e0500e3389ffeac329deaa4ebf9894c0` |
| Interfaz | `sha256:b1c2868edc805ab2f7da39d13fb30617596632dd4cbb2ecadf7257cbdb78e037` | `sha256:869d45c0d452b741b7b4efc5ec7d6ec1236763bec9151e5fd59e9c0981bca18c` |

Las cuatro lentes pertinentes se lanzaron concurrentemente en orden del proveedor. Las correcciones y validadores siguieron sus bindings exactos. La excepción incompleta de H5 no se heredó. Una aprobación nativa no autorizó publicación ni habilita producción.

## 7. Commits y árboles exactos

| Commit | Árbol | Unidad |
|---|---|---|
| `63409d337d83f4a2555dd9d84abb1ce53e57a93a` | `897035d89f945ef0c75e30e5af2573af28e7c45f` | feat(h6): freeze local notification and settings contract |
| `f37cbf20c2b39d7e4994c03c552472ae209b73e1` | `7a3b80117813aeaef0d6c9e15c9cde6d0df523aa` | fix(h6): enforce exact signed bigint fee boundary |
| `da5d3d98a3e10393877530abc926bb0644e5cdbe` | `8a0554e947c6f1baf6e3c456d333d1b738d2f423` | feat(h6): dispatch durable local notification jobs |
| `d9c08fabe5b02e5f718b47a4fbfd51cb9681e53b` | `57e38d21115fae916e539a003c2aaf8dbe9e9368` | fix(h6): preserve accepted local notification aliases |
| `71b82939a549b14f3c786b8b702f4c092112f858` | `021000f8f0f29ea9f625f75f616075683e72779f` | fix(h6): resolve portable local Docker endpoints |
| `c6e2db89f2f9d5f857edf3e85545b3119d69575f` | `1f50da202d4f3ea1c5cab93388a2b91e840a6621` | fix(h6): report incomplete notification dispatch |
| `dd6823f7aff7894c23d07ffda8f26a15d1b460fc` | `4214a6df82dbe573b80e58c34c4ee14d1e786f15` | feat(h6): manage versioned commercial settings |
| `09edd5768a6ab9dc044c4208021ebe0dc7c7f4b0` | `e03f7edd29c56787614444f20e33230727e6d0e9` | fix(h6): preserve valid contact and historical instructions |
| `e151ee70888d6e8c43c1a68948aeab424f0ffe55` | `c045e8237cc80d1f7b32ca0b880126820fdc52e7` | fix(h6): enforce server simulation capability on settings |
| `b70067a156926dec7146a49bfae0bff6a3327c75` | `83eab1a65f67d2b92c70e105dfd4e614acb1cf62` | feat(h6): add commercial settings and notification interfaces |
| `0fb85fb46e67160bcddf294c8c1a694edb1a78e7` | `15a40b6167bb64044574dd07dbea3d2dd5a2cd8d` | fix(h6): preserve commercial drafts across async requests |
| `a3560e4b18e1271757a93f20a4859ae021617df2` | `0ba49afb979816ea296c784f840c409440d26528` | fix(h6): serialize notification retry refreshes |

## 8. Control del cierre documental

El cierre documental inicial fue `22c76728f0fb9237e71bcc7c20805afcd1290dea`, árbol `ba5abeb9a831ba579fc341f06e1c95995fffeaf3`. La reparación de extensiones fue `3e51f867e8ec6aa3d77f53b92355b73438cdb6b8`, árbol `9a8eba8dee1ec86ae1ac2783209fb2ca635f0839`. La identidad del commit que incorpora esta constancia adicional se entrega en el chat, por el límite de autorreferencia explicado arriba.

La evaluación nativa del delta exclusivamente documental/evidencias desde a356 devolvió `risk: medium`, `review_due: false`, `review_due_reason: under_budget` (275líneas); el JSON de prueba se clasificó heurísticamente como configuración. No se inició otra revisión ni se atribuye aprobación nativa a ese delta: las cuatro aprobaciones terminales corresponden a las unidades funcionales anteriores.

El `git diff --check` de toda la rama señaló tres espacios finales en las líneas3–5 de `docs/milestones/H6-prompt.md`, copiados literalmente del prompt original (saltos de línea Markdown). Se conservan para no reescribir la fuente aprobada. La comprobación excluyendo ese único archivo pasa; el control completo no se informa como PASS. La comparación final de16HEAD/índices/status siguió sin diferencias y main/origin/main/tag conservaron la base.

## 9. Deuda, límites y horas

1. Zoom nativo200%, auditoría WCAG integral y test H1 PostgreSQL omitido; tampoco se afirma nuevo browser E2E completo para cada escenario H4 o CI remoto.
2. SMTP puede duplicar tras aceptación/pérdida ACK. La lease/at-least-once y exit1 no lo convierten en exactly-once.
3. Advertencias nativas no bloqueantes: causa de errores de fixture oculta; error de claimBD clasificado como SMTP_UNAVAILABLE; duplicación de modelo/validadores de política y límites label120/100; duplicación del límite de tarifa; labels de kind no exhaustivos por tipo; reload concurrente de settings sin fencing. Se registran, no se corrigen fuera de la tanda autorizada ni reabren reviews consumidos.
4. Marcadores runtime-stage de freeze requieren reconciliación documental futura; no se usan como proof de ejecución. Horarios/contacto/P05/P06/P07 siguen sin aprobación comercial real.
5. La comparación final de preservación no repitió el hash integral inicial de archivos. Se conservan baseline y prueba HEAD/índice/status; no se atribuye una evidencia distinta de la observada.
6. **Horas efectivamente trabajadas: no disponibles en un registro verificable de esta sesión.** No se inventa un número ni se convierte tiempo de comandos/estimaciones en horas realizadas. El total comprometido PS2 de200horas no significa200horas ejecutadas. Requiere conciliación humana del registro de horas.

**Cierre:** funcionalidades H6.1–H6.3 implementadas y verificadas localmente, con resultados nativos terminales reconocidos y deudas anteriores explícitas. Dictamen global PARCIAL para auditoría académica, no producción. No quedan acciones de publicación autorizadas. Se detiene para auditoría externa en este chat.
