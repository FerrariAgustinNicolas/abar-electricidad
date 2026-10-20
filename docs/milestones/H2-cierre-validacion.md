# H2 — Cierre complementario de validación

**Resultado: PARCIAL únicamente por zoom nativo no comprobado.** La matriz visual real, teclado/foco, reflow, smoke integrado y revisión independiente del contrato se completaron. Se corrigieron cuatro problemas visuales/de navegación reproducidos. Se entrega para auditoría externa; no constituye autorización de producción ni avance a H3.

- Fecha: 2026-10-20. Rama: `codex/h2-catalog-stock`.
- Candidato técnico final: **`b7efb3bf9f88715e3bdaa99819b105dc57d1fc2f`**.
- Base auditada: `b24f5bf`; cierre documental `c9180bff9ae2f5b4a1f3c6bb249c1345ee6d4496`; estado documental de entrada `5431f4fe2b4e558577c15b2546b84a42ef454be6`.
- El commit que contiene este informe es documental y se identifica mediante `git log -1 -- docs/milestones/H2-cierre-validacion.md`; no puede contener su propio hash. El candidato de código anterior es exacto e inmutable.
- Antecedente: [informe H2](H2-informe.md). No se reinterpreta su evidencia histórica como ejecución nueva.

## 1. Git, alcance y preservación

Antes de trabajar, `git diff b24f5bf..5431f4f -- backend frontend` resultó vacío: los cierres documentales no cambiaron código de producción. La modificación informativa de OpenAPI previa no alteró operaciones, DTO, seguridad, ejemplos ni versión del contrato.

El checkout original permaneció en `feat/h1-change-password-review-blocks`, HEAD `9582df938c35ddb251b2446a568e32d9f60e9206`, con sus modificaciones de H1 y archivos no versionados intactos. Se conservaron los worktrees existentes, incluido el de revisión separado en `b24f5bf`. No se hizo checkout, reset, limpieza ni actualización del WIP ajeno.

`main`, `origin/main` y el commit de `h1-approved` permanecen en `5c0e0fc200c1c22eaa2731298eb7e8bf968a8466`; `h0-approved` permanece sin cambios. No hubo push, PR, merge, tags ni operaciones remotas. El diff protegido original conserva SHA-256 `00cbe4677d1db6c9f1b7547dbf6d3e59bc966b67c3ebec99e8a19f09be5271e7`, además de los cuatro hashes de archivos protegidos.

## 2. Navegador real: matriz visual

Navegador IAB con servicios propios en loopback. Anchos CSS reales 360, 768 y 1440 px, altura 1000 px; capturas JPEG reales de página completa. No son mocks ni imágenes reconstruidas. [Manifiesto SHA-256](evidence/H2-cierre/manifest.json) y [mediciones de las 27 vistas](evidence/H2-cierre/final-matrix.json).

| Vista | 360 px | 768 px | 1440 px |
|---|---|---|---|
| Home | [Captura](evidence/H2-cierre/home-360-final.jpg) | [Captura](evidence/H2-cierre/home-768-final.jpg) | [Captura](evidence/H2-cierre/home-1440-final.jpg) |
| Catálogo | [Captura](evidence/H2-cierre/catalog-360-final.jpg) | [Captura](evidence/H2-cierre/catalog-768-final.jpg) | [Captura](evidence/H2-cierre/catalog-1440-final.jpg) |
| Detalle | [Captura](evidence/H2-cierre/detail-360-final.jpg) | [Captura](evidence/H2-cierre/detail-768-final.jpg) | [Captura](evidence/H2-cierre/detail-1440-final.jpg) |
| Administración de productos | [Captura](evidence/H2-cierre/admin-products-360-final.jpg) | [Captura](evidence/H2-cierre/admin-products-768-final.jpg) | [Captura](evidence/H2-cierre/admin-products-1440-final.jpg) |
| Administración de categorías | [Captura](evidence/H2-cierre/admin-categories-360-final.jpg) | [Captura](evidence/H2-cierre/admin-categories-768-final.jpg) | [Captura](evidence/H2-cierre/admin-categories-1440-final.jpg) |
| Administración de stock | [Captura](evidence/H2-cierre/admin-stock-360-final.jpg) | [Captura](evidence/H2-cierre/admin-stock-768-final.jpg) | [Captura](evidence/H2-cierre/admin-stock-1440-final.jpg) |

