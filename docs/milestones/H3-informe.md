# H3 — Carrito y presupuesto autoritativo: informe para auditoría externa

**Estado: PARCIAL; no se autoaprueba el hito.** H3.1–H3.3 implementados y verificados funcionalmente; Review independiente sin bloqueantes P1/P2 identificados y Verify con sus tres fallos originales resueltos en una única corrección dirigida. Permanecen un defecto visual de contraste, omisiones explícitas y Review nativo no iniciado por error de preflight. Detención para auditoría externa; sin publicación.

## 1. Identidad y preservación

| Elemento | Identidad / evidencia |
|---|---|
| Base local main / origin/main / h2-approved^{} | `c91ccd4b436ecb2e4585d7c33e12b7b1a45d16ff` |
| Árbol base aprobado | `9edf974d74e466662850cfd446ac391a18d7d406` |
| Tag H2 | Anotado; objeto tipo tag; destino idéntico a main |
| Rama H3 | `codex/h3-cart-quote` |
| Worktree independiente | `/Users/agustin/.codex/worktrees/h3-cart-quote/abar-electricidad` |
| Freeze normativo | `15ebb00` — OpenAPI 0.6.0, anterior al paralelismo |
| Backend | `4b2a0bf` |
| Frontend integrado | `09a532d3f2a562af22ef6082533211edb08308f1` |
| Árbol del primer candidato | `b8ee9964abfedb2bb6bb9378fbc168aea463c307` |
| HEAD técnico corregido | `f2277c5331c178bac465097dd1651ebcafe0f55c` |
| Árbol técnico corregido | `fbc91c13156d4b1e5d60b41aad18ad2323d5796e` |
| Entrega documental | Commit posterior, exclusivamente README/decisión/seguimiento/informes/capturas; HEAD y árbol contenedor informados en la entrega. No se inserta un hash autorreferente en este archivo. |

Subárboles técnicos corregidos: `5319c3d11a882c6b11056dcbfd7f9297b963db05` / `866ad4780f2fcad741dbf05c7a9752a76549dd55` / `8d9a6d60da5f7486f2ec66c07a2b64e8d9e52501` (backend / frontend / contracts). La documentación posterior no cambia esos subárboles.

Preflight: raíz/origin, índice, ramas, tags y 13 worktrees preexistentes inspeccionados. El original permanece en `9582df938c35ddb251b2446a568e32d9f60e9206`; su WIP nunca fue movido, limpiado ni incorporado indiscriminadamente. El prompt H3 sin versionar se copió selectivamente. Hay 14 worktrees tras añadir H3; no se eliminó ninguno. `main`, `origin/main` y `h2-approved` permanecen en la base aprobada. Verificación local de referencias: no hubo fetch ni consulta remota autenticada en esta sesión; no se revalida aquí la publicación del tag en GitHub.

Hash de estado porcelain original antes/después: `9a1a555bcad3c719c21c95c411752ccaab1f5eae04d549f0611e6099d28d1419`. Hash del diff protegido H1-informe: `00cbe4677d1db6c9f1b7547dbf6d3e59bc966b67c3ebec99e8a19f09be5271e7`. Los archivos originales sin versionar fueron leídos/copias de entrada, no editados. Sin modificación retroactiva de informes H0–H2.

## 2. Trabajo y alcance

| Actor real | Responsabilidad y resultado |
|---|---|
| Orquestador | Preflight, rama/worktree, contrato/validador, seams Swagger, documentación, commits selectivos y corrección dirigida |
| h3_map | Exploración de solo lectura, lectura completa del prompt y documentos referenciados, CodeGraph en el worktree aprobado |
| h3_backend | Backend, migración aditiva, tests y fixture H3; superficie disjunta del frontend |
| h3_frontend | Signals/cart/storage, integración API, pruebas; paralelo después del freeze |
| h3_review | Review independiente del candidato y suplemento limitado al delta corregido |
| h3_verify | Extracciones exactas en scratch, suites/builds, PostgreSQL propio, API/UI reales y recheck dirigido |

No se crearon cadenas de PR. Cuatro commits técnicos cohesionados, seguidos del cierre documental; no se redujeron pruebas ni se comprimió código para cumplir un número de líneas. Las dependencias existentes se copiaron físicamente a H3; no se instalaron versiones nuevas ni se modificaron lockfiles o dependencias H2.

