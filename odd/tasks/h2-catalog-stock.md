# H2 — Catalog and stock implementation
Objective: implement H2.1–H2.4 only on approved H1 base `5c0e0fc200c1c22eaa2731298eb7e8bf968a8466`; branch `codex/h2-catalog-stock`.
Delivery: local coherent work-unit commits only, no push/PR/merge/tags; proportional slicing selected under the user's delegated granularity decision, future PR topology deferred to external audit. Forecast: 4,000–7,000 authored lines, not a hard cap. Runners: existing backend Jest/Prisma/OpenAPI and Angular Vitest/build/lint plus isolated PostgreSQL integration.

## Specs

The complete revised input below is normative. The user's latest approved Git state supersedes the historical pending-integration narrative in S1; no business requirement is changed. Exact Spanish source text is retained.

### S1

> ## 1. Contexto y puerta de entrada
>
> GitHub público fue verificado directamente: `FerrariAgustinNicolas/abar-electricidad`, PR #1 de H1 mergeado, `main` en `18c39e9b86b7b7bf45263fe5bad4fe77125a6386` en la consulta previa a este documento.
>
> **Auditoría externa de H1: CUMPLE para continuar, con deuda declarada.** Se evaluaron `docs/milestones/H1-informe.md`, `H1-postmerge-validation.md` y `H1-correccion-tests.md`. En el commit local `8308f8c423aef2550deaa97464735002509d4d46` se corrigieron cuatro pruebas, sin modificar código de producción. Se informó Review y Verify independientes, revisión nativa aprobada para el **delta correctivo** y suites finales sin fallas. El informe posterior `f9a9483` es documental. No atribuir aprobación nativa global a todo H1 ni afirmar certificación de producción. Quedan pendientes tres TODOs de persistencia, navegador visual completo y harness congelado; la cobertura alternativa funcional quedó documentada.
>
> **La rama correctiva todavía no estaba publicada ni integrada al momento de esta autorización. Antes de iniciar H2, debe estar incorporada en main junto con sus informes y actualización documental.**
>
> 1. Verificá raíz Git `/Users/agustin/Repos/personal/abar-electricidad`, `origin`, rama/HEAD, árbol/índice, worktrees y estado real de `main` y `origin/main`. No tocar WIP ajeno.
> 2. Comprobá que el tag `h0-approved` esté intacto y que `main` contiene los commits de corrección `8308f8c` y del informe `f9a9483`, o sus equivalentes si hubo integración revisada. Comprobá la publicación y posición del tag `h1-approved` **solo si efectivamente fue creado**: no inventar SHA o etiqueta.
> 3. Leé completos `docs/plan.md`, `docs/milestones/H0-informe.md`, `docs/milestones/H1-prompt.md`, `docs/milestones/H1-informe.md`, `docs/milestones/H1-postmerge-validation.md`, `docs/milestones/H1-correccion-tests.md`, `docs/decisions/H0-base.md`, `docs/decisions/H0-contract.md`, `docs/decisions/H1-auth.md`, `contracts/openapi.yaml`, `docs/figma-map.md` y README. Si falta un archivo, explicá el bloqueo; no asumir contenido.
> 4. Tomá H1 como **base técnica aprobada con deuda explícita**, pero no como autorización para introducir cambios incompatibles en CSRF, cookies, sesión, administración o OpenAPI. Las omisiones documentadas deben seguir trazadas y las regresiones H1 mantenerse verdes.
> 5. Si la integración post-merge no está cerrada/publicada, **detenete sin comenzar H2** y solicitá regularizarla. Si está cerrada, creá desde el `main` actualizado una rama, por ejemplo `feat/h2-catalog-stock`. No reutilices ramas de H1 ni alteres su historial.
> 6. Si `H2-prompt.md` está sin versionar, podés incluir **solo este archivo** en un commit documental inicial de H2 una vez creada su rama, previa revisión selectiva. No incorporarlo a `main` aislado. No hacer `git add -A` indiscriminado.
> 7. Conservá los agentes Pi/Gentle-AI, permisos nativos y configuraciones. Si un control nativo bloquea una operación, detenerse y pedir autorización acotada.
>
> **No hacer push, merge a main ni tags durante H2.** Guardar evidencia y detenerse para la auditoría H2.

### S2

