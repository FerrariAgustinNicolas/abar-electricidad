# ABAR Electricidad
## Plan integral de implementación

**Práctica Supervisada · Ingeniería en Sistemas de Información · UTN La Plata**

**Versión:** 0.1 — propuesta para revisión, todavía no aprobada como plan completo.

**Fecha:** 2 de octubre de 2026.

**Proyecto:** Desarrollo de plataforma e-commerce para negocio de venta de materiales eléctricos.

**Finalidad:** definir arquitectura, modelo, contrato, backlog y controles de integración antes de encargar la implementación al orquestador de Gentle-AI. Este documento no contiene código de producción ni prompts de ejecución.

**Lectura prioritaria:** secciones 2 y 7 (alcance y reglas), 9 (contrato), 13 y 18 (hitos y avance). Las decisiones técnicas identificadas como propuestas se aprueban con el plan; las preguntas abiertas no se convierten en requisitos confirmados.

## Control de fuentes y decisiones

| Código | Fuente y uso |
| --- | --- |
| S1 | Plan_de_Desarrollo_PS_Ferrari_Agustin_Nicolas.pdf, 4 páginas, proporcionado como documento académico aprobado. Objetivos, módulos, exclusiones y cronograma. |
| S2 | Texto pegado(1).txt. Brief completo de arquitectura, planificación y trabajo con Gentle-AI. |
| S3 | Figma ABAR Electricidad, archivo RRDxiNsq9ytwdwVX7u3Gxn. Estructura, textos y capturas generales obtenidos en la revisión anterior de esta conversación. Los nodos se identifican en la sección 5. |
| C | Confirmaciones expresas del usuario en esta conversación: pagos simulados en la entrega final; unidades enteras; rollos cerrados; stock al confirmar manualmente el pago; envío fijo configurable; email. |
| T | Propuestas técnicas de este plan. No son respuestas atribuidas al negocio. Las referencias oficiales del anexo respaldan mecanismos técnicos, no agregan requisitos comerciales. |
| P | Decisiones todavía pendientes del cliente o de revisión del plan. Cada una tiene una fecha lógica de resolución en la sección 17. |

Se conserva la jerarquía solicitada: S1, requerimientos confirmados, S3, arquitectura aceptada, contrato vigente y decisiones locales de implementación. Una diferencia entre niveles se registra, no se oculta. La sustitución de integración real por pagos simulados debe explicitarse en la documentación académica; la conversación confirma el alcance pedido, pero no acredita una aprobación posterior del tutor. [S2, «Fuentes de verdad»; S1, p. 3; C]

**Límite de evidencia:** no se inspeccionó un repositorio de implementación. No se supone que esté vacío ni que ya existan módulos. La consulta de Figma de este turno volvió a encontrar el límite de la integración; se utiliza la lectura ya obtenida, sin afirmar una nueva auditoría visual exhaustiva. El plan no modifica el Figma, el documento académico original ni un repositorio remoto.

# 1. Síntesis funcional

Se construirá un e-commerce para publicar materiales eléctricos, recibir pedidos de compradores invitados y permitir su gestión desde un panel privado. El problema planteado es organizar catálogo, precios, disponibilidad y ventas en un sitio propio, complementando los canales actuales del negocio. [S1, pp. 2–3]

El comprador podrá buscar y filtrar productos, elegir presentación y cantidad, revisar el carrito, informar sus datos, elegir retiro o entrega, registrar un pedido y consultar su estado. No tendrá cuenta, perfil ni contraseña. El administrador gestionará catálogo, imágenes, presentaciones, stock, pedidos, confirmaciones manuales de pago, cuentas internas, configuración y reportes básicos. [S1, pp. 2–3; S2, «Autenticación», «Alcance funcional»; C]

**Flujo principal propuesto a partir de las reglas confirmadas:** producto y presentación → carrito → presupuesto de checkout → pedido recibido sin reserva → confirmación manual de pago con validación de stock → preparación → retiro o entrega. La simulación de pagos permite demostrar resultados aprobados, pendientes y rechazados, pero no se convierte en un cobro real ni descuenta stock por sí sola. [C; T para el presupuesto previo]

La entrega de la PS será local y reproducible, con datos ficticios. No equivaldrá a una puesta en producción, a sincronización de inventario del mostrador ni a una integración bancaria terminada. [S2, «Base de datos», «Desarrollo e infraestructura»; C]

# 2. Alcance y trazabilidad

## 2.1. Reglas confirmadas

| ID | Regla vigente |
| --- | --- |
| C01 | Los pagos simulados forman parte de la entrega final de la PS. La integración real queda para una evolución posterior. |
| C02 | ABAR vende por unidad, metro y rollo. La PS aceptará cantidades enteras, con incremento mínimo de 1 en cada presentación. |
| C03 | Un rollo puede abrirse para vender metros. Cuando se vende un rollo, debe entregarse entero y cerrado. |
| C04 | Color, sección, potencia y medida describen el producto. No se requiere un motor de variantes comerciales por esos atributos. |
| C05 | El e-commerce tiene gestión propia de stock. Su sincronización con ventas presenciales se realizará después de la PS. |
| C06 | Un pedido pendiente de pago no reserva ni descuenta mercadería. Se mostrarán administrativamente productos y cantidades solicitadas sin pago confirmado. |
| C07 | La disponibilidad se descuenta al confirmar manualmente el pago. No al crear el pedido ni al marcarlo como entregado. |
| C08 | La entrega coordinada tendrá un importe fijo configurable para todas las entregas, inicialmente cero. |
| C09 | Las notificaciones básicas serán por email al comprador y al administrador. WhatsApp queda como contacto manual. |
| C10 | Se mantiene el stack del brief: Angular, NestJS, PostgreSQL, Prisma, API REST y OpenAPI, en un único repositorio. |
| C11 | Compra como invitado y autenticación administrativa desde el comienzo. No se introduce un sistema complejo de roles. |

C01–C09 provienen de las confirmaciones del chat; C10–C11, de decisiones explícitas del brief. Su aprobación no equivale a aprobar automáticamente las propuestas T que siguen. [C; S2, «Decisiones técnicas», «Autenticación»]

## 2.2. MVP, exclusiones y evolución

| Dentro de la PS | Fuera de la PS o evolución posterior |
| --- | --- |
| Sitio responsive: Home, catálogo, filtros, detalle, carrito, checkout, resultados, consulta de pedido y contacto. | Cuenta de cliente, favoritos, promociones, cupones y aplicación móvil nativa. |
| Catálogo, categorías, atributos descriptivos, imágenes, presentaciones y precios por presentación. | Variantes combinatorias, múltiples listas de precios, múltiples sucursales. |
| Saldos de disponibilidad, movimientos, apertura de rollos, demanda impaga y confirmación manual transaccional. | Sincronización con mostrador, integración con inventario externo, trazabilidad industrial de lotes y remanentes. |
| Simulador de proveedor; transferencia y pago al retirar configurables; historial de intentos y confirmación manual. | Pasarela real, reembolsos automáticos, facturación electrónica y conciliación bancaria. |
| Retiro y entrega coordinada con tarifa fija; dirección e instrucciones según definición de la sección 17. | Tarifas por zonas o distancias, integración con transportistas y seguimiento logístico. |
| Cuentas administrativas básicas, notas internas, emails verificables localmente, dashboard y reportes simples. | Roles complejos, campañas de marketing, WhatsApp automatizado y Business Intelligence. |
| Documentación, manual, pruebas y evidencia por hito. | Hosting, dominio, infraestructura productiva y despliegue comercial. |

Base: S1, pp. 2–3; S2, «Fuera del MVP», «Configuración», «Dashboard», «Reportes»; C. El dashboard y los reportes están especificados en el brief y Figma aunque no tienen un renglón propio en el cronograma académico.

## 2.3. Diferencias registradas, no omitidas

| ID | Diferencia | Tratamiento en el plan |
| --- | --- | --- |
| DIF01 | S1 describe integración con un medio de pago; C01 define simulación final. | Mantener la simulación; documentar alcance efectivo, limitación y fundamento. No declarar integración real ni aprobación adicional del tutor. |
| DIF02 | Figma muestra Mercado Pago automático; C07 exige confirmación manual para descontar stock. | Separar resultado simulado de confirmación comercial; ajustar textos y estados. Ningún retorno del simulador marca el pedido como pagado por sí solo. |
| DIF03 | Figma usa un precio/stock genérico; C02–C03 requieren unidad, metro y rollo cerrado. | Agregar presentaciones y saldos diferenciados, más operación de apertura. |
| DIF04 | El brief enumera login, pero no apareció en los nodos leídos. | Incorporar login y gestión básica de cuentas; no esperar una pantalla inexistente. |
| DIF05 | Figma no expone acción específica de confirmar pago ni notas internas en el pedido. | Agregar ambas, con auditoría y permisos del servidor. |
| DIF06 | Ficha pública con galería; formulario administrativo con una sola imagen. | Proponer galería simple, imagen principal y orden, sin un gestor multimedia general. |
| DIF07 | Figma no incluye costo de entrega configurable. | Agregar tarifa fija y snapshot del costo por pedido. |
| DIF08 | Dos Home, falta de pantallas móviles y de estados completos. | Usar Home CORREGIDA como referencia propuesta; completar responsive y estados. No copiar textos internos del diseñador al sitio público. |
| DIF09 | El carrito de ejemplo suma tres renglones, pero su resumen incluye dos. | Calcular desde los mismos ítems: 12.500 + 18.000 + 9.200 = 39.700. No copiar el total inconsistente de 30.500. |

[S3, nodos 17:256, 6:324, 9:2, 9:539, 9:770, 9:939 y 9:1026; S1, p. 3; C]

# 3. Arquitectura general propuesta

## 3.1. Estructura lógica

**T01 — Monolito modular:** una aplicación Angular y una API NestJS; una base PostgreSQL; archivos de imágenes en almacenamiento local; envío de emails mediante SMTP. Prisma será la capa de persistencia, no el contrato público. No habrá microservicios, event sourcing, Redis obligatorio, bus de eventos externo ni infraestructura distribuida.

| Elemento | Responsabilidad y comunicación |
| --- | --- |
| Navegador / Angular | UI, formularios y carrito. Consume únicamente la API; no se conecta a la base. |
| API NestJS | Autenticación, autorización, validaciones, catálogo, pedidos, pagos, stock y reportes. |
| Prisma + PostgreSQL | Datos persistentes, restricciones y transacciones. Las escrituras críticas se resuelven en una única transacción. |
| Almacenamiento local | Archivos de imágenes con nombres generados por servidor y metadatos en base. Preparado mediante una interfaz pequeña para sustituir el almacenamiento. |
| Despachador de notificaciones | Lee trabajos de email persistidos y los envía fuera de la transacción del pedido. Se ejecuta dentro del mismo backend. |
| Mailpit local | Recibe el correo de prueba y permite inspeccionarlo. No entrega a las casillas reales mientras no se configure un servidor externo. |