### Superficie implementada

- Angular público `/carrito`, enlace en header, añadir desde detalle H2 únicamente presentaciones vendibles. Signals, sin gestor de estado externo.
- Storage `abar.cart.v1`: `{version:1,items:[{presentationId,quantity}]}`; solo IDs/cantidades. Añadir/combinar por ID, incrementar/decrementar, quitar, vaciar con confirmación y recargar. Datos inválidos/versiones desconocidas/duplicados se rechazan con aviso; una presentación no disponible permanece para corrección explícita.
- Datos descriptivos desde catálogo público H2. METER/ROLL/UNIT independientes. Nunca precio persistido como autoridad.
- `GET /api/v1/public/settings`: política mínima demo, versiones, modalidades, tarifa, TTL y límites.
- `GET /api/v1/public/payment-methods?deliveryMode=...`: métodos compatibles demo. Modalidad válida deshabilitada devuelve lista vacía; selección inválida produce 400. POST valida nuevamente compatibilidad y puede responder 409.
- `POST /api/v1/public/checkout/quotes`: 201 autoritativo; no endpoint de pedido, pago, simulador, reserva o edición administrativa de configuración.
- Resumen, diferencias de precio/tarifa, aceptación explícita, expiración y supresión de respuestas tardías; recarga requiere presupuesto y aceptación nuevos. No se vacía el carrito al presupuestar.

## 3. Contrato y autoridad

Única norma: [OpenAPI](../../contracts/openapi.yaml), versión **0.6.0**, `cart-quote-v1`, extensión de H2 0.5.0. Se conservan marcadores legacy. Review comparó programáticamente **25 rutas y 62 schemas preexistentes idénticos** a la base; nuevas operaciones/DTOs son aditivos. Validador estático/live y ejemplos acompañan el freeze.

Request cerrado `QuoteRequest`: 1–100 entradas `{presentationId,quantity}`, `deliveryMode`, `paymentMethodCode`. UUID se normaliza a minúsculas antes de combinar duplicados; cantidad agregada entera 1–1.000.000. Orden de salida determinista. Campos monetarios adicionales del cliente se rechazan.

Response cerrado `QuoteResponse`: UUID, expiración UTC, snapshots por línea (producto/nombre/slug, presentación, unidad, largo de rollo, cantidad, precio unitario y total), subtotal/tarifa/total, modalidad/método, `policyVersion`, `stateFingerprint` y advertencias. Dinero `{amountMinor:string,currency:'ARS'}`, aritmética bigint, límite signed64 `9223372036854775807`. Invariantes: subtotal=suma de líneas; total=subtotal+tarifa. Retiro cobra cero.

Modalidades: `PICKUP`, `COORDINATED`. Métodos **ficticios**: `DEMO_PAY_ON_PICKUP` solo retiro; `DEMO_TRANSFER` y `DEMO_SIMULATION` en modalidades habilitadas. Instrucciones sin credenciales ni cobro; P05 permanece pendiente para operación real.

Errores saneados code/message/requestId: 400 VALIDATION_ERROR; POST409 INSUFFICIENT_STOCK / PRODUCT_UNAVAILABLE / METHOD_UNAVAILABLE / DELIVERY_UNAVAILABLE; 429 RATE_LIMITED; 503 SERVICE_UNAVAILABLE. Sin cantidades privadas de stock ni nombres privados en rechazos. Endpoints públicos sin CSRF administrativo; `Cache-Control:no-store`. Parser H3 específico, límite32KiB; rate limit por peer directo30 solicitudes/60s, mapa acotado4096 entradas, local al proceso.

## 4. Persistencia, migración y no reserva

Migración nueva `backend/prisma/migrations/20261020190000_h3_checkout_quotes/migration.sql`, sin alterar las cuatro históricas. Añade:

- `CheckoutPolicy`, singleton `default`: feeMinor0 inicial, TTL600 segundos (CHECK60–3600), modalidades y métodos demo JSON, versión y timestamp. Configuración propiedad del backend; fixture SQL inicial en la migración, no editor H6.
- `CheckoutQuote`: response JSONB íntegro, UUID, versión, hash, fechas de creación/expiración e índice de expiración. Sin PII o información de pago real.

