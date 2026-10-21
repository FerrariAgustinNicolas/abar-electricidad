# ABAR Electricidad — H5 · Confirmación manual de pagos y gestión de pedidos

**Plan de referencia:** `docs/plan.md`, especialmente §§ 2, 7.1–7.5, 8, 9.6, 10.7–10.10, 11, 14–15, 17 y 18 (H5.1–H5.3).  
**Hito autorizado:** H5.1, H5.2 y H5.3 exclusivamente.  
**Informe de cierre solicitado:** `docs/milestones/H5-informe.md`.  
**Fecha de decisiones P01–P03:** 20/10/2026, para la versión académica.  
**Estado al redactar este prompt:** H0–H4 aprobados e integrados; H5 aún no iniciado. **No hay autorización para publicar o integrar H5 sin nueva auditoría externa.**

## 1. Contexto y puerta de entrada

Base aprobada y contrastada en GitHub:

- Repositorio: `FerrariAgustinNicolas/abar-electricidad`.
- PR #50 integrado mediante merge sin reescritura.
- `main` / `origin/main` esperados: `e435c222d4c7245faad0a125c0ff6438e05425c3`.
- Árbol aprobado: `eadf133c62f8dac8846b11778d4a7a103f6114c4`.
- Tag anotado `h4-approved`, apuntando al merge anterior.
- H4 incluye creación de pedidos, snapshots, intentos simulados, consulta pública protegida, demanda impaga y trabajos de notificación pendientes; **no** implementa confirmaciones manuales, débito de stock ni administración completa de pedidos.
- Review nativo del runtime H4 terminó bloqueado por `lens_context_budget_exceeded`, **sin reviewer ni ACK de runtime**. La auditoría externa aprobó integrar H4 **solo con esa excepción académica**. No heredarla como permiso genérico para H5 ni atribuir una aprobación nativa retroactiva.

Antes de escribir código:

1. Verificá raíz, origin, `main`, `origin/main`, tag, HEAD, índice, árbol, ramas y worktrees. Al inicio había **15 worktrees**; preservalos, junto con sus ramas, modificaciones y archivos no versionados. Si las referencias no coinciden, detenete antes de derivar H5.
2. Leé completos `docs/plan.md`, `README.md`, `docs/milestones/H4-prompt.md`, `H4-informe.md`, `H4-cierre-validacion.md`, `docs/decisions/H4-orders-payments.md`, los documentos contractuales H2/H3, `docs/decisions/H1-auth.md`, `docs/figma-map.md`, `contracts/openapi.yaml`, `contracts/CHANGELOG.md`, `backend/prisma/schema.prisma` y las implementaciones vigentes de pedidos, intentos, stock, autenticación y notificaciones. Contrastá la realidad del código, no solo las proyecciones del plan.
3. Creá **una nueva rama y worktree H5 desde `main` aprobado**, por ejemplo `codex/h5-manual-confirmation-orders`. Nunca cambies de rama el checkout original ni mezcles su WIP. Si este prompt fue copiado como archivo no versionado al original, incorporalo **selectivamente** a la rama H5; no uses `git add -A` sobre todo el árbol ni toques archivos ajenos.
4. Registrá el preflight y la integridad del WIP protegido. Si aparece una discrepancia real respecto de H4, describila antes de programar.
5. Dejá constancia de P01–P03 en la documentación de decisión de H5 y del contexto de ejecución, sin modificar retrospectivamente los informes históricos H0–H4.

## 2. Alcance funcional y decisiones comerciales vigentes

### P01 — Confirmada expresamente para la versión académica

- **Pedido sin pago confirmado:** se puede cancelar, con motivo obligatorio y registro de actor/fecha/historial. Su cancelación **no** toca ningún saldo, porque el impago nunca reservó ni descontó stock; desaparece de la demanda impaga informativa.
- **Pedido con pago confirmado:** la cancelación **está prohibida** en la API y la UI administrativa, incluso si aún no se preparó o entregó. No permitirlo por una ruta alternativa ni mediante un cambio genérico de estado.
- **Fuera del alcance:** devolución automática de dinero, reintegro de stock de pedidos pagados, notas de crédito, reversión de cobros, descuentos negativos compensatorios o sistemas de devolución. Estos casos requieren gestión manual fuera del sistema y una decisión futura.