Mailpit dispone de servidor SMTP e interfaz web para correo capturado; se propone solo para la verificación local. [T; R08]

## 3.2. Entorno reproducible y versiones

Docker Compose levantará PostgreSQL y Mailpit, con volúmenes persistentes y puertos ligados a loopback. Angular y NestJS podrán correr en el host para simplificar depuración. Un proxy de desarrollo hará que el navegador use rutas relativas del mismo origen para `/api` y los medios públicos. Los servicios auxiliares no se expondrán a la red por defecto. [T]

H0 verificará las versiones estables compatibles de Node.js, Angular, NestJS, Prisma, PostgreSQL y los generadores. Se fijarán versiones exactas, lockfiles y etiquetas o digest de imágenes; no se utilizará `latest` como garantía de reproducibilidad. Este plan no atribuye a una versión futura las APIs de una versión anterior. En particular, la documentación actual de Prisma y sus ramas versionadas difieren en las opciones de transacción; la implementación comprobará el mecanismo real disponible antes de codificarlo. [T; R05]

Configuración técnica en variables de entorno: conexión de base, secretos de sesión y cifrado de respuestas sensibles, origen permitido, rutas de archivos, SMTP, expiraciones, límites de carga y modo demo. Los datos comerciales editables van en base: identidad del negocio, contacto, textos, métodos habilitados y tarifa de entrega. Ningún secreto se incluirá en Angular, Git, logs o datos de prueba publicados. [T]

## 3.3. Autenticación y seguridad

**T02 — Sesión administrativa revocable en servidor:** cookie de identificador opaco, `HttpOnly`, `SameSite` explícito y `Secure` cuando haya HTTPS. Excepción documentada para localhost HTTP, nunca reutilizada en un entorno externo. Al iniciar sesión se rota el identificador; logout, desactivación de cuenta y restablecimiento de contraseña revocan sesiones. No se almacenan tokens administrativos en localStorage. Sesiones persistidas en PostgreSQL, no únicamente en memoria del proceso. [T; R03, R07]

Contraseñas protegidas con Argon2id y parámetros verificados contra la guía vigente; credenciales y contraseñas temporales no aparecen en seeds públicos. Se plantea una sola clase de usuario interno con las mismas capacidades administrativas y una protección contra desactivar la última cuenta activa. La recuperación inicial puede realizarse por otra cuenta administrativa o por un procedimiento local documentado, sin un portal de recuperación por email en esta PS. [T; R06]

Todas las rutas administrativas requieren autorización del backend. Los guards Angular solo controlan navegación. Las mutaciones con cookie incorporan protección CSRF, validación de origen y tokens asociados al contexto de sesión; SameSite no se trata como protección única. Login y consulta pública reciben límites de intentos y mensajes no enumerables. [T; R02, R07, R10]

# 4. Repositorio y responsabilidades

Árbol propuesto, no repositorio creado:

```text
/
  frontend/
    src/app/core/
    src/app/layouts/
    src/app/shared/ui/
    src/app/features/
    src/app/api-generated/
    src/styles/
    package.json + lockfile
  backend/
    src/modules/
    src/common/
    prisma/
      schema y migrations/
      seeds/
    test/
    package.json + lockfile
  contracts/
    openapi.yaml
    examples/
    CHANGELOG.md
  docs/
    plan.md
    decisions/
    figma-map.md
    milestones/
    manual-usuario.md
  scripts/
  compose.yaml
  .env.example
  .gitignore
  README.md
```

`frontend/` pertenece al frente Angular; `backend/`, al frente API/persistencia. `contracts/` pertenece a la integración global: no lo modifican dos frentes simultáneamente. `docs/decisions/` registra decisiones de arquitectura aceptadas; `docs/milestones/` conserva resultados y evidencia por hito. Los scripts futuros se limitan a tareas reproducibles de instalación, verificación y datos de prueba. [T; S2, «Repositorio», «Ownership»]

Se propone un manifiesto y lockfile por aplicación, sin introducir un gestor de monorepo adicional. H0 debe revisar primero cualquier contenido existente: no sobreescribir README, ramas, configuración de herramientas o migraciones sin inventario. Excluir `.env`, sesiones, tokens, uploads locales, volúmenes, compilados y archivos particulares de herramientas; conservar ejemplos saneados y recursos ficticios necesarios. [T]

# 5. Arquitectura Angular y mapeo del Figma

## 5.1. Organización

**T03:** componentes standalone, rutas por feature con carga diferida, servicios pequeños de acceso a datos y estado. `core` concentra sesión, configuración y errores transversales; `shared/ui` solo elementos reutilizables de interfaz, sin reglas de cobro o stock. Los archivos propios de una feature permanecen junto a ella. Esta organización sigue la recomendación oficial de agrupar por áreas funcionales. [T; R01]

Layouts: público con header/footer; autenticación sin navegación privada; administrativo con sidebar y cabecera. Las pantallas siguientes se implementan como rutas reales, no como copias de frames gigantes. La tabla es un mapeo de la evidencia leída, no un inventario nuevo del archivo vivo. [S3; T]

| Feature / ruta propuesta | Pantalla de referencia |
| --- | --- |
| home · `/` | Home CORREGIDA, 17:256; original 6:4 se conserva como referencia anterior. |
| catalog · `/productos` | Catálogo, 6:182. Categoría es un filtro de esta ruta, no una implementación duplicada. |
| catalog · `/productos/:slug` | Detalle, 6:324. Añadir selector de presentación cuando corresponda. |
| cart · `/carrito` | Carrito, 9:2. Añadir quitar renglón y precio/cantidad con unidad explícita. |
| checkout · `/checkout` | Checkout, 9:89. Añadir tarifa y validación de combinaciones de entrega/pago. |
| orders · `/pedido/:id/resultado` | Confirmado 9:179, pendiente 9:218 y rechazado 9:257; render según datos del servidor. |
| orders · `/consultar-pedido` | Consulta, 9:1232. Separar consulta mínima y acceso privado por token. |
| contact · `/contacto` | Contacto/ubicación, 9:1302. |
| admin-auth · `/admin/login` | Pantalla a completar; no localizada en los nodos inspeccionados. |
| admin-dashboard · `/admin` | Dashboard, 9:296. |
| admin-catalog · `/admin/productos` | Gestión, 9:412. |
| admin-catalog · `/admin/productos/nuevo`, `/:id/editar` | Alta/edición, 9:539. Presentaciones, galería y acceso a ajustes de stock. |
| admin-stock · `/admin/stock` | Extensión necesaria de la gestión de stock: saldos, impagos, movimientos y apertura. |
| admin-orders · `/admin/pedidos`, `/:id` | Gestión 9:637 y detalle 9:770. Añadir confirmación de pago y notas privadas. |
| admin-categories · `/admin/categorias` | Categorías, 9:844; formularios en diálogo o subruta. |
| admin-settings · `/admin/configuracion` | Configuración, 9:939. |
| admin-payments · `/admin/metodos-pago` | Métodos, 9:1026; modo demo y confirmación manual explícitos. |
| admin-reports · `/admin/reportes` | Reportes, 9:1109. |
| admin-users · `/admin/usuarios` | Gestión básica a completar por requisito S1. |
| admin-notifications · `/admin/notificaciones` | Lista mínima de envío/error y reintento; no una bandeja de comunicación general. |

## 5.2. Formularios, HTTP y estado

Formularios reactivos tipados para login, checkout y administración; validaciones reutilizables de cantidades enteras, campos obligatorios, importes y combinaciones válidas. Los datos se vuelven a validar en backend. Se elige un único enfoque de formularios para la primera versión, sin mezclar innecesariamente alternativas. [T; R04]

Signals y estado local para carrito, sesión y selección de filtros; RxJS/HttpClient para peticiones, cancelación de búsquedas y flujos HTTP. No se propone NgRx. El estado de filtros se refleja en query parameters para conservar navegación y recarga. El servidor sigue siendo la autoridad de precio, stock, pago y permisos. [T; R11]

Interceptores limitados a identificación de solicitudes, credenciales/CSRF donde corresponda y traducción de errores comunes. No reintentar automáticamente una escritura sin clave de idempotencia. Un 401 redirige a login en el área privada sin perder innecesariamente un formulario; un 409 presenta el conflicto y requiere revisión del usuario. [T]

El carrito persistirá únicamente identificadores de presentación y cantidades, con versión de formato. Los precios locales son informativos y se revalidan. No persistir allí contraseñas, dirección, datos bancarios o el formulario completo. El acceso temporal a un pedido recién creado se conserva en memoria/sessionStorage, no en la URL ni en logs. [T]

## 5.3. Estilos y estados de UI

Tokens CSS/SCSS a partir de Foundations: azul `#0B6FB3`, azul oscuro `#084D7D`, naranja `#F7931E`, base neutral e Inter. Estos valores son evidencia del Figma, no una certificación de contraste. Se comprobará legibilidad y se propondrá ajustar combinaciones donde haga falta, sin rediseñar silenciosamente la identidad. [S3, página 0:1; T]

Componentes comunes: botón, campo y errores, selector de cantidad/presentación, precio con unidad, tarjeta de producto/categoría, badges separados de pago y pedido, tabla paginada, diálogo, alerta y resumen de compra. La librería interna será pequeña: no construir un framework visual paralelo. [T]

Toda ruta debe contemplar carga, vacío, error, datos válidos y acción en progreso. Formularios: foco, errores asociados, campos deshabilitados, confirmación y cambios sin guardar. Pruebas propuestas en anchos de 360, 768 y 1440 píxeles, navegación por teclado y zoom. Los tamaños son criterios técnicos de prueba, no pantallas móviles ya diseñadas en Figma. [T; S1, p. 2]

# 6. Arquitectura NestJS

| Módulo propuesto | Responsabilidad y límites |
| --- | --- |
| auth / admins | Login, sesión, CSRF, logout, cuentas internas y revocación. Nunca expone hashes ni sesiones en respuestas de negocio. |
| catalog | Productos, presentaciones, categorías, características, visibilidad, búsqueda y filtros. No confirma pagos ni descuenta stock por guardar una ficha. |
| inventory | Saldos, umbrales, ajustes, apertura de rollos y movimientos. Solo modifica existencias mediante operaciones auditadas. |
| checkout | Presupuesto, validación de modalidad y cálculo del total. No reserva stock. |
| orders | Creación, snapshots, acceso público limitado, estados, notas e historial. |
| payments | Intentos, adaptador simulado, métodos manuales y confirmación; no confía en un estado enviado por Angular. |
| settings | Configuración comercial y métodos habilitados. Nunca publica secretos de la aplicación. |
| media | Validación, almacenamiento y recuperación de imágenes; sin importación de URL arbitraria. |
| notifications | Plantillas y trabajos de email; envío posterior al commit, reintento y trazabilidad. |
| reports | Consultas agregadas sobre pedidos y pagos confirmados; no introduce nuevas fuentes de verdad. |
| persistence / common | Prisma, transacciones, validación de entorno, errores y logging saneado. Sin convertir common en un depósito de lógica comercial. |

