# ABAR — mapa de UI y brechas H0.4

Este mapa convierte la referencia documental del plan en una base de rutas verificable; no declara que las pantallas comerciales estén construidas ni que se haya validado visualmente el archivo Figma. La única UI real es el subconjunto H0 señalado abajo. La auditoría visual y responsive permanece pendiente.

## Niveles de evidencia

| Nivel | Significado en este mapa |
|---|---|
| **Referencia del plan** | Nodos, textos, tokens y diferencias ya consignados en `docs/plan.md` sección 5 y sus fuentes citadas. No se reabrió ni se auditó Figma durante este trabajo. |
| **Observado en código ABAR** | Rutas/componentes comprobados en `frontend/src/app/` y renderizados en pruebas Angular con jsdom. Esto no implica captura de navegador real. |
| **Propuesta / pendiente** | Pantalla, estado o criterio futuro derivado del plan; falta implementación funcional y/o inspección visual. |

No se afirma acceso directo, revisión nueva, pixel-perfect, contraste certificado ni validación de un dispositivo. La Home CORREGIDA **17:256** es la referencia documental preferida del plan; la Home anterior **6:4** queda como antecedente, no como otra página que deba duplicarse. La interfaz solo cita esa referencia y no simula acceso a Figma.

## Nodos del plan §5 y rutas

Los nodos siguientes reproducen el inventario del plan §5.1; las rutas son las propuestas allí. “H0 real” identifica únicamente los esqueletos sin comportamiento comercial.

| Feature / ruta | Nodo o referencia del plan | Estado en ABAR |
|---|---|---|
| `home` · `/` | Home CORREGIDA `17:256`; original `6:4` | **H0 real:** header/footer público, texto base y comprobación de salud. Sin catálogo ni compra. |
| `catalog` · `/productos` | Catálogo `6:182` | Propuesta pendiente; no hay catálogo. Categoría se plantea como filtro de esta ruta, no pantalla duplicada. |
| `catalog` · `/productos/:slug` | Detalle `6:324` | Propuesta pendiente; presentación y alternativa de imagen aún no construidas. |
| `cart` · `/carrito` | Carrito `9:2` | Propuesta pendiente; agregar/quitar y resumen no implementados. |
| `checkout` · `/checkout` | Checkout `9:89` | Propuesta pendiente; cotización, tarifa y validaciones no implementadas. |
| `orders` · `/pedido/:id/resultado` | Confirmado `9:179`, pendiente `9:218`, rechazado `9:257` | Propuesta pendiente; resultado del servidor y sus tres estados no implementados. |
| `orders` · `/consultar-pedido` | Consulta `9:1232` | Propuesta pendiente; consulta mínima y acceso limitado no implementados. |
| `contact` · `/contacto` | Contacto/ubicación `9:1302` | Propuesta pendiente; contenido comercial no inventado. |
| `admin-auth` · `/admin/login` | No localizado en nodos leídos; requerido por S1 | **H0 real:** placeholder inerte. Sin formulario, credenciales ni autenticación. |
| `admin-dashboard` · `/admin` | Dashboard `9:296` | **H0 real:** placeholder; sin datos, operaciones ni acciones administrativas. |
| `admin-catalog` · `/admin/productos` | Gestión `9:412` | Propuesta pendiente; no hay CRUD. |
| `admin-catalog` · `/admin/productos/nuevo`, `/admin/productos/:id/editar` | Alta/edición `9:539` | Propuesta pendiente; sin formulario, presentaciones, galería o ajustes. |
| `admin-stock` · `/admin/stock` | Extensión necesaria de gestión de stock | Propuesta pendiente: saldos, demanda impaga, movimientos y apertura manual. |
| `admin-orders` · `/admin/pedidos`, `/admin/pedidos/:id` | Gestión `9:637`, detalle `9:770` | Propuesta pendiente: pago manual y notas privadas requieren H1+; no exponer operación ahora. |
| `admin-categories` · `/admin/categorias` | Categorías `9:844` | Propuesta pendiente; formularios podrían ser diálogo o subruta. |
| `admin-settings` · `/admin/configuracion` | Configuración `9:939` | Propuesta pendiente. |
| `admin-payments` · `/admin/metodos-pago` | Métodos `9:1026` | Propuesta pendiente; modo demo y confirmación manual deben distinguirse. |
| `admin-reports` · `/admin/reportes` | Reportes `9:1109` | Propuesta pendiente; no hay métricas. |
| `admin-users` · `/admin/usuarios` | Gestión básica requerida por S1; no nodo localizado | Propuesta pendiente: alta, desactivación y restablecimiento requieren autenticación H1. |
| `admin-notifications` · `/admin/notificaciones` | Lista mínima propuesta en plan §5.1 | Propuesta pendiente: envío/error y reintento; no una bandeja general. |
| `status` · `/estado` | Ruta operativa añadida en H0 | **H0 real:** estado textual de `GET /health`, no pantalla comercial. |
| `not-found` · `/**` | Fallback accesible propuesto para H0 | **H0 real:** mensaje y enlace de regreso al inicio. |