### P02/P03 — Confirmadas en H4, sin cambios

- El pedido impago **no tiene expiración comercial automática** y sus ítems, cantidades, precios y tarifa de entrega son snapshots inmutables. El TTL técnico del presupuesto H3 es independiente y no se usa para invalidar un pedido ya creado.
- Datos del comprador: nombre, apellido, email y teléfono obligatorios; dirección y localidad para entrega coordinada, instrucciones opcionales; versión de términos demostrativa explícita. H5 no rediseña el formulario de comprador.

### C03, C06, C07 y reglas transversales

- `UNIT`, `METER` y `ROLL` tienen **saldos independientes**; ROLL significa rollo cerrado. No abrir rollos automáticamente ni convertir metros en rollos durante la confirmación.
- Crear pedido, presupuestar, aprobar simulación, reintentar o cancelar impago **no** reserva ni descuenta stock.
- **Única transición autorizada para descontar existencias:** confirmación **manual administrativa** del pago completo, validada y transaccional en PostgreSQL. Cada línea/presentación se descuenta exactamente una vez.
- `DEMO_SIMULATION` con resultado `APPROVED` **no** establece estado comercial `PAID` automáticamente. Un intento `REJECTED` o `PENDING` de simulación no es confirmable como aprobado; métodos manuales demo pueden confirmarse tras validación explícita del operador.
- El sistema demuestra un **flujo de pagos simulado**, no cobro real, conciliación bancaria ni operación lista para producción.

## 3. Contrato OpenAPI, decisiones y evolución del esquema — antes de paralelizar

La autoridad normativa será **una sola**: `contracts/openapi.yaml`. Prepará primero el contrato aditivo H5, su CHANGELOG, ejemplos saneados, pruebas estáticas y `docs/decisions/H5-manual-confirmation.md`. No permitas que frontend y backend congelen DTO distintos o modifiquen OpenAPI en paralelo.

- Partí de la versión **0.7.0** / H4. Definí la nueva versión y el marcador H5, conservando semánticamente rutas, DTO, garantías y seguridad H1–H4. Las operaciones H5 no pueden figurar como existentes antes de implementarse; mantené metadatos históricos de compatibilidad con atribución correcta.
- Congelá DTOs cerrados para `AdminOrderList`, `AdminOrderDetail`, `OrderHistory`, `OrderNote`, `PaymentConfirmationRequest/Response`, `OrderStatusRequest`, `CancelOrderRequest`, `allowedActions`, vistas actualizadas de movimientos y estados públicos. Importes `{amountMinor: string, currency:'ARS'}`, basados en `bigint` y snapshots del pedido, nunca en precios actuales enviados desde Angular.
- Añadí, según el contrato congelado, `GET /api/v1/admin/orders`, `GET /api/v1/admin/orders/{id}`, `POST /api/v1/admin/orders/{id}/payment-confirmation`, `PATCH /api/v1/admin/orders/{id}/status`, `POST /api/v1/admin/orders/{id}/cancel`, `POST /api/v1/admin/orders/{id}/notes` y `GET /api/v1/admin/orders/{id}/history`. La autorización real siempre la aplica NestJS, no el guard Angular.
- Publicá claramente errores seguros: 400 validación, 401 sesión vencida, 403 Origin/CSRF/permisos, 404 recurso inexistente, 409 para monto incorrecto, intento inválido/obsoleto, estado incorrecto, pago ya confirmado, stock insuficiente, versión vencida y conflictos de idempotencia; 503 operativo cuando aplique. No exponer cantidades privadas de stock, tokens, credenciales ni información de pago sensible en errores públicos.
- Definí explícitamente qué versión controla `expectedVersion` en cada mutación y cómo la incrementa una operación; no asumir que H4 ya tiene `Payment.version`, porque su modelo actual contiene `Order.version` pero no versión del pago.
- La API pública de H4 debe seguir retornando estados coherentes después de una confirmación/cancelación/entrega, sin ampliar sus datos personales, permisos ni acceso por token. `OrderLookupResponse`, `PublicOrderView` y acciones disponibles requieren revisión/adición compatible.
- En `StockRow` administrativo, conservar `requestedUnpaidQuantity` e informar, si corresponde, cantidad pagada pendiente de entrega **por presentación**, sin sumar unidades y metros. No poner saldos exactos en API pública.