[T; módulos ajustados a S2, «Arquitectura NestJS»]

Controladores delgados; casos de uso en servicios; acceso a persistencia detrás de servicios específicos cuando protege una regla. No se exige repositorio genérico por tabla ni interfaces para toda clase. Solo se abstraen cambios previsibles: proveedor de pago, envío de email y almacenamiento de archivos. [T]

**Una sola entrada para confirmar pago:** un caso de uso coordina la verificación del pedido, pago, saldos, movimientos, historial y trabajos de email dentro de una transacción de base. Los módulos participantes reciben el mismo contexto transaccional; no abren commits independientes. Ningún controlador ofrece un PATCH genérico que permita saltarse esa operación. [T]

# 7. Modelo de dominio y reglas críticas

## 7.1. Producto, presentación y saldo

`Product` representa un artículo concreto con nombre, categoría, marca, descripciones, características y visibilidad. Un cable rojo y uno azul pueden ser artículos separados si el negocio los carga así; no se generan variantes combinatorias. `ProductPresentation` representa cómo se vende ese artículo: UNIT, METER o ROLL. Tiene precio, umbral y estado propio; no es un atributo como color. [C02–C04; T]

**T04 — Saldos separados:** un producto vendido por unidad tiene presentación UNIT. Un producto lineal puede tener METER y ROLL, con longitud entera positiva por rollo configurada para ese artículo. Se mantienen disponibilidad de metros abiertos y disponibilidad de rollos cerrados por separado. La longitud no se presume de 100 metros para todos los productos.

**T05 — Apertura explícita y manual:** el administrador registra la apertura física de N rollos disponibles. Una operación resta N del saldo cerrado y suma N × longitud al saldo de metros. Ambos cambios ocurren juntos o ninguno ocurre. No se permite abrir rollos ya descontados por pedidos pagados. No se reconstruye un rollo cerrado sumando metros sueltos.

Ejemplo ficticio: 3 rollos cerrados de 100 m y 20 m abiertos. Abrir 1 deja 2 rollos cerrados y 120 m abiertos. Confirmar una compra de 1 rollo deja 1 rollo cerrado; confirmar 30 m deja 90 m abiertos. El equivalente total sirve para control interno, nunca para prometer rollos cerrados que no existen.

Por simplicidad y para no fingir una apertura física, el checkout no convertirá rollos automáticamente. Si solo hay rollos cerrados y el saldo abierto es cero, la presentación por metro no se considera disponible hasta registrar la apertura. La venta por metro se controla por cantidad agregada; no se implementa trazabilidad de cada tramo ni garantía automática de continuidad de un corte. Ese límite debe validarse antes de usar el sistema con inventario real. [T; P04]

Los precios de metro y rollo serán configurables por presentación: no se supone que un rollo cueste exactamente longitud × precio por metro. La longitud/unidad de una presentación con movimientos no se modifica en el lugar; se cierra la anterior y se crea el artículo/presentación que corresponda mediante procedimiento de migración. [T]

## 7.2. Disponibilidad e impagos

**Cantidad disponible** es lo que el e-commerce todavía puede asignar a nuevos pagos confirmados. No es un conteo físico completo del local: no incluye como disponible lo pagado pendiente de entrega y tampoco está sincronizado con mostrador. Administración mostrará por separado disponible, solicitado sin pago confirmado y pagado pendiente de entrega. [C05–C07; T]

Los pedidos activos sin pago confirmado aportan a la demanda informativa; los cancelados no. Un intento rechazado no cancela automáticamente el pedido: mientras siga activo y recuperable, su cantidad pertenece a demanda sin pago confirmado. Las cantidades se agrupan por presentación, sin sumar metros, rollos y unidades como si fueran equivalentes. [T]

Un pedido no puede solicitar individualmente más de lo disponible en su presentación al registrarse. Como no hay reserva, varios pedidos impagos pueden superar conjuntamente el stock. Al confirmar el pago se vuelve a verificar y solo se acepta una combinación con existencias suficientes para todos sus renglones. El cliente recibe un mensaje claro de que registrar el pedido no garantiza reserva. [S2, «Stock»; C06–C07; T]

Regla pública propuesta: cantidad cero → OUT_OF_STOCK; cantidad positiva y menor o igual al mínimo → LOW_STOCK; superior al mínimo → AVAILABLE. Se aplica por presentación. La API pública no envía el saldo exacto ni lo incluye en errores; el administrador sí accede a saldos. Los umbrales son configurables, no un número fijo aplicado a productos distintos. [S2, «Stock»; S3, 9:539; T]

## 7.3. Pago comercial frente a resultado del simulador

| Hecho | Estado comercial del pago | Efecto en disponibilidad |
| --- | --- | --- |
| Pedido registrado con pago al retirar o transferencia | PENDING | Ninguno. |
| Simulador devuelve PENDING | PENDING; intento PENDING | Ninguno. |
| Simulador devuelve APPROVED | PENDING; intento APPROVED; confirmación administrativa pendiente | Ninguno. |
| Simulador devuelve REJECTED | REJECTED; intento rechazado conservado | Ninguno. |
| Reintento con método válido | PENDING; nuevo intento asociado al mismo pedido | Ninguno. |
| Administrador confirma el importe completo y hay stock | PAID, con fecha y administrador | Un descuento por cada renglón, en una sola transacción. |
| Se repite la confirmación de un pago ya registrado | Se devuelve el resultado existente si es la misma operación | Ningún descuento adicional. |
| Confirmación encuentra stock insuficiente | No se confirma dentro del sistema; conflicto operativo | Ningún descuento parcial. |

C07 determina la confirmación manual. Separar el resultado del proveedor en `PaymentAttempt` es la propuesta técnica que permite conservar los escenarios del brief sin implementar un descuento automático no aprobado. Solo se confirma el intento vigente: manual pendiente o simulación aprobada, nunca uno rechazado. Una pantalla de simulación aprobada no dirá «Total abonado» mientras el pago comercial esté pendiente. La pantalla «Pagado» solo se obtiene después de la confirmación manual; todos los datos demo siguen identificados como simulados. [C; S2, «Pagos»; S3, 9:179 y 9:1026; T]

El control transaccional no prueba que haya ingresado dinero real. Para pagos manuales, el operador debe verificar el cobro. Si el dinero llegó por fuera y luego falta stock, el sistema no debe afirmar que ese ingreso nunca ocurrió: la conciliación y eventual devolución quedan como incidencia manual, sin devolución automática. No se implementan pagos parciales ni múltiples cobros confirmados por el mismo pedido. [T; P01]

## 7.4. Estados del pedido y modalidad

`OrderStatus` propuesto: RECEIVED, PREPARING, READY, DELIVERED, CANCELLED. `DeliveryMode`: PICKUP o COORDINATED. `PaymentStatus`: PENDING, REJECTED o PAID. Se separa modalidad de entrega del progreso, en lugar de usar «Entrega coordinada» indistintamente como modalidad y estado. READY se presenta como «Listo para retirar» o «Listo para entrega» según la modalidad. [S2, «Pedidos»; S3, 9:1232; T]

| Transición propuesta | Condición |
| --- | --- |
| Nuevo → RECEIVED | Pedido válido, snapshots completos y pago pendiente. |
| RECEIVED → PREPARING | Pago confirmado manualmente. Evita que el flujo propuesto prepare/aparte automáticamente mercadería impaga. |
| PREPARING → READY | Preparación completada; conservar historial y emitir aviso. |
| READY → DELIVERED | Retiro/entrega realizado; no vuelve a descontar stock. |
| RECEIVED → CANCELLED | Pago sin confirmar y motivo obligatorio; desaparece de demanda impaga. |
| Cancelar pedido pagado o revertir estados | Política pendiente P01. No se habilita un atajo que reintegre stock o dinero sin acuerdo. |

Estas transiciones son propuestas para revisión, no una descripción confirmada de cada procedimiento interno de ABAR. El backend publicará las acciones permitidas para cada pedido; Angular no reconstruirá permisos a partir de textos.

## 7.5. Invariantes que no se negocian dentro de una implementación

Cantidades y saldos enteros; saldos no negativos; venta de rollo solo desde saldo cerrado; dinero sin cálculos binarios de coma flotante; total coherente con renglones y entrega; ausencia de doble descuento; integridad de snapshots; un intento rechazado no borra el pedido; cambio de método no crea otro pedido; cancelación impaga no devuelve stock que nunca se descontó; pago y pedido nunca se actualizan parcialmente. [T derivadas de C y del brief]

# 8. Modelo relacional propuesto

No se entrega todavía un esquema Prisma ejecutable. Este modelo describe tablas y relaciones para convertirlas en migraciones después de aprobar el plan. Se usa JSONB solo para estructuras acotadas que lo justifican; cantidades, importes, estados y relaciones críticas tienen columnas propias. [T]

| Tabla | Campos principales y relaciones |
| --- | --- |
| admins | id, nombre, email normalizado único, password_hash, activo, must_change_password, versión y fechas. |
| admin_sessions | id, admin_id, identificador protegido según el store elegido, expiración, revocación. Relación Admin 1:N Session. |
| categories | id, nombre, slug único, descripción, activo, orden, imagen/ícono opcional y versión. |
| products | id, category_id, slug, nombre, marca, SKU opcional único, descripciones, características JSONB, activo, destacado, versión. Category 1:N Product. |
| product_presentations | id, product_id, unit, longitud del rollo cuando aplica, precio en centavos, mínimo, activo, orden/default, versión. Product 1:N Presentation. |
| product_images | id, product_id, storage_key, media_type, bytes, alt, orden y principal. Product 1:N Image. |
| stock_balances | presentation_id único, available_quantity, versión. Presentation 1:1 Balance. |
| stock_operations | id, tipo, motivo, admin_id, payment_id opcional, fecha y referencia de idempotencia. |
| stock_entries | id, operation_id, presentation_id, delta y saldo resultante. Operation 1:N Entry; Presentation 1:N Entry. |
| checkout_quotes | id, snapshot de renglones/total/opciones, expiración, huella/versiones de precio y configuración. No reserva stock. |
| orders | id, order_number único, quote_id único, datos del comprador, modalidad y datos de entrega, subtotal, tarifa, total, estado, versión, acceso público temporal protegido, fechas. |
| order_items | id, order_id, presentation_id, cantidad y snapshots de nombre, SKU, unidad, longitud, precio e importe. Order 1:N Item. |
| payments | id, order_id único, importe, estado comercial, método vigente/snapshot, current_attempt_id, confirmed_at, confirmed_by y versión. Order 1:1 Payment. |
| payment_attempts | id, payment_id, método, proveedor, outcome, referencia simulada/manual, idempotencia, fechas. Payment 1:N Attempt. |
| order_events | id, order_id, tipo, estado anterior/nuevo, actor y fecha. Historial inmutable y saneado. |
| order_notes | id, order_id, admin_id, texto y fecha. Notas internas separadas del comentario del cliente. |
| business_settings | registro único, datos comerciales, textos, retiro/entrega habilitados, tarifa, zona horaria y versión. |
| payment_methods | código único, tipo, activo, modalidades permitidas e instrucciones/configuración pública acotada y versión. No secretos del proveedor. |
| notification_jobs | id, order_id, evento, destinatario, payload de plantilla, estado, intentos, próximo intento, error saneado y dedupe_key único. |
| idempotency_keys | ámbito, clave protegida, request_hash, estado, referencia de recurso/respuesta protegida y expiración. Unicidad por ámbito y clave. |

