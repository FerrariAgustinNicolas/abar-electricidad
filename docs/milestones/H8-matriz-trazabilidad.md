# H8 — Matriz de trazabilidad

Fuente académica disponible: [plan §15](../plan.md#15-estrategia-de-pruebas), sin aval institucional inferido. Texto de escenarios conservado. Corte correctivo: [cierre](H8-cierre-validacion.md), [manifest nuevo](../evidence/h8-corrective/manifest.json), [logs por hash](../evidence/h8-corrective/checks.json). PASS EJECUTADO H8 = ejecución focalizada de este cierre; PASS HISTÓRICO vigente = evidencia previa exacta de51fd7e898a650249cd616d69b6dbffe6732e6c0f/tree2659c64056f2c5a3bd2876daf85d4979af9cb763, sin cambios productivos posteriores. RecuperaciónH2 y subcasos faltantes nuevos se identifican por separado en las filasQ05/Q06/Q23 y el complemento; no se asignan a51fd7e8 las ejecuciones históricasH2. Los títulos H5-Q internos no son los Q académicos. PARCIAL no es PASS integral; NOT RUN indica no ejecutado en este cierre. Las suites históricas no se repitieron indiscriminadamente.

| ID | Escenario original | Evidencia EJECUTADO H8 / límite | Criterio |
|---|---|---|---|
| Q01 | Login correcto/incorrecto, logout, expiración y revocación. | Login/logout del recorrido crítico; no se repitió toda expiración/revocación. | PARCIAL |
| Q02 | CSRF y cuenta con cambio de contraseña obligatorio. | Frontend completo161PASS incluye errorBlob/cambio obligatorio; no nueva auditoría CSRF integral. | PARCIAL |
| Q03 | Producto inactivo/categoría restringida y stock cero. | Sin nueva prueba focalizada de las tres restricciones; suites previas no equivalen a escenario completo. | PARCIAL |
| Q04 | Precio y cantidad por UNIT/METER/ROLL. | UNIT real1×15000; METER/ROLL solo cobertura previa, no recorrido nuevo completo. | PARCIAL |
| Q05 | Apertura normal y apertura superior al saldo cerrado. | H2 ejecutado83f38abacb260fe37b7c40fb4763ab30af17bb28/tree14b1541ad4c49b14b69e4bfc1e66f50ce62947b7; reporte b7efb3bf/tree3d352cb9; apertura100m + rollback sin saldo,13PASS4SKIP. [Identidades/pruebas/límites](../evidence/h8-complementary/history-q05-q06-q23.json). Mutaciones adjust/openRolls sin cambios desde H2; no corrida nuevaQ05. | PASS HISTÓRICO vigente |
| Q06 | Repetir apertura/ajuste con misma clave. | Ajuste: prueba históricaH2 same actor/key/body, reporte13PASS4SKIP. Apertura faltante nueva: mismoactor/clave/cuerpo/versionesviejas, replayexacto;1operación/2entradas y hashigual. [Historia](../evidence/h8-complementary/history-q05-q06-q23.json) / [nuevo](../evidence/h8-complementary/public-aggregate.json). | PASS HISTÓRICO vigente (ajuste); PASS EJECUTADO H8 (apertura) |
| Q07 | Carrito con precio adulterado o persistencia vieja. | Carrito/checkout real; adulteración/persistencia vieja no reejecutadas focalmente. | PARCIAL |
| Q08 | Cambio de precio/tarifa después de presupuestar. | H4 PG12PASS, test rejects expired…policy-changed, price-changed…quotes; cobertura parcial de tarifa/aceptación posterior. | PARCIAL |
| Q09 | Doble click y timeout al crear pedido. | H4 PG: atomically creates…exact encrypted replay; serializes concurrent…creates, sin alterar replay de creación. | PASS EJECUTADO H8 |
| Q10 | Crear pedido impago. | Node24 UI+PG: RECEIVED/PENDING,stock50 y ledger0 tras creación. facts.json. | PASS EJECUTADO H8 |
| Q11 | Simulador APPROVED/PENDING/REJECTED. | H4 PG: keeps simulated APPROVED…supports rejection/retry; UI APPROVED sigue PENDING/stock50. | PASS EJECUTADO H8 |
| Q12 | Reintento y cambio de método. | H4 PG12 +unit8: carrera misma clave, cambio método,201exacto/409/403/503 y hashes. Native permanece correction_required. | PASS EJECUTADO H8 |
| Q13 | Confirmación manual válida. | UI Node24 confirmación completa: PAID/PREPARING,stock49,ledger1,15000centavos. | PASS EJECUTADO H8 |
| Q14 | Confirmación repetida con misma/otra clave. | H5-Q06 same key replays…changed body/new key/other actor, final-h5.log15PASS en51fd7e8; checks.json histórico. | PASS HISTÓRICO vigente |
| Q15 | Dos confirmaciones compiten por la última existencia. | H5-Q07 two admins competing…PostgreSQL locks, final-h5.log15PASS en51fd7e8; no nueva carrera aquí. | PASS HISTÓRICO vigente |
| Q16 | Pedido de varias presentaciones con una insuficiente. | H5-Q04/Q05…rolls back insufficient multi-line stock, final-h5.log15PASS en51fd7e8. | PASS HISTÓRICO vigente |
| Q17 | Apertura/ajuste concurrente con confirmación. | H5-Q08 confirmation races…adjustment/opening, final-h5.log15PASS en51fd7e8. | PASS HISTÓRICO vigente |
| Q18 | Entrega de pedido ya pagado. | UI Node24 READY→DELIVERED; stock49/ledger1 sin segundo débito, facts.json. | PASS EJECUTADO H8 |
| Q19 | Cancelación impaga y cancelación pagada no habilitada. | H5-Q10/Q11/Q12 unpaid cancellation…paid transitions cannot cancel, final-h5.log15PASS en51fd7e8. | PASS HISTÓRICO vigente |
| Q20 | Cambiar nombre/precio/tarifa tras crear pedido. | H5-Q02/Q03 conserva precio histórico; no nueva verificación completa de nombre/tarifa. | PARCIAL |
| Q21 | Consulta por número/contacto incorrectos. | H4 PG uses minimum lookup output, generic contact errors…;12PASS en pruebas correctivas. | PASS EJECUTADO H8 |
| Q22 | Token de un pedido usado con otro. | HTTP token cruzado403 sin currentAttempt, hash igual; token vencido403 no cancela pedido. | PASS EJECUTADO H8 |
| Q23 | Subida de archivo inválido, grande o con nombre malicioso. | Nueva ruta multipart real: PNGinválido400INVALID_IMAGE;5242881bytes413IMAGE_TOO_LARGE; nombresPOSIX/Windows201 conUUID.pngopacos/sinescape. HashesDB/archivosiguales en rechazos. [Probes](../evidence/h8-complementary/public-rejection-aggregate.json). HistoriaPNG/size separada. | PASS EJECUTADO H8 |
| Q24 | SMTP caído al crear/confirmar pedido. | H6 previo15PASS incluye falloSMTP; no corteSMTP nuevo ni reasignación a freshPASS. | PARCIAL |
| Q25 | Emails al comprador y al administrador. | Node24 dispatch5SENT/Mailpit5recibidos, comprador y administrador .test; hash negocio igual. | PASS EJECUTADO H8 |
| Q26 | Reportes en período vacío y período conocido. | Período conocido nuevo1/15000/0, UI/API/CSV conciliados; vacío solo suite previaH7, cobertura compuesta aún parcial. | PARCIAL |
| Q27 | Metro/rollo en productos más vendidos. | UNIT nuevo; no repetir indebidamente METER/ROLL de suite previa como ejecución nueva. | PARCIAL |
| Q28 | Pantallas en 360/768/1440, teclado y zoom. | Teclado crítico y foco visible nuevos; reflow360/768/1440 histórico Node26; zoom nativo200% NOT RUN. | PARCIAL |
| Q29 | Instalación desde clone/base vacía. | Instalación limpia vigente; bootstrapH1 h1_local_<16hex>, seedH2 h2_seed/h2_catalog y fixtureH6 tienen targets disjuntos. Ruta manual por catálogoautenticado factible NOT RUN; faltan ownership/migraciones/runbook/ejecución. [Manual](../manual-instalacion.md#q29--evaluación-complementaria-no-procedimiento-validado). | PARCIAL |
| Q30 | Contrato final vs endpoints/mocks. | Contrato41PASS/LIVE56/56 del corte previo; no nueva comparaciónsemántica global tras tests-only. | PARCIAL |

Rutas/archivos: Q01–02 `backend/src/auth/`, `backend/test/admin-users-concurrency.e2e-spec.ts`; Q03–06/Q23 `backend/src/catalog/`, `backend/src/stock/`; Q07–08 `backend/src/checkout/`; Q09–12/Q21–22 `backend/src/orders/orders.service.ts`, `backend/test/h4-orders.e2e-spec.ts`; Q13–20 `backend/src/orders/admin-orders.service.ts`, `backend/test/h5-orders.e2e-spec.ts`; Q24–25 `backend/src/notifications/`, tests H6; Q26–27 `backend/src/reports/`, tests H7; Q28 `frontend/src/app/features/`; Q29 `compose.yaml`, ocho migraciones y lockfiles; Q30 `contracts/openapi.yaml`, validadores `scripts/*contract*`. Todos relativos a la raíz del candidato indicado en el informe.

Manuales y arquitectura: [instalación](../manual-instalacion.md), [administrador](../manual-administrador.md), [cliente](../manual-cliente.md), [modelo](../arquitectura-h8.md). PS2/200h y P10: [borrador](H8-cierre-academico-borrador.md), PENDIENTE DE VALIDACIÓN humana. No se dispone aquí de horas/firmas verificadas ni se inventan fuentes académicas.