**Evolución aditiva real:** el esquema H4 tiene `H4OrderStatus` limitado a `RECEIVED`, `H4PaymentStatus` a `PENDING`/`REJECTED`, `H4IdempotencyKind` a `CREATE_ORDER`/`PAYMENT_ATTEMPT`, `H4NotificationKind` a los eventos de pedido creado y `StockOperationType` a `ADJUSTMENT`/`ROLL_OPENING`. H5 debe ampliar de forma versionada esos tipos y las restricciones SQL de la base existente. No recrear tablas, perder registros históricos ni editar migraciones ya aplicadas. Crear una migración H5 nueva y probarla tanto desde una BD limpia como actualizando H4 con pedidos e intentos poblados.

Proponé nombres definitivos de enums y claves sin inventar una segunda fuente de verdad. Para el movimiento comercial, utilizar un tipo inequívoco como `PAYMENT_CONFIRMATION` que quede separado de apertura y ajuste. Vincular inequívocamente el movimiento al `paymentId`/`orderId` y reforzar en BD la **unicidad de descuento por pago**, además de la clave idempotente; un mismo pago no puede deducirse dos veces usando otro administrador, otra clave o una carrera.

## 4. H5.1 — Confirmación manual atómica y única

### Elegibilidad y validaciones

La operación de confirmación administrativa debe:

1. Exigir sesión H1 válida, administrador activo, sin contraseña pendiente de cambio, protección Origin/CSRF y `Idempotency-Key` conforme al contrato. **Revalidar la autoridad dentro de la transacción** antes del cambio de negocio. Un token público de consulta del pedido no habilita la operación.
2. Identificar el pedido y el pago correspondientes a un único intento **actual**. Rechazar IDs de intentos históricos, rechazados, invalidados o ajenos al pago. Permitir únicamente intento manual pendiente (`DEMO_PAY_ON_PICKUP` o `DEMO_TRANSFER`, con verificación humana) o intento `DEMO_SIMULATION` efectivamente `APPROVED` como demostración pendiente de confirmación manual.
3. Validar estado `RECEIVED`, pago todavía no `PAID`, `expectedVersion` vigente y monto confirmado **exactamente igual** al `totalMinor` congelado (incluye tarifa de entrega) y `Payment.amountMinor`. Sin pagos parciales, importes enviados por frontend como autoridad, float ni recálculo con precios actuales.
4. Leer `OrderItem` históricos, preservar el snapshot comercial, agregar cantidades de un mismo `presentationId` si hubiera duplicación y verificar que cada presentación disponga de saldo suficiente. UNIT/METER/ROLL son distintos aunque pertenezcan al mismo producto. Una presentación ROLL se debita como **un rollo cerrado**, no como metros.
5. Si cambia un producto, precio o tarifa **después** de crear el pedido, no reescribir su valor histórico ni cobrar otra cifra silenciosamente. Comprobar que existe saldo real para la presentación pedida; documentar cualquier política de bloqueo adicional por cambio posterior del catálogo antes de imponerla como regla comercial nueva.

### Una sola transacción PostgreSQL

