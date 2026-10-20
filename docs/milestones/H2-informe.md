# H2 — Catálogo administrable y gestión de stock

**Estado:** implementación local entregada para auditoría externa; aceptación integral **PARCIAL** por las omisiones declaradas abajo. No implica aprobación de producción ni autorización para integrar.
**Fecha:** 20/10/2026. **Candidato de código:** `b24f5bf1f3521f8fee94c02c48cf064bcd35adfc`, rama `codex/h2-catalog-stock`.
El cierre posterior modifica documentación y metadatos descriptivos exclusivamente. No se hizo push, merge a main, tag ni avance a H3.

## 1. Base, alcance y preservación

- Base H1 aprobada: `5c0e0fc200c1c22eaa2731298eb7e8bf968a8466`. Referencias locales `main`, `origin/main` y `h1-approved^{}` coinciden. PR #47/integración aprobados según autorización de entrada; no se atribuye una comprobación remota nueva a este cierre.
- Raíz original: `/Users/agustin/Repos/personal/abar-electricidad`; remoto configurado `https://github.com/FerrariAgustinNicolas/abar-electricidad.git`. Original permanece en `feat/h1-change-password-review-blocks`, HEAD `9582df938c35ddb251b2446a568e32d9f60e9206`.
- Se verificaron raíz, índice, ramas, referencias, tags y worktrees antes de aislar H2. Se preservaron los worktrees/configuraciones/agentes existentes. El prompt revisado posterior a la auditoría H1 se incorporó selectivamente desde el archivo no versionado; su relato histórico de integración pendiente queda supersedido por la autorización/base aprobada.
- Implementación aislada: `/Users/agustin/Repos/personal/abar-electricidad-worktrees/h2-catalog-stock`. Review aislado: worktree hermano `h2-persistence-review`, limpio y detached en el candidato correctivo.
- Diff original protegido SHA256 `00cbe4677d1db6c9f1b7547dbf6d3e59bc966b67c3ebec99e8a19f09be5271e7`, idéntico a la captura inicial. Permanecen sin incorporar el informe H1 modificado, scripts supervisor POSIX, documentación de testing, prompt original y `.review-worktrees/`. El objeto local `h0-approved` permanece `2d53088c1523f60d070cb2f321e0f9af74e69d21`.
- Solo H2.1–H2.4. No hay reservas, descuentos por pagos, carrito, checkout, pedidos, pagos, demanda impaga ficticia, ERP, variantes combinatorias ni sincronización de mostrador.

## 2. Commits locales revisables

| Commit | Unidad |
|---|---|
| `1d264ef` | Prompt revisado y logbook ODD |
| `613eea8aad4006e3c123b889c3ebac4b422a9adc` | Freeze OpenAPI 0.5.0, ejemplos y controles |
| `52c54efbde1563e6ff7d57e5763872c7f42b1d0d` | Persistencia y migración aditiva |
| `82abd4f0751b1a377f4555fa1f318095cbfc81a0` | Integración H1/autorización/validación compartida |
| `802b3f9ae45873b2ca532a47208d76dc8032a55e` | Ajustes y aperturas auditados |
| `d47b8fcd29a4486ec731f33ba070dacddc5fc261` | PNG local, coordinación y limpieza |
| `6e7fb1c2c1f4cf69131e9c73429ae47a3a8c1821` | Catálogo HTTP, galerías y seed ficticio |
| `395cece1ae879cc711d6485612ccc2cd15381a05` | Retener imágenes ante acknowledgement ambiguo |
| `f03088620563050c78e9eadbcd185913f8c220db` | Angular público real |
| `83f38abacb260fe37b7c40fb4763ab30af17bb28` | Angular admin y Forms fijado |
| `b24f5bf1f3521f8fee94c02c48cf064bcd35adfc` | Preservación independiente de borradores de galería |

Las unidades coherentes superan a veces la heurística de 400 líneas; no se dividieron DTOs/tests ni se omitieron pruebas para alcanzar una cuota. No se crearon PRs. Topología/publicación futura queda a la auditoría. El logbook y su archivo histórico preservan decisiones y autorizaciones: [tareas](../../odd/tasks/h2-catalog-stock.md), [archivo](H2-work-log.md).

## 3. Implementación y decisiones

### H2.1 — Persistencia

Prisma/PostgreSQL añade `Category`, `Product`, `ProductPresentation`, `ProductImage`, `StockBalance`, `StockOperation` y `StockEntry`, más enums; no reemplaza tablas ni migraciones H1. Migración: `backend/prisma/migrations/20261020000100_h2_catalog_stock/migration.sql`.