> ## 2. Resultado del hito
>
> Desarrollar el **catálogo real desde base de datos**, administrable desde Angular y visible al comprador sin autenticación, incluyendo productos, categorías, presentaciones, precios, imágenes, disponibilidad y movimientos de existencias, más **apertura manual y atómica de rollos**.
>
> Los cuatro bloques son:
>
> - **H2.1 (P0):** modelo Prisma/PostgreSQL, restricciones, migraciones, seeds ficticios; saldos enteros por presentación.
> - **H2.2 (P1):** administración real de categorías, productos, precios, características, galería de imágenes y visibilidad.
> - **H2.3 (P0):** ajustes auditables e idempotentes de stock y apertura de rollos cerrados a metros, con concurrencia segura.
> - **H2.4 (P1):** Home, catálogo, búsqueda/filtros/paginación, detalle y selector de presentación consumiendo la API pública real.
>
> **No comenzar H3 (carrito/quote), H4 (pedidos) ni H5 (confirmación de pagos).** No simular reservas, cobros o demanda impaga real en H2.

### S3

> ## 3. Reglas confirmadas de negocio — obligatorias
>
> 1. ABAR vende por **UNIT**, **METER** y **ROLL**, siempre en cantidades enteras positivas, incrementos de 1. No se venden medios metros o medios rollos en esta PS.
> 2. Un rollo vendido debe entregarse **entero y cerrado**. La cantidad de rollos cerrados y los metros procedentes de rollos abiertos se mantienen **en saldos separados**.
> 3. Un administrador puede **abrir físicamente** N rollos cerrados para vender metros; la apertura decrementa N rollos cerrados e incrementa N × longitud_entera_del_rollo metros. Es una conversión **atómica y registrada**, no una venta ni una compra.
> 4. **No se recompone un rollo cerrado** sumando metros sueltos. No se hace apertura automática desde el checkout o la API pública.
> 5. La longitud de rollo es configurable **por artículo/presentación ROLL**; no presumir que todos miden 100 m. UNIT, METER y ROLL tienen precios independientes; un rollo no tiene por qué costar `longitud × precio_por_metro`.
> 6. Color, sección, potencia, material y medida son **atributos descriptivos del producto**, no variantes combinatorias que debamos crear automáticamente. Un cable rojo y uno azul pueden cargarse como artículos distintos si el catálogo así lo decide.
> 7. Los saldos pertenecen **al e-commerce**. La sincronización con mostrador es posterior a la PS; no construirla aquí.
> 8. Los pedidos impagos **no reservan ni descuentan stock**; el descuento ocurrirá exclusivamente tras confirmación manual de pago en H5. En H2 **no existen todavía pedidos**, por lo que no implementar cálculos ficticios de demanda impaga ni tablas de pedidos solo para mostrarla.
> 9. El comprador verá `Disponible`, `Pocas unidades` o `Sin stock` según **su presentación**, nunca el saldo numérico exacto. El administrador sí ve existencias.
> 10. Stock disponible cero implica presentación no vendible; una presentación sin stock puede mostrarse informativamente sin permitir iniciar compra. La política de no vender por encima de disponible rige ya en controles de UI/servicios H2; la validación final de pedido se implementa en H4/H5.
>
> Ejemplo **ficticio** de aceptación: un artículo con rollos de 100 m tiene 3 rollos cerrados y 20 m abiertos. Abrir 1 deja **2 rollos cerrados y 120 m abiertos**. Una compra futura de 1 rollo podrá consumir solo el saldo cerrado y una venta futura de 30 m solo el abierto.

### S4

> ## 4. Modelo H2 y restricciones de persistencia
>
> Extender el schema Prisma **encima de las migraciones reales H1**; preservar Admin, Sessions, su seguridad y cualquier tabla H1.
>
> Modelar como mínimo:
>
> - `Category`: id, nombre, slug único, descripción, activo, orden, versión; ícono/imagen opcional solo si justificado por diseño actual.
> - `Product`: id, categoría, nombre, slug único, marca opcional, SKU único si existe, descripción breve y detallada, características técnicas flexibles (clave/valor), activo/destacado, versión y timestamps.
> - `ProductPresentation`: id, producto, `unit` (UNIT/METER/ROLL), longitud entera positiva si ROLL, precio `amountMinor` en centavos de ARS, mínimo de stock, visibilidad/activa, predeterminada y versión; una presentación por unidad por producto en esta versión salvo revisión explícita del contrato.
> - `ProductImage`: id, producto, nombre/clave segura de archivo, tipo validado, bytes, alt, orden y principal (máximo una principal).
> - `StockBalance`: presentación, saldo entero no negativo y versión; único por presentación.
> - `StockOperation`: id, tipo, motivo, administrador autor, fecha, referencia de idempotencia y metadata mínima auditada.
> - `StockEntry`: operación, presentación, delta firmado, saldo resultante; cada cambio de saldo tiene su asiento auditado.
> - Si se necesita una tabla de idempotencia común para los ajustes/aperturas, justificar e incluir lo mínimo suficiente sin implementar el dominio de pagos.
>
> Reglas de integridad:
>
> - `CHECK`/constraints efectivas en PostgreSQL para saldos no negativos, precios válidos, longitud positiva y unicidad de entidades/presentaciones; índices proporcionados para búsquedas y FK.
> - Importes representados como enteros en centavos/`bigint` persistidos y expuestos como `{ amountMinor: string, currency: 'ARS' }` según H0, nunca con aritmética monetaria en float.
> - Cambiar descripciones o precios **no modifica stock**. Ajustes exclusivamente mediante operaciones auditadas y endpoint separado.
> - No eliminar físicamente productos/presentaciones que tengan movimientos. Preferir desactivación y preservar trazabilidad para futuros pedidos.
> - Longitud/unidad de presentación con movimientos no se edita in-place: rechazar o requerir proceso explícito documentado, sin mutar saldos históricos.
> - Desactivar una categoría con productos activos debe impedirse o requerir reasignación/desactivación explícita; nunca ocultar productos por accidente sin informar.
> - Seeds ficticios, deterministas e idempotentes; **no borrar ni regenerar las cuentas H1, contraseñas, sesiones ni datos existentes**. Probar migraciones desde una base limpia y desde el estado H1.
>
> No introducir event sourcing, ERP, lotes, tracking de cada tramo/remanente, múltiple sucursal, CQRS complejo ni microservicios.