Las rutas comerciales de esta tabla son mapa, no autorización para implementarlas en H0. Las rutas H0 observadas usan carga diferida para páginas/áreas; el placeholder de login no autentica y el layout admin no realiza peticiones privadas.

## Layouts y límites de contenido

| Layout | H0 real | Pendiente |
|---|---|---|
| Público | Header/nav semánticos, enlace de salto, área principal, footer, Home inicial y mensaje de salud. | Navegación de catálogo/carrito/contacto, identidad y contenido definitivos, estados de compra. |
| Autenticación | Aviso explícito “Base H0; no autenticación implementada”; placeholder sin campos. | Login funcional, sesión y protección de rutas/API pertenecen a H1. |
| Administración | Shell con encabezado/área lateral y texto de placeholder. No presenta datos privados ni controles de negocio. | Sidebar real, cuentas, autorización servidor, dashboard y operaciones; no simular un acceso seguro antes de H1. |
| No encontrada | Fallback con título y enlace accesible a Home. | Revisar representación visual en navegador/dispositivos. |

## Tokens de diseño

Valores de referencia del plan §5.3 / Figma citado allí; no son un resultado de nueva inspección:

| Token | Valor | Uso actual |
|---|---|---|
| Azul | `#0B6FB3` | Identidad/acento. |
| Azul oscuro | `#084D7D` | Enlaces y encabezado admin. |
| Naranja | `#F7931E` | Foco visible y acento. |
| Tipografía | `Inter`, con fallback local `'Segoe UI', sans-serif` | Sin descarga ni llamada a fuentes remotas. |
| Superficies | Blanco y gris neutro local | Fondo, tarjetas y contenedores. |

El fallback no importa ni descarga recursos externos. Los colores se trasladaron a propiedades CSS en `frontend/src/styles/tokens.css`; contrastes aún requieren medición y validación visual, no se declaran conformes por inspección del código.

## Diferencias documentadas DIF01–DIF09

Las brechas proceden del plan §2.3; no se resolvieron decisiones comerciales ni se construyeron las pantallas respectivas.

| ID | Brecha de referencia | Tratamiento en el mapa H0 |
|---|---|---|
| DIF01 | Integración de pago descrita en S1 vs simulación final confirmada. | Fuera de esta UI; documentar el alcance efectivo sin afirmar aprobación académica posterior. |
| DIF02 | Mercado Pago automático en Figma vs confirmación manual requerida para descontar stock. | No hay UI de pago; futuros estados deben diferenciar intento aprobado y pago confirmado. |
| DIF03 | Precio/stock genérico vs unidad, metro, rollo cerrado. | No hay catálogo; futuras vistas separarán presentación y saldo. |
| DIF04 | Brief enumera login, no localizado en nodos leídos. | Placeholder `/admin/login` sin autenticación ni captura de credenciales. |
| DIF05 | Falta acción de confirmación de pago/notas internas en la referencia. | No hay operaciones admin H0; futura vista debe separar notas públicas/privadas. |
| DIF06 | Galería pública vs formulario admin de una imagen. | No hay imágenes ni gestión multimedia H0; propuesta de galería simple continúa pendiente. |
| DIF07 | No aparece costo de entrega configurable. | Sin checkout H0; futura tarifa y snapshot no se simulan aquí. |
| DIF08 | Dos Home y falta de estados/pantallas móviles. | Se prioriza como referencia documental Home CORREGIDA `17:256`; Home `6:4` antecedente. Sin rediseño ni validación visual. |
| DIF09 | Tres renglones del carrito con resumen inconsistente. | Sin carrito H0; futura suma debe derivarse de los mismos renglones (12.500 + 18.000 + 9.200 = 39.700). |