Constraints efectivas: saldo no negativo, enteros/versiones positivos, importes bigint válidos, longitud positiva exclusiva de ROLL, unicidad producto/unidad, slug/SKU, saldo por presentación, actor/clave idempotente y asiento por operación/presentación; FK restrictivas y principal única. Servicios completan las reglas de una predeterminada activa y ocho imágenes.

Seed explícito y limitado a fixture propio: ocho categorías y seis productos ficticios; activos/inactivos/vacío, stock cero/bajo/suficiente, cables de **80 m y 50 m**, precios independientes, dos PNG, descripción larga (2185 caracteres), SKU opcional y producto sin imagen. Segunda ejecución no pisa stock/precios editados ni cuentas/sesiones H1.

### H2.2 — Catálogo, precios y galería

Categorías y productos reales, baja lógica, atributos descriptivos clave/valor y edición completa con `expectedVersion`; IDs de presentaciones existentes se conservan. Desactivar categoría con productos activos se rechaza. Unidad/longitud con movimientos no se muta in-place. Editar descripción/precio no modifica saldo, versión de stock ni auditoría.

PNG únicamente: 5 MiB, 4096 por eje, máximo ocho, decodificación acotada a 64 MiB más filtros, CRC/estructura/chunks/zlib/raster validados; no SVG, APNG, descarga remota ni rutas del host. Nombres opacos generados, principal coherente y lectura pública solo si producto/imagen visibles; admin exige sesión H1.

La publicación de archivo y el commit de BD no forman una transacción única. Un error de acknowledgement puede significar commit exitoso: se retienen bytes publicados, no se compensan ciegamente. Limpieza acotada/idempotente elimina solo huérfanos no referenciados, coordinada con publicaciones mediante el mismo bloqueo. No se borra dato histórico como rollback.

### H2.3 — Stock

UNIT/METER/ROLL mantienen precios y saldos independientes, cantidades enteras. ROLL representa rollos **cerrados**. Solo ajustes auditados o apertura manual admin cambian stock. Apertura de N rollos obtiene longitud de BD y acredita N × longitud a METER, en una transacción con **dos asientos**; no recompone rollos ni abre automáticamente.

Bloqueo determinista, versiones optimistas, resultado 0..2147483647 y rollback completo. Idempotencia persistida por actor/clave, compartida entre tipos: mismo cuerpo/tipo repite resultado original incluso con versión hoy vencida; otro cuerpo/tipo devuelve409. Autor, motivo, fecha, deltas y saldos resultantes quedan auditados. No se usa float monetario ni se impone SERIALIZABLE como atajo.

### H2.4 — Angular

Home/catálogo/detalle consumen API real, filtros/query params/paginación y búsqueda cancelable. Precio, unidad y disponibilidad corresponden a la misma presentación. Galería y fallback local; selector/stepper entero y no vendible a stock cero, **sin acción funcional de compra**.

Admin real de categorías/productos/precios/galerías/stock/movimientos. La pareja ROLL/METER se carga independientemente del filtro/página visible. Apertura muestra confirmación y resultado previsto. Fallos401 expiran sesión y conservan destino H1; CSRF exige refresco explícito y nueva acción, sin replay automático. Conflictos conservan borradores.

La corrección final reconcilia borradores de galería por imagen/campo: guardar una imagen no descarta otras, cambios de servidor actualizan campos no editados y cancelar upload no anula la protección de navegación. Descartar tras conflicto exige confirmación explícita.

Stack preservado: Angular21.2.25, NestJS11.2.7, Prisma7.10.0, PostgreSQL17.11. Única dependencia directa frontend añadida: `@angular/forms@21.2.25`, descarga anónima específicamente autorizada. Otras versiones/resolved/integrity no cambiaron; standard-schema existente pierde solo su marca dev transitiva.

## 4. Contrato y seguridad

OpenAPI único **0.5.0**, `x-abar-h2-freeze: catalog-stock-v1`, congelado antes de paralelizar. 21 operaciones H2: cuatro públicas, quince administrativas de negocio y dos lecturas de imágenes. Base `/api/v1`; health conserva su ruta operativa. [Contrato y decisiones](../decisions/H2-contract.md), [historial](../../contracts/CHANGELOG.md).