Las 20 tablas propuestas evitan un cliente registrado ficticio, un esquema de variantes combinatorias y un sistema contable. Algunas representaciones internas pueden consolidarse durante H0 solo si se conservan las reglas y se registra el cambio; no se autoriza a eliminar auditoría o protección de concurrencia por simplificar nombres. [T]

## 8.1. Tipos, restricciones e índices

Identificadores técnicos UUID; número visible de pedido separado y no usado como credencial. Fechas en `timestamptz`, serializadas con zona UTC; reportes con zona comercial `America/Argentina/Buenos_Aires`. Cantidades enteras; importes `bigint` en centavos, serializados como cadenas decimales. La moneda del MVP es ARS. [T]

CHECK para cantidades/saldos no negativos, cantidad de pedido positiva, precio positivo y tarifa no negativa. Unicidad de producto/presentación por unidad en esta versión; longitud positiva para ROLL; SKU nulo permitido; una imagen principal como máximo por producto; un Payment por Order; un descuento de confirmación por Payment. Las restricciones que el ORM no exprese se agregan en migraciones SQL versionadas. [T]

Índices propuestos: productos por categoría/activo y slug; pedidos por fecha, estado y número; pagos por estado/confirmación; movimientos por presentación/fecha; intentos por pago/fecha; notificaciones por estado/próximo intento; claves y sesiones por expiración. Búsqueda básica parametrizada por nombre, marca, categoría, SKU y texto de características. No introducir un buscador externo: optimizar índices de texto solo si las mediciones lo requieren. [T]

## 8.2. Historia y borrado

Desactivar antes que eliminar productos/presentaciones usados en pedidos. Las categorías con productos activos no podrán desactivarse sin reasignar o desactivar esos productos de forma explícita. Claves foráneas históricas con borrado restringido, no cascada que borre ventas. Los cambios de precio, nombre, longitud o tarifa no alteran snapshots de pedidos existentes. [S2, «Productos», «Categorías», «Pedidos»; T]

El saldo disponible se conserva materializado y cada cambio genera movimientos, dentro de la misma transacción. No se trata de event sourcing: el saldo sirve la operación y los movimientos permiten auditoría/reconciliación. Un ajuste requiere motivo; no hay un PATCH libre de `availableQuantity`. [T]

## 8.3. Concurrencia e idempotencia

En confirmación: bloquear el pedido/pago y las filas de saldo involucradas, siempre con orden determinista; comprobar importes, estado y stock; aplicar todos los débitos; marcar PAID; registrar historia y trabajos de email; confirmar la transacción. Ante conflicto o error, rollback completo. PostgreSQL permite bloqueos de fila que impiden escrituras incompatibles hasta finalizar la transacción. La sintaxis concreta a través de Prisma se verificará en H0. [T; R05, R09]

También apertura, ajustes y cancelaciones deben coordinarse con esos mismos saldos. Reintentos limitados para conflictos transitorios; nunca un bucle ilimitado. `Idempotency-Key` protege creación de pedido, intentos, confirmación, apertura y ajustes. Misma clave/mismo cuerpo devuelve la operación previa; misma clave/otro cuerpo devuelve 409. La creación de pedido protege además `quote_id` con unicidad para evitar duplicados con claves distintas. [T]

Una credencial temporal de acceso a pedido no se guarda en claro junto a los datos ordinarios: se almacena su hash para validarla. Si la respuesta idempotente debe reemitir esa credencial, se protege la respuesta almacenada con cifrado autenticado y una clave de entorno, o un mecanismo equivalente revisado en H0. No basta con guardar el token en texto en la tabla de idempotencia. [T]

# 9. Contrato de API candidato

## 9.1. Reglas comunes

Prefijo `/api/v1`. Áreas `/public`, `/auth` y `/admin`. JSON, nombres de campos en inglés y textos de interfaz en español. OpenAPI 3.0.3 propuesto como dialecto contractual compatible a verificar en H0; no se lo presenta como la edición más reciente. `contracts/openapi.yaml` será la única referencia normativa aprobada por hito. Swagger generado por NestJS se compara semánticamente con ese archivo; no lo reemplaza sin revisión. [T; R12, R13]

Listados: `page` desde 1; `pageSize` predeterminado 20 y máximo técnico 100; `sort` de una lista cerrada. Respuesta `items` y `pageInfo {page,pageSize,totalItems,totalPages}`. Objetos individuales sin envoltorio innecesario; errores siempre `code, message, fieldErrors?, requestId`. No se filtran stack traces ni mensajes SQL. IDs opacos; fechas RFC 3339 UTC. [T]

Dinero: `Money {amountMinor: string, currency: 'ARS'}`. Ejemplo ficticio: `amountMinor='1250000'` representa ARS 12.500. Cantidades son enteros JSON. Operaciones críticas con `Idempotency-Key`; ediciones con `expectedVersion`. Paginación, filtros, enums, dinero y errores se congelan antes de que Front y Back creen mocks separados. [S2, «OpenAPI como contrato»; T]

Autorización: **P** pública; **A** sesión administrativa y CSRF para mutaciones; **G** token temporal opaco del pedido, limitado a leer ese pedido y reintentar métodos autorizados. El token G no permite confirmar pago, cambiar renglones, cancelar ni leer notas privadas. Una consulta por número y contacto no otorga automáticamente el token G. [T]

Errores comunes: 400 datos inválidos; 401 credencial ausente/expirada; 403 acción no permitida; 404 recurso inexistente o no accesible; 409 conflicto de negocio/versión; 413 carga demasiado grande; 415 tipo no admitido; 429 límite de intentos; 503 dependencia temporalmente indisponible. En las tablas se añaden errores específicos. Los éxitos y errores deben aparecer también en OpenAPI y ejemplos de contrato. [T]

## 9.2. Objetos y requests principales

| DTO / objeto | Contenido contractual propuesto |
| --- | --- |
| ProductSummary | id, slug, name, category, brand?, primaryImage?, defaultPresentation, matchingPresentation?, activePresentations. Cada presentación pública incluye id, unit, rollLengthMeters?, price y availability; no saldo exacto. |
| ProductDetail | ProductSummary + shortDescription, description, characteristics[{key,value}], images[{id,url,alt,order,isPrimary}]. |
| AdminProduct | ProductDetail + SKU, activo/destacado, versión y presentaciones con mínimo, saldo, demanda impaga y pagado pendiente de entrega. |
| ProductWrite | name, categoryId, brand?, SKU?, descriptions, characteristics, active, featured, presentations[{id?,unit,rollLengthMeters?,price,lowStockThreshold,active,isDefault}]. Actualización requiere expectedVersion; no admite saldos. |
| QuoteRequest | items[{presentationId,quantity}], deliveryMode y paymentMethodCode. El servidor normaliza renglones repetidos, valida cantidades y calcula precios y tarifa. |
| QuoteResponse | quoteId, expiresAt, items con snapshots, subtotal, deliveryFee, total, deliveryMode, paymentMethod y warnings. No contiene reserva ni promesa de disponibilidad futura. |
| CreateOrderRequest | quoteId, customer{firstName,lastName,email,phone}, customerNote?, deliveryDetails?, acceptedTermsVersion. No acepta estado de pago, saldo ni importes autoritativos enviados por el navegador. |
| CreateOrderResponse | orderId, orderNumber, orderStatus, paymentStatus, currentAttemptId, total, accessToken temporal, accessExpiresAt, nextActions y demoMode. |
| PublicOrderView | número, fecha, renglones resumidos, importes, modalidad, estado de pedido/pago, resultado del último intento y próximos pasos. Sin notas internas ni domicilio/contacto completo. |
| LookupRequest | orderNumber y contact. Respuesta mínima; error genérico si no coincide cualquiera de ambos. |
| AdminOrderDetail | cliente, entrega, comentarios del comprador, snapshots, payment/attempts, historial/notas y allowedActions; version. |
| AttemptRequest | methodCode y, solo en modo demo y para el simulador, scenario APPROVED/PENDING/REJECTED. Método habilitado y compatible con el pedido. |
| PaymentConfirmationRequest | expectedVersion, attemptId, confirmedAmount, reference? y note?. Importe completo exactamente igual al total congelado. |
| StockAdjustmentRequest | presentationId, delta entero no cero, reason y expectedVersion. No permite saldo final negativo. |
| RollOpeningRequest | productId, rollQuantity entero positivo, reason y expectedVersions. Longitud tomada de la presentación almacenada, no del cliente. |
| OrderStatusRequest | targetStatus, expectedVersion y note?. Solo transición permitida, no cambio libre de PaymentStatus. |
| SettingsWrite | datos comerciales, contacto, horarios, pickupEnabled, coordinatedDeliveryEnabled, deliveryFee y expectedVersion. Secrets no admitidos. |
| SalesReport | período/zona, total confirmado de productos, entrega cobrada separada, total cobrado, pedidos confirmados, ticket promedio, impagos, series, estados, productos/presentaciones y métodos. |

Campos de comprador obligatorios y detalle de entrega son propuestas sujetas a P03. El contrato definitivo detallará límites de longitud, nulabilidad, ejemplos y mensajes en H0/H4; no se afirmará que esas validaciones fueron confirmadas por ABAR. [T]

## 9.3. API pública

Todos los paths siguientes se agregan a `/api/v1`.