- Orden de bloqueo consistente: pedido, pago/intento vigente y después presentaciones/saldos en **orden determinista de ID**, compatible con H2 (ajustes y aperturas) y H4 (reintentos sobre pedido). Revalidar estados, autorización, monto y saldo bajo los bloqueos. No confiar en validaciones hechas solo antes de iniciar la transacción.
- Registrar todos los débitos agregados de `StockBalance`, incrementos de versión y un único `StockOperation` de confirmación, con una entrada por presentación y audit trail con actor/fecha/pedido/pago. Respetar constraints de cantidad no negativa, versiones y claves foráneas.
- Actualizar `Payment.status` a `PAID`, fecha y administrador de confirmación; reflejar el avance del pedido de `RECEIVED` a `PREPARING` según el flujo previsto; versionarlo y añadir `OrderEvent` inmutable.
- Crear los `NotificationJob` de pago confirmado en el **mismo commit** con deduplicación, sin enviar SMTP dentro de la transacción. H6 implementará el despacho y su operación completa.
- **O confirma todo o no confirma nada**: si falta una presentación, falla una escritura, la auditoría o un job, no cambia saldo alguno, no existe confirmación comercial parcial, ni queda `PAID` sin movimientos.
- No introducir un endpoint de escritura libre de `Payment.status` o `StockBalance`; la operación de confirmación es el único caso de uso autorizado. Evitar transacciones separadas entre módulos y reintentos infinitos. Documentar aislamiento/transacciones elegidos y por qué las carreras reales están cubiertas.

### Idempotencia y carreras

- Misma clave, mismo cuerpo normalizado y mismo ámbito: devolver **la respuesta original** sin aplicar nuevos débitos, aunque las versiones hayan cambiado desde el commit. Misma clave con distinto cuerpo: 409.
- Diferente clave o diferente administrador, mismo pago ya confirmado: resultado coherente **sin otro descuento** (conflicto salvo política explícita de lectura). Reforzar la protección por identidad del pago en BD; no depender exclusivamente del idempotency key de actor.
- Reintento de pago H4 concurrente con confirmación H5: no crear un intento nuevo después de `PAID`; el intento que se confirma debe seguir siendo el vigente en el instante de commit. Un replay legítimo histórico no puede modificar el puntero vigente ni revertir el pago.
- Confirmaciones concurrentes de dos pedidos **que compiten por el último saldo**: solo puede confirmar la combinación cubierta por existencias; el perdedor conserva su pedido sin cobro confirmado, sin débito parcial, y recibe conflicto operativo entendible.
- Confirmación simultánea con ajuste negativo, apertura de rollos o cambio de presentación: transacciones compatibles, sin saldo negativo, deadlock no tratado, duplicación de rollos ni conversión ficticia.

## 5. H5.2 — Administración de pedidos y operación

Desarrollá pantallas reales `/admin/pedidos` y `/admin/pedidos/:id`, siguiendo las referencias Figma 9:637 y 9:770 ya mapeadas; no afirmar una inspección Figma nueva salvo que ocurra. Incorporar navegación desde el layout administrativo sin sustituir módulos H1–H4.

- Listado paginado, filtros básicos de estado del pedido, estado de pago, modalidad y fecha, búsqueda segura por número y datos autorizados. Estados de carga, vacío, error, reintento, paginación y detalle navegable.
- Detalle administrativo con número, fecha, ítems y precios congelados, entrega, comprador, estado del pedido/pago **separados**, intento vigente, historial y notas internas. Mostrar claramente intento `APPROVED` pero pago `PENDING`; no llamar «Pagado» a una aprobación simulada.
- Acción de confirmación **explícita y con doble verificación humana** de importe/intent/saldo; mostrar resumen de lo que se debitará por presentación y pedir confirmación antes de enviar. UI maneja doble clic, timeout, idempotencia, 401/403/409 y conflictos de versión sin reenviar automáticamente con nueva clave. Las cifras de saldo usadas para operar llegan de API admin; el servidor revalida siempre.
- Notas internas con actor/fecha, distintas de `customerNote`. No filtrarlas a endpoints públicos, emails demo ni logs. Evitar ejecución de HTML/JS y cambios de pedido al editar notas.
- `allowedActions` es calculado por backend, a partir del estado autorizado. Deshabilitar acciones incompatibles en frontend **sin considerar esa protección suficiente**; revalidar en servidor.
- Proteger navegación con sesión H1, CSRF/Origin y expiración/contraseña pendiente. No añadir login de cliente ni nuevos roles complejos.
- Mantener coherencia con `frontend/src/app/features/orders/**` público de H4; las acciones administrativas no deben requerir ni exponer su credencial `X-Order-Access-Token`.