- Público: Home, categorías, listado filtrado y detalle; sin saldos/umbrales/versiones privados.
- Admin: categorías alta/edición/orden, productos alta/edición/listado/detalle, galería upload/metadata/delete, stock/movimientos/ajustes/aperturas.
- Sesión, cookie, Origin/CSRF y restricción de contraseña H1 se reutilizan en Nest; el guard Angular no es autoridad. Revalidación de actor dentro de mutaciones y antes de entregar lecturas protegidas.
- Precios `{amountMinor:string,currency:'ARS'}`, DTOs cerrados, errores seguros y no-store. Sin PATCH libre de cantidades.
- Cierre informativo: `x-abar-h2-runtime-stage: implemented-audit-pending`; el resto de rutas/componentes/security/ejemplos/versión permanece semánticamente idéntico al freeze implementado. Marcadores H0/H1 históricos exigidos por el validador se conservan, no describen disponibilidad actual.

## 5. Verify independiente y evidencias reproducibles

Los logs completos sanitizados son locales e ignorados en `odd/checks/`; no se versionan secretos ni stderr crudo del revisor. Las tablas siguientes son el registro durable de comandos/resultados. Los paths son relativos a la rama H2.

### Backend final

Snapshot Git exacto `83f38ab`; los 128 archivos backend coinciden antes/después y no cambian en `b24f5bf`. Scratch nuevo y dos PostgreSQL **nuevos**, imagen cacheada con pull=never, tmpfs, puertos loopback aleatorios, labels/IDs comprobados antes de usar y detener. Sin target existente ni credenciales ambientales.

| Comando / prueba | Exit y observación |
|---|---|
| `npm ci --offline --ignore-scripts --no-audit --no-fund`, backend y frontend | 0 ambos; 805/578 paquetes, configs vacías, caché solo cuerpos tarball por integridad, targets de dependencias separados. No prueba lifecycle/native modules. |
| `npm run build`, `npm run lint` (backend) | 0 / 0 |
| `npm run prisma:validate`, `npm run prisma:generate` | 0 / 0; config schema-only explícita |
| `npm test -- --runInBand` | 0; **1218 pass, 1 skip** |
| `node --test backend/scripts/*.test.mjs` (expansión absoluta en scratch) | 0; **397 pass, 2 skip** condicionados a fixture |
| `npm run test:e2e -- --runInBand` con fixture nuevo | 0; **13 pass, 4 skip**, incluye seis casos stock y coordinación real publicación/cleanup |
| `node --test backend/scripts/h2-schema.test.mjs` con fixture explícito | 0; **1 pass, 0 skip**: cadena limpia, upgrade H1, constraints y hashes preservados |
| `node --test backend/scripts/h2-seed.test.mjs` con fixture explícito | 0; **1 pass, 0 skip**, dos ejecuciones con ediciones preservadas |
| `npm run contract:validate` | 0; OpenAPI3.0.3 y diez ejemplos JSON |
| Tests `h0-contract-validate.test.mjs` + `h2-contract.test.mjs` | 0; **17 pass** |
| Probes independientes HTTP / adicionales / PNG | 0; **16 + 8 + 15 pass**, assertions nominales inspeccionadas |
| Probe propio Swagger/health/auth | 0; **3 pass**, login H1, health200, semántica normativa, revocación en cuatro lecturas |
| `prisma migrate diff --config verify.prisma.config.ts --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code` | 0; SQL explícito “empty migration”,32 bytes |
| Control `--from-empty --to-schema ... --script --exit-code` | **2 esperado**,8980 bytes SQL no vacío |

El primer stdout vacío de Prisma **no** se consideró prueba de drift; se retuvo y luego se agregó salida explícita y control positivo. Hash H1 poblado final (dos admins/dos sesiones) antes/después: `9b257dab6cb4e160fc86ec67c57c884525f8e9c53bdb307e30f7cbc60d5e233c`.

Evidencia: `odd/checks/h2-integration/final-exact-backend/FINAL-HANDOFF.md`, `FINAL-RESULT.json`, logs, manifests, resultados HTTP/PNG y recibos de parada. También `h2-schema`, `h2-catalog/ambiguity-verify` y `h2-integration/image-coordination`.

### Frontend final y corrección

Exacto `83f38ab` más overlay de los **tres archivos idénticos a b24f5bf**; 62 archivos originales iguales workspace/copias antes/después, manifest SHA256 `99a0007d6230a1d159fd26648dcb261b8f8ef6e75af77d4f08e174726c306113`.