También se inspeccionó el formulario/galería a [360](evidence/H2-cierre/admin-edit-360-after.jpg), [768](evidence/H2-cierre/admin-edit-768-after.jpg) y [1440](evidence/H2-cierre/admin-edit-1440-after.jpg) px. Las 27 mediciones (18 vistas principales, tres de edición y seis de reflow) dieron `document.scrollWidth == innerWidth`.

A 360 px las tablas administrativas usan desplazamiento interno (contenedor 326 px, contenido 704 px), no desplazamiento de toda la página. En stock se enfocó el contenedor con Tab y se desplazó con flecha derecha: `scrollLeft` 0→40, con contorno visible y ancho de documento 360 px: [captura](evidence/H2-cierre/stock-keyboard-pan.jpg).

### Teclado y foco

En las seis rutas: Tab enfoca «Saltar al contenido»; Enter enfoca el `main` correcto sin cambiar URL; el siguiente Tab alcanza el primer control del contenido. Se observó contorno sólido naranja en público y azul en administración. [Resultados por ruta](evidence/H2-cierre/keyboard-results.json). El ajuste de stock también se activó con Enter. No se presenta esta inspección acotada como certificación completa WCAG.

### Reflow y límite de zoom

Se comprobó reflow real a **720 CSS px** en las seis vistas, sin overflow del documento; las tablas conservan su scroll interno. Capturas: [Home](evidence/H2-cierre/home-720-reflow.jpg), [catálogo](evidence/H2-cierre/catalog-720-reflow.jpg), [detalle](evidence/H2-cierre/detail-720-reflow.jpg), [productos](evidence/H2-cierre/admin-products-720-reflow.jpg), [categorías](evidence/H2-cierre/admin-categories-720-reflow.jpg), [stock](evidence/H2-cierre/admin-stock-720-reflow.jpg).

**Zoom nativo: NO VERIFICADO.** El control disponible ofrece viewport, no API de zoom. Los atajos probados no produjeron un cambio medible de zoom (1440 px, DPR 1, escala 1). El proveedor Chrome no estaba disponible; seleccionar Chrome for Testing agotó el tiempo sin control efectivo. No se modificó configuración ni se intervino en sesiones ajenas. Reducir el viewport a 720 px **no equivale a probar zoom nativo al 200 %**. Queda pendiente esa comprobación manual/externa; no se oculta bajo un PASS de reflow.

## 3. Defectos reproducidos y corrección mínima

| Problema observado | Causa y corrección | Evidencia |
|---|---|---|
| Título Home invisible | Regla global `.hero h1` usaba el mismo azul que el fondo; herencia blanca local | Contraste medido 1:1→8.87:1; [antes](evidence/H2-cierre/home-360-before.jpg), [después](evidence/H2-cierre/home-360-final.jpg) |
| Botón + habilitado casi invisible | Texto global blanco sobre fondo claro; color local de texto | 1.09:1→14.07:1; [antes](evidence/H2-cierre/detail-360-before.jpg), [después](evidence/H2-cierre/detail-360-final.jpg) |
| Saltar al contenido abandonaba la ruta | Fragmento resuelto respecto al `base href`; se cancela navegación predeterminada y se enfoca el `main` local con `tabindex=-1` | Desde stock navegaba a `/#admin-content`; [antes](evidence/H2-cierre/stock-skip-focus-before.jpg); seis rutas verificadas después |
| Enlaces públicos visualmente adyacentes | Navegación inline sin separación efectiva; flex/wrap/gap local | Capturas finales Home; destinos intactos |

[Colores observados](evidence/H2-cierre/colors-after.json) y [ratios calculados](evidence/H2-cierre/contrast-ratios.json). No se infiere conformidad cromática global a partir de dos mediciones.

Commit de corrección `b7efb3bf9f88715e3bdaa99819b105dc57d1fc2f`: cuatro componentes de producción, dos pruebas de skip links y [decisión técnica](../decisions/H2-complementary-ui.md), 74 líneas añadidas/eliminadas. No cambia backend, migraciones, contratos, precios, permisos, saldo, logout ni política de sesión. Reversión acotada: los estilos y manejadores de foco de ese commit, con sus pruebas/documentación; no revertir la implementación H2 anterior.

## 4. Smoke integrado breve con fixtures propios

Entorno nuevo efímero: PostgreSQL 17.11-bookworm de imagen ya disponible (`--pull=never`), tmpfs, sin volúmenes persistentes; backend `127.0.0.1:55882`, frontend `127.0.0.1:55875`, PostgreSQL loopback `55844`. Se usaron cuenta, imágenes y datos sintéticos propios; no credenciales existentes ni bases ajenas. Compilación backend y servidor Angular necesarias para ejecutar el smoke, no repetición de sus suites.