## 6. H5.3 — Cancelación impaga y estados finales

Estados de pedido previstos por el plan:

- `RECEIVED` → `PREPARING` **solo** cuando la confirmación manual del pago fue exitosa.
- `PREPARING` → `READY` mediante una acción administrativa, sin otro movimiento de stock.
- `READY` → `DELIVERED` mediante acción administrativa, sin otro descuento. Texto contextual «Listo para retirar» / «Listo para entrega coordinada».
- `RECEIVED` → `CANCELLED` **solo** cuando el pago no está confirmado y se indica un motivo; debe abarcar intentos rechazados recuperables. Mantener ítems/eventos/intentos históricos, excluirlo de demanda impaga, no tocar saldos ni versiones de stock.
- Bloquear demás transiciones, regresiones y cualquier cancelación/reintegro de un pedido `PAID`, aunque esté en `PREPARING` o `READY`. No admitir editar libremente `orderStatus`/`paymentStatus`.

Todas las mutaciones deben revalidar `expectedVersion`, estado y actor. Controlar doble clic, reenvío/replay, confirmación versus cancelación concurrentes y cambio a READY/DELIVERED contra pago no confirmado. Si se usan idempotency keys para estas mutaciones, definir ámbitos y respuestas estables; no generar dos eventos/notificaciones por un mismo hecho.

Actualizar vistas administrativas y **públicas mínimas** para reflejar `PREPARING`, `READY`, `DELIVERED`, `CANCELLED` y `PAID` de forma consistente. Al cancelar, la consulta protegida no debe permitir nuevos intentos; al pagar, el resultado no debe sugerir otro cobro. Mantener el acceso por token limitado y no revelar dirección, notas internas, sesiones administrativas ni cantidades privadas.

Dejar notificaciones pendientes para pago confirmado, pedido listo y cancelación según la necesidad documentada: insertarlas en la transacción de negocio con dedupe y destinatarios ficticios/de entorno, **no** implementar envío real ni panel H6.

## 7. Verificación obligatoria: PostgreSQL, API, seguridad, navegador

Realizar primero pruebas sobre bases **propias, nuevas y aisladas** con PostgreSQL real, no SQLite o simulacros de locks. Mínimo de casos:

