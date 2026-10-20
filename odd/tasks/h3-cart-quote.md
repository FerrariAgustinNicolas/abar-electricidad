# H3 cart and authoritative quote
Objective: H3.1–H3.3 only, external audit pending.
Branch: codex/h3-cart-quote; base: c91ccd4b436ecb2e4585d7c33e12b7b1a45d16ff. Local cohesive units only; publication strategy deferred (no PR authorized). Runners: Jest, Vitest, contract validators, owned PostgreSQL.

## Specs
The following S# sections quote the authorized prompt verbatim.

### S1
# ABAR Electricidad — H3 · Carrito y presupuesto autoritativo

**Hito autorizado:** H3.1–H3.3 únicamente.  
**Plan normativo:** `docs/plan.md`, especialmente §§ 2.1, 5.1–5.3, 6, 7.1–7.2, 8–9, 10.2–10.4, 13/H3, 14–15 y 17–18.  
**Informe final:** `docs/milestones/H3-informe.md`.  
**No avanzar a H4, no publicar ni integrar H3 sin auditoría externa.**


### S2
## 1. Punto de partida y puerta de entrada

H2 fue auditado externamente **CUMPLE para continuar** y luego integrado mediante [PR #48](https://github.com/FerrariAgustinNicolas/abar-electricidad/pull/48). GitHub fue consultado directamente:

- `main` y referencia remota informada: `c91ccd4b436ecb2e4585d7c33e12b7b1a45d16ff`.
- Tag anotado `h2-approved` verificado sobre ese mismo commit.
- Árbol real del merge: `9edf974d74e466662850cfd446ac391a18d7d406`, igual al entregable aprobado.
- H0 y H1 integrados previamente; conservar sus tags y deuda técnica.
- No hay H3 implementado en el estado de entrada confirmado.

**Preflight antes de cualquier escritura:**

1. Verificá raíz Git `/Users/agustin/Repos/personal/abar-electricidad`, `origin`, `main`, `origin/main`, `h2-approved^{}`, estado de índice/árbol, ramas y worktrees. Si una referencia cambió, inspeccioná antes de continuar; no fuerces el SHA anterior.
2. Leé `docs/plan.md`, `docs/milestones/H2-prompt.md`, `H2-informe.md`, `H2-cierre-validacion.md`, `docs/decisions/H2-contract.md`, `docs/decisions/H1-auth.md`, `contracts/openapi.yaml`, `contracts/CHANGELOG.md`, `docs/figma-map.md`, `README.md`, Prisma, rutas Angular y servicios H2 de catálogo/stock. Distinguir fuentes históricas y estado actual.
3. Preservá WIP y **los 13 worktrees existentes**. No cambiar el checkout original, no hacer reset/clean/rebase destructivo, borrar ramas, force-push ni editar configuraciones globales de Pi/Gentle-AI.
4. Creá una rama independiente desde el `main` aprobado, por ejemplo `feat/h3-cart-quote`, idealmente en un nuevo worktree aislado. No reutilices los de H1/H2 ni toques otros repositorios.
5. Si este prompt fue colocado sin versionar en `docs/milestones/H3-prompt.md`, incorporalo **selectivamente** en la rama H3. No hacer `git add -A` indiscriminado.
6. Conservá el orquestador existente y usá workers/reviewers/Verify según dependencias. Preferí pocas unidades cohesionadas: evitá una cadena de decenas de PR y gastos de verificación redundantes.


### S3
## 2. Alcance exacto

| Tarea | Objetivo obligatorio | Salida verificable |
| --- | --- | --- |
| **H3.1** | Carrito Angular por `presentationId`, cantidades enteras y persistencia local versionada. | Añadir, combinar, modificar, quitar, vaciar y recuperar tras recarga sin confundir metros/rollos/unidades. |
| **H3.2** | Presupuesto **autoritativo del servidor**, con modalidad de entrega, método compatible, tarifa plana y expiración. | Totales exactos y snapshots coherentes; cero reserva o movimiento de stock. |
| **H3.3** | Carrito + resumen de presupuesto + cambios/conflictos integrados con API real. | Precio/tarifa actualizados visibles y aceptados explícitamente antes de continuar; Review/Verify del candidato. |

No implementar creación de pedido, clientes registrados, formulario definitivo de comprador, acceso a pedido, simulador, pago, confirmación, descuento, demanda impaga, notificaciones, facturación, dashboard o configuración administrativa completa. Corresponden a H4–H8. No crear endpoints falsos para marcarlos como completos.


### S4
## 3. Reglas comerciales que deben mantenerse

1. Se vende por **UNIT, METER o ROLL**; cada una conserva su `presentationId`, precio y saldo independientes. Solo cantidades **enteras positivas** con paso 1. METER jamás se combina con ROLL aunque pertenezcan al mismo producto.
2. ROLL siempre significa rollo **entero y cerrado**. H3 nunca convierte un rollo en metros, abre rollos ni estima metros disponibles a partir de rollos cerrados.
3. Nunca confiar en precio, nombre, unidad, disponibilidad, importe ni tarifa enviados desde Angular/localStorage. El servidor lee el estado actual de H2.
4. No reservar ni descontar existencias por añadir, presupuestar, cambiar modalidad, abandonar la página o vencer el presupuesto. No generar `StockOperation`/`StockEntry` ni modificar `StockBalance`.
5. Mostrar una advertencia clara: **presupuestar no garantiza disponibilidad futura ni constituye pedido o pago**. H4 revalidará al crear el pedido; H5 descontará solamente al confirmar manualmente el pago.
6. Importes como unidades menores ARS: `{amountMinor: string, currency:'ARS'}`. Operar con `bigint`/decimales exactos; serializar cadenas. Prohibidos cálculos monetarios con `number` en punto flotante. Comprobar límites de enteros y overflow.
7. La entrega coordinada tiene **tarifa fija configurable**, inicialmente `$0` en la demo local, fijada por servidor. Retiro no cobra esa tarifa. No inventar costos reales de ABAR.
8. `P05` sigue pendiente para operación real: por ahora compatibilidad **ficticia/de demostración** según plan (pago al retirar únicamente con retiro; transferencia y simulación solo donde la configuración demo lo permita). No activar cobros, solicitudes bancarias ni credenciales productivas.
9. Características técnicas (color, sección, medida) siguen siendo descriptivas, no variantes de carrito.
10. Figma: referencia carrito `9:2`; etapa de resumen de checkout `9:89`. Corregir incoherencia de ejemplo `DIF09`: tres renglones `12.500 + 18.000 + 9.200 = 39.700`, no `30.500`. No afirmar que se inspeccionó Figma en esta sesión si no fue accesible.


### S5
## 4. Contrato H3: congelar antes del paralelismo

`contracts/openapi.yaml` sigue siendo la **única norma**. Crear `docs/decisions/H3-quote.md`, actualizar `contracts/CHANGELOG.md`, ejemplos y validador static/live manteniendo compatibilidad con el contrato H2 0.5.0 y marcadores legacy necesarios. Es aceptable una versión aditiva posterior (por ejemplo 0.6.0), pero fijarla y documentarla explícitamente.

Rutas esperadas, prefijo `/api/v1`:

- `GET /public/settings`: configuración **pública mínima** requerida para escoger retiro o entrega, tarifa y modo demo; sin datos sensibles. Si se decide introducir solo los campos imprescindibles ahora, documentar cuáles se completarán en H6.
- `GET /public/payment-methods?deliveryMode=...`: métodos de **demostración** habilitados y compatibles, con instrucciones públicas ficticias. Sin credenciales, pasarelas ni intentos de pago.
- `POST /public/checkout/quotes`: recibe `QuoteRequest {items:[{presentationId,quantity}], deliveryMode, paymentMethodCode}`; devuelve `201 QuoteResponse {quoteId, expiresAt, items, subtotal, deliveryFee, total, deliveryMode, paymentMethod, warnings}` con snapshots e importes autoritativos, sin cantidades exactas privadas.

Conservar la semántica de error propuesta: 400 validación, 409 `INSUFFICIENT_STOCK`, `PRODUCT_UNAVAILABLE`, `METHOD_UNAVAILABLE`, `DELIVERY_UNAVAILABLE` según causa, 429 abuso y 503 servicio indisponible. Códigos/payload exactos se congelan en OpenAPI antes de paralelizar. Errores `code/message/requestId` saneados. Los rechazos no revelan saldo exacto de terceros ni nombres de artículos privados.

**Puntos que debe resolver el freeze y documentar, sin inventar aprobaciones del cliente:**

- Nombres exactos de enums/códigos de modalidad/método en modo demo; coherencia con la futura configuración H6.
- Persistencia mínima de tarifa, métodos compatibles y su versión. Usar configuración **propiedad del backend** o tablas mínimas con fixture demo, no valores confiados al frontend. H6 agregará administración; no desarrollar CRUD de settings/métodos en H3.
- Vigencia técnica de quote: propuesta 10 minutos configurable. Guardar snapshot/huella de precios, presentaciones, cantidades y tarifa/configuración con expiración para validación posterior en H4. **El quote no reserva ni congela stock**. No emitir un pedido desde este objeto en H3.
- Cómo refrescar un presupuesto y mostrar diferencias de precio/tarifa sin reintentar escrituras silenciosamente. Preferir re-cotizar con el mismo endpoint y comparar dos respuestas normativas; no agregar endpoints innecesarios.
- Una cantidad repetida de `presentationId` se combina **antes** de controlar límites, disponibilidad y calcular totales. Orden de salida determinista; máximo de líneas/cantidades acotado para evitar abuso. Una misma unidad/metro/rollo no es intercambiable con otra.

Si aparece una **decisión comercial no definida que bloquee la implementación**, detener solo ese frente, registrar alternativas y pedir aprobación. La parametrización ficticia demostrativa que ya contempla el plan no debe confundirse con datos comerciales confirmados.


### S6
## 5. H3.1 — Frontend carrito

- Crear feature/cart y ruta pública **`/carrito`**; enlazarla desde header y desde la ficha de producto H2. Convertir el botón H2 deshabilitado de «Próximamente» en añadir al carrito **solo para presentaciones sellable**, con confirmación accesible. No dejar acción de compra simulada.
- Estado sencillo (Angular Signals/servicio), sin introducir NgRx ni gestor de estado externo.
- Persistencia local versionada con **solo** `presentationId` y cantidad entera. Rechazar/sanear payload malformado, versiones desconocidas, duplicados y cantidades fuera de rango sin romper la navegación. Nunca persistir datos personales, passwords, tokens, precio como autoridad ni formularios de checkout.
- Combinar líneas del mismo `presentationId`. Cambiar presentación produce línea independiente, incluso cuando el producto coincide. Incrementos/decrementos de 1, quitar con feedback, vaciar con confirmación apropiada y mensaje accesible. Recuperar al recargar.
- Resolver nombres/precios/unidades para visualización desde la **API actual**, no confiar en descripciones antiguas de localStorage. Si producto/presentación desaparece, queda inactivo o deja de ser vendible, mostrar aviso y una acción explícita de corrección; no borrar silenciosamente el carrito.
- Respetar estados loading, vacío, error, reintento y actualización; accesibilidad de inputs/etiquetas, foco y feedback. Mostrar precio por presentación y tipo correcto; total final **solo a partir de quote válido del servidor**.


### S7
## 6. H3.2 — Backend presupuesto y configuración mínima

- Implementar quote con controladores delgados, validación estricta y errores saneados, usando la arquitectura H2 y PostgreSQL real.
- Habilitar `checkout_quotes` o equivalente coherente con el modelo planeado, usando migración **aditiva**. Conservar H1/H2 sin cambiar migraciones históricas. Snapshots de líneas e importes (incluido precio, nombre/unidad y tarifa/método/modalidad), caducidad y versión/huella del estado de referencia; no PII ni datos de pago reales.
- Calcular todos los subtotales y total en servidor con aritmética exacta. Comprobar que `subtotal == sum(items)` y `total == subtotal + deliveryFee`. Rechazar desbordamientos, ceros, fracciones, formatos inválidos, demasiadas líneas o importes fuera de rango; no tolerar campos adicionales de precio manipulados por cliente.
- Validar presentación activa, producto/categoría visibles, existencia para **cada** línea agregada y compatibilidad de modalidad/método. No devolver cantidades disponibles exactas por API pública.
- Un quote no bloquea saldo, no realiza `update` de balance y no crea stock movements. El estado puede cambiar luego; responder una vigencia técnica, no disponibilidad garantizada. H4 revalidará al crear pedido.
- Testear cambio de precio, cambio de tarifa y baja de producto después de emitir quote. Que el servidor detecte cambio cuando se solicite un presupuesto nuevo y que Angular informe las diferencias para aceptación; no inventar endpoint de pago. Usar fixtures propios para actualizar configuración, no un editor admin completo.
- Evitar tablas o infraestructura pesada para configuraciones que todavía no se editan comercialmente. Documentar cómo H6 ampliará el modelo sin invalidar los snapshots creados.
- Proteger el endpoint público contra abuso: límite acotado de entradas, validación y rate limit proporcionado (sin copiar accidentalmente la restricción CSRF de sesiones admin ni filtrar recursos privados). No exponer secrets ni información técnica en errores.


### S8
## 7. H3.3 — Cotización integrada y conflictos

- Implementar una etapa pública de **resumen de presupuesto** dentro de la ruta de carrito o `/checkout` si se necesita para la navegación prevista, **sin** formulario completo de comprador ni botón funcional de «Crear pedido». Si se usa `/checkout`, identificarla claramente como pantalla incompleta hasta H4.
- Obtener opciones/modalidades/métodos del backend. Volver a cotizar al cambiar items, entrega o método, o al volver a continuar con un quote vencido. Gestionar respuestas tardías y peticiones solapadas (solo la última selección vigente puede cambiar el resumen).
- Si hay cambio de precio/tarifa/visibilidad/disponibilidad, mostrar qué cambió mediante las respuestas autoritativas y exigir aceptación explícita del nuevo resumen. No confirmar silenciosamente cifras viejas. No ocultar el aviso tras recargar o al cambiar de pestaña.
- Diferenciar error de datos locales, 409 de disponibilidad/opción, 429 y 503, sin inventar stock exacto ni afirmar una reserva. Mantener el carrito hasta que **H4 confirme una creación de pedido**; no vaciarlo al generar quote ni por un pago de demostración.
- Integrar con Home, catálogo y detalle H2, respetando las rutas, guard H1, textos/tokens/skip-links y estilos ya aprobados. No modificar login/autorización sin justificación.


### S9
## 8. Verificación obligatoria y alcance del Review

**Criterios técnicos principales:**

1. Carrito versionado: añadir/quitar/vaciar/recargar, parseo de storage malformado, combine por ID, METER vs ROLL independientes.
2. Cantidades estrictamente enteras, positivas, dentro de rangos y disponibilidad en servidor. Casos 0, negativo, fracción, muy grande, duplicados/overflow, presentación inactiva, producto/categoría ocultos y stock cero.
3. Precio manipulado en navegador/almacenamiento: no afecta importe del quote. Probar precio de metro y rollo independiente; usar ARS minor units, sin coma flotante.
4. Compatibilidad: entrega/retiro y métodos demo válidos o rechazados sin aceptar combinaciones inventadas.
5. Tarifa $0 inicial y cambio simulado de tarifa desde configuración del **servidor**; re-cotización muestra conflicto/diferencia y solicita aceptación.
6. Quote tiene ID, snapshots/huella y expiración válidos. Su generación no modifica saldos, versiones de stock ni movimientos: comparar snapshots de BD antes/después, incluso ante errores o concurrencia.
7. Quote caducado, precio/producto/configuración modificados: presupuesto nuevo verificado antes de seguir. Mensajes de conflicto sin PII ni números internos de saldo.
8. Integración real Angular↔NestJS↔PostgreSQL: recorrido producto→añadir→carrito→recarga→opciones→quote→cambio de precio/tarifa→nueva aceptación. Sin mocks residuales ni pedido creado.
9. Pruebas H1/H2 de regresión en superficies afectadas, sobre todo auth/CSRF, catálogo/stock y cambio de precio; no repetir miles de casos sin necesidad, pero registrar si alguna regresión queda sin comprobar.
10. UI en 360/768/1440 px, teclado/foco, estados y reflow cuando haya navegador. Zoom nativo al 200% sigue deuda previa si no existe control real; no presentarlo como PASS por simular viewport.

**Review:** contrato versus runtime, aritmética/BigInt, stock sin reserva, validación de cantidades, cambio de tarifas, snapshots/expiración, límites de endpoint público, manejo de cart storage y regresiones H1/H2. Distinguir revisión independiente y nativa: un ACK sobre una unidad no es aprobación global. No forzar herramientas nativas bloqueadas ni acumular PR por ceremonia.

**Verify:** comandos reproducibles, versiones Node/npm, builds/lint/tests, Prisma validate/generate, migración desde base limpia y upgrade H2 con datos, static/live OpenAPI, HTTP real y UI; exit codes y evidencia del **candidato exacto**. Tests omitidos/errores del entorno no se convierten en PASS. Usar únicamente PostgreSQL/servicios/puertos/credenciales propios y limpieza no destructiva. No leer ni publicar secretos o logs crudos sensibles.


### S10
## 9. Git, informe y detención

- Trabajar solo en la rama H3; commits locales cohesionados y revisables. Mantener diff/checks y documentación H3 alineados con el mismo candidato.
- No push, PR, merge en `main`, tag, eliminación de worktrees ni H4. Se solicita autorización después de la auditoría externa.
- Documentar decisiones en `docs/decisions/H3-quote.md`; actualizar README y contrato/CHANGELOG según implementación; no editar retroactivamente informes H0–H2.
- Entregar `docs/milestones/H3-informe.md` con:
  - base/HEAD/árbol técnico y documental; superficie de cambios, workers reales y preservación de WIP;
  - H3.1–H3.3 y rutas/endpoints implementados, DTO/versiones/códigos de configuración ficticia;
  - snapshots persistidos, TTL, origen de precios/tarifa, cuentas monetarias exactas y reglas de no reserva;
  - migraciones, seed/fixtures y dos estados reales usados para verificar diferencias;
  - matriz de pruebas (comando, exit code, conteo, candidato), screenshots/visual, red/green, Review/Verify, bloqueos y omisiones;
  - riesgos/deuda y estado `CUMPLE / PARCIAL / NO CUMPLE` por criterio, sin autoaprobar el hito;
  - confirmación de que no existen pedidos, pagos, reservas ni H4 iniciado.

**Detenerse al finalizar para la auditoría de H3 en este chat.**

## Tasks
- T1 / S5: inline, contract freeze and decision; completed; static validator exit 0, contract regression tests 20/20; no runtime claim.
- T2 / S4,S7: delegated backend, independent from frontend after T1 freeze; pending.
- T3 / S6,S8: delegated frontend, disjoint edit surface from T2 after T1 freeze; pending.
- T4 / S9,S10: independent Review and Verify of assembled candidate, final report; pending.

## Log
L1 — Original authorized milestone prompt quoted verbatim above; current user instruction: “Autorizo ejecutar **únicamente H3.1–H3.3** conforme a docs/milestones/H3-prompt.md.” “Sin push, merge a main, tags ni acciones destructivas.” Full original request retained by chat and H3-prompt.
L2 — Preflight confirmed main/origin-main/tag target c91ccd4, tree 9edf974, annotated tag; original HEAD 9582df9 with protected WIP; 13 pre-existing worktrees untouched. Full reference read completed via h3_map read-only worker.
L3 — Forecast exceeds 400 lines; use few cohesive local commits, no publication or unnecessary chains. Scope/demo values fixed in normative OpenAPI before parallel workers. Risk: items 3,4,5 (additive API validator, overlapping UI requests, additive schema).

L4 — T1 RED: new H3 acceptance test failed on old exact allowlist. GREEN: H0/H2/H3 contract tests 20/20; static validation exit 0. Frozen 0.6.0, demo methods and bounds. Final independent Review/Verify cover assembled candidate; no global approval inferred.
