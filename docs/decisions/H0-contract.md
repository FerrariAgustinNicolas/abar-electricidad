# H0.3 — Contrato transversal candidato

**Estado:** candidato documental para auditoría; no es aprobación comercial ni habilita H1.

## Alcance real

`contracts/openapi.yaml` es la única referencia normativa candidata. La única operación documentada e implementada en H0 es `GET /health`, fuera de `/api/v1`. Devuelve `200 {"status":"ok"}` solamente después de un `SELECT 1` real en PostgreSQL; si falla la dependencia, responde `503` con `SERVICE_UNAVAILABLE`, el mensaje público fijo en español y un UUID `requestId`, sin causa interna.

Swagger se sirve en `/api/docs`. Los ejemplos JSON son ficticios y sanitizados. Ninguna ruta de negocio, autenticación, cookie, mutación ni endpoint administrativo se implementa en esta unidad.

## Proyección comercial, no endpoints

La API futura se proyecta bajo `/api/v1` con áreas `/public`, `/auth` y `/admin`. La especificación marca el documento y cada componente futuro como candidato. No se enumeran ni implementan los 51 endpoints. Las descripciones DTO y convenciones no autorizan a clientes ni equipos a crear DTO paralelos: deben derivarse de esta referencia y revisarse antes de H1.

Los pendientes P01–P10 de `docs/plan.md` permanecen abiertos. En particular, reglas de cancelación pagada, vigencia de impagos, datos obligatorios del comprador/entrega, longitudes reales y condiciones comerciales siguen sin decisión. No se da por cerrada ninguna regla de campos del comprador.

## Convenciones compartidas propuestas

| Tema | Convención candidata | Límite |
|---|---|---|
| Transporte | JSON; nombres de propiedades y códigos en inglés; UI/mensajes para personas en español. `/api/v1` solo para operaciones comerciales. | `/health` no lleva prefijo. |
| Identidad y fechas | IDs UUID opacos; fechas serializadas RFC 3339 en UTC. | No usar número visible de pedido como ID o credencial. |
| Dinero | `Money { amountMinor: string, currency: 'ARS' }`; `amountMinor` es una cadena decimal entera no negativa, nunca `number`/float JSON. | Ejemplo ficticio `'1250000'` = ARS 12.500. |
| Cantidades | Enteros JSON positivos; unidades separadas `UNIT`, `METER`, `ROLL`. | Roll length opcional solo cuando aplique y positiva; longitud y precios reales siguen sujetos a revisión. |
| Listados | `page >= 1`, `pageSize` por defecto 20 y máximo 100; respuesta propuesta `items` + `pageInfo {page,pageSize,totalItems,totalPages}`. | Ordenamientos como lista finita, no texto libre. Candidatos explícitos: `name-asc`, `name-desc`, `price-asc`, `price-desc`; aplicabilidad por operación se fija antes de implementarla. |
| Errores | `code`, `message`, `requestId`, con `fieldErrors?`; sin stack, SQL ni detalles internos. | Health 503 omite `fieldErrors`. `requestId` UUID. |
| Estados | `OrderStatus`, `PaymentStatus`, `PaymentAttemptStatus` y `DeliveryMode` son enums distintos. | Son exactamente los valores candidatos del plan sección 7; no fusionar resultado simulado con pago comercial ni modalidad con progreso. |
| Idempotencia | Cabecera `Idempotency-Key` en futuras mutaciones críticas: misma clave/mismo cuerpo devuelve resultado previo; misma clave/cuerpo distinto responde 409 `IDEMPOTENCY_CONFLICT`. | Semántica descriptiva, no operación implementada. |
| Concurrencia | `expectedVersion` en futuras ediciones detecta versión obsoleta y responde 409. | No se modela como endpoint H0. |
| Sesión administrativa | Sesión revocable almacenada/validada en servidor mediante cookie `HttpOnly`, `SameSite=Lax` o más estricta y `Secure` en producción. | Secure puede omitirse solo en desarrollo HTTP local explícito; mutaciones requieren CSRF y validación de origen. No JWT ni `localStorage`. Autenticación funcional queda para H1. |

## Invariantes de inventario y pago que se deben preservar

- Crear un pedido impago no reserva ni descuenta stock.
- Un resultado simulado `APPROVED` no marca el pago comercial como `PAID` y tampoco descuenta stock.
- La entrega, el avance de estado y los reintentos no descuentan stock.
- Únicamente la confirmación manual del pago completo puede debitar una sola vez, junto con actualización del pago en una operación atómica; las operaciones futuras deben ser idempotentes.
- La apertura de rollos es explícita y manual. El checkout no convierte rollos cerrados en metros.
- Los estados comerciales del pedido, del pago, del intento y de la modalidad de entrega permanecen separados.

Estas son salvaguardas de alcance del plan, no código de negocio producido por H0.3.

## Validación y uso

- `npm --prefix backend run contract:validate` valida OpenAPI 3.0.3 con Redocly 2.57.0 y todos los JSON externos registrados con AJV.
- `node --test scripts/h0-contract-validate.test.mjs` cubre los ejemplos válidos, casos inválidos de dinero/unidad/cantidad/error, documentos ausentes/inválidos, marcadores de proyección y comparación semántica.
- `npm --prefix backend run contract:validate:live` inicia procesos backend locales propios con variables ficticias explícitas, verifica Swagger y respuestas reales 200/503, y detiene exclusivamente esos procesos. Requiere build backend y PostgreSQL local disponible para el caso exitoso. Nunca lee `.env` ni `.env.example`.

Los componentes de negocio pueden existir sin estar referenciados por operaciones; el lint omite únicamente avisos de licencia de documento local, host localhost, 4xx en health y componentes intencionalmente proyectados/no usados. Los errores de OpenAPI no se omiten.

## Apertura y rollout

El rollout comercial permanece **cerrado** hasta una autorización explícita de apertura posterior a revisión del contrato y resolución de pendientes aplicables. La propuesta no implica disponibilidad productiva, finalización del plan, aprobación de negocio o inicio de H1.