| ID | Escenario | Evidencia imprescindible |
| --- | --- | --- |
| H5-Q01 | Migración limpia H0→H5 y actualización de H4 **poblado** | Ledger, constraints, datos/snapshots/intent historiales preservados; sin drift. |
| H5-Q02 | Aprobación simulada `APPROVED` sin confirmación | Order RECEIVED, pago PENDING y stock intacto. |
| H5-Q03 | Confirmación manual válida con UNIT, METER y ROLL | PAID/PREPARING, una operación, entradas exactas, evento/admin y jobs; precios originales. |
| H5-Q04 | Importe falso, intento viejo, REJECTED y sim PENDING | 400/409 adecuados; ninguna escritura parcial ni filtración. |
| H5-Q05 | Un renglón suficiente y otro insuficiente | Rollback total, orden/pago sin confirmar, ningún balance disminuye. |
| H5-Q06 | Misma clave+cuerpo, nueva clave, distinto cuerpo, mismo pago desde dos admins | Replay estable, conflicto correcto, **un solo débito** y un movimiento por pago. |
| H5-Q07 | Dos pedidos compiten por última unidad | Solo uno PAID, el otro sin descuento, ningún saldo negativo. |
| H5-Q08 | Confirmación compite con apertura/ajuste H2 y con reintento H4 | Serialización efectiva, puntero y saldo correctos, sin deadlock permanente ni doble efecto. |
| H5-Q09 | Falla inyectada en movimiento, evento o NotificationJob | Rollback atómico; sin PAID huérfano, asiento incompleto o efecto perdido. |
| H5-Q10 | Cancelación RECEIVED PENDING/REJECTED | Motivo/evento, demanda impaga disminuye, stock igual, sin reintentos posteriores. |
| H5-Q11 | Intentar cancelar cualquier PAID | Rechazo desde UI y API; sin refund/reintegro/estado adulterado. |
| H5-Q12 | RECEIVED→PREPARING→READY→DELIVERED e intentos inválidos | Transiciones autorizadas y eventos; READY/DELIVERED sin débito adicional. |
| H5-Q13 | Sesión expirada/revocada, Origin/CSRF incorrecto, password-change obligatorio | 401/403 coherentes; cliente con token público no puede confirmar, cancelar o leer notas. |
| H5-Q14 | Consultas públicas y admin después de cambiar estados | Solo admin ve PII/saldos/notas; cliente ve estado real, no `PAID` ficticio ni acciones imposibles. |
| H5-Q15 | Flujo real de navegador completo | Angular→NestJS→PostgreSQL: pedido impago→login admin→confirmación→stock/deuda→READY/DELIVERED y cancelación alternativa. |
| H5-Q16 | UI y regresiones H1–H4 | Builds/lint/tests, contratos, historial intacto; 360/768/1440 px, teclado/foco/reflow donde sea posible. |

Incluir lecturas antes/después con hashes o conteos interpretables; no basta con un test mock que espera un número. Comprobar que abrir un rollo cerrado no ocurre implícitamente y que una venta de rollo solo descuenta ROLL; dinero como BigInt. Verificar **exactamente un** movimiento/operación de confirmación por pago; movimientos de ajuste y apertura continúan funcionando con sus reglas existentes.

Validar `npm` backend/frontend build, lint y tests afectados, Prisma validate/generate/migrate, contratos OpenAPI y Swagger runtime, regresiones de autenticación, catálogo, pedidos/intentos y stock. Registrar comandos, versiones, exit codes, PASS/FAIL/skips, SHA del candidato y qué se omitió. Si una herramienta falla por entorno o datos del fixture, conservar el fallo antes de corregir el harness; no atribuir PASS sin repetición válida.

No borrar fixtures, recursos de otros worktrees, contenedores ajenos ni secretos. Utilizar puertos loopback, bases nuevas, datos `.test` y limpieza con comprobación de propiedad, como en H2–H4. No guardar payloads con compradores reales, tokens privados o claves de replay en informes, capturas o Git.

## 8. Review y Verify: evitar la repetición del bloqueo H4

Este hito incluye dinero y stock transaccional: **riesgo alto**. No asumir que el Review nativo H4 fue aprobado (no lo fue) ni que una excepción académica anterior cubre H5.

- Establecer **unidades de cambio cohesionadas y revisables**: (a) contrato y migración; (b) caso de uso H5.1 y pruebas PostgreSQL; (c) panel administrativo y lecturas; (d) cancelación/estados/eventos; (e) integración/correcciones finales. Puede variar la topología si el análisis demuestra una división mejor, pero sin duplicar esquemas ni crear PRs ceremoniales.
- Antes de acumular un candidato enorme, evaluar presupuesto real de contexto del Review nativo. Ejecutar el procedimiento oficial sobre **candidatos inmutables suficientemente pequeños**, con consentimiento propio por lineage cuando corresponda. Cada resultado limita su autoridad al candidato revisado; una aprobación parcial no implica PASS global.
- Una herramienta que devuelva `lens_context_budget_exceeded`, requiera una selección que no puede documentarse o indique `next_action: stop` **debe detener ese frente**. No repetir el mismo candidato, truncar evidencia, fabricar tokens/selectores, reusar ACK ni deshabilitar Review.
- **Review independiente** en bloques críticos: autorización dentro de transacciones; locks/deadlocks; atomicidad; unicidad por pago; idempotencia; constraints/migraciones; retornos públicos; seguridad de datos; y límites de UI. **Verify independiente** ejecuta los comandos y casos pertinentes sobre candidato exacto en scratch/BD propios, no con simulaciones ocultas.
- Revisar funcionalmente el **candidato técnico final**. Si tras un Review aparecen correcciones, revalidar el delta afectado sin adjudicarles los PASS previos. Si el Review nativo queda bloqueado de nuevo, entregá evidencia y solicitá una **nueva decisión externa**, sin autoaprobar H5 ni forzar publicación.
- No sobreejecutar miles de pruebas no afectadas por cada CSS o documento; sí repetir pruebas pertinentes cuando cambien transacción, permisos, contratos, estados, concurrencia o estructura SQL.