### S5

> ## 5. Stock: operación, concurrency e idempotencia
>
> **Ajuste de inventario**: un administrador indica presentación, `delta` entero distinto de cero, motivo obligatorio y versión esperada. El servidor bloquea/coordina saldo, verifica resultado no negativo y escribe saldo + movimiento en **una transacción**. Repetición con misma `Idempotency-Key` y mismo cuerpo no duplica el cambio; misma clave con cuerpo diferente devuelve 409.
>
> **Apertura de rollo**: administrador indica producto/relación de presentaciones, cantidad de rollos positiva, motivo, versiones esperadas y clave de idempotencia. El servidor obtiene longitud y presentaciones desde BD (no confía en metros enviados por el navegador), comprueba rollos suficientes y actualiza **ambos saldos y movimientos** atómicamente. Si falla un saldo, **rollback** completo.
>
> Respetar un orden de bloqueo determinista y pruebas de dos peticiones simultáneas: dos aperturas compitiendo por el último rollo; apertura enfrentada con ajuste; operación repetida por doble clic/reintento. No forzar SERIALIZABLE ni dependencias complejas sin justificación; emplear control transaccional realmente compatible con **la versión Prisma/PostgreSQL fijada en el repositorio**.
>
> El endpoint de lectura admin debe devolver saldo, mínimo y estado derivado por presentación; demanda impaga es responsabilidad H4. Si se deja preparado un campo para H4, etiquetarlo claramente como **no implementado todavía** en el contrato y UI, no inventar un valor comercial.

### S6