Transacción PostgreSQL `RepeatableRead`: lectura coherente catálogo/categoría/presentación/política/saldo e inserción del snapshot. Ningún lock de reserva, UPDATE de StockBalance ni creación StockOperation/StockEntry. El hash identifica estado de referencia, **no es identidad íntegra de cantidades**: cantidades quedan en el response persistido. H4 deberá usar el quote almacenado y revalidar; H6 podrá administrar la política conservando snapshots históricos. No se implementaron esas fases.

Migración limpia de cinco archivos y upgrade desde H2 con datos reales verificados en fixture propio. Readback upgrade conserva producto, precio4321, saldo7 y versión1; una política creada. Base limpia del recheck: cinco quotes, cero operaciones y cero entries. Diferencias reales: metro125×2+rollo12500=12750; precio175 y tarifa400 producen13250. UI posterior: precio225/tarifa800 muestra13525 con nueva aceptación. No son precios comerciales confirmados.

## 5. Matriz de pruebas y proveniencia

Detalles, recursos y fallos originales: [Verify independiente](../testing/h3-verify.md). Node **v24.18.1**, npm **11.16.0**. Cada extracción provino de `git archive` y dependencias físicas aisladas.

| Comando / prueba | Exit / conteo | Candidato |
|---|---|---|
| H0/H2/H3 `node --test scripts/*contract*.test.mjs` (lista exacta en Verify) | 0;20/20 | 09a532d |
| `node scripts/h0-contract-validate.mjs` | 0;11 ejemplos | 09a532d |
| Backend `prisma:validate`, `prisma:generate`, `build`, `lint` | 0 cada uno | 09a532d |
| Backend `npm --prefix backend test -- --runInBand` | 0;1234 PASS,1 omitido | 09a532d |
| Frontend suite inicial | 1;93 PASS/1 FAIL | 09a532d, fallo conservado |
| Suite PostgreSQL inicial | 1;3 fallos setup | 09a532d, fallo conservado |
| Parent seam auth/Swagger (2 suites) | 0;110 PASS | preparación de09a532d |
| Parent expiración determinista RED→GREEN | 1→0;8+1fallo→9/9 | corrección f2277c5 |
| Frontend cart spec dirigida | 0;9/9 | f2277c5 independiente |
| Frontend suite completa | 0;94/94,19 archivos | f2277c5 independiente |
| Frontend build/lint | 0/0 | f2277c5 |
| Backend generate/build | 0/0 | f2277c5 |
| `npm --prefix backend run test:e2e -- --runInBand test/h3-checkout-postgres.e2e-spec.ts` | 0;3/3 reales | f2277c5, nuevo fixture vacío |
| API propia Swagger: validateH1Semantics | 0 diferencias | 09a532d |
| HTTP real201/400/409/429/503, totales, snapshots, concurrencia y no-stock | probe final0 | 09a532d; PG suitef2277c5 refuerza backend sin cambios runtime |
| Angular↔Nest↔PostgreSQL, conflictos y aceptación renovada | observado real, no mock | 09a532d |
| `git diff --check` / WIP y refs | 0 / conservados | cierre documental |

RED inicial de workers por módulos nuevos aún inexistentes, posterior GREEN backend13 tests y frontend91→94. Parent detectó expiry no reactivo y mezcla de revisiones métodos/quote antes del primer candidato; ambas correcciones tuvieron tests. Verify independiente detectó después tres fallos: reloj capturado anterior a respuesta vencida; Product.updatedAt ausente en fixture SQL; TTL3 incompatible con CHECK. Una única corrección f2277c5, recheck limitado a esos bloqueos, **todos resueltos**. No se modificaron constraints productivos para adaptar tests.

No se repitió backend1234 ni E2E UI tras delta f2277c5: backend runtime no cambió; frontend tuvo tests/build/lint y Review suplementario. No se presentan las capturas de09a532d como capturas nuevas del corregido. El test H3 PostgreSQL compila y omite tres casos sin env propio: ese skip previo no se contó como PASS; posteriormente ejecutó3/3 reales.

## 6. Review, visual y límites de evidencia

**Review independiente h3_review:** sin bloqueantes P1/P2 identificados en09a532d; suplemento del delta f2277c5 sin nuevos bloqueantes. Es juicio de código, no aprobación externa ni sustituto de Verify.

