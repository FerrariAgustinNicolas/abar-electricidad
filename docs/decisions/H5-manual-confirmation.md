# H5 — Confirmación manual y gestión de pedidos

**Estado: implementación local H5; Review/Verify final y auditoría externa pendientes.** OpenAPI 0.8.0 es la única norma de DTOs. Esta decisión no declara aprobación externa, pago real ni disponibilidad productiva.

## Decisiones académicas confirmadas

- **P01:** cancelar únicamente un pedido `RECEIVED` impago (`PENDING` o `REJECTED`), con motivo obligatorio, actor, fecha e historial. No modifica saldos ni versiones de inventario. Un pago `PAID` no se cancela desde ninguna ruta, incluida la actualización genérica de estado. No hay reintegros, devoluciones ni compensaciones automáticas.
- **P02/P03:** sin expiración comercial automática; snapshots de ítems/importes/tarifa inmutables. Se conservan comprador y términos demo de H4. El TTL de presupuesto o token no expira el pedido comercial.
- `APPROVED` es resultado de simulación, **no** pago comercial. Solo confirmación manual completa produce `PAID` y `PREPARING`.

## Contrato y versiones

Siete operaciones administrativas nuevas, protegidas por sesión H1 activa. Todas usan `no-store`; las mutaciones exigen Origin, CSRF e Idempotency-Key. `expectedVersion` siempre controla **Order.version**, versión del agregado pedido/pago/intento vigente/notas: cada nueva mutación o nuevo intento H4 la incrementa una vez; el replay no la modifica. No se inventa una versión de Payment.

La confirmación recibe `attemptId`, `confirmedAmount` ARS en centavos como string y `expectedVersion`. Su respuesta estable incluye identidades de pedido/pago/intento/operación, actor/fecha, versión y total histórico. No se aceptan precios ni estados arbitrarios enviados por Angular. Lista y detalle admin incorporan acciones calculadas, comprador, snapshots, saldos por presentación, notas e historial. Historial es paginado; el detalle contiene hasta 1000 eventos/notas recientes. Ninguna nota se edita: son anexos internos, texto renderizado por interpolación, nunca HTML.

Lecturas públicas mantienen su autenticación por posesión y exclusión de PII, saldos y notas; agregan estados finales y dejan de ofrecer reintento cuando corresponde. Los resultados idempotentes históricos H4 siguen siendo históricos, no autoridad para otra mutación. El cliente debe consultar el estado actual tras un replay antiguo.

## Transacción y ledger previstos

Un único responsable mantiene Prisma y migraciones. Conservar nombres de enums H4 evita renombrar tipos históricos: se amplían aditivamente estados, tipos idempotentes y notificaciones. Migración nueva; no recrear tablas ni modificar migraciones aplicadas. Payment incorpora actor/fecha de confirmación. StockOperation incorpora `PAYMENT_CONFIRMATION`, `paymentId` único y `orderId`, con FKs y constraint de vinculación; ajustes/aperturas históricos no requieren esos campos. Una entrada agregada por presentación.

Orden de bloqueo: autoridad H1 (AdminUser/AuthSession, como H2), pedido, pago/intento vigente, presentaciones por ID y luego balances por ID. Compatible con H2: primero todas las presentaciones, luego balances; no intercalar presentaciones/balances. Revalidar autoridad y negocio dentro de la transacción. No bloquear productos ni volver a valorizar catálogo: el precio/estado comercial posterior no reescribe snapshots. Se comprueba existencia real y saldo de cada presentación histórica. No convertir metros ni abrir rollos implícitamente.

La confirmación prevista usa PostgreSQL con bloqueos explícitos y aislamiento ReadCommitted para ver la última fila tras esperar; la interacción con reintentos serializables H4 debe demostrarse con PostgreSQL real. Conflictos de serialización/deadlock se devuelven acotadamente como conflicto operativo; no reintentar indefinidamente. Un solo commit incluye balances/versiones, operación/entradas, PAID, PREPARING, evento y jobs deduplicados pendientes. Fallar cualquiera revierte todo. Unicidad en BD por pago refuerza el lock; otra clave/actor nunca habilita un segundo descuento.

## Idempotencia y errores

Ámbito: operación + pedido + actor autenticado. Clave 16–200 caracteres ASCII alfanuméricos/guion/underscore. Cuerpo cerrado normalizado (UUID minúsculo, texto recortado y claves ordenadas), hash persistido y respuesta cifrada como H4. Bajo lock, comprobar replay antes de versión/estado, pero después de revalidar autoridad. Misma clave/cuerpo devuelve respuesta original; distinto cuerpo da 409. Nueva clave para un pago confirmado da 409. UI conserva intención/clave ante timeout y no genera una nueva automáticamente.

400 validación; 401 sesión; 403 autoridad/Origin/CSRF; 404 pedido; 409 `AMOUNT_MISMATCH`, `INVALID_ATTEMPT`, `PAYMENT_ALREADY_CONFIRMED`, `INSUFFICIENT_STOCK`, `INVALID_TRANSITION`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`; 503 indisponibilidad. Errores seguros sin stock, PII, notas ni SQL. Importe se compara con total y Payment.amountMinor históricos. Simulación confirmable solo APPROVED; manual demo solo PENDING, intento vigente y del mismo pago.

## Transiciones previstas

| Origen | Acción | Destino | Inventario |
|---|---|---|---|
| RECEIVED impago | confirmar pago completo | PREPARING / PAID | un débito por presentación |
| RECEIVED impago | cancelar con motivo | CANCELLED | sin cambios |
| PREPARING / PAID | marcar listo | READY | sin cambios |
| READY / PAID | entregar | DELIVERED | sin cambios |

Todas las demás transiciones se rechazan. Cancelación y confirmación compiten sobre el mismo lock de pedido. Stock admin mantiene demanda impaga e incorpora cantidad pagada pendiente de entrega, separada por presentación y ya descontada.

## Verificación y límites

Pendientes H5-Q01–Q16 del prompt: migración limpia/upgrade H4 poblado, carreras reales, rollback inyectado, replay, auth y navegador. El freeze solo tiene evidencia estática; no demuestra atomicidad ni disponibilidad de rutas. Se conserva la falla inicial de pruebas y cualquier fallo posterior. Review nativo por candidato inmutable y Verify independientes son barreras distintas; la excepción H4 no se hereda.

Jobs pendientes para confirmación, listo y cancelación, insertados en la transacción, con destinatarios ficticios/de entorno. Sin SMTP, gateway real, conciliación, reembolso ni panel H6. Sin push, PR, merge ni tags; detener para auditoría externa al cierre.

## Evidencia local de implementación (sin aprobación global)

El backend aplica `ReadCommitted` y bloqueos explícitos, más unicidad SQL por identidad de pago. La migración H5 agrega checks/FKs, metadatos de confirmación y auditoría append-only; Prisma validate/generate y migrate deploy limpios/upgrade poblado se prueban en PostgreSQL 17 nuevo. Se observó contención real con dos transacciones esperando locks sobre el último saldo; una confirma y otra pierde sin débito parcial. Hay rollback con triggers de fallo en operación, evento o job, y revocación H1 después de autenticar pero antes de adquirir el lock. Resultados detallados y límites se registran en el informe H5 al cerrar; estos checks no sustituyen Review nativo del runtime ni auditoría externa.