> ## 6. Contrato API H2 (normativo una vez congelado)
>
> **Base** `/api/v1`, objetos/error/paginación/cookies/CSRF conforme a H0/H1. Mantener un único `contracts/openapi.yaml`. Evitar que Swagger generado y el contrato normativo diverjan; actualizar ejemplos y CHANGELOG de contrato.
>
> ### Público, acceso sin sesión (P)
>
> | Método y endpoint | Resultado/alcance |
> | --- | --- |
> | `GET /public/home` | Categorías destacadas, productos destacados y últimas unidades; estructuras compartidas de resumen. |
> | `GET /public/categories` | Categorías activas ordenadas. |
> | `GET /public/products` | `q`, `categoryId`, `availability`, `unit?`, `minPriceMinor?`, `maxPriceMinor?`, `sort`, `page`, `pageSize`; solo productos/presentaciones vendibles o informativos según visibilidad. |
> | `GET /public/products/{slug}` | Ficha visible con imágenes, descripción, atributos, presentaciones, precios y disponibilidad por presentación. |
>
> Se contemplan 404/400 coherentes, paginación `items/pageInfo`, IDs opacos, errores sin detalles sensibles, precio y filtros vinculados a **la presentación coincidente**. No implementar `POST /public/checkout/quotes` ni crear pedidos.
>
> ### Administración — sesión H1 (A), CSRF para mutaciones
>
> | Método y endpoint | Resultado/alcance |
> | --- | --- |
> | `GET /admin/categories` | Listado completo, estado/orden y filtros. |
> | `POST /admin/categories` | Alta, 201; 409 `SLUG_IN_USE`. |
> | `PATCH /admin/categories/{id}` | Edición/estado con `expectedVersion`; 409 `CATEGORY_HAS_ACTIVE_PRODUCTS`/`VERSION_CONFLICT`. |
> | `PATCH /admin/categories/order` | Reordenar; 409 `CATEGORY_SET_CHANGED`. |
> | `GET /admin/products` | Listado con filtros, búsqueda, disponibilidad y paginación. |
> | `GET /admin/products/{id}` | Ficha admin con precios/presentaciones/saldos y datos privados de catálogo, no secretos. |
> | `POST /admin/products` | Alta, saldos iniciales cero; 409 `SKU_IN_USE`/`SLUG_IN_USE`, 400 `INVALID_PRESENTATION`. |
> | `PATCH /admin/products/{id}` | Actualizar datos/versiones, no saldos; 409 `PRESENTATION_IMMUTABLE`/`VERSION_CONFLICT`. |
> | `POST /admin/products/{id}/images` | Multipart de imagen, metadatos y validaciones (400/413/415). |
> | `PATCH /admin/products/{id}/images/{imageId}` | Orden, principal, alt. |
> | `DELETE /admin/products/{id}/images/{imageId}` | Eliminar imagen y mantener principal coherente. |
> | `GET /admin/stock` | Saldos por presentación, mínimos, filtros, sin demanda H4 inventada. |
> | `GET /admin/stock/movements` | Historial auditable, filtros/paginación. |
> | `POST /admin/stock/adjustments` | Delta/motivo/versión/idempotencia; 409 saldo/versión. |
> | `POST /admin/stock/roll-openings` | Cantidad/motivo/versiones/idempotencia; 409 rollos insuficientes/versión, 400 configuración inválida. |
>
> Rutas precedidas realmente por `/api/v1` y autorizadas **en NestJS**, no solamente ocultas mediante rutas Angular. Probar 401/403 y CSRF real. El único modo de modificar saldos es un endpoint de movimiento; prohibido `PATCH availableQuantity` libre.
>
> Congelar primero DTO/enums/respuestas/errores y estrategia de imágenes. El frontend puede usar mocks **validados contra el contrato** de forma temporal; al cierre H2 deben consumir API real sin mocks residuales. Cambios incompatibles de contrato detienen el frente afectado y vuelven a revisión externa con impacto Front/Back documentado.
>
> ### Mínimos de objetos de catálogo
>
> - `ProductSummary`: id, slug, nombre, categoría, imagen principal o fallback, presentación predeterminada, presentaciones activas, precio y estado de disponibilidad **por presentación**. Public API no expone saldo numérico.
> - `ProductDetail`: resumen + descripción breve/detallada, atributos `[{key,value}]`, imágenes `[{id,url,alt,order,isPrimary}]` y presentaciones.
> - `AdminProduct`: datos editables, SKU y versiones + stock/umbrales por presentación.
> - `ProductWrite`: datos principales, categoryId, atributos, `presentations[{id?,unit,rollLengthMeters?,price,lowStockThreshold,active,isDefault}]`, expectedVersion cuando corresponde; **sin saldo en DTO de edición**.
> - `StockAdjustmentRequest`: `presentationId`, `delta`, `reason`, `expectedVersion`, idempotencia por header.
> - `RollOpeningRequest`: `productId`, `rollQuantity`, `reason`, `expectedVersions`, idempotencia por header. Los metros a acreditar se computan en backend.

### S7

> ## 7. Imágenes y almacenamiento local
>
> La ficha pública de Figma contiene galería y edición admin solo una imagen principal: resolver con galería simple, imagen principal y adicionales, sin gestor de archivos general.
>
> - Almacenamiento de prueba local detrás de interfaz pequeña, no exponer rutas absolutas del host.
> - Aceptar tipos raster seguros definidos y detectados por **firma/contenido**, no solo extensión/MIME del navegador.
> - Limitar tamaño, dimensiones y cantidad por producto con números documentados y probados.
> - Generar nombres de archivo seguros en servidor; evitar path traversal, SVG arbitrario, ejecución y SSRF mediante descarga remota.
> - Validar permisos: solo un admin autenticado puede subir/cambiar/eliminar; público puede leer únicamente imágenes visibles de productos públicos.
> - Conservar integridad entre metadatos en BD y archivo; tratar fallos parciales y limpieza idempotente con política simple documentada.
> - Imagen fallback (sin depender de un asset remoto externo) y alt adecuado.

### S8