| Método y path · acceso | Request / respuesta de éxito | Errores específicos |
| --- | --- | --- |
| GET `/public/settings` · P | Sin cuerpo → 200 datos comerciales públicos, opciones de entrega, tarifa, modo demo y textos vigentes. | 503 si no hay configuración válida. |
| GET `/public/home` · P | Sin cuerpo → 200 categorías destacadas, productos destacados y últimas unidades. Misma forma de ProductSummary. | 503. |
| GET `/public/categories` · P | Query de listado/orden → 200 categorías activas. | 400 filtro no admitido. |
| GET `/public/products` · P | q, categoryId, availability, unit?, minPriceMinor?, maxPriceMinor?, sort, page, pageSize → 200 listado. | 400 rango/filtro inválido. |
| GET `/public/products/{slug}` · P | Slug → 200 ProductDetail visible. | 404 producto no visible. |
| GET `/public/payment-methods` · P | deliveryMode → 200 métodos activos compatibles e instrucciones públicas. | 400 modalidad inválida. |
| POST `/public/checkout/quotes` · P | QuoteRequest → 201 QuoteResponse. | 409 INSUFFICIENT_STOCK, PRODUCT_UNAVAILABLE, METHOD_UNAVAILABLE, DELIVERY_UNAVAILABLE. |
| POST `/public/orders` · P + idempotencia | CreateOrderRequest → 201 CreateOrderResponse; replay conserva resultado. | 409 QUOTE_EXPIRED, QUOTE_CHANGED, INSUFFICIENT_STOCK, QUOTE_ALREADY_USED, IDEMPOTENCY_CONFLICT. |
| POST `/public/orders/lookup` · P | LookupRequest → 200 vista mínima de estado. | 404 ORDER_NOT_FOUND genérico; 429. |
| GET `/public/orders/{id}` · G | Token por cabecera → 200 PublicOrderView. | 401/404 sin acceso válido. |
| POST `/public/orders/{id}/payment-attempts` · G + idempotencia | AttemptRequest → 201 intento y estados actuales. | 409 ORDER_PAID, ORDER_CANCELLED, METHOD_UNAVAILABLE; 403 escenario demo fuera del modo demo. |

El rango de precio y ordenamiento de productos se evaluará sobre presentaciones vendibles. Con filtro `unit`, se compara esa unidad; sin él, la respuesta identifica la presentación que satisface el filtro y muestra su precio/unidad. Un filtro por precio de metro no puede mostrar después un precio por rollo sin aclaración. No se duplican artículos para simular resultados de filtro. [T]

La consulta por número/contacto conserva el acceso propuesto en Figma, pero devuelve solo información mínima y aplica límites. No equivale a una autenticación fuerte. Los datos personales completos y las acciones quedan restringidos; recuperar acceso temporal más amplio requiere un flujo revisado, no revelar tokens por conocer un teléfono. [S3, 9:1232; T]

## 9.4. Sesión y cuentas

| Método y path · acceso | Request / respuesta de éxito | Errores específicos |
| --- | --- | --- |
| GET `/auth/csrf` · P | Inicializa protección de solicitudes → 200 token/metadata según middleware elegido. | 429. |
| POST `/auth/login` · P con CSRF/origen | email, password → 200 AdminSessionView y cookie rotada. | 401 INVALID_CREDENTIALS genérico; 429. |
| GET `/auth/me` · A | Sin cuerpo → 200 usuario y expiración, nunca identificador de sesión. | 401 SESSION_EXPIRED. |
| POST `/auth/logout` · A | Sin cuerpo → 204; revoca y elimina cookie. Repetición segura. | 403 CSRF inválido. |
| POST `/auth/change-password` · A | currentPassword, newPassword → 204; renueva sesión y revoca las restantes. | 400 PASSWORD_POLICY; 401 credencial incorrecta. |
| GET `/admin/users` · A | Paginación → 200 usuarios internos saneados. | 400. |
| POST `/admin/users` · A | nombre, email, temporaryPassword → 201 usuario con cambio obligatorio. | 409 EMAIL_IN_USE. |
| PATCH `/admin/users/{id}` · A | nombre/activo, expectedVersion → 200 usuario. | 409 LAST_ACTIVE_ADMIN, VERSION_CONFLICT. |
| POST `/admin/users/{id}/reset-password` · A | temporaryPassword y motivo → 204; revoca sesiones. | 404; 400 PASSWORD_POLICY. |

Una sesión con cambio obligatorio solo puede cambiar contraseña, consultar su identidad o cerrar sesión. Este control corresponde al servidor. Las operaciones sobre usuarios quedan auditadas sin registrar contraseñas. [T]

## 9.5. Catálogo, imágenes y stock administrativo

| Método y path · acceso A | Request / respuesta de éxito | Errores específicos |
| --- | --- | --- |
| GET `/admin/categories` | Filtros/paginación → 200 listado completo. | 400. |
| POST `/admin/categories` | nombre, slug?, descripción?, activo, orden → 201 categoría. | 409 SLUG_IN_USE. |
| PATCH `/admin/categories/{id}` | cambios + expectedVersion → 200 categoría. | 409 CATEGORY_HAS_ACTIVE_PRODUCTS, VERSION_CONFLICT. |
| PATCH `/admin/categories/order` | lista ordenada de IDs + versión → 200 orden vigente. | 409 CATEGORY_SET_CHANGED. |
| GET `/admin/products` | q, categoría, activo, disponibilidad, paginación → 200 listado. | 400. |
| GET `/admin/products/{id}` | ID → 200 AdminProduct. | 404. |
| POST `/admin/products` | ProductWrite → 201 producto y presentaciones, saldos iniciales en cero. | 409 SKU_IN_USE, SLUG_IN_USE; 400 INVALID_PRESENTATION. |
| PATCH `/admin/products/{id}` | ProductWrite parcial y versión → 200 producto. | 409 PRESENTATION_IMMUTABLE, VERSION_CONFLICT. |
| POST `/admin/products/{id}/images` | multipart con archivo, alt, orden/principal → 201 metadatos de imagen. | 413/415; 400 INVALID_IMAGE. |
| PATCH `/admin/products/{id}/images/{imageId}` | alt, orden/principal → 200 imagen. | 404; 409 orden/principal incoherente. |
| DELETE `/admin/products/{id}/images/{imageId}` | ID → 204; actualiza referencia principal. | 404; fallo de archivo se registra para limpieza. |
| GET `/admin/stock` | presentación/producto, disponibilidad, paginación → 200 saldos y cantidades informativas. | 400. |
| GET `/admin/stock/movements` | presentación, período, paginación → 200 movimientos auditados. | 400. |
| POST `/admin/stock/adjustments` | StockAdjustmentRequest + idempotencia → 201 operación/saldo. | 409 NEGATIVE_STOCK, VERSION_CONFLICT. |
| POST `/admin/stock/roll-openings` | RollOpeningRequest + idempotencia → 201 operación y dos saldos. | 409 INSUFFICIENT_CLOSED_ROLLS, VERSION_CONFLICT; 400 INVALID_ROLL_CONFIGURATION. |

El alta puede solicitar después un ajuste inicial mediante el mismo mecanismo auditado. Editar precio o descripción no modifica saldo. Las imágenes admitidas serán tipos raster seguros verificados por contenido; límites técnicos de tamaño/dimensiones definidos en H0 y publicados para los formularios. Sin SVG subido libremente, sin ejecución, sin rutas del usuario y sin descargar imágenes de URLs arbitrarias desde el servidor. [T]

## 9.6. Pedidos y pagos administrativos

| Método y path · acceso A | Request / respuesta de éxito | Errores específicos |
| --- | --- | --- |
| GET `/admin/orders` | q, orderStatus, paymentStatus, deliveryMode, período y paginación → 200 pedidos. | 400. |
| GET `/admin/orders/{id}` | ID → 200 AdminOrderDetail. | 404. |
| PATCH `/admin/orders/{id}/status` | OrderStatusRequest → 200 pedido actualizado. | 409 INVALID_TRANSITION, PAYMENT_NOT_CONFIRMED, VERSION_CONFLICT. |
| POST `/admin/orders/{id}/cancel` | motivo, expectedVersion + idempotencia → 200 cancelación impaga. | 409 PAID_CANCELLATION_REQUIRES_REVIEW, INVALID_TRANSITION. |
| POST `/admin/orders/{id}/notes` | texto → 201 nota interna. | 400 texto inválido. |
| GET `/admin/orders/{id}/history` | Paginación → 200 eventos/notas autorizados. | 404. |
| POST `/admin/orders/{id}/payment-confirmation` | PaymentConfirmationRequest + idempotencia → 200 pago/pedido/saldos afectados. | 409 INSUFFICIENT_STOCK, AMOUNT_MISMATCH, INVALID_ATTEMPT, ORDER_CANCELLED, PAYMENT_ALREADY_CONFIRMED, VERSION_CONFLICT. |

`PAYMENT_ALREADY_CONFIRMED` corresponde a una confirmación incompatible con la existente; una repetición idéntica devuelve éxito previo, no un segundo cobro. Confirmar un método manual previamente elegido sigue siendo posible aunque luego se deshabilite para nuevas compras; se preservan las instrucciones históricas. Los reintentos nuevos sí verifican la configuración vigente y la compatibilidad. [T]

## 9.7. Configuración, notificaciones y reportes

| Método y path · acceso A | Request / respuesta de éxito | Errores específicos |
| --- | --- | --- |
| GET `/admin/settings` | → 200 configuración comercial. | 503 configuración inválida. |
| PATCH `/admin/settings` | SettingsWrite → 200 configuración/version. | 409 NO_VALID_CHECKOUT_COMBINATION, VERSION_CONFLICT. |
| GET `/admin/payment-methods` | → 200 métodos y configuración editable sin secretos. | 400. |
| PATCH `/admin/payment-methods/{code}` | activo, instrucciones, modalidades permitidas, versión → 200 método. | 409 NO_VALID_CHECKOUT_COMBINATION, VERSION_CONFLICT. |
| GET `/admin/notifications` | estado, pedido, período, paginación → 200 trabajos y errores saneados. | 400. |
| POST `/admin/notifications/{id}/retry` | → 202 reintento encolado, sin repetir el pedido/pago. | 409 NOT_RETRYABLE. |
| GET `/admin/dashboard` | período opcional → 200 indicadores operativos. | 400. |
| GET `/admin/reports/sales` | from, to, método, estado → 200 SalesReport. | 400 INVALID_PERIOD. |
| GET `/admin/reports/sales/export` | Los mismos filtros → 200 CSV de los datos definidos del reporte. | 400; 429 por uso excesivo. |

Endpoints operativos locales adicionales: GET `/health` y documentación Swagger en `/api/docs`. Deben responder sin exponer credenciales ni datos del entorno. No se incluyen endpoints públicos que creen administradores o marquen pedidos pagados. [T]

## 9.8. Definición de métricas

Propuesta: ventas por período se basan en pagos manualmente confirmados y su `confirmedAt`; pedidos nuevos se basan en `createdAt`. Mostrar por separado subtotal de productos y tarifa de entrega. Ticket promedio = total cobrado del conjunto confirmado / cantidad de pedidos de ese conjunto; si el denominador es cero, se muestra cero con período explícito. [T]

Los impagos se cuentan como pedidos activos sin pago confirmado, con desglose de intentos rechazados. Los productos más vendidos se informan por presentación o por importe: no sumar 5 rollos y 20 metros como 25 unidades homogéneas. Pedidos por estado se refiere al estado actual, no a una reconstrucción temporal implícita. El filtro de fechas usa inicio incluido y fin excluido calculados con la zona del negocio. [T]