**Review nativo:** modo global ON; assessment high, review_due=high_risk con item1. El STATUS de preflight devolvió exit1 `gentle-ai.review-integration.failure/v2`, `invalid_request`, `mutation_outcome:not_started`, `authority_applicability:not_evaluated`. Causa informada: transición `intended_untracked_selection_required` en lugar del START esperado y petición de reentrada sin selectores auxiliares. No se reconstruyeron tokens, reintentó a ciegas, forzó herramientas, deshabilitó modo ni publicó un defecto. **Sin START, consentimiento, reviewer nativo, ACK o aprobación nativa.** No existe autoridad que permita inferir aprobación global.

UI real con CUA: tres anchos sin overflow horizontal; teclado Tab y foco outline solid; aceptación mediante Enter. Capturas:
- [360px](../testing/h3-verify-360.png)
- [768px](../testing/h3-verify-768.png)
- [1440px](../testing/h3-verify-1440.png)

**Hallazgo visual adicional del orquestador:** en captura360, símbolos +/− del stepper tienen bajo contraste. `frontend/src/styles.css:8` establece blanco; `.stepper button` en cart-page cambia fondo a `--color-surface-subtle` (#f3f6f8) sin sobrescribir color. Funciona por teclado/aria-label, pero NO se considera accesibilidad visual completa. Queda pendiente, sin abrir segunda corrección después del recheck acotado. Recomendación para decisión de auditoría: aplicar color de texto de alto contraste en ese selector y comprobar captura/foco, sin alterar reglas del carrito.

Omisiones/deuda explícitas: zoom nativo200% no verificado; Figma9:2/9:89 no inspeccionados de nuevo; no E2E H2 stock completo ni diferencial ejecutable profundo contra H2 (sí regresiones Jest y comparación estructural25rutas/62schemas); limiter local y cuerpos rechazados antes de cuota; resolución de metadata recorre catálogo completo; sin limpieza programada/retención de quotes productiva ni administración comercial H6. DIF09 mantiene suma39700, no30500.

## 7. Criterios H3 (evaluación técnica, no autoaprobación)

| Criterio del prompt §8 | Estado / evidencia |
|---|---|
| 1. Carrito versionado/acciones/recarga/METER–ROLL | CUMPLE funcional; tests94 y recorrido real |
| 2. Cantidades/límites/duplicados/visibilidad/saldo | CUMPLE en cobertura ejecutada; tests y PG3 |
| 3. Precios cliente sin autoridad/importes exactos | CUMPLE; payload cerrado, bigint y HTTP real |
| 4. Modalidades/métodos demo compatibles | CUMPLE; servidor + pruebas |
| 5. Tarifa0 inicial/cambio servidor/aceptación | CUMPLE; migración y dos estados reales |
| 6. Snapshot/TTL/huella/ninguna reserva | CUMPLE; PG/concurrencia/hash stock/0movimientos |
| 7. Caducidad/cambio precio-producto-config | CUMPLE en pruebas; respuesta vencida corregida y ocultamiento409 real |
| 8. Integración Angular–Nest–PostgreSQL | CUMPLE en09a532d más delta dirigido f2277c5; sin repetir UI completa |
| 9. Regresiones H1/H2 proporcionadas | PARCIAL; unitarias y contrato conservados, no E2E H2 completo/diferencial profundo |
| 10. Visual360/768/1440/teclado/zoom | PARCIAL; reflow/foco observados, contraste stepper pendiente y zoom no probado |

H3.1: funcional implementado, pendiente visual. H3.2: implementación y prueba real completadas. H3.3: integración funcional, con límites visuales/nativos explicitados. Resultado global **PARCIAL para auditoría externa**, sin autorización de integración.

## 8. Limpieza y detención

Dos contenedores exclusivamente H3 verificados por ID/owner/purpose/imagen/tmpfs/no binds antes de detenerlos; no se eliminaron contenedores, imágenes o volúmenes existentes. API/Angular propios identificados por PID, cwd scratch y puertos antes de SIGTERM. Scratch y credenciales ficticias privadas eliminados tras persistir evidencia saneada. Ningún servicio previo fue detenido. Los 14 worktrees se conservan.

**Necesita decisión de auditoría:** contraste visual pendiente, omisiones de evidencia y Review nativo no iniciado. Sin otra ronda automática de cambios o de verificación. No push, PR, merge, tags ni acciones destructivas sobre trabajo existente. No se crearon pedidos, pagos o reservas; no se descontó stock, no se convirtieron rollos y no se inició H4, H5 ni H6 completo.
