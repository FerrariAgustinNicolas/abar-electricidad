# H8 — Plan de validación

Estado inicial: NOT RUN. Base técnica H7 aprobada; no trasladar PASS históricos.
Las filas siguientes conservan literalmente los escenarios y evidencias del plan §15.

| ID | Escenario obligatorio | Evidencia esperada |
| --- | --- | --- |
| Q01 | Login correcto/incorrecto, logout, expiración y revocación. | API + navegador; rutas privadas inaccesibles sin sesión. |
| Q02 | CSRF y cuenta con cambio de contraseña obligatorio. | Mutaciones bloqueadas cuando falta protección o permiso. |
| Q03 | Producto inactivo/categoría restringida y stock cero. | No aparece como vendible; acceso directo también controlado. |
| Q04 | Precio y cantidad por UNIT/METER/ROLL. | Enteros únicamente; etiquetas y totales correctos. |
| Q05 | Apertura normal y apertura superior al saldo cerrado. | Conversión completa o ningún movimiento. |
| Q06 | Repetir apertura/ajuste con misma clave. | Una sola operación; otra carga con misma clave devuelve conflicto. |
| Q07 | Carrito con precio adulterado o persistencia vieja. | Backend calcula total vigente; no acepta importe falso. |
| Q08 | Cambio de precio/tarifa después de presupuestar. | Conflicto visible y nueva aceptación; no cobro silencioso. |
| Q09 | Doble click y timeout al crear pedido. | Un pedido y un número; respuesta recuperable de forma segura. |
| Q10 | Crear pedido impago. | Saldos idénticos antes/después; demanda informativa aumenta. |
| Q11 | Simulador APPROVED/PENDING/REJECTED. | Resultado registrado; ningún caso descuenta stock automáticamente. |
| Q12 | Reintento y cambio de método. | Mismo pedido, intento nuevo; historial conservado. |
| Q13 | Confirmación manual válida. | PAID + movimientos + actor/fecha + email pendiente, en un commit. |
| Q14 | Confirmación repetida con misma/otra clave. | Sin doble descuento; resultado previo o conflicto coherente. |
| Q15 | Dos confirmaciones compiten por la última existencia. | Solo la combinación posible se confirma; nunca saldo negativo. |
| Q16 | Pedido de varias presentaciones con una insuficiente. | Ningún débito parcial ni marca PAID parcial. |
| Q17 | Apertura/ajuste concurrente con confirmación. | Saldos reconciliados y orden transaccional consistente. |
| Q18 | Entrega de pedido ya pagado. | Cambia estado sin otro descuento. |
| Q19 | Cancelación impaga y cancelación pagada no habilitada. | Impaga quita demanda sin reintegro; pagada no dispara operaciones no acordadas. |
| Q20 | Cambiar nombre/precio/tarifa tras crear pedido. | Snapshots intactos en detalle, consulta y reportes. |
| Q21 | Consulta por número/contacto incorrectos. | Respuesta genérica, límite de intentos y ausencia de datos privados. |
| Q22 | Token de un pedido usado con otro. | Sin acceso; tampoco permite confirmar pago ni leer notas. |
| Q23 | Subida de archivo inválido, grande o con nombre malicioso. | Rechazo seguro; ningún archivo ejecutable ni path traversal. |
| Q24 | SMTP caído al crear/confirmar pedido. | Pedido íntegro; job reintentable; operación comercial no se repite. |
| Q25 | Emails al comprador y al administrador. | Plantillas y destinatarios ficticios verificados en Mailpit. |
| Q26 | Reportes en período vacío y período conocido. | Denominadores correctos, tarifa separada y estados no cobrados excluidos. |
| Q27 | Metro/rollo en productos más vendidos. | Cantidades no mezcladas; importes reconciliados. |
| Q28 | Pantallas en 360/768/1440, teclado y zoom. | Evidencia visual; sin cortes, superposición ni campos inaccesibles. |
| Q29 | Instalación desde clone/base vacía. | Migraciones y seeds reproducibles; manual suficiente. |
| Q30 | Contrato final vs endpoints/mocks. | Sin divergencias de schemas, auth, enums, paginación, errores o dinero. |


## Orden y criterio de ejecución
1. Instalación limpia mediante export Git del árbol aprobado; npm ci por lockfile, Node24/npm11, Prisma validate/generate, builds, lint y tests. Registrar versión/código/salida saneada.
2. Q29: Compose config; ocho migraciones desde vacío, upgrade H5 poblado y drift con fixture H6 nuevo (PostgreSQL17/Mailpit, tmpfs/labels/loopback); no reutilizar servicios históricos.
3. Q01–Q23: suites reales H4/H5 y controles H1/H2; distinguir tests unitarios de PostgreSQL. Priorizar última existencia, rollback, replay y no-reserva. H1 concurrencia requiere calificación propia; no fabricar prerrequisitos.
4. Q24–Q27: H6 SMTP fallido/recuperación/Mailpit, H7 períodos/CSV y hashes de hechos. No confundir entrega SMTP con exactly-once.
5. Q28 y flujos completos: navegador real comprador/admin a360/768/1440, teclado y zoom nativo200% si está disponible; si falta mecanismo, NOT RUN. Nunca sustituirlo por CSS scale.
6. Q30: validadores normativos y comparación Swagger/DTO/rutas; marcadores históricos se registran separados.
7. Review y Verify independientes sobre identidad congelada; privacidad estricta de evidencia nueva; sin nuevos valores heredados. Registrar bloqueos nativos sin fabricar ACK.

## Reglas de aceptación
CUMPLE/PARCIAL/NO CUMPLE/NOT RUN por criterio y PASS/FAIL/SKIP por ejecución. Cada resultado debe nombrar SHA/árbol, fixture y alcance. Solo corregir defectos reproducidos; detener superficie ante P0/P1. H8.3 permanece PARCIAL sin horas humanas/firmas validadas.