El CSV incluye período, filtros y etiquetas de modo demo, y neutraliza celdas susceptibles de interpretarse como fórmulas. No se implementa una suite de exportaciones ni un archivo de contabilidad. Si se confirma una política de cancelación pagada, estas métricas deberán ajustarse explícitamente antes de congelar H7. [T; P01]

# 10. Flujos críticos y aceptación

## 10.1. Login y sesión

Obtener protección CSRF → enviar credenciales → validar hash y usuario activo → rotar sesión → cargar identidad y rutas administrativas. Recargar el navegador conserva la sesión válida; logout revoca el acceso; desactivar al usuario invalida sus sesiones. Un guard del navegador nunca autoriza un endpoint por sí mismo. [T]

## 10.2. Navegación, búsqueda y detalle

Cargar configuración y categorías; buscar por texto y aplicar filtros; conservar filtros en URL; abrir producto visible y seleccionar presentación. Mostrar precio por unidad/metro/rollo y disponibilidad de esa presentación. Una presentación sin stock no puede añadirse; una sin visibilidad no aparece. La galería siempre tiene alternativa cuando faltan imágenes. [S2, «Comportamiento general»; T]

## 10.3. Carrito y presupuesto

Agregar por presentationId; combinar renglones iguales; incrementar de uno en uno; permitir quitar y vaciar con feedback. Solicitar presupuesto al pasar a checkout o cambiar modalidad/método. Precio y tarifa se calculan en servidor, no se aceptan los del almacenamiento local. Un presupuesto tiene expiración técnica propuesta de 10 minutos, configurable y sin reserva. [C02, C08; T]

## 10.4. Creación de pedido

Validar datos y términos vigentes; releer presupuesto; comprobar precios/configuración actuales y disponibilidad; si cambiaron, devolver conflicto y mostrar un nuevo resumen para aceptación. Si es válido, guardar pedido, renglones históricos, pago y primer intento pendientes, evento y emails en una transacción, sin descontar stock. Responder número y acceso temporal. El carrito se vacía después de constatar creación, no depende de que un simulador apruebe. Ante timeout, repetir la misma clave; no crear automáticamente otro pedido. [T]

Los precios y la tarifa se congelan en el pedido creado. Si luego cambia la configuración, no se cobra silenciosamente otra suma. La vigencia comercial de pedidos impagos y eventuales modificaciones deben validarse; la PS no editará renglones de un pedido ya creado sin una decisión explícita. [T; P02]

## 10.5. Simulador e intentos

El comprador de la demo ejecuta un intento vinculado a su pedido, con escenario controlado. El adaptador devuelve APPROVED, PENDING o REJECTED y persiste el intento; ninguno marca PAID automáticamente. El resultado público describe exactamente ambos estados cuando difieren. Reintentar o cambiar de método crea otro intento del mismo pedido, no otro pedido. Un resultado tardío de un intento viejo no reemplaza al intento vigente ni degrada un pago ya confirmado. [S2, «Pagos»; C07; T]

El modo demo es configuración del servidor y se señaliza visualmente. Un parámetro de Angular no puede habilitarlo fuera de ese modo. No se solicitan tarjetas, credenciales de banca o datos de pago reales. El proveedor futuro podrá reutilizar contratos internos, pero activar confirmación automática requerirá una decisión de alcance nueva. [T]

## 10.6. Transferencia y pago en local

Transferencia: mostrar instrucciones de prueba/vigentes y dejar pendiente; un comprobante no prueba automáticamente el cobro. Pago al retirar: explicar que el pedido no reserva y el pago se verifica en el local. Ambos se confirman desde administración mediante la misma operación transaccional. [S2, «Métodos de pago»; C06–C07; T]

La combinación propuesta conserva Figma: pago al retirar solo con retiro; transferencia y simulador con retiro o entrega coordinada. En la demo pueden habilitarse para probar el flujo. No se presupone que ABAR ya acepte transferencia en su operación real. La modalidad de pago de una entrega cuando el negocio solo cobra en el local se valida antes de uso real; el checkout impide combinaciones sin método válido. [S3, 9:1026; C; P05]

## 10.7. Confirmación manual y stock

El administrador abre el pedido y revisa importe, intento y existencias. Confirma el cobro; el backend bloquea datos relevantes, revalida y ejecuta el descuento completo con cambio a PAID, historial y trabajo de email. Si falta una sola presentación, no confirma parcialmente. Un doble click o un reenvío no produce otro descuento. Marcar READY o DELIVERED no descuenta de nuevo. [C07; T]

## 10.8. Apertura y ajuste

Para abrir, seleccionar producto y cantidad de rollos; mostrar la longitud configurada y ambos saldos resultantes; confirmar la operación física y su motivo. Débito y crédito atómicos, identidad del administrador e historial. Para ajuste, mostrar delta/saldo final y exigir motivo; prohibir saldo negativo. Los dos mecanismos se prueban mientras otra transacción intenta confirmar un pedido. [C03; T]

## 10.9. Estados, consulta y cancelación

Un administrador realiza solo transiciones permitidas; notas del comprador e internas se visualizan separadas. El cliente consulta estado con datos mínimos o con su acceso temporal; no recibe notas ni información de otros pedidos. Cancelar un pedido sin pago confirmado quita su demanda informativa, no incrementa stock. Cancelaciones pagadas permanecen bloqueadas hasta resolver P01. [S1, p. 3; T]

## 10.10. Notificaciones

Eventos propuestos: pedido creado → comprador y administrador; pago confirmado → comprador y administrador; listo para retiro/entrega → comprador; cancelación → comprador y administrador. Pedidos e intentos rechazados no envían un correo por cada recarga de pantalla. [C09; T]

La creación del trabajo de email ocurre en la transacción de negocio y el envío después del commit. Si SMTP falla, pedido y pago permanecen correctos y el trabajo se reintenta. Clave única por evento/destinatario evita generar trabajos duplicados por el mismo hecho. Aun así, una caída después de enviar y antes de registrar el envío puede provocar una repetición: no se promete entrega exactamente una vez por SMTP. [T]

# 11. Datos ficticios y seeds

Dos conjuntos reproducibles: **base**, para catálogo, cuentas y configuración; **escenarios**, para pedidos y estados de demostración. Ejecución repetida no duplicará registros ni sobrescribirá automáticamente modificaciones manuales. El reinicio destructivo será un procedimiento separado, permitido solo en una base identificada como desarrollo. [S2, «Base de datos», «Seeds»; T]

| Grupo ficticio | Datos y propósito |
| --- | --- |
| Categorías | Cables, iluminación, térmicas, tomas, tableros y herramientas; una categoría inactiva para validar visibilidad. No se declaran categorías reales del negocio. |
| Productos unitarios | Térmica, toma y lámpara de ejemplo; uno disponible, uno bajo umbral, uno sin stock y uno inactivo. Precios y fichas sin afirmaciones técnicas de seguridad. |
| Productos lineales | Dos cables de prueba con longitudes por rollo distintas; presentaciones METER/ROLL, precios independientes, saldo cerrado y abierto. |
| Casos límite | Producto con metros y sin rollos; con rollos y sin metros; con ambas existencias; nombre largo; sin imagen; galería; SKU nulo. |
| Cuentas | Dos administradores ficticios; secretos por entorno/procedimiento local. Se prueba desactivación sin perder la última cuenta activa. |
| Configuración | Identidad ABAR de demostración, contactos `@example.test`, tarifa cero, retiro y entrega habilitados con métodos demo compatibles. |
| Pagos | Simulador, transferencia de prueba y pago al retirar; APPROVED/PENDING/REJECTED; confirmación manual posterior. Nunca cuentas bancarias reales en seeds. |
| Pedidos | Impago, rechazado recuperable, aprobado simulado aún impago, pagado, en preparación, listo, entregado y cancelado impago. |
| Emails | Direcciones de prueba capturadas por Mailpit; notificación enviada, fallida y reintentada. |
| Competencia de stock | Dos pedidos que individualmente tienen stock, pero compiten al confirmarse; solo uno puede consumir la última cantidad disponible. |

Los saldos de escenarios deben conciliar con movimientos: no insertar un pedido PAID sin su descuento correspondiente. No cargar fotografías o datos personales reales para «hacer más realista» la demo. Datos e imágenes reales se migrarán posteriormente mediante una planilla acordada y validación, sin escribir directamente sobre tablas históricas. [T]

# 12. Desarrollo paralelo e integración

| Bloque | Frontend | Backend | Condición para paralelizar |
| --- | --- | --- | --- |
| Base | Layouts, tokens y rutas vacías. | Arranque, entorno, base y health. | Plan aprobado y ownership definido; no requiere una API comercial terminada. |
| Autenticación | Login, sesión, guards y manejo 401/403. | Hash, sesión, CSRF y cuentas. | Contrato de sesión/errores congelado; integrar en H1. |
| Catálogo/stock | Catálogo, ficha, editor y vistas de stock con mocks. | Modelo, endpoints, búsqueda, apertura y movimientos. | Product/Presentation/Stock y filtros congelados. |
| Carrito | Estado persistente, renglones y resumen. | Presupuesto y cálculo autoritativo. | Dinero, cantidades, quote y errores congelados. |
| Pedido/pago | Checkout, resultados, detalle y confirmación manual. | Creación idempotente, intentos, transacción e historial. | Estados y efectos sobre stock congelados antes de empezar. |
| Configuración/reportes | Formularios y vistas. | Persistencia y agregaciones. | Esquemas y definición matemática de métricas revisados. |

El frontend podrá usar mocks que validen contra OpenAPI, no interfaces inventadas. Backend exportará su documento y ejemplos; integración comprobará equivalencia con el contrato normativo. Un cambio incompatible pausa el bloque afectado: se explica motivo, impacto y migración, y vuelve a este chat. [S2, «Trabajo paralelo», «OpenAPI», «Cambios de contrato»]

Archivos compartidos: OpenAPI, ejemplos, enums contractuales, schema/migraciones, Compose, README y documentos de decisión. Un responsable de integración controla su edición/merge. Los tipos de frontend se generan a partir del contrato o se verifican automáticamente contra él; no se importan modelos Prisma desde Angular. [T]

No se acumularán tres o cuatro features con mocks antes de comprobar la API real. Cada hito termina con un recorrido integrado y evidencia del commit que se verificó. [S2, «Regla de avance»]

# 13. Backlog por hitos

Prioridades: **P0** protege reglas centrales o desbloquea integración; **P1** completa funcionalidades de la PS. No significa que P1 sea opcional. Frente indica responsable funcional; Gentle-AI decide cuántos workers, reviewers y verificadores necesita. Todos los criterios siguientes son propuestos para la aprobación del plan. [S2, «Backlog», «Gentle-AI»; T]

## H0. Base contractual y técnica