| Comando / prueba | Exit y observación |
|---|---|
| `npm run build`, `npm run lint` | 0 / 0, producción |
| `npm test -- --watch=false` | 0; **77 pass, 15 archivos**, cero skips |
| `node --test scripts/h2-frontend-assets.test.mjs` | 0; **1 pass**, fallback empaquetado idéntico |
| Probe independiente `gallery-independent-recheck.spec.ts` | 0; **8 pass**, conservación de dos borradores, selección, orden servidor y descarte explícito |
| Regresión comprometida de galería | RED: siete casos fallan/3 previos pasan; GREEN: **10 pass**. Error inicial TS4114 del fixture no se contó como RED funcional. |
| Spot-check padre contrato+asset final | 0; **18 pass**, más validador estático 0 y igualdad de metadatos descriptivos únicamente |

Evidencia: `odd/checks/h2-admin/gallery-*.log`, `gallery-independent/`, `odd/checks/h2-final/`. Antes de esta corrección hubo Verify exacto público53 tests y admin70 tests; no se presentan como77.

**Fallas retenidas, no borradas:** build inicial bajo sandbox134 y asset dependiente ENOENT en Verify de galería; con ejecución escalada autorizada ambos pasan. Probe independiente tuvo un fallo de aliasing de su mock (7/8), corrigió solo el fixture y pasó8/8. Verify backend adicional intentó construir frontend con dependencias offline bajo Node26/24: ambos abortaron134 sin diagnóstico causal; suite raíz amplia queda28pass/1fail por asset generado ausente en ese scratch. No se infiere defecto backend ni se transforma ese resultado en PASS. La verificación frontend separada sí generó y verificó el artefacto. En Verify admin previo falló captura inicial de hash; la nueva prueba62 archivos sí establece antes/después.

### Smoke real e integración navegador

Se ejecutó antes de las dos correcciones puntuales finales sobre fixture propio; no se repitió el E2E completo después de ellas. Las correcciones tienen pruebas deterministas/independientes específicas y no cambian el contrato.

- Home, catálogo/filtros URL, detalle, galería, descripción larga, precios independientes metro/rollo80 m y ausencia de saldo numérico público.
- Login/logout H1 y redirección anónima de admin stock.
- Filtro ROLL mantiene acceso a pareja METER. Apertura80 m: **2 rollos/35 m → 1 rollo/115 m**, una operación/dos entradas.
- Una interrupción de confirmación nativa se reconcilió en BD **sin repetir** la apertura; nueva UI y JSON final confirmaron exactamente un efecto.
- Edición125000→130000 centavos deja saldos1/115 y versiones stock2/2 intactos; upload PNG real/principal, tres imágenes; alta/reorden de categoría.
- Screenshots: `H2-stock-browser.png`, `H2-catalog-browser.png`, `H2-public-price-browser.png` bajo la carpeta de visualizaciones de esta tarea; copias/evidencias en `odd/checks/h2-browser/`. API/servidores/tab/fixture/credenciales temporales se retiraron.

## 6. Review independiente por unidad

Aprobación nativa es **de cada candidato inmutable**, no de todo H1/H2 ni de producción. Se conservaron selección/consentimiento nativos. Los429 carecen de causa demostrada; se ejecutaron solo los reintentos autorizados y slots reofrecidos, con instrumentación acotada cuando se autorizó. Nunca se inspeccionaron credenciales existentes ni se guardó stderr crudo.

| Unidad / commits | Resultado nativo real |
|---|---|
| Contrato `613eea8` | **Declinado** por candidato tras límite de contexto; no PASS. Verify contractual independiente registrado. |
| Persistencia `52c54ef` | Approved + ACK exacto, autoridad burned; `review-611b2c2125d67584` |
| Compartido `82abd4f` | Approved + ACK; `review-fbeab227a74fa76e` |
| Stock `802b3f9` | Approved + ACK; `review-5a857519336295b9` |
| Imágenes `d47b8fc` | Approved + ACK; `review-312b76024ad06bec` |
| Catálogo `6e7fb1c + 395cece` | Approved tras corrección y validador puntual + ACK; `review-7fa42cd2bc30c909` |
| Público `f030886` | Approved + ACK; `review-8acb1bc6de04d150` |
| Admin `83f38ab + b24f5bf` | Approved tras corrección y validador puntual + ACK; **misma** `review-2601dfa46cfb8115` |