> ## 8. Frontend Angular y mapeo de Figma
>
> **Referencias de pantalla ya auditadas previamente:**
>
> - Home **CORREGIDA**: `17:256` (la original `6:4` no se usa como base nueva).
> - Catálogo: `6:182`.
> - Detalle: `6:324`.
> - Gestión admin de productos: `9:412`.
> - Alta/edición: `9:539`.
> - Categorías: `9:844`.
> - Nuevo área admin stock: `/admin/stock` (sin frame completo, derivado del alcance confirmado).
> - Componentes visuales: Foundations, página `0:1`, estilo del proyecto.
>
> Accedé a Figma si está disponible desde el agente; si no, usá las referencias del plan y registrá qué parte fue inspección nueva y cuál documentación existente. **No inventes pantallas o comportamientos como si estuvieran dibujados.**
>
> Público:
>
> - `/`: categorías destacadas, productos destacados y últimas unidades desde API, con estados loading/empty/error y enlaces correctos.
> - `/productos`: búsqueda por texto, categoría, disponibilidad, presentación, precio y orden; conservar filtros/paginación en query params; búsqueda cancelable para evitar resultados obsoletos.
> - `/productos/:slug`: galería, características, precio por presentación, selector UNIT/METER/ROLL según producto y stepper de cantidades enteras; si no hay stock, impedir iniciar compra.
> - Las tarjetas de producto muestran precio **por unidad/metro/rollo** según presentación que corresponda al filtro. Nunca mezclar precio de METER con promesa de ROLL.
> - **No implementar carrito funcional ni CTA que finja agregados.** Se puede mostrar acción claramente deshabilitada / «próximamente» según decisión visual documentada, manteniendo navegación y detalle reales. Carrito completo corresponde a H3.
>
> Administración (rutas protegidas, reutilizar sesión H1):
>
> - `/admin/productos`: tabla/listado, filtros, activar/desactivar, paginación, badges de stock; búsqueda por SKU, nombre, categoría y marca.
> - `/admin/productos/nuevo`, `/admin/productos/:id/editar`: formulario reactivo tipado con características flexibles, presentación y longitud/Precio, galería, validaciones, conflictos 409, cambios sin guardar.
> - `/admin/categorias`: alta/edición/activación/orden y conflicto ante categoría con productos.
> - `/admin/stock`: existencias por presentación, mínimos, movimientos, ajustes con motivo y flujo de abrir rollos con confirmación y antes/después.
>
> Usar tokens H0, componentes comunes, señales y servicios HTTP; no introducir NgRx ni framework visual paralelo. Mantener 401/403 gestionados por H1, y CSRF en mutaciones.
>
> Responsive 360 / 768 / 1440 px y navegación teclado/foco. Si hay navegador visual, comprobar y capturar; si no, entregar checklist manual y **no** afirmar PASS visual.

### S9

> ## 9. Seeds de demostración
>
> Dos categorías/estados activos e inactivos como mínimo, una categoría vacía y categorías suficientes para ejercitar filtros; categorías ejemplos: Cables, Iluminación, Térmicas, Tomas, Tableros, Herramientas.
>
> Productos ficticios:
>
> - unitario con stock suficiente y otro en mínimo;
> - uno sin stock y otro oculto;
> - cable vendido por metro y rollo con longitudes configuradas, saldos separados y precios independientes;
> - segundo cable con longitud distinta para probar que no se hardcodeó 100 m;
> - imagen principal/galería, artículo sin imagen, descripción larga y SKU opcional.
>
> Seeds idempotentes sin sobrescribir manualmente stock o precio ya editado. No recrear administradores/contraseñas H1; el bootstrap admin conserva su política segura. Datos ficticios, sin credenciales compartidas ni productos reales presentados como confirmados. Registrar comandos y resultados.

### S10

> ## 10. Reparto y dependencias de agentes
>
> **Contrato primero.** El orquestador decide el número de workers, reviewers y verify según dependencias; no se le asigna un número artificial.
>
> - **Integración/contrato:** control exclusivo de `contracts/**`, schema/migraciones compartidas, cambios de scripts raíz, README y decisions. Congelar contratos H2 y formato imagen antes del paralelismo.
> - **Backend catálogo:** categorías/productos/atributos/presentaciones/búsqueda/imágenes; Prisma y migraciones coordinadas.
> - **Backend stock:** saldos/movimientos/ajustes/apertura/idempotencia, tras definir modelo común; no duplicar writers de schema.
> - **Frontend público:** Home/catálogo/detalle con mocks conformes al contrato y posterior API real.
> - **Frontend admin:** categorías/productos/formularios/stock usando sesión H1; posterior integración real.
> - **Review/Verify:** inspección independiente de reglas y pruebas, no reemplazar sus resultados por resumen del worker.
>
> No mezclar ediciones simultáneas de OpenAPI, Prisma schema/migraciones, assets globales o configuraciones personales. Integración obligatoria tras cada bloque coherente, no acumular UI mock hasta el final.

### S11