| Tarea / objetivo | Frente y modo | Dependencias / prioridad | Criterio de terminado |
| --- | --- | --- | --- |
| H0.1 Inventariar repositorio y fijar versiones. | Integración · Review + Verify. | Plan aprobado · P0. | Estado inicial registrado; sin sobreescrituras; compatibilidad y lockfiles definidos. |
| H0.2 Crear entorno local reproducible. | Back independiente y Front independiente. | H0.1 · P0. | Ambas aplicaciones arrancan; PostgreSQL/Mailpit accesibles solo localmente; README reproducible. |
| H0.3 Congelar contrato transversal y decisiones. | Integración. | H0.1 · P0. | IDs, dinero, errores, sesión, unidades, estados e idempotencia documentados; OpenAPI válido. |
| H0.4 Completar inventario de UI y brechas. | Front independiente · Review + Verify. | S3 y DIF01–09 · P1. | Mapa de rutas, estados faltantes y referencia Home acordados; criterios responsive establecidos. |

## H1. Autenticación desde el comienzo

| Tarea / objetivo | Frente y modo | Dependencias / prioridad | Criterio de terminado |
| --- | --- | --- | --- |
| H1.1 Implementar sesión y controles. | Back independiente. | H0.3 · P0. | Login/logout/revocación/CSRF y hash probados; endpoint privado no accesible sin sesión. |
| H1.2 Construir login y layout admin. | Front + Back paralelos. | Contrato H1 · P0. | Login, recarga, expiración y logout integrados; ningún guard sustituye autorización. |
| H1.3 Gestión básica de administradores. | Front + Back paralelos; Integración. | H1.1–2 · P1. | Alta, desactivación y restablecimiento controlados; última cuenta activa protegida. |

## H2. Catálogo administrable y stock

| Tarea / objetivo | Frente y modo | Dependencias / prioridad | Criterio de terminado |
| --- | --- | --- | --- |
| H2.1 Modelo de catálogo y presentaciones. | Back independiente. | H0.3, H1 · P0. | Migraciones/seeds válidos; saldos enteros y presentaciones coherentes. |
| H2.2 Edición de catálogo, categorías e imágenes. | Front + Back paralelos. | Contrato H2 · P1. | Alta/edición/visibilidad/galería reales; validaciones y conflictos resueltos. |
| H2.3 Ajustes y apertura de rollos. | Front + Back paralelos; Review + Verify. | H2.1 · P0. | Apertura atómica conserva cantidades; no rollos negativos, cierre ficticio ni ajustes sin motivo. |
| H2.4 Sitio público de catálogo. | Front + Back paralelos; Integración. | H2.1–2 · P1. | Home, filtros, paginación, detalle y unidades consumen API; sin stock exacto expuesto. |

## H3. Carrito y presupuesto autoritativo

| Tarea / objetivo | Frente y modo | Dependencias / prioridad | Criterio de terminado |
| --- | --- | --- | --- |
| H3.1 Carrito por presentación. | Front independiente. | H2 contrato · P0. | Agregar/quitar/cambiar/recargar; metros y rollos no se fusionan. |
| H3.2 Presupuesto de compra. | Back independiente. | H2; configuración mínima · P0. | Totales exactos, tarifa y compatibilidad; sin reserva; cambios detectables. |
| H3.3 Integrar resumen y conflictos. | Integración · Review + Verify. | H3.1–2 · P0. | Carrito no confía en precio local; visualiza nueva cotización antes de aceptar cambios. |

## H4. Checkout, pedidos y simulación sin descuento

| Tarea / objetivo | Frente y modo | Dependencias / prioridad | Criterio de terminado |
| --- | --- | --- | --- |
| H4.1 Registrar pedido con snapshots. | Back independiente. | H3; P02/P03 para datos/reglas · P0. | Creación atómica/idempotente; pago pendiente; stock intacto; doble envío no duplica. |
| H4.2 Checkout y resultados. | Front + Back paralelos. | Contrato H4 · P0. | Datos, modalidad, importe y estado coherentes; no se presenta simulación como cobro real. |
| H4.3 Intentos y reintentos. | Front + Back paralelos. | H4.1 · P0. | Tres resultados demo; mismo pedido al reintentar; token de pedido no autoriza cobro. |
| H4.4 Demanda impaga y consulta. | Front + Back paralelos; Integración. | H4.1–3 · P1. | Demanda separada de stock; consulta mínima protegida; errores no enumerables. |

## H5. Confirmación manual y operación de pedidos

| Tarea / objetivo | Frente y modo | Dependencias / prioridad | Criterio de terminado |
| --- | --- | --- | --- |
| H5.1 Confirmar pago con stock transaccional. | Back independiente · Review + Verify. | H2, H4 · P0. | Descuento único completo; carreras y rollback probados contra PostgreSQL real. |
| H5.2 Operar pedido desde administración. | Front + Back paralelos. | Contrato H5 · P0. | Confirmación, notas, historial y transiciones integrados; no PATCH de pago libre. |
| H5.3 Cancelación y estados finales. | Front + Back paralelos; Integración. | P01 y H5.1–2 · P1. | Cancelación impaga correcta; alcance pagado decidido o explícitamente bloqueado; entregar no descuenta. |

## H6. Emails y configuración completa

| Tarea / objetivo | Frente y modo | Dependencias / prioridad | Criterio de terminado |
| --- | --- | --- | --- |
| H6.1 Despacho durable de notificaciones. | Back independiente. | H4–5; P06 · P1. | Trabajos persistidos al commit; SMTP fuera de transacción; errores/reintentos demostrables. |
| H6.2 Configuración comercial y de pagos. | Front + Back paralelos. | Contrato H6; base de H3 · P1. | Tarifa/métodos/contactos editables; cambios no alteran pedidos históricos; combinaciones válidas. |
| H6.3 Validar comunicaciones y contacto. | Integración · Review + Verify. | H6.1–2 · P1. | Emails del comprador y admin visibles en Mailpit; sin envío externo ni promesas de WhatsApp automático. |

## H7. Dashboard y reportes básicos

| Tarea / objetivo | Frente y modo | Dependencias / prioridad | Criterio de terminado |
| --- | --- | --- | --- |
| H7.1 Agregaciones de negocio. | Back independiente. | H5; métricas aprobadas · P1. | Totales reconciliados con pedidos confirmados; períodos y unidades definidos. |
| H7.2 Dashboard, reportes y CSV. | Front + Back paralelos. | Contrato H7 · P1. | Filtros funcionan con API; exportación coincide con las definiciones, sin sumar unidades incompatibles. |
| H7.3 Auditoría con dataset conocido. | Integración · Review + Verify. | H7.1–2 · P0. | Valores esperados documentados; impagos, rechazo y simulación no suman ventas confirmadas. |

## H8. Integración final y entrega académica

| Tarea / objetivo | Frente y modo | Dependencias / prioridad | Criterio de terminado |
| --- | --- | --- | --- |
| H8.1 Flujos completos, responsive y seguridad. | Integración · Review + Verify. | H1–7 · P0. | Escenarios de sección 15 aprobados en commit integrado; defectos relevantes corregidos. |
| H8.2 Documentación técnica y manual. | Ambos frentes + integración. | Evidencia de todos los hitos · P1. | Instalación limpia, modelo, contrato, operaciones, límites y screenshots de uso. |
| H8.3 Cierre de PS. | Integración. | H8.1–2 · P0. | Matriz de trazabilidad, horas reales y demostración; simulación declarada; pendientes aceptados, no ocultos. |

Los trabajos básicos de notificación y configuración necesarios para H3/H4 se crean allí; H6 completa administración, despacho y verificación. No se espera a H6 para descubrir que faltaba persistir un evento de pedido. [T]

# 14. Estrategia Git y trabajo de agentes

`main` contendrá únicamente hitos o incrementos integrados que pasan verificación. Ramas breves por hito/frente; worktrees separados cuando el orquestador ejecute workers simultáneos. Un worker no cambia la rama de otro ni ejecuta reseteos destructivos para resolver conflictos. No se propone GitFlow. [S2, «Estrategia Git»; T]

Frontend trabaja en su árbol; backend, en el suyo. Un responsable de integración mantiene contrato, archivos raíz y secuencia de migraciones. Los cambios de schema de varios workers se coordinan antes de generar migraciones: no se resuelven colisiones renombrando archivos sin probar desde cero. [T]

Merge frecuente de incrementos revisados, integración obligatoria al cierre de cada hito y etiqueta del hito aprobado. Cualquier diferencia de contrato se registra en CHANGELOG con impacto en ambos frentes; los clientes generados se regeneran después del cambio aprobado. El commit de verificación debe ser el mismo que se entrega para auditoría. [T]

Gentle-AI conserva su orquestador y puede subdividir tareas libremente dentro de los límites. Este chat audita alcance, arquitectura, contratos y evidencias; no decide el número fijo de workers ni reemplaza la configuración interna de agentes. [S2, «Gentle-AI», «Niveles de responsabilidad»]

# 15. Estrategia de pruebas

No se fija 100% de cobertura. Se priorizan invariantes, fronteras y recorridos. Unit tests para cálculos/reglas; integración con PostgreSQL real para restricciones y carreras; pruebas de API para autorización/errores; pruebas de UI para formularios y flujos. Un mock de base o SQLite no valida los bloqueos y transacciones de PostgreSQL. [S2, «Testing»; T]

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

**Definición de terminado por hito:** compila Front y Back afectados; lint; pruebas relevantes; migración desde cero cuando corresponde; seeds; contrato validado; revisión funcional y visual; integración real; informe con comandos/resultados, commit y pendientes. Un «parece funcionar» del worker no reemplaza evidencia. [S2, «Verify», «Regla de avance»]

# 16. Riesgos y mitigaciones

| Riesgo | Mitigación y control |
| --- | --- |
| Divergencia Front/Back. | OpenAPI normativo, ejemplos validados y cierre integrado de cada hito. |
| Sobreventa por pedidos sin reserva. | Advertencia al cliente, verificación al crear y transacción al confirmar; mostrar demanda sin descontarla. |
| Confundir aprobado simulado con cobro. | Dos estados separados, modo demo visible y única confirmación manual con stock. |
| Prometer rollo cerrado desde metros equivalentes. | Saldos separados, apertura manual auditada y prohibición de recomposición automática. |
| Saldo del sitio distinto del mostrador. | Nombrarlo como disponibilidad del e-commerce; procedimiento de ajuste; sincronización explícitamente fuera de la PS. |
| Historial cambia al editar catálogo. | Snapshots por pedido e integridad referencial; baja lógica. |
| Múltiples descuentos/reintentos. | Idempotencia, unicidad por pago, bloqueo de filas y pruebas de concurrencia. |
| Fuga por consulta invitada. | Vista mínima, token con alcance limitado, rate limit, mensajes genéricos y ausencia de datos en URL/logs. |
| Sesiones o imágenes inseguras. | Controles servidor, cookies/CSRF, revocación, validación de archivos y secretos fuera de Git. |
| Email perdido o duplicado. | Jobs persistentes con dedupe, reintento y límite; admitir la posibilidad de duplicación SMTP, sin repetir negocio. |
| Figma incompleto o antiguo. | Inventario de brechas y capturas/versiones cuando sea posible; no afirmar validación pixel-perfect de estados no diseñados. |
| Exceder presupuesto académico. | Registrar horas ya usadas, estimar tareas en H0, priorizar MVP, no recortar requisitos silenciosamente para encajar en 200 h. |
| Cambios de bibliotecas/API de Prisma. | Fijar versiones verificadas y ensayar transacciones/migraciones antes de paralelizar la feature crítica. |
| Complejidad innecesaria. | Un backend, una base, sin arquitectura distribuida; abstracciones solo para cambios previsibles. |
| Migración futura inconsistente. | Importación validada por SKU/presentación, longitud explícita, preview de errores y respaldo; no tocar historia. |