## Estados que faltan

La base actual solo resuelve carga/éxito/error del servicio de salud. Para todas las pantallas comerciales/admin propuestas aún faltan estados de dominio; no confundir placeholder con implementación.

| Estado | Cobertura mínima a diseñar/verificar |
|---|---|
| Carga | Indicador con `role=status`, texto comprensible y layout estable; contemplar carga inicial y actualización. La salud H0 sí muestra carga. |
| Vacío | Catálogo sin coincidencias, carrito vacío, listas sin pedidos/productos/notificaciones, reportes sin datos; orientar siguiente paso sin acción falsa. |
| Error | API sin conexión, respuesta inválida, 4xx/5xx y recuperación; texto seguro, asociado a contexto. Salud H0 presenta error seguro y reintento. |
| En progreso | Envíos/guardados/deshabilitación temporal, prevención de doble acción, foco y confirmación; no existe ninguna mutación H0. |
| Resultado | Éxito persistido, advertencias y conflictos de versión/stock; distinguir intento de pago de pago comercial. |
| Acceso | Expiración/401/403/CSRF y acceso denegado; debe venir de controles reales del backend, no de un guard de UI. Fuera de H0. |
| Contenido parcial | Imagen ausente, datos incompletos y degradación de conexión; alternativa accesible. Pendiente de features. |

Login, administración de stock, usuarios y notificaciones son pantallas explícitamente pendientes, además de catálogo, carrito, checkout, consulta de pedido, categorías, configuración, pagos y reportes. No se deriva de esta base que esos flujos ya tengan estados completos.

## Responsive y accesibilidad — criterios pendientes de prueba visual

El código ofrece estilos adaptativos básicos, pero **no hubo navegador ni inspección visual real**. jsdom prueba DOM/rutas/interacciones de salud; no prueba layout CSS, responsive, contraste ni comportamiento visual. La presencia de media query tampoco prueba cumplimiento.

| Viewport objetivo | Criterios para verificación futura |
|---|---|
| 360 px | Sin scroll horizontal accidental, header/nav y textos no colisionan, formularios/acciones utilizables, información prioritaria visible, placeholders no desbordan. |
| 768 px | Navegación, áreas públicas y shell admin reorganizados sin pérdida de jerarquía; revisar sidebar, anchos de contenido y controles. |
| 1440 px | Contenido con ancho legible, composición no estirada, espaciado y jerarquía consistentes; revisar tablas/formularios cuando existan. |

Pruebas requeridas: teclado completo (Tab/Shift+Tab/Enter/Escape donde corresponda), orden de foco, foco visible, enlace “Saltar al contenido”, landmarks/labels, zoom/reflow y lectura de mensajes asíncronos. Medir contraste de texto, controles y foco en combinaciones reales; los tokens azules/naranja no son una certificación WCAG. Capturar evidencia visual de cada ancho, registrar defectos y volver a verificar tras corregir. **Estado de todos estos criterios: pendiente de prueba visual real.**

## Implementación H0 observada

- Rutas reales limitadas a `/`, `/estado`, `/admin/login`, `/admin` y wildcard 404; rutas admin son esqueletos sin acciones ni datos privados.
- Angular standalone/zoneless y carga por feature; `HttpClient` consulta `/health` por mismo origen. Proxy local preserva la ruta operativa `/health` sin `/api/v1`, además de `/api` para futuras rutas.
- Pruebas Angular con Vitest + jsdom comprueban render público, rutas placeholder/not-found, path HTTP y salud loading/ok/error. Son pruebas DOM estructurales, no navegador real.
- Fuera de alcance: login funcional, autorización, guards que finjan seguridad, CRUD, catálogo, carrito, checkout, endpoints comerciales o pantallas completas.