> ## 11. Riesgos y casos de prueba obligatorios
>
> ### Modelo/reglas
>
> 1. Alta UNIT y cable METER+ROLL, precios diferentes y longitud explícita; rechazar incrementos fraccionarios o cero.
> 2. Actualización de nombre/precio/descripción no modifica saldos ni borra movimientos.
> 3. Intento de modificar longitud de ROLL con movimientos no reescribe historial.
> 4. SKU/slug duplicados y `expectedVersion` vencido retornan errores contractuales.
> 5. Producto/categoría inactivo no aparece públicamente; acceso directo a slug no filtra información no pública.
> 6. Categoría con productos activos no puede desactivarse sin solución explícita.
> 7. Imágenes: tipo falso por extensión, tamaño excesivo, principal duplicada, borrado/cambio de principal, URL segura y fallback.
>
> ### Stock
>
> 8. Ajuste positivo/negativo con motivo y delta registrado; ajuste negativo superior al saldo → 409 y rollback.
> 9. Apertura normal: 3 ROLL ×100 m + 20 METER → 2 ROLL + 120 METER; exactamente dos movimientos auditados.
> 10. Apertura con rollos insuficientes, longitud inválida o falta de presentación METER → ningún cambio parcial.
> 11. Misma clave de idempotencia + mismo request no duplica ajustes/aperturas; misma clave + otro cuerpo responde 409.
> 12. Dos ajustes/aperturas concurrentes no producen stock negativo o saldo incoherente. Validar contra PostgreSQL real.
> 13. No recomponer ROLL desde metros; no descontar por consulta pública ni edición del producto.
> 14. STOCK 0, bajo mínimo y disponible calculados por **presentación**, sin exponer saldos en API pública.
>
> ### API y seguridad
>
> 15. GET público sin credenciales retorna solo productos visibles; búsqueda por nombre/categoría/marca/SKU/atributos según contrato, filtros orden/página con resultado estable.
> 16. Filtro de precio y sort no confunden METER y ROLL.
> 17. Toda mutación admin requiere sesión y CSRF/origen H1; visitante recibe 401/403, sin filtrar datos administrativos.
> 18. 409 de versión y errores de imágenes se presentan en UI sin pérdida silenciosa.
> 19. OpenAPI validado estática y semánticamente contra Swagger/runtime, incluyendo errores y ejemplos.
> 20. Migración desde H1 y desde base limpia, seeds repetidos sin duplicar ni resetear la base.
>
> ### Front e integración
>
> 21. Home, catálogo y detalle consumen API real; estados loading/error/empty.
> 22. Filtros/paginación persistentes en URL al volver atrás o recargar; búsqueda no devuelve resultados viejos por carrera.
> 23. Admin crea producto, carga imagen, edita presentación, ajusta stock, abre rollo y ve efecto en catálogo público.
> 24. UI móvil/tablet/escritorio, teclado y foco si existe navegador. Si no, registrar deuda visual con pruebas manuales específicas.
> 25. Build/lint/tests frontend/backend, health, auth H1 y smoke H2 sin degradación. No suprimir aserciones para obtener verde.
>
> No perseguir 100% cobertura; priorizar invariantes, privilegios, concurrencia y flujos de usuario.

### S12

> ## 12. Review y Verify
>
> ### Review
>
> Revisar por lo menos:
>
> - modelo de presentaciones y saldos separados;
> - apertura manual atómica y auditoría;
> - idempotencia y carreras de stock;
> - seguridad de uploads;
> - conservación de H1 y de migraciones;
> - visibilidad pública y no exposición de stock;
> - precisión monetaria;
> - contrato único OpenAPI y ausencia de endpoints H3–H5 implementados;
> - fidelidad al Figma real donde se pueda inspeccionar.
>
> Registrar hallazgos y correcciones; no considerar «cuatro lentes aprobados» sin evidencia real.
>
> ### Verify independiente
>
> Ejecutar y documentar en el **commit exacto** que se entrega:
>
> - `npm ci` (frontend/backend) y versiones/lockfiles según scripts existentes;
> - builds, lint, unit e integración/e2e relevantes;
> - Prisma `validate`, `generate`, migración desde base H1 y base limpia aislada;
> - seeds idempotentes;
> - OpenAPI/Swagger y ejemplos;
> - autenticación/CSRF H1 no regresados;
> - tests de apertura/ajustes e idempotencia/concurrencia contra PostgreSQL;
> - smoke real navegador/API para catálogo y admin stock cuando esté disponible;
> - verificaciones de imágenes y control de acceso;
> - `docker compose`/bindings del entorno según H0;
> - estado Git limpio, sin secretos ni archivos personales versionados.
>
> Cada prueba debe registrar comando, exit code, ambiente y evidencia. `NOT APPLICABLE`/`BLOCKED` son válidos si están justificados, pero no se declaran `PASS` sin ejecución.

### S13

