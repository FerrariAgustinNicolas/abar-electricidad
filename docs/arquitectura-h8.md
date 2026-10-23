# Arquitectura implementada — H8

Monolito académico local. Fuentes: [Prisma](../backend/prisma/schema.prisma), [rutas Angular](../frontend/src/app/app.routes.ts), [OpenAPI0.10.0](../contracts/openapi.yaml) y decisiones H1–H7. No describe una arquitectura productiva ni una propuesta nueva.

## Componentes y límites
```text
Browser → Angular standalone/zoneless → proxy /api,/health → NestJS
                                                       → Prisma/pg → PostgreSQL17
Worker foreground → outbox PostgreSQL → SMTP loopback → Mailpit
```
Angular muestra formularios/estados; Nest controla autorización, validación, precios y reglas transaccionales. `/health` consulta PostgreSQL; Swagger se sirve en `/api/docs` y JSON en `/api/docs-json`. El contrato normativo es YAML; marcadores históricos de freeze no prueban implementación pendiente/terminada. [Figma map](figma-map.md) es documental: no hubo nueva inspección Figma.

## Modelo relacional equivalente derivado de Prisma
| Entidad origen | Relación implementada |
|---|---|
| AdminUser | AuthSession y AdminUserAudit; AuthPreAuthContext separado para preautenticación |
| Category | Product por categoría |
| Product | ProductPresentation y ProductImage |
| ProductPresentation | StockBalance único y StockEntry; UNIT/METER/ROLL únicos por producto |
| StockOperation | StockEntry y vínculo único a Payment cuando hay confirmación |
| CheckoutPolicy / CheckoutQuote | Política actual y snapshot persistido; Order tiene quoteId único |
| Order | OrderItem, Payment único, PaymentAttempt, OrderEvent, OrderIdempotencyKey, NotificationJob, OrderNote |
| Payment | Confirmación/actor/fecha, intentos y operación de stock enlazada con pedido |
| NotificationJob | Estado durable, intentos, lease y dedupeKey única |

21 modelos, ocho migraciones H1–H6; H7 no agrega migración. Dinero BigInt en centavos; API strings, cantidades enteras, snapshots separados de catálogo mutable. No deducir el ER implementado del modelo conceptual del plan.

## Flujos críticos
Presupuesto→snapshot→pedido impago+intento+outbox, sin descuento. Simulación modifica el intento, no confirma PAID. Confirmación manual→validación sesión/versión/importe→locks→PAID+ledger+evento+outbox en transacción. Insuficiencia rechaza el agregado completo; replay utiliza clave/huella/resultado persistido. Apertura y ajustes conservan ledger y saldos por presentación. Entrega y notificaciones no vuelven a descontar.
Reportes leen hechos confirmados y snapshots; SMTP ocurre fuera de transacciones comerciales y admite duplicado por ACK perdido. Seguridad: sesión revocable, Origin/CSRF en mutaciones administrativas, token por pedido en header, no-store en respuestas sensibles. No afirmar CSP/headers no observados.

## Mapa de pantallas
Catálogo/producto→carrito→checkout→resultado/consulta; admin login/cambio→usuarios/categorías/productos/stock→pedidos/detalle→configuración/métodos/notificaciones→dashboard/reportes. Los componentes corresponden a `frontend/src/app/features/` y los servicios Nest a `backend/src/`; el [plan Q01–Q30](milestones/H8-plan-validacion.md) fija evidencia requerida, no resultados asumidos.