Admin: ACK confirmado `gentle-ai.review-acknowledged/v1`, target `sha256:f4954861872db69c6be9a4aec96960e3711619de78561e8c4f6b3c479d346179`, consumed revision `sha256:22bca3cf7d05e2c400cbee7f573e3160542fe1f52d9a91496d1994460a6eb615`, autoridad **burned**. No STATUS/FINALIZE posterior ni nueva lineage. Evidencia exacta `odd/checks/h2-admin/native-acknowledged.json`; síntesis de captura identificada expresamente como resumen en `native-approved-summary.json`, no recibo sustituto.

### Hallazgos y correcciones

- Backend Verify original B1–B7: revalidación de actor en lecturas; PNG crítico/reservado/zlib completo; carrera publicación/cleanup; orden de categorías por array; filtro Home previo al límite; seed galería/descripción; metadata Swagger H1 obsoleta. Una corrección y recheck acotado PASS.
- Frontend Verify original: recuperación asíncrona categoría/URL, cambio de slug en componente reutilizado, entero fraccionario DOM, pareja apertura independiente de filtro/página, expiración/CSRF H1 sin replay y con borradores, IDs nuevos rehidratados y asset de fallback. Corrección/recheck PASS.
- Native catálogo R4 commit ambiguity: dos RED, ocho GREEN; Verify independiente commit/rollback conserva error/bytes sin eliminación;111 líneas dentro de forecast160/max200. Finding R3 intercambio de orden de imagen fue **refutado nativamente**, no queda blocker.
- Native admin R2/R3 duplican pérdida de borradores: siete RED,10 GREEN y ocho probes independientes;136 líneas/tres archivos dentro de forecast190/max200. Validador puntual aprobó ambas correcciones sin relanzar los cuatro lentes.

### Deuda no bloqueante / no corregida automáticamente

- Lecturas públicas/availability sin paginación interna acotada; fanout de carga de parejas stock admin a escala.
- Refreshes asíncronos de previews pueden solaparse; URLs obsoletas hasta destrucción del componente.
- Recuperación de sesión duplicada entre pantallas y guard exportado no utilizado.
- Error de categorías público se degrada a lista vacía; retry de productos no recarga categorías.
- Decodificación PNG síncrona/coste event-loop, I/O de limpieza bajo lock, UUID regex permisivo dentro del formato generado, lock ID mágico y tests ligados a offsets.
- Helpers de búsqueda muertos, portabilidad de socket/rutas Docker, summary seed limitado, fixture test exportado en código runtime y advertencias/deprecaciones pg/npm.
- Rechazos503 inesperados no tienen diagnóstico interno adicional.
- Los avisos no abrieron transición de corrección y no reabren candidatos aprobados; quedan para planificación posterior.

## 7. Omisiones y límites explícitos

1. **No se certificó visual responsive360/768/1440**, teclado/foco completo, zoom/reflow ni contraste WCAG. Navegador estuvo disponible para smoke, pero esa matriz formal no se ejecutó. Revisión manual pendiente: filtros/tablas/formularios sin desborde en los tres anchos, Tab/Shift+Tab/Enter/Escape, foco visible/retorno, mensajes asíncronos y contraste.
2. **Sin inspección Figma nueva**: solo referencias auditadas/documentadas Home17:256, catálogo6:182, detalle6:324, admin9:412/9:539/categorías9:844. Stock es derivado, no frame inventado. [Mapa y checkpoint](../figma-map.md).
3. H1 conserva un skip Jest y omisiones e2e históricas; los tests scripts schema/seed que saltan sin target se ejecutaron además positivamente con fixture. No se simula que el harness H1 congelado/persistencia TODO completo esté aprobado; admin-concurrency H1 dedicado no fue seleccionado en esta nueva corrida.
4. `contract:validate:live` histórico **NOT RUN**: target5432 fijo no propio. Se usó equivalente contra API/Swagger/PG nuevos, sin debilitar assertions.
5. Instalación offline fue con **ignore-scripts**; builds/generación posteriores se verificaron por separado con dependencias instaladas existentes. No se afirma reconstrucción integral nativa desde cero ni se ocultaron los dos abortos de build frontend del scratch backend.
6. No se repitió smoke navegador completo en b24f5bf; sí pruebas funcionales exactas por hashes/corrección. No se arrancó Compose persistente ni se borraron volúmenes existentes; configuración/bindings se comprobaron sin contactar servicios ajenos. Intento con HOME/config Docker vacíos: exit125 porque faltó el registro del plugin; ejecución directa del Compose instalado, con los mismos configs vacíos y `--env-file .env.example config --quiet`: exit0. Ambos logs se retienen en `odd/checks/h2-final/compose-*.log`.
7. El delta documental final es estructural/descriptivo, no un nuevo candidato de código ni una aprobación global del branch. Evidencia local ignorada acompaña la auditoría en esta máquina; no se publicó externamente.

