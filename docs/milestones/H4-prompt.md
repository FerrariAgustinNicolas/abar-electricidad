# ABAR Electricidad — H4 · Checkout, pedidos y simulación de pagos

**Documento de ejecución para Codex / Gentle-AI**  
**Único hito autorizado:** H4.1–H4.4. **No implementar H5 ni H6 completo.**  
**Repositorio:** `FerrariAgustinNicolas/abar-electricidad`  
**Entregable:** `docs/milestones/H4-informe.md` + decisiones y evidencia reproducible.  
**Base Git aprobada y verificada:** `main` / `origin/main` / `h3-approved^{}` = `d08adc17efbdd62cd847fea7c16d1371a14436f3`, árbol `1dc52587aa56909f6256ed36eb1b05eaa8508dce` (PR #49).

## 1. Autorización y decisiones confirmadas

El usuario **confirmó el 20/10/2026** para la versión académica de ABAR las siguientes decisiones pendientes del plan:

- **P02 — Pedidos sin pago confirmado:** no hay **vencimiento comercial automático**. Un pedido creado no admite edición posterior de renglones, cantidades, precios o tarifa; se conservan snapshots. Esto es **independiente** del presupuesto H3 (`CheckoutQuote`), que **sí vence técnicamente** (TTL actual de 600 s, configurable según su política). No implementar un mecanismo que cancele pedidos por vencer su presupuesto original después de creados.
- **P03 — Datos obligatorios del comprador:** `firstName`, `lastName`, `email` y `phone`. Cuando `deliveryMode=COORDINATED`, exigir dirección; permitir instrucciones opcionales. En `PICKUP` no exigir dirección. Registrar aceptación de condiciones con su **versión exacta**, usando texto de demostración identificado como provisional, no condiciones legales reales validadas por ABAR. No atribuir aprobación del cliente/tutor a ese texto.

Estas decisiones autorizan **congelar el contrato de H4**, no cambiar retrospectivamente H0–H3 ni habilitar pagos reales. Cualquier detalle técnico de longitud/formato no definido por el negocio debe justificarse como validación técnica y testearse, no inventarse como política comercial confirmada.

### Invariantes innegociables

1. Venta por **UNIT, METER y ROLL**, cantidades enteras y saldos por presentación independientes. ROLL se vende cerrado; H4 jamás abre/consolida rollos.
2. **Crear un pedido, simular un intento o reintentar no reserva ni descuenta stock.** No modificar `StockBalance`, sus versiones ni crear `StockOperation`/`StockEntry` por estos actos. Dos pedidos impagos pueden solicitar la misma disponibilidad, pero **cada pedido** debe comprobar existencias suficientes al registrarse.
3. **Solo H5** podrá confirmar comercialmente un cobro y descontar existencias con transacción única y auditoría. Una simulación APPROVED **no** equivale a pago comercial PAID ni a pedido entregado/preparado.
4. El frontend nunca fija importes, estados del pago, stock ni reglas de entrega; el backend conserva autoridad. Dinero ARS con `amountMinor` como string decimal y aritmética `bigint`, sin floats.
5. No clientes registrados, tarjetas, transferencias bancarias reales, pasarela externa, reembolsos, entregas automatizadas, promociones, roles nuevos ni sincronización con mostrador.
6. No interpretar ausencia de Review nativo H3 como ACK aprobado: H3 quedó autorizado externamente para avance con esa excepción documentada. Preservar la deuda, no reabrir H3 por procedimiento.

## 2. Preflight, fuentes y aislamiento

**Antes de escribir**, verificar:

- Raíz Git correcta, `origin`, `main`, `origin/main` y tag `h3-approved` en el commit esperado, árbol Git limpio de la **nueva rama**; comprobar origen del worktree y preservación del WIP original y los **14 worktrees preexistentes**. Si cambió `main`, detenerse y reportar, no crear una rama desde una base supuesta.
- Revisar los archivos existentes y **leer completos**: `docs/plan.md` (especialmente §§ 2, 5–10, 12–15, 17–18), `docs/milestones/H3-prompt.md`, `docs/milestones/H3-informe.md`, `docs/milestones/H3-cierre-validacion.md`, `docs/decisions/H2-contract.md`, `docs/decisions/H3-quote.md`, `contracts/openapi.yaml`, `backend/prisma/schema.prisma`, README, `docs/figma-map.md` y código H1–H3 involucrado.
- Mantener el stack existente Angular 21, NestJS 11, PostgreSQL 17, Prisma 7 y REST/OpenAPI 3.0.3. Las dependencias, migraciones y rutas ya integradas no se reemplazan ni se reescriben.
- Crear rama y worktree **independientes desde main aprobado**, sugerido `feat/h4-orders-demo-payments` o `codex/h4-orders-demo-payments`. No reutilizar worktrees de H1/H2/H3, no mover rama de otro trabajador. Si este prompt está no rastreado en el checkout original, copiarlo y añadir **selectivamente** como primer commit documental de H4, sin modificar el WIP original.

Conservar orquestador, permisos y agentes existentes; usar paralelismo solo después de congelar OpenAPI y delimitar ownership: backend `backend/**`; frontend `frontend/**`; integración/contrato `contracts/**`, Prisma migraciones coordinadas, README y decisiones. Un único responsable escribe los archivos compartidos. No instalar ni modificar herramientas o modelos globales. Priorizar pocos commits cohesivos y evidencia suficiente, evitando cadenas innecesarias de PR.

## 3. Alcance funcional H4

| Bloque | Implementación exigida | Criterio principal |
|---|---|---|
| **H4.1** | Crear pedido de invitado desde `CheckoutQuote` persistido, con snapshots, datos comprador, pedido/pago/intento/eventos, idempotencia y acceso temporal protegido. | Un pedido por quote; creación atómica; stock intacto; replay seguro. |
| **H4.2** | Checkout Angular con formulario, dirección condicional, versión de condiciones, resumen autoritativo y resultado del pedido. | Validar, confirmar y recuperar sin inventar pago o disponibilidad. |
| **H4.3** | Intentos de pago demo APPROVED/PENDING/REJECTED, cambio/reintento de método sin crear otro pedido. | Historial inmutable, intento vigente correcto; simulación nunca marca PAID. |
| **H4.4** | Consulta de pedido y demanda impaga informativa para administración. | Acceso mínimo protegido, antienumeración y agregado por presentación separado del saldo. |

### No incluido

- Pago comercial confirmado / estado `PAID`, descuento de saldo, paso a `PREPARING`, acciones administrativas de cobro, entrega, cancelaciones pagadas o refund: **H5**.
- UI administrativa completa de operación de pedidos, notas, transiciones y confirmación: **H5** (H4 puede incorporar lecturas administrativas mínimas exigidas para demanda impaga).
- SMTP real/simulado como envío operativo, reintentos del despachador, edición completa de medios y datos comerciales: **H6**. Crear únicamente la base de trabajos de notificación **pendientes**, si se requiere por el modelo H4 aprobado.
- Reportes estadísticos y dashboards **H7**, certificación total WCAG/zoom pendiente **H8**.

## 4. Contrato H4: congelar antes de implementar

Extender **aditivamente** `contracts/openapi.yaml` desde 0.6.0. Conservar exactamente las operaciones/esquemas de H1–H3 y sus restricciones funcionales; no crear un segundo contrato o DTOs frontend divergentes. Crear decisión `docs/decisions/H4-orders-payments.md`, ejemplos JSON no sensibles y pruebas estáticas/live; registrar freeze/versión en CHANGELOG.

### Endpoints propuestos desde el plan (prefijo `/api/v1`)

| Método y ruta | Acceso | Regla de éxito / restricción |
|---|---|---|
| `POST /public/orders` | Invitado + `Idempotency-Key` | `CreateOrderRequest` → 201 `CreateOrderResponse`, snapshot y credencial temporal segura; replay devuelve misma respuesta. |
| `GET /public/orders/{id}` | Portador del token temporal por **header** | 200 vista pública saneada de su propio pedido. Nunca token en query/path. |
| `POST /public/orders/{id}/payment-attempts` | Token temporal + `Idempotency-Key` | 201 intento/reintento nuevo con método demo vigente; mismos pedidos/stock intactos. |
| `POST /public/orders/lookup` | Invitado y rate-limit | Número + contacto → vista **mínima**, error genérico sin enumeración, **nunca entrega token de acceso**. |
| `GET /admin/stock` (extensión compatible) | Admin H1 | Añadir demanda impaga informativa **por presentación**, sin reemplazar cantidad disponible. Extender DTO/contrato y pruebas sin romper H2. |

`GET /admin/orders` de solo lectura o un endpoint de agregado dedicado puede añadirse **solo si es imprescindible** para mostrar la demanda y justificarlo. No agregar un CRUD administrativo de pedidos completo. Conservar rutas y estatus ya existentes.

### DTO y validaciones

- `CreateOrderRequest`: `quoteId`, `customer:{firstName,lastName,email,phone}`, `customerNote?`, `deliveryDetails?`, `acceptedTermsVersion`. No aceptar precios, cantidad desde browser, stock, `paymentStatus`, `orderStatus` ni resultados simulados.
- `deliveryDetails` en entrega coordinada exige **dirección**. Definir una estructura acotada y clara (por ejemplo calle y número/localidad, con instrucciones opcionales) consistente en contrato, UI, persistencia y tests. Para retiro no exigir ni inventar domicilio. No asumir zonas de reparto reales de ABAR.
- Las condiciones de compra deben visualizarse completas o accesibles antes de su aceptación, con versión de demostración almacenada en backend. Exigir consentimiento explícito y versión vigente; cambios de versión requieren nueva aceptación. Nunca inventar términos de devolución o garantías aprobados por el negocio.
- `CreateOrderResponse`: `orderId` UUID opaco, `orderNumber` independiente, `orderStatus=RECEIVED`, `paymentStatus=PENDING`, `currentAttemptId`, `total`, `accessToken` opaco temporal, `accessExpiresAt`, `nextActions`, `demoMode`. Mantener compatibilidad exacta con el plan; un token no equivale a autorización administrativa.
- `PublicOrderView`: número, momento, renglones/importe/modalidad, estado comercial e intento vigente/resultado, próximos pasos; **no** dirección/contacto completos, notas internas, tokens ni campos de base.
- `AttemptRequest`: `{methodCode,scenario?}`; `scenario` solo para `DEMO_SIMULATION` y solo en modo demo, entre `APPROVED|PENDING|REJECTED`. Para métodos manuales, resultado inicial PENDING sin un escenario inventado.
- Errores esperados de creación (409): `QUOTE_EXPIRED`, `QUOTE_CHANGED`, `INSUFFICIENT_STOCK`, `QUOTE_ALREADY_USED`, `IDEMPOTENCY_CONFLICT`; además validación 400, límite 429 y dependencia 503. Reintentos: `ORDER_PAID`, `ORDER_CANCELLED`, `METHOD_UNAVAILABLE`, `IDEMPOTENCY_CONFLICT`, 403 demo deshabilitado o credencial inválida. Mantener sobre `{code,message,fieldErrors?,requestId}` y `Cache-Control: no-store` donde corresponda; no filtrar saldos exactos, existencia de cliente ni causas SQL.

Definir en OpenAPI las reglas de idempotencia, expiración, acceso y errores **antes** de paralelizar. Si un detalle exige un cambio incompatible al esquema congelado de H3, registrar propuesta/impacto y pausar el frente: no romper el contrato silenciosamente.

## 5. H4.1 — Persistencia y alta idempotente

### Migraciones Prisma/PostgreSQL

Extender **aditivamente** las migraciones H0–H3. Según el plan, implementar como mínimo:

- `Order` y `OrderItem`: número visible único independiente del ID, `quoteId` único, snapshots de producto/presentación/unidad/longitud/precio/cantidad, subtotal, tarifa, total, modalidad, comprador, dirección condicional, versión de condiciones aceptadas, estado `RECEIVED`, fecha y versión. Sin editar renglones después de crear.
- `Payment` uno a uno con `Order`: estado comercial `PENDING` inicial, importe congelado, referencia de método e intento vigente, sin fecha de confirmación comercial aún.
- `PaymentAttempt`: historial persistente de método, escenario demo/outcome, secuencia/tiempos e idempotencia. Conservar intentos anteriores e identificar solo uno vigente.
- `OrderEvent` para alta de pedido e intentos significativos, historial inmutable y sano.
- `IdempotencyKey` o modelo equivalente duradero y transaccional para creación de pedido y nuevos intentos, con fingerprint canónico y respuesta de replay protegida.
- Token de acceso de invitado guardado **solo como hash** para comprobar posesión; mecanismo cifrado/secret gestionado por entorno para reemitir exactamente el `accessToken` en un replay válido de creación, o equivalente revisado. No almacenar credencial clara, no incluirla en logs, ejemplos, informes ni URLs.
- Trabajos básicos `NotificationJob` de pedido creado para comprador y administrador (destinos ficticios/configurados) registrados **en la misma transacción**, pendientes de envío H6, con `dedupeKey`; si requiere simplificación, dejar evidencia y aprobación explícita de cualquier diferimiento en vez de simular mails enviados.

Un historial con referencias históricas no debe borrarse por cascada. Índices/unicidades y CHECK de importes/cantidades/estados en SQL versionado cuando Prisma no los exprese; dinero en minor units `bigint`, cantidades enteras. No crear órdenes `PAID` ficticias que carezcan de su descontado correspondiente.

### Transacción de crear pedido

1. Validar sintaxis del request, versión de condiciones y `Idempotency-Key` antes de efectos; cualquier cliente sin idempotencia definida no genera un pedido.
2. **Comprobar primero replays ya confirmados**: misma clave y mismo request devuelve la respuesta original aunque el quote haya vencido **posteriormente**. Misma clave con otro request devuelve `409 IDEMPOTENCY_CONFLICT`. La unicidad `quoteId` impide una segunda orden con otra clave.
3. Recuperar `CheckoutQuote` **persistido** en PostgreSQL; validar identidad, respuesta/estructura, expiración técnica al primer uso y que no fue consumido. **No** confiar en `stateFingerprint` como identidad íntegra de cantidades; leer del snapshot guardado, que contiene cantidades y precios.
4. Revalidar de forma coherente política vigente de entrega/tarifa/método, producto/categoría/presentación activa, precios y saldo suficiente para **cada línea de ese pedido**. Sin recomposición de rollos, sin reservas; si cambió precio/tarifa/configuración/snapshot relevante, devolver 409 y permitir nueva cotización/aceptación explícita (no actualizar importes silenciosamente).
5. Generar número de pedido sin colisión, snapshot monetario y comprador, datos de entrega, primer intento `PENDING`, pago comercial `PENDING`, eventos y trabajos pendientes; insertar todo **en una transacción**. Bloqueo/concurrencia suficiente para prevenir duplicados y estados parcialmente persistidos. Ante fallo, rollback completo.
6. Una vez creada, no aplicar expiración automática comercial al pedido ni actualizarlo al vencer el quote original. Un quote caducado antes de su uso **no** se convierte en pedido; devolver error y solicitar otro.
7. **No** modificar `StockBalance`, versión, `StockOperation`, `StockEntry`, ni usar el quote como reserva. Probar hashes/filas antes/después, también frente a duplicación y fallos.

Guardar estado de intento `PENDING` sin inferir éxito del proveedor. El método demo elegido procede del quote y debe coincidir con la política al momento del primer pedido. No confiar en campos enviados por navegador que permitan saltarse reglas.

## 6. H4.2 — Checkout Angular y resultados

- Conectar la salida de `/carrito` de H3 con **`/checkout` real**, sin pérdida de `presentationId`/cantidad ni precios asumidos como autoridad. Reutilizar el `QuoteResponse` vigente y **aceptado explícitamente**; al recargar/vencer/cambiar selección, exigir nueva cotización/aceptación. Si la API indica conflicto, mostrar diferencias y no crear pedido.
- Implementar formulario reactivo tipado para nombre, apellido, correo, teléfono, dirección condicional e instrucciones opcionales. Validación accesible en frontend y backend; errores por campo, estados loading/submit/error y protección frente a doble clic. No guardar comprador, domicilio ni pago en `localStorage` del carrito.
- Exponer la versión de condiciones demo y checkbox obligatorio de aceptación. El backend valida que se aceptó la versión actual; guardar esa versión en Order. Texto de ejemplo claramente provisional, sin presentar políticas legales como aprobadas.
- Resumen muestra las **líneas y totales del servidor**, cantidad y presentación correctas, retiro/entrega y método de demostración elegido. Advertencia visible: registrar un pedido **no reserva ni garantiza existencias futuras**; todo pago simulado requiere confirmación administrativa posterior.
- Crear pedido con clave de idempotencia estable para la **misma intención de envío**. Frente a timeout/respuesta desconocida no generar silenciosamente otra clave ni duplicar pedido: reconciliar o reintentar con la misma clave/solicitud. Si hubo cambio explícito confirmado del formulario/quote, nueva intención exige clave diferente con reglas documentadas.
- Carrito solo se vacía **después de constatar creación de pedido exitosa**. No vaciar por presupuestar, navegar, simular APPROVED o por errores.
- Rutas de resultados `/pedido/:id/resultado` y consulta `/consultar-pedido` según mapeo Figma. Diferenciar resultado de intento de pago vs estado comercial `PENDING/REJECTED/PAID`; **H4 no permite `PAID`**. No mostrar «Pagado»/«Total abonado» ante APPROVED simulado.
- Guardar credencial temporal de acceso del pedido únicamente en memoria o `sessionStorage` para permitir recarga acotada; nunca query parameter, fragmento público, logs, localStorage persistente global o enlace compartible. Al vencer o perderse el token, ofrecer consulta mínima por número/contacto, no revelar la credencial por adivinación.
- Pedidos y resultados deben representar claramente demo sin solicitar números de tarjeta/cuentas reales. Mantener responsive, teclado, foco, avisos accesibles, errores y navegación H1–H3.

## 7. H4.3 — Simulador e intentos

- Permitir intento demo `APPROVED`, `PENDING` o `REJECTED` solo con `DEMO_SIMULATION` y modo demo de servidor habilitado; no permitir query/flag frontend para activar modo demo o adjudicar estado.
- APPROVED = **resultado del intento** aprobado, pago comercial **PENDING** y pedido todavía `RECEIVED`; **no** descuento de stock, preparación ni notificación de pago confirmado.
- PENDING = intento pendiente y pago comercial pendiente.
- REJECTED = intento rechazado, pago comercial `REJECTED` recuperable según plan, pedido `RECEIVED`; historial conservado y posible nuevo intento válido. No cancelar pedido automáticamente.
- Reintento o cambio a otro método **permitido actualmente** crea un nuevo `PaymentAttempt` del **mismo Order/Payment**, cambia puntero de intento vigente y conserva historial. Nuevo intento reinicia estado comercial a `PENDING` cuando corresponda; no duplica compra. Resultado tardío de intento viejo jamás pisa el vigente.
- PAY_ON_PICKUP solo `PICKUP`; `DEMO_TRANSFER` y `DEMO_SIMULATION` solo combinaciones permitidas por política backend H3. En métodos manuales no aceptar `scenario` del cliente; registrar pendiente. No solicitar ni almacenar datos bancarios reales.
- `Idempotency-Key` en intentos: mismo key/body/ámbito devuelve resultado anterior, mismo key con otro cuerpo →409; intentos simultáneos no generan dos vigentes o degradan el estado.
- Los campos `PAID`, `confirmedAt`, `confirmedBy`, acciones de confirmación comercial y descuento de stock permanecen **inaccesibles** en H4. Preparar modelo para H5, pero no simular la operación.

## 8. H4.4 — Consulta y demanda impaga

- `POST /public/orders/lookup`: número + contacto coincidente → **vista mínima** de estado. Ausencia/incorrecto responde mismo error genérico, tiempo y límites razonables; no exponer identidad completa, domicilio, notas internas, medio de contacto ajeno ni token. Rate-limit para impedir enumeración.
- `GET /public/orders/{id}` y `POST /public/orders/{id}/payment-attempts` exigen token opaco por header y lo validan en backend contra hash y vencimiento. Expirar el **token** no cancela el **pedido**. En `sessionStorage` no guardar el formulario completo ni más información de la necesaria.
- Agregar al stock administrativo demanda informativa `requestedUnpaidQuantity` **por presentationId**, sumando renglones de pedidos activos sin pago comercial confirmado; incluir rechazados recuperables, no sumar presupuestos abandonados. No restar esa demanda de `availableQuantity`. No mezclar metros, rollos y unidades ni publicar cantidades exactas.
- Diseñar el agregado para que sea incrementalmente compatible con H5: en H4 no existen pedidos `PAID` generados por el flujo, no inventar `paidPendingDelivery` positivo. Probar que varios pedidos sin reserva pueden hacer superar la demanda agregada al disponible sin generar saldo negativo.
- Si se implementan lecturas administrativas mínimas de pedidos, proteger con sesión H1, `mustChangePassword` y controles existentes. No anticipar edición/notas/confirmación/H5.

## 9. Pruebas de aceptación obligatorias

Ejecutar pruebas proporcionadas con PostgreSQL **real, propio y nuevo**; migración desde base limpia y upgrade H3 con productos/cuentas/sesiones/quotes preservados. El verificador documenta comandos, versiones, resultados y exit codes contra **el mismo commit técnico candidato**.

**H4.1 (creación/consistencia):**

1. Quote válido y aceptado → `201`, Order/Items/Payment/Attempt/Event/NotificationJob coherentes; versión de condiciones y datos condicionados según PICKUP/COORDINATED.
2. Sin dirección en COORDINATED, campos obligatorios ausentes, términos no aceptados/versión obsoleta, precios/estados falsos enviados →400/409, **cero escrituras parciales**.
3. Quote vencido antes del uso →409 y ninguna orden; quote consumido otra clave →409; dos envíos concurrentes del mismo quote →uno solo; mismo key+body replay exacto (incluida credencial protegida) →una sola orden; mismo key otro cuerpo →409.
4. Aumentar precio, tarifa, desactivar producto/presentación, cambiar método/entrega, bajar stock entre cotizar/crear → conflicto acorde y nuevo presupuesto requerido; **nunca** sustituir totales silenciosamente.
5. Pedidos impagos sin vencimiento comercial automático; no edición de snapshots, aunque venza el quote original. Sin descuento/reserva por crear ni por repetir.
6. Resistencia a rollback SQL, carrera, fallo/transporte ambiguo. Un intento rechazado no elimina pedido ni sus snapshots.

**H4.3 (intentos):**

7. Escenarios APPROVED/PENDING/REJECTED; todos sin `PAID`, sin `StockOperation` y sin cambio de cantidad/versiones de stock.
8. Cambio de método y reintento conservan mismo orderId, historial e intento vigente; rechazo recuperable, intento viejo tardío ignorado, idempotencia válida y conflictiva.
9. Escenario prohibido para método manual, simulación deshabilitada, modalidad incompatible, token inválido/vencido y operación de pago comercial prohibida.

**H4.4 (seguridad/consultas):**

10. Lookup correcto devuelve mínimo; número erróneo vs contacto erróneo indistinguibles, rate-limit operativo; ningún resultado revela token o PII ajena.
11. Acceso por token sobre el pedido propio sí, pedido ajeno no; expiración de acceso no cancela pedido; sin token por URL/logs; seguridad H1 intacta.
12. Demanda informativa por presentationId: independiente del saldo, incluye pagos rechazados recuperables, no quotes; reglas de estado/visibilidad correctas y sin leakage público.

**Frontend/integración:**

13. Producto→carrito→presupuesto aceptado→checkout con retiro→pedido→resultado; segundo escenario entrega con dirección; reload/doble click/timeout; carrito vaciado solo tras éxito.
14. Cambios de precio/tarifa exigen nueva aceptación; visualizaciones correctas para tres outcomes demo sin confundir pago con cobro.
15. Pruebas unitarias/UI, build/lint, OpenAPI estático y Swagger live, H1 auth/CSRF y H2 stock no regresan. No repetir millares de tests inalterados por ceremonia, pero realizar regresiones relevantes y un smoke integrado de H4.
16. Navegador real si está disponible: `/checkout`, resultados y consulta a **360/768/1440**, teclado/foco, errores y reflow. Zoom nativo 200 % y comparación Figma sin herramienta = **NOT RUN**, no PASS.

Guardar snapshot/hashes de saldos y versiones antes/después de cotizar, crear, simular y reintentar. Los medios demo no son prueba de cobro real ni de pago comercial confirmado. Distinguir PASS, FAIL, BLOCKED y NOT APPLICABLE; omisiones no se convierten en PASS por repetirlas en informes.

## 10. Review, Verify y seguridad

- **Review independiente:** modelo de datos/constraints/migraciones, idempotencia y race, independencia quote vs order, protección de accessToken/replay, PII, contrato vs Swagger, simulador sin pago PAID, cambios de modalidad y tarifario, consulta/lookup no enumerable, agregados de demanda, regresiones H1–H3.
- **Review nativo Gentle-AI:** respetar status/forecast/selección de untracked y consentimiento según procedimientos documentados. La excepción nativa de H3 **no se hereda** para H4. Si hay bloqueo, registrar transición/error exactos y detener ese frente sin inventar ACK ni desactivar protección.
- **Verify independiente:** probar commits/árboles inmutables, lint/build/tests, schema/generate/migrate, OpenAPI normativo/static/live, fixture PostgreSQL nuevo y upgrade H3, concurrencia/idempotencia, HTTP reales, Angular/browsers accesibles, errores de seguridad y capturas. No ejecutar sobre DB/productos/credenciales ajenos, no borrar volúmenes externos. Sembrar solo datos ficticios y secretos efímeros.
- No registrar PII, contraseñas, tokens de acceso, encabezados completos sensibles, tarjetas ni datos bancarios. Los ejemplos de OpenAPI deben usar `.test` y valores ficticios, **sin accessToken utilizable**. Si hay necesidad de clave cifrado, solo entorno privado/operativo y ejemplo sin secreto; no eludir políticas de archivos `.env`.
- Documentar las deudas existentes (zoom nativo, Figma/WCAG integral, Review nativo H3 exceptuado, escalabilidad H2/H3), sin afirmar que fueron saneadas por H4. No extender el MVP para resolverlas si no bloquean este hito.

## 11. Git, documentación y entrega

- Commits locales revisables en la rama H4. No hacer `reset --hard`, `clean -fd`, force-push, rebase destructivo, borrado de worktrees, cambios de modelos/configuraciones globales ni manipular ramas/índices ajenos. No hacer push, PR, merge a `main`, tag ni publicar secretos.
- No iniciar H5, cobro manual, descuento por confirmación, UI de operación de pedidos ni H6 completo. Si un cambio de contrato/arquitectura/dominio fundamental resulta necesario, registrar impacto y pausar el frente afectado para esta auditoría.
- Dejar decisiones P02/P03 marcadas como **confirmadas por el usuario para la versión académica**. P01 y P04/P05/P06/P07/P09/P10 conservan su estado, según aplicabilidad; no atribuir resolución al cliente. No reescribir documentos académicos aprobados ni afirmar que existe una pasarela real de pagos.
- Mantener README, `contracts/CHANGELOG.md`, decisiones y contrato congruentes con runtime. No editar retrospectivamente informes H0–H3. La evidencia local puede conservarse ignorada, con manifiestos/hashes saneados.
- Crear **`docs/milestones/H4-informe.md`** incluyendo:
  - base/branch/worktree/HEAD técnico y documental, estado del WIP protegido, ownership real;
  - cuatro bloques H4.1–H4.4 entregados o limitaciones;
  - tablas/migraciones/constraints, secretos y mecanismo seguro de token e idempotencia;
  - contrato OpenAPI y desviaciones aprobadas, ejemplos, versiones/DTO;
  - tratamiento P02/P03, términos demostrativos y condiciones de retiro/entrega;
  - flujos demo y resultado comercial separado de intentos;
  - pruebas con **comandos exactos, salida/exit, hash del candidato**, incluidos fallos y reparaciones, scripts/fixtures y regresiones;
  - Review independiente, nativo y Verify con identidad y autoridad precisas;
  - capturas, rendimiento/limitaciones, deuda residual, matriz por criterio `CUMPLE / PARCIAL / NO CUMPLE`;
  - declaración explícita de **stock idéntico** al antes/después de H4, ausencia de pago comercial `PAID` y de inicio H5.

**Entregar el informe y detenerse para auditoría externa en este chat. No aprobarse ni integrar por cuenta propia.**