## 9. Organización y límites de implementación

La coordinación de agentes y sus modelos corresponde al orquestador existente de Gentle-AI/Codex; este prompt **no** cambia su configuración global. El backend de confirmación debe tener un dueño claro; migraciones y OpenAPI tienen un único responsable. Permitir paralelo solo después del freeze y con ownership disjunto. Evitar ciclos de PRs diminutos y overengineering para cumplir heurísticas de longitud; preferir pocas unidades coherentes y auditables.

No hacer en H5:

- Integración bancaria, Mercado Pago real, cobros reales, reembolsos, conciliación, pedidos de clientes registrados o facturación electrónica.
- Apertura automática de rollos, reintegrar metros a rollos, reservar stock de pedidos impagos o descontar ante resultado del simulador.
- Configuración administrativa comercial completa H6, despacho SMTP productivo/externo, dashboard/CSV/reportes H7, cierre académico H8.
- Edición de snapshots de ítems/importes de un pedido confirmado o impago.
- Abrogación de la seguridad H1 ni cambios innecesarios en rutas públicas H2–H4.
- Publicación remota/PR/merge/tag H5; limpiar/resetear worktrees existentes o su WIP.

## 10. Entregables y puerta de aprobación

Al finalizar H5:

1. Documentar `docs/decisions/H5-manual-confirmation.md` con P01 confirmado, estados, contrato, transacciones, locks/idempotencia, vinculación de movimientos a pago y límites de uso académico.
2. Versionar las modificaciones aditivas de Prisma/migración, contrato y ejemplos, módulos backend/frontend, pruebas, README y `contracts/CHANGELOG.md` que correspondan.
3. Generar `docs/milestones/H5-informe.md` que incluya:
   - Base, rama, HEAD y árboles técnicos/documentales exactos; inventario de diff y preservación WIP/15 worktrees.
   - H5.1/H5.2/H5.3 implementados, rutas, DTO y migración con constraints.
   - Matriz de pruebas con comandos, versionado, exit codes, resultados sobre PostgreSQL real y screenshots de navegador.
   - Hashes de saldos/versiones/operaciones antes/después en éxito, error, idempotencia y concurrencia.
   - Escenarios de simulación vs pago comercial; P01 aplicado sin devolución ni reintegro de stock.
   - Review nativo **real** por candidato y consentimiento/ACK o bloqueo; Review/Verify independientes, omisiones y debt, sin equivalencias inventadas.
   - Dictamen propio CUMPLE / PARCIAL / NO CUMPLE **por criterio**, sin autoconceder aprobación externa.
4. Preservar evidencia saneada, detener exclusivamente recursos propios y señalar cualquier limitación del entorno.
5. **Detenerse para la auditoría externa en este chat.** No iniciar H6, no hacer push, PR, merge en `main` ni tag `h5-approved` sin autorización nueva.

**Condición de cierre:** solo se evaluará H5 como integrable si existe evidencia de confirmación manual atómica y única, stock correcto bajo carreras, cancelación impaga sin efecto en inventario, rechazo de cancelación pagada, estados coherentes, permisos protegidos y ausencia de cambios ocultos en H1–H4. Ninguna prueba no ejecutada debe declararse aprobada.