El entorno se construyó desde archivo Git y recibió únicamente las cuatro correcciones de producción. [Comparación final](evidence/H2-cierre/receipts/final-production-comparison.json): **113/113 archivos de producción coinciden con el commit técnico final**, sin diferencias.

| Paso ejecutado en UI/API real | Resultado observado |
|---|---|
| Acceso anónimo a administración y login H1 | Redirección a login conserva returnUrl; cuenta fixture inicia sesión y llega a productos |
| Home, catálogo, filtros y detalle | Lecturas reales, precios independientes por presentación y sin saldos numéricos públicos |
| Ajuste manual +5 metros | 35→40 METER, versión 1→2; una operación y una entrada, con motivo |
| Apertura manual de un rollo cerrado de 80 m | Confirmación/preview 2 ROLL y 40 METER→1 ROLL y 120 METER; versiones finales METER 3 / ROLL 2; dos entradas auditadas |
| Borradores independientes de galería | Se editan A y B; hacer B principal conserva ambos borradores; guardar A no borra B; guardar B y recargar conserva ambos textos y B principal; producto versión 4 |
| Visibilidad pública posterior | Detalle 200 con B principal, METER `AVAILABLE`, ROLL `LOW_STOCK`; oculto 404 y ausente de listado; sin cantidades, umbrales ni versiones privadas |
| Precios y efectos laterales | METER `125000`, ROLL `8200000` unidades menores ARS, sin cambios; tras galería siguen exactamente dos operaciones y tres entradas de stock |
| Logout | Cerrar sesión vuelve a login; se capturó la pantalla y luego Home; pestaña propia cerrada y viewport restaurado |

Evidencias: [recibo integrado final](evidence/H2-cierre/receipts/final-smoke-receipt.json), [reconciliación de apertura](evidence/H2-cierre/receipts/parent-opening-reconciliation.json), [dos borradores tras cambio de principal](evidence/H2-cierre/gallery-two-drafts-after-primary.jpg), [guardar A conserva B](evidence/H2-cierre/gallery-save-a-keeps-b.jpg), [lectura pública posterior](evidence/H2-cierre/public-roll-after-opening.jpg), [logout](evidence/H2-cierre/logout-login.jpg).

Una confirmación nativa interrumpió el transporte de automatización durante la apertura. **No se repitió la mutación**: se retomó la misma pestaña y un verificador leyó el PostgreSQL propio, confirmando una única apertura y sus dos entradas. Un selector de lectura no coincidente se sustituyó por el ID observado; no produjo escritura. El recibo integrado fue tomado antes del logout y por ello muestra una sesión válida en ese instante, no después de cerrar sesión.

Procesos y contenedor se detuvieron verificando PID/inicio/grupo, comando, ID, etiquetas e imagen propios: [recibo de cierre](evidence/H2-cierre/receipts/stop-receipt.json). El helper inicial rechazó correctamente el cambio de título de proceso de Angular; se validó el título exacto con argumentos del fixture antes de enviar señales. Los temporales propios se eliminaron después de conservar únicamente evidencia permitida; no se copiaron archivos de secretos ni credenciales generadas.

## 5. Revisión independiente de lectura del contrato

Un actor independiente leyó las especificaciones completas y el contrato congelado; sin escrituras, nuevas pruebas, operaciones remotas ni revisión nativa. **Sin contradicciones bloqueantes en las cuatro áreas solicitadas**:

| Área | Dictamen y evidencia del repositorio |
|---|---|
| Stock | Enteros, saldos separados, actor/motivo/versión e idempotencia; repetición antes de rechazo por versión. Apertura genera salida de rollo y entrada de metros, no venta de rollo abierto. `docs/decisions/H2-contract.md:33–40`; `contracts/openapi.yaml:2174–2184,2272–2282,3680–3739` |
| Permisos administrativos | 21 operaciones H2: cinco públicas y 16 administrativas con sesión H1; diez mutaciones con Origin+CSRF. Respuesta pública excluye cantidad/umbral/versión privados. `contracts/openapi.yaml:2362–2397,2972–3048` |
| Precios | Decimal no negativo como string de unidades menores ARS; límite bigint y precios independientes, sin derivar precio metro del rollo. `contracts/openapi.yaml:2672–2684`; decisión `:17–25`; `contracts/examples/h2-product.json:17–37` |
| Errores | code/message/requestId y fieldErrors opcional; 400/401/403/409/503 según operación; uploads incluyen 413/415. `contracts/openapi.yaml:2195–2254,2293–2353,2639–2657` |