[T; riesgos solicitados en S2, «Riesgos técnicos»]

# 17. Pendientes y propuestas que requieren revisión

Las cuatro preguntas estructurales de la conversación ya fueron respondidas. Los puntos siguientes no reabren esas respuestas: delimitan reglas que las fuentes no definen. Permiten proponer arquitectura y comenzar H0/H1, pero el hito señalado no debe cerrarse con una regla inventada. [C; S2, «Relevamiento adicional»]

| ID / prioridad | Punto por definir o validar | Tratamiento provisional y momento límite |
| --- | --- | --- |
| P01 · importante | Cancelaciones después de pago, reintegro de mercadería y eventual devolución de dinero. | Implementar cancelación impaga; bloquear la pagada. Validar política o aceptar explícitamente esta limitación antes de cerrar H5. |
| P02 · importante | Vigencia de pedidos impagos y posibilidad de cambiar sus productos/precios. | Sin expiración comercial automática ni edición de renglones; snapshots congelados. Aprobar esta regla para la demo antes de H4. |
| P03 · importante | Datos obligatorios del comprador, domicilio para entrega y texto de condiciones. | Propuesta: nombre, apellido, email y teléfono; dirección/instrucciones para entrega, no para retiro. Validar antes de congelar formulario y contrato H4. |
| P04 · importante para uso real | Longitudes reales de rollo, precios por presentación y necesidad de un tramo continuo al vender metros. | Longitud configurable y seeds ficticios; sin control de remanentes individuales. Validar antes de cargar inventario real; confirmar el límite técnico de la PS al aprobar el plan. |
| P05 · importante para uso real | Pago en local de un pedido que será entregado, dado que hoy ABAR cobra en el local. | Demo con combinaciones explícitas de métodos; pago al retirar solo con retiro según Figma. No activar comercialmente una entrega sin método compatible. |
| P06 · contenido operativo | Email del administrador, textos de aviso, horarios y datos de contacto reales. | Utilizar datos ficticios y Mailpit. Completar destinatarios/textos definitivos antes de envío externo, no antes de probar H6 local. |
| P07 · contenido operativo | Categorías, marcas, precios, mínimos y productos destacados reales. | Editables y migrables; seeds no se presentan como catálogo real. Necesarios antes de la carga real, no bloquean desarrollo. |
| P08 · revisión del plan | Propuestas de sesión, apertura manual, estados, galería, métricas y organización. | Aprobar o ajustar este documento antes de emitir prompts de ejecución. |
| P09 · planificación | Horas reales ya consumidas y restricciones del calendario académico. | Registrar en H0 para estimar saldo y fechas. No asumir 200 horas restantes. |
| P10 · documentación académica | Cómo dejar asentado el alcance final de pagos simulados frente al documento S1. | Incluir diferencia en la entrega; no declarar validación del tutor que no consta. Revisar formalización antes de cierre académico. |

No es necesario definir hosting, proveedor real de pagos, WhatsApp automático, stock del mostrador, ERP ni logística avanzada para comenzar la implementación de esta PS. [S2; C]

# 18. Roadmap, puertas de avance y entrega

| Hito | Qué puede avanzar en paralelo | Prueba de salida y condición para continuar |
| --- | --- | --- |
| H0 · Base | Front: layouts/tokens. Back: entorno/persistencia. Integración: contrato. | Reproducción local y contrato transversal aprobados; inventario del repo completado. |
| H1 · Acceso | Pantallas y endpoints de sesión/cuentas. | Login real, logout, revocación y acceso privado demostrados. |
| H2 · Catálogo/stock | API/seeds y UI catálogo/admin usando el mismo contrato. | Producto administrable y vendible; unidad clara; apertura/ajustes correctos. |
| H3 · Carrito/quote | Estado del carrito y presupuesto servidor. | Total calculado en API, presentación preservada y cambio de tarifa/precio controlado. |
| H4 · Pedido/demo | Creación/intentos y checkout/resultados/consulta. | Pedido único sin reserva; los tres resultados demo no descuentan stock. |
| H5 · Confirmación | Transacción backend y operación administrativa. | Confirmación manual descuenta exactamente una vez; carreras sin saldo negativo; estados válidos. |
| H6 · Comunicación/configuración | Despacho de emails y formularios de configuración. | Avisos comprador/admin en Mailpit; tarifa y métodos históricos coherentes. |
| H7 · Reportes | Agregaciones y visualización/CSV. | Métricas conciliadas con dataset conocido y unidad/período explícitos. |
| H8 · Cierre | Correcciones, manual y preparación de evidencia. | Flujos completos, instalación limpia y documentación íntegra; diferencias declaradas. |

La ruta crítica comercial es H0 → H1 → H2 → H3 → H4 → H5. Notificaciones y configuración pueden prepararse antes, pero H6 solo se cierra cuando sus eventos y pantallas están integrados. Reportes dependen de que los estados y pagos sean correctos, no solo de disponer de una tabla con números. [T]

## 18.1. Presupuesto del documento aprobado

El cronograma de S1, página 4, totaliza **200 horas para el proyecto completo**, incluyendo análisis, diseño y documentación. No representa un saldo de 200 horas a partir de este chat. Se conserva sin sustituirlo por una estimación fabricada. [S1, p. 4]

| Actividad académica | Horas aprobadas |
| --- | --- |
| Relevamiento, análisis, casos de uso y alcance | 10 |
| Arquitectura, modelo y tecnologías | 10 |
| Interfaz, navegación y prototipo | 15 |
| Configuración de entorno, frontend, backend y base | 5 |
| Catálogo público y responsive | 15 |
| Ficha de producto | 15 |
| Buscador y filtros | 10 |
| Carrito | 20 |
| Checkout | 20 |
| Métodos de pago y estados | 20 |
| Administración de catálogo, imágenes y stock | 15 |
| Pedidos, estados, pagos y notas internas | 15 |
| Autenticación y usuarios internos | 10 |
| Testing, integración y correcciones | 15 |
| Documentación y manual | 5 |
| TOTAL | 200 |

H0 debe registrar lo ya ejecutado, estimar cada tarea restante e identificar explícitamente el esfuerzo de apertura de rollos, notificaciones, reportes y pantallas faltantes dentro de la planificación. Si no entra en el saldo disponible, se revisa alcance/calendario con evidencia; no se omite testing, seguridad o documentación ni se promete que la IA elimina ese esfuerzo. [T]

## 18.2. Gobierno del avance con Gentle-AI

Después de aprobar este plan, se prepara el prompt del primer hito para el orquestador. Gentle-AI ejecuta, revisa y verifica; devuelve un informe con alcance realizado, workers utilizados, archivos, decisiones, pruebas, resultados, commit, cambios de contrato, deuda y pendientes. No se le autoriza a encadenar hitos sin integración y auditoría. [S2, «Formato esperado», «Regla de avance»]

Este chat evalúa **CUMPLE / PARCIAL / NO CUMPLE** contra fuentes, arquitectura, contrato y criterios. Un hito parcial recibe corrección antes de avanzar. Los cambios que afecten unidades, confirmación de pagos, stock, estados o seguridad regresan aquí antes de congelarse. [S2]

**Paquete de cierre esperado:** código integrado; instrucciones locales; migraciones y seeds; contrato OpenAPI; modelo y decisiones; manual de comprador/administrador; pruebas y capturas; trazabilidad contra S1/S2/S3/C; limitaciones y horas reales. No se declara operación productiva, pago real, correo externo o sincronización con mostrador sin haberlos implementado y verificado. [S1, pp. 3–4; S2; C]

**Estado de salida de este documento:** arquitectura y roadmap candidatos listos para revisión. Las confirmaciones C permanecen vigentes. Las propuestas T todavía requieren aceptación del plan; los pendientes P se resuelven en su hito. Todavía no corresponde emitir prompts ni comenzar código de producción.

# Anexo. Referencias y uso de evidencia

S1: documento académico aportado, páginas 2–3 para objetivos/módulos/exclusiones y página 4 para horas. S2: brief aportado completo, particularmente «Fuentes de verdad», «OpenAPI como contrato», «Entregables», «Regla de avance» y «Qué quiero que hagas ahora». S3: archivo Figma con páginas 0:1 Foundations, 3:2 Public Screens y 3:3 Admin Screens; identificadores específicos en secciones 2 y 5. C: confirmaciones del usuario recogidas en la sección 2.1.

Las referencias oficiales siguientes se consultaron el 02/10/2026 como apoyo de las propuestas técnicas. No reemplazan las fuentes del proyecto ni prueban que la implementación ya exista. Las versiones concretas de dependencias se verificarán en H0.

| Código | Referencia oficial |
| --- | --- |
| R01 | Angular — Style Guide: https://angular.dev/style-guide |
| R02 | Angular — Route guards: https://angular.dev/guide/routing/route-guards |
| R03 | NestJS — Session: https://docs.nestjs.com/http/session |
| R04 | Angular — Reactive forms: https://angular.dev/guide/forms/reactive-forms |
| R05 | Prisma — Transactions: https://www.prisma.io/docs/orm/fundamentals/transactions |
| R06 | OWASP — Password Storage: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html |
| R07 | OWASP — Session Management: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html |
| R08 | Mailpit — Docker y correo local: https://mailpit.axllent.org/docs/install/docker/ |
| R09 | PostgreSQL — Explicit Locking: https://www.postgresql.org/docs/current/explicit-locking.html |
| R10 | OWASP — CSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html |
| R11 | Angular — Signals: https://angular.dev/guide/signals |
| R12 | NestJS — OpenAPI: https://docs.nestjs.com/openapi/introduction |
| R13 | OpenAPI Initiative — Specification 3.0.3: https://spec.openapis.org/oas/v3.0.3.html |

**Regla para futuras revisiones:** cambios al plan incrementan versión y describen qué requisito, contrato, pantalla, migración y prueba afectan. No se reemplazan silenciosamente las decisiones ya confirmadas por una elección local de un agente.