> ## 13. Criterios de aceptación H2
>
> 1. H1 verificado como base y sin regresiones de seguridad.
> 2. Modelo/migraciones funcionales y seeds ficticios idempotentes.
> 3. Productos y categorías administrables, baja lógica y validaciones reales.
> 4. UNIT/METER/ROLL con precios y saldos propios, longitud configurable por rollo.
> 5. Apertura manual de rollos y ajustes en transacción, auditados e idempotentes.
> 6. Stock nunca negativo; no convertir metros en rollos ni abrirlos automáticamente.
> 7. Visibilidad pública/estados por presentación sin stock numérico.
> 8. Imágenes múltiples y principal coherentes, con controles de seguridad.
> 9. Home/catálogo/búsqueda/filtros/detalle sobre API real, sin mocks de cierre.
> 10. Admin CRUD de catálogo/stock operativo con sesión H1.
> 11. OpenAPI, Swagger y validación de ejemplos consistentes.
> 12. Frontend/backend builds/lint/tests, migraciones y smoke integrados verificados.
> 13. Review y Verify independientes documentados sobre candidato exacto.
> 14. Entorno local y secretos protegidos.
> 15. Brechas visuales cerradas cuando es posible o documentadas sin fingir pruebas.
> 16. Informe H2 completo y **ningún avance a H3**.

### S14

> ## 14. Restricciones Git y cierre
>
> - Branch sugerida: `feat/h2-catalog-stock` desde `main` con H1 integrado.
> - Commits locales revisables; preservar worktrees y ramas de H1/H0.
> - No ejecutar `reset --hard`, `clean -fd`, force-push, rewrite de historia, eliminación de volúmenes o reset de DB.
> - No tocar configuración global de agentes o proyectos ajenos.
> - No hacer push, merge a `main` ni tags en esta ejecución.
> - No cerrar H2 por cuenta propia ni encadenar H3.
>
> Guardar `docs/milestones/H2-informe.md` con: base real H1 y SHA, hitos H2.1–H2.4, decisiones, cambios de contrato, diseño Prisma, migraciones, rutas, seguridad, archivos, agentes realmente usados, comandos/exit codes/resultados, Review/Verify, regresiones H1, evidence de Figma/UI, defectos/deuda, bloqueos y matriz **CUMPLE/PARCIAL/NO CUMPLE** por criterio.
>
> **Detenerse para auditoría humana antes de integrar o publicar H2.**

## Tasks

- T0 | S1 | inline + delegated read-only mapping (mandatory full reference reading exceeds bounded inline evidence) | COMPLETE | approved base verified, full-read handoff received; no remote operations.
- T1 | S4–S7,S10–S11 | inline shared integration owner | IN PROGRESS | freeze OpenAPI/examples/image strategy, schema/migrations and contract checks before parallel implementation; Risk items 1,3,5.
- T2 | S2–S4,S6–S9,S11 | delegated parallel backend catalog unit, after T1; disjoint catalog surface | PENDING | categories/products/images, deterministic non-destructive seeds; Risk items 1,2.
- T3 | S3–S6,S10–S11 | delegated parallel backend stock unit, after T1; disjoint stock surface | PENDING | audit/idempotency/atomic openings/real PostgreSQL races; Risk items 1,2,4.
- T4 | S2–S3,S6–S8,S11 | delegated parallel public frontend unit, after T1; disjoint public pages | PENDING | API Home/catalog/detail, URL state and presentation availability; Risk item 3 (shared routes owned by parent).
- T5 | S2–S8,S11 | delegated parallel admin frontend unit, after T1; disjoint admin pages | PENDING | catalog/stock administration using unchanged H1 session; Risk item 2.
- T6 | S11–S14 | independent Review + independent Verify; parent synthesis | PENDING | exact candidate, checks/evidence/acceptance matrix, H2 report, stop for external audit.

## Log

### L1 — Original user authorization (2026-10-20)

Vamos a comenzar H2 — Catálogo y gestión de stock de ABAR Electricidad.

**Estado aprobado:**

- H0 y H1 están integrados y aprobados para continuar.
- `main` y `origin/main`: `5c0e0fc200c1c22eaa2731298eb7e8bf968a8466`.
- `h1-approved` apunta al mismo commit.
- PR #47 integrado.
- La deuda técnica de H1 está documentada y no bloquea H2.

Leé completo `docs/milestones/H2-prompt.md` y los documentos, decisiones y contratos que allí se indican.

**Autorizo ejecutar únicamente H2**, respetando H2.1, H2.2, H2.3 y H2.4.

Antes de modificar archivos:

1. Verificá raíz Git, rama, HEAD, remoto, tags y worktrees.
2. Preservá todo el WIP existente.
3. Comprobá que el prompt corresponde a la versión revisada posterior a la auditoría H1.
4. Actualizá la referencia local de `main` mediante operaciones no destructivas, si resulta necesario.
5. Creá una rama independiente desde el `main` aprobado, por ejemplo `feat/h2-catalog-stock`.
6. Incorporá selectivamente el prompt de H2 a esa rama si todavía no está versionado.

**Ejecución:**