**Advisory P3 preexistente, no defecto de ejecución:** `StockOperationView.entries` (`contracts/openapi.yaml:3634–3665`) permite estructuralmente una o dos entradas sin condicionar por tipo. Un validador exclusivamente estructural podría aceptar una apertura con una entrada, aunque la regla normativa exige dos y servicio/pruebas lo fijan. No se cambia el contrato congelado por esta limitación expresiva. El ejemplo `contracts/examples/h2-roll-opening.json:7–20` muestra correctamente −1 ROLL y +100 METER.

## 6. Verificación de las correcciones

| Ejecución nueva | Resultado |
|---|---|
| Dos nuevas pruebas skip-link antes de corregir | RED: dos fallos reales por no cancelar navegación predeterminada |
| `npm test -- --watch=false --include=src/app/layouts/skip-links.spec.ts --include=src/app/features/catalog/product-detail-page.component.spec.ts` | GREEN: cuatro pruebas, dos archivos, exit 0; spot check final del padre también 4 PASS |
| Frontend `npm run build` / `npm run lint` | Ambos exit 0 |
| Frontend `npm test -- --watch=false` | 79 PASS, 16 archivos, exit 0; repetición justificada por cambio en layouts compartidos/Home/detalle |
| Verificación independiente en scratch nuevo | Cuatro pruebas focalizadas y dos probes propios PASS, exit 0; click de teclado, foco, múltiples query params y fragmento conservados |
| Readback independiente de superficie | 61 hashes de fuentes iguales antes/copias/después; solo delta autorizado, sin cambios en logout, sesión, destinos, carga ni cantidades |

Logs nuevos retenidos en `odd/checks/h2-closure/`: `skip-links-red.log`, `skip-links-green-detail.log`, `frontend-build.log`, `frontend-lint.log`, `frontend-affected-suite.log`; pruebas/manifiestos independientes en `independent-ui/`. Son evidencia local ignorada por Git, no archivos de producción. Se conservan en el worktree para inspección; los resultados y recibos esenciales están resumidos/versionados aquí.

No se repitieron suites completas de backend, migraciones, concurrencia ni las aprobadas H1: ese código no cambió. Sus resultados históricos y omisiones permanecen en el informe H2, no se adjudican al nuevo commit como ejecución fresca. El smoke ejercitó login/logout e integración H1/H2 del candidato final.

Assessment informativo del commit frente a `5431f4f`: `gentle-ai.review-assessment/v1`, riesgo `medium`, seis paths/74 líneas, `review_due=false`, `review_due_reason=under_budget`. **No es un PASS nativo.** No se abrió nueva transacción, no se reintentaron lentes, no se forzó consentimiento ni se alteraron revisiones anteriores.

## 7. Matriz de cierre y decisión pendiente

| Solicitud | Estado |
|---|---|
| Estado Git y cierre documental sin producción | CONFORME, diff de producción vacío antes de la corrección explícita |
| Seis vistas a 360/768/1440, capturas y problemas | CONFORME; defectos corregidos y evidencia antes/después |
| Teclado/foco y reflow | CONFORME en el alcance observado; no certificación integral de accesibilidad |
| Zoom nativo | **PENDIENTE: falta control efectivo del navegador para comprobarlo** |
| Smoke integrado con fixtures propios | CONFORME, sin duplicar ajuste/apertura |
| Revisión independiente del contrato acotada | CONFORME; un advisory P3 registrado |
| Pruebas proporcionales y correcciones | CONFORME; solo suite completa frontend afectada |
| Preservación y prohibiciones de publicación | CONFORME; WIP/worktrees conservados, sin push/PR/merge/tags/H3 |

No se ejecutó comparación Figma nueva ni auditoría WCAG completa; no forman parte de esta evidencia. La deuda técnica H1 no cambió. No se introdujeron reservas, descuento por pagos, carrito, checkout, pedidos ni pagos.

**Siguiente paso: auditoría externa**, incluyendo la comprobación pendiente de zoom nativo. Se detiene el trabajo; no se declara cierre global completo con esa prueba ausente.

Risk: item 3 (layouts compartidos y navegación pública/H1; verificación independiente, regresiones y smoke realizados, sin cambio de política de autenticación).