## 8. Matriz de aceptación

| # | Criterio del prompt | Estado | Evidencia / límite |
|---|---|---|---|
| 1 | Base H1 y no regresión seguridad | CUMPLE | Base aprobada, H1 auth/CSRF/guards y suites verdes; deuda histórica retenida |
| 2 | Modelo/migración/seed idempotente | CUMPLE | Limpia/H1, constraints, drift con control, seed positivo dos veces |
| 3 | Catálogo administrable/baja lógica | CUMPLE | HTTP real y admin; versiones, slug/SKU/categoría y presentaciones |
| 4 | UNIT/METER/ROLL independientes | CUMPLE | Longitudes100/75 en probes,80/50 seed, precios/saldos propios |
| 5 | Ajuste/apertura atómica auditada idempotente | CUMPLE | PG real, dos entradas, races/replay/rollback |
| 6 | No negativo/sin recomposición/autoapertura | CUMPLE | Constraints y comandos rechazados sin cambiar hashes |
| 7 | Visibilidad y disponibilidad sin saldo público | CUMPLE | DTO cerrado, filtros misma presentación, lecturas ocultas404 |
| 8 | Galería/principal/seguridad | CUMPLE | PNG15, permisos, concurrencia y corrección acknowledgement |
| 9 | Público sobre API sin mocks | CUMPLE | Tests HTTP/DOM y navegador real; no mocks de runtime |
| 10 | Admin con sesión H1 | CUMPLE | API/CSRF y smoke stock/precio/galería/categorías; borradores corregidos |
| 11 | OpenAPI/Swagger/ejemplos | CUMPLE | Freeze antes de paralelismo, static17/ejemplos10 y semántica owned API |
| 12 | Builds/tests/migraciones/smoke integrados | **PARCIAL** | Checks por componente PASS; skips, abortos scratch, npmci sin lifecycle y smoke no repetido final declarados |
| 13 | Review y Verify independientes exactos | CUMPLE por unidad | Hashes/candidatos/ACK; contrato declinado, no aprobación global implícita |
| 14 | Entorno y secretos | CUMPLE | Fixtures nuevos detenidos, WIP original/hash intactos, sin credenciales existentes |
| 15 | Brechas visuales cerradas o documentadas | CUMPLE documental | Matriz visual pendiente y sin Figma nuevo, no falsa certificación |
| 16 | Informe y ningún H3 | CUMPLE | Este documento; no push/merge/tags/H3 |

## 9. Agentes, archivos y siguiente paso

Orquestador: integración, contrato/Prisma compartidos, Git selectivo, correcciones puntuales, pruebas propias y síntesis. Workers reales de la sesión: backend catálogo/stock, frontend público/admin y correcciones; Verify independiente backend y frontend; exploración429/transporte solo lectura. Nombres conservados en el runtime/logbook incluyen `h2_backend_catalog`, `h2_backend_correction`, `h2_admin_frontend`, `h2_admin_correction`, `h2_backend_integration_verify`, `h2_frontend_final_build`, `h2_reviewer_429_diagnosis` y `h2_transport_diagnostics_readonly`. Los revisores nativos son actores del proveedor, no subagentes que reconstruyen prompts. No se modificaron sus configuraciones.

Superficies principales: `backend/prisma/**`, `backend/src/catalog/**`, `backend/src/stock/**`, módulos/validación/autorización compartidos, scripts H2 y recursos ficticios; `frontend/src/app/core/catalog/**`, `features/catalog/**`, `features/admin-catalog/**`, rutas/layout/assets; `contracts/**`, README/decisions/logbook. El diff exacto desde la base es la autoridad del inventario.

**Detención:** auditar externamente este candidato, las omisiones y avisos. No integrar/publicar ni continuar H3 sin nueva decisión humana. Una eventual aceptación visual o productiva requiere su evidencia propia.

Risk: items 1, 2, 3, 4 and 5 — migraciones/datos auditados, autorización, contrato/rutas compartidas, concurrencia y dependencia fijada. Review/Verify observados tienen límites explícitos; no existe aprobación global de producción.