- Conservá el orquestador, workers, reviewers y Verify existentes.
- Definí y congelá el contrato OpenAPI de H2 antes de paralelizar frontend y backend.
- Aprovechá el trabajo paralelo cuando aporte valor.
- Elegí una granularidad de tareas y PR proporcional al proyecto. Evitá fragmentación y sobreingeniería innecesarias.
- Mantené Angular, NestJS, PostgreSQL y Prisma.
- Conservá el funcionamiento y las pruebas de H1.

**Reglas fundamentales:**

- Venta por unidad, metro y rollo, con cantidades enteras.
- Los rollos vendidos deben permanecer cerrados.
- Apertura manual y auditada de rollos para habilitar metros.
- Saldos independientes para rollos cerrados y metros disponibles.
- Características técnicas descriptivas, sin sistema complejo de variantes.
- No implementar todavía reservas de stock ni descuento por pagos: corresponden a hitos posteriores.
- No adelantar carrito, checkout, pedidos ni pagos.

**Verificación y cierre:**

- Ejecutá Review y Verify independientes.
- Verificá migraciones, integridad, operaciones de stock, API, frontend, integración y regresiones H1.
- Registrá las pruebas no ejecutadas y sus motivos.
- Generá `docs/milestones/H2-informe.md` con commits, evidencias, decisiones y matriz de aceptación.

No hagas push, merge a main ni tags.
No avances a H3.
Detenete al entregar el informe para auditoría externa.

Si aparece un cambio incompatible de arquitectura, contrato o reglas de negocio, detené el frente afectado y solicitá revisión antes de introducirlo.

### L2 — Entry evidence (2026-10-20)

- Original checkout remains on `feat/h1-change-password-review-blocks` at `9582df938c35ddb251b2446a568e32d9f60e9206`, with five existing dirty/untracked entries preserved. No stash/reset/checkout there.
- Root and origin URL verified; `main`, cached `origin/main`, and peeled annotated `h1-approved` all equal approved `5c0e0fc`; `8308f8c` and `f9a9483` are ancestors. Local main required no update. `h0-approved` remains at `2428f2b918d97c5a48dabc438b0b3bf89030c7fb`.
- All 11 original worktrees retained. New isolated worktree is the sibling `abar-electricidad-worktrees/h2-catalog-stock`. No live remote verification performed; prior publication evidence recalled and current local refs/ancestry independently verified.
- Revised H2 prompt is dated 2026-10-20 after external H1 audit; its historical pending-integration condition is now satisfied by the current approved base. Original input bytes copied selectively without alteration. SHA256: 065ad855cdb68a075de2a26552c7e3b55c4bc018d1ca90f960d01fbda9865c6c.
- `h2_entry_map` read all required referenced documents fully at immutable approved main, using bounded nontruncated ranges. H1 debt stays open; no global/native/production approval inferred.
- Existing CodeGraph was synced before structural queries; original agent/reviewer/Verify configuration unchanged. Native review mode reads ON (global); candidate consent remains separate.
- Default RED→GREEN applies when deterministic runnable behavior tests exist. Initial prompt/tracking is documentary; structural readback is the proportional check. Future functionality needs real PostgreSQL evidence for migrations and races, not mock substitution.
- Single integration owner holds contracts, Prisma, scripts/root config and shared Angular routes. No front/backend writer starts before T1 freeze. Parallel writers will receive narrow disjoint surfaces, immutable requirements, skills and tests; parent owns Git.

### L3 — Local work-unit 1 and contract checks

- `1d264ef`: selectively versioned unchanged H2 prompt and this logbook (747 lines). Standard whitespace check reported the source prompt's three original Markdown hard-break lines; preserved original input bytes and reran with blank-at-eol excluded (exit 0). No source implementation in this commit.
- Native assessment of that committed range: medium/executable-change (prompt), `review_due: false`, `under_budget`; no review transaction/consent was started. The open review slice retains approved-main base until the next assessment.
- Created the additive contract candidate 0.5.0 and decision H2-contract. Contract/schema owner is the parent; schema/migrations are still PENDING, no implementation worker started.
- Both offline npm ci commands exited 0, Node24.18.1/npm11.16.0. npm withheld lifecycle scripts; no automatic enabling or config changes. Dependency worker only wrote ignored node_modules.
- RED: focused contract test exited1 before implementation. GREEN: new tests6/6; full contract tests17/17 exit0; static OpenAPI ten examples exit0. Fixed test-helper signature usage and OpenAPI nullable image encoding without changing H1 assertion behavior.
- Product/image DTOs and PNG-only strategy are documented. No live Swagger/DB/UI claims; all remain pending. H2 contract candidate is one coherent larger work unit, not artificial schema-only/endpoint-only slices. No PR is created; later publication/topology remains a human decision.
