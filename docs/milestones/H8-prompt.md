# ABAR Electricidad — H8 · Integración final, validación y cierre académico

**Hito autorizado:** H8.1, H8.2 y preparación controlada de H8.3, exclusivamente en un entorno local/descartable.  
**Base aprobada:** PR #53 de H7 integrado mediante merge commit.  
**Informe solicitado:** `docs/milestones/H8-informe.md`.  
**Naturaleza:** versión académica de demostración, **no** despliegue productivo ni certificación de seguridad/accesibilidad.  
**Regla de salida:** detenerse para auditoría externa de este chat; **no** push, PR, merge, tags, despliegue ni cierre académico autoaprobado.

## 1. Referencia inmutable, alcance y preflight

Repositorio: `FerrariAgustinNicolas/abar-electricidad`.

- `main` / `origin/main` esperados: `e2dba6f244e926610891cb927d8942825aeaf264`.
- Árbol aprobado H7: `61e1e04eb5109f898ca6372d6109070059e60cde`.
- Tag anotado `h7-approved`: debe apuntar al merge anterior, no a la rama H7 original.
- La publicación H7 proviene de `codex/h7-publication-sanitized` (entregable original autorizado `3b8f77ef6786189aae9942b11b7c39821997b026`). La rama H7 original con evidencias crudas se conserva **solo local**, no se publica ni se hace ancestro de H8.
- Al cierre H7 había **19 worktrees**. Preservar los 19 anteriores, sus ramas, índices, archivos no rastreados y WIP original. Crear un **vigésimo worktree H8**, si el inventario real coincide, desde el `main` aprobado, por ejemplo `codex/h8-final-integration-academic`.

Antes de escribir o ejecutar pruebas:

1. Verificar `git remote`, `main`, `origin/main`, `h7-approved^{commit}`, HEAD, árboles, índice, `git status`, worktrees y hashes de preservación; registrar las identidades. Si difieren, detenerse y elevar la discrepancia.
2. Leer completos `docs/plan.md` (§§ 2–18, en especial 13/H8 y 15/Q01–Q30), `README.md`, `contracts/openapi.yaml`, `contracts/CHANGELOG.md`, `docs/figma-map.md`, `compose.yaml`, `backend/prisma/schema.prisma`, los documentos `docs/decisions/H1…H7` aplicables y los informes de cierre H0–H7. Distinguir material histórico de estado implementado real.
3. Inventariar módulos y rutas reales Angular/NestJS, configuración de entorno, scripts de pruebas, Docker/PostgreSQL/Mailpit, políticas de migración, Swagger, imágenes, roles/sesiones y DTOs; evitar confiar en README desactualizado. OpenAPI vigente H7: **0.10.0**, salvo discrepancia demostrada al preflight.
4. Incorporar selectivamente este prompt a la rama H8. No ejecutar `git add -A`, checkout de ramas ajenas, `git clean`, `reset --hard`, rebase, squash ni manipular configuración global de Codex/Gentle-AI.
5. Preparar un plan de ejecución dividido en validación integral, correcciones justificadas y documentación; priorizar criterios de aceptación, sin construir funcionalidades comerciales nuevas.

## 2. Contrato comercial que no se puede modificar

- Pagos de **demostración**: un `PaymentAttempt.APPROVED` del simulador **no** es una venta confirmada. Solo la confirmación administrativa completa H5 lleva el pago a `PAID` y descuenta stock exactamente una vez.
- P01 confirmado: solo pueden cancelarse pedidos `RECEIVED` impagos con motivo y auditoría; cancelar pagados, reintegrar stock o devolver dinero automáticamente está prohibido.
- P02/P03 confirmados: pedido impago sin vencimiento comercial automático, ítems/precios/entrega históricos inmutables; comprador y términos demo de H4. La expiración del quote o de la credencial de consulta no cancela un pedido.
- Cantidades `UNIT`, `METER` y `ROLL` independientes y enteras. Rollo completo se descuenta cerrado; apertura física a metros es manual, transaccional y auditada. No abrir automáticamente.
- El stock de e-commerce no se sincroniza con mostrador, no se reserva para impagos y no se descuenta al pasar un pedido a READY/DELIVERED.
- H6: configuración demo, tarifa entrega coordinada fija (retiro sin cargo), métodos demo compatibles, notificaciones por correo ficticio a Mailpit local. SMTP puede duplicarse si pierde ACK: nunca prometer exactamente una entrega.
- H7: reportes solo desde confirmaciones `PAID`/`Payment.confirmedAt`, pedidos creados desde `Order.createdAt`, ARS en centavos exactos como strings, snapshots históricos, fecha local `America/Argentina/Buenos_Aires`, UNIT/METER/ROLL separados y CSV protegido contra fórmulas.
- P04/P05/P06/P07 permanecen sin validación comercial real cuando corresponda. Sin pasarela real, facturación, reembolso, WhatsApp automático, logística externa ni datos reales inventados.

## 3. H8.1 — Integración final y pruebas de aceptación

### 3.1. Estrategia de entorno

- Usar **solo infraestructura propia, nueva, identificada, descartable y ligada a loopback**: PostgreSQL 17 compatible y Mailpit local; Angular/NestJS en servicios propios. Verificar labels, IDs, mounts y propiedad **antes** de crear, detener o borrar recursos.
- Probar instalación desde un **clon limpio o export controlado del árbol H7/H8**, no desde el checkout con dependencias precargadas. Node.js **24.x**/npm versión fijada por el repo, lockfiles mediante `npm ci`, sin instalaciones globales ni cambios de versiones. Si falta un prerequisito, registrarlo como bloqueo; no deshabilitar las protecciones de Docker/Prisma para forzar un PASS.
- Validar `docker compose config`, PostgreSQL y Mailpit, configuración local saneada, `prisma validate/generate`, las **ocho migraciones históricas H1–H6** desde base vacía, seeds reproducibles que correspondan y upgrades compatibles. H7 no tuvo migración; una migración H8 solo se justifica por un defecto imprescindible.
- Demostrar backend, Angular, proxy API/medios, `/health`, `/api/docs`, `/api/docs-json`, contraste OpenAPI normativo vs Swagger y mensajes Mailpit. Usar cuentas y compradores ficticios `.test`; nunca credenciales reales.
- Registrar comandos, versión exacta, códigos de salida, fixture y hash de los hechos. Prueba con contenedor propio no autoriza tocar las bases locales históricas.

### 3.2. Matriz obligatoria Q01–Q30 del plan

Reconciliar **uno por uno** los escenarios de `docs/plan.md` §15, manteniendo los IDs y el contenido original, sin inventar resultados. Un caso puede usar evidencia de hito previo solo si la identidad técnica sigue siendo exactamente válida y el alcance no exige una nueva ejecución; registrar `HISTÓRICO` separado de `EJECUTADO H8` y `NOT RUN`.

| Bloque | Casos | Qué debe quedar probado en el candidato final |
| --- | --- | --- |
| Autenticación y autorización | Q01–Q02 | Login/logout, sesión, expiración/revocación, CSRF/Origin, cambio obligatorio, permisos reales del backend |
| Catálogo, unidades e imágenes | Q03–Q06, Q23 | Visibilidad, saldos y umbrales, precios por presentación, apertura de rollos, idempotencia de ajustes, cargas y rutas de archivos seguras |
| Carrito y presupuesto | Q07–Q08 | Precio calculado por backend, persistencia mínima, cambio precio/tarifa y nueva aceptación explícita |
| Pedido y simulación | Q09–Q12, Q21–Q22 | Doble envío/timeout, token por pedido, consulta no enumerable, PENDING/APPROVED/REJECTED sin stock, reintento en mismo pedido |
| Confirmación/operación/stock | Q13–Q20 | PAID/ledger/actor, replay/doble confirmación, última unidad, rollback multilineal, carrera con ajuste/apertura, entrega sin doble descuento, P01 y snapshots |
| Notificaciones | Q24–Q25 | SMTP fallido no rompe negocio, trabajos durables/reintentables, emails comprador/admin únicamente en Mailpit |
| Reportes y métricas | Q26–Q27 | Períodos vacíos/conocidos, pagos realmente confirmados, tarifa separada, UNIT/METER/ROLL, CSV/API/UI reconciliados |
| Accesibilidad, instalación y contrato | Q28–Q30 | 360/768/1440, teclado/zoom, instalación limpia y equivalencia OpenAPI/Swagger/DTO/rutas |

**Prioridades adicionales de deuda previa** (no inventar arreglos):

- Revalidar con prueba propia y acotada el `SKIP` histórico H1 de concurrencia al desactivar al último administrador, si su harness de PostgreSQL aislado está disponible sin relajar seguridad. Si no puede ejecutarse, conservar `SKIP / NOT RUN` y explicar.
- Examinar la advertencia H5 sobre falta de **inyección directa de fallo de StockEntry**. Ejecutar prueba focal si es viable con fixture propio y sin alteración funcional; no afirmar que se ejecutó si solo se demuestra atomicidad estructural.
- Considerar de manera **no bloqueante salvo defecto reproducido** el escenario de sesión que expira durante la espera de un replay administrativo. Si se reproduce un comportamiento relevante, detener el frente y proponer política/corrección acotada antes de escribir.
- Probar comportamiento de creación de pedido incierta tras reload: no generar segunda intención/clave/compra accidental, reconociendo el límite de recuperación entre sesiones/dispositivos.
- Confirmar que H6 envío de email no descuenta stock ni se atribuye semántica exactly-once, y que H7 reportes son solo lectura (hash de hechos antes/después).

### 3.3. Navegador, responsive y accesibilidad

- Recorrer los **flujos completos** tanto comprador como administrador en navegador real: catálogo→producto→carrito→quote→checkout→pedido→simulación/reintento→consulta; autenticación admin→productos/stock→pedido→confirmación manual→READY→DELIVERED→notificación→dashboard/reporte/CSV; camino alternativo de cancelación impaga.
- Escenarios de error: cuota expirada, sin stock, versión en conflicto, intento rechazado, sesión expirada, SMTP indisponible, consulta sin acceso, importes inválidos, CSV potencialmente peligroso y rutas no encontradas. No enviar email externo ni usar métodos reales.
- Validar 360, 768 y 1440 CSS px: reflow sin desbordamiento, tablas con scroll interno operable, formularios, mensajes, estado carga/vacío/alerta, foco visible, Tab/Shift+Tab, Enter/Space/Escape donde corresponda. Registrar capturas originales saneadas y medidas.
- **Comprobar zoom real/nativo 200 % si el navegador/herramienta lo soporta**, con evidencia del mecanismo de zoom, porcentaje y capturas. Cambiar solo viewport o aplicar `transform:scale()` **no** cuenta. Si no es accesible: `NOT RUN`, no afirmarlo aprobado.
- Examinar contraste, etiquetas/errores accesibles, lectura con zoom, orden de foco y semántica de tablas/alertas. No declarar certificación WCAG sin auditoría integral real; si la cobertura es parcial, clasificarla correctamente.
- Usar referencias de Figma ya documentadas y las pantallas reales; no afirmar inspección nueva de Figma si no se ejecuta. Resolver únicamente defectos demostrados, evitando rediseños extensos.

### 3.4. Seguridad, privacidad y robustez

- Verificar controles H1 de sesión revocable, Origin/CSRF, contraseñas Argon2, no-store, aislamiento admin/público, acceso al pedido por token de posesión y expiración, intentos limitados y ausencia de filtración de PII/notas/stock en respuestas públicas.
- Validar valores de `Idempotency-Key` y protección frente a dobles envíos/refresh; no dejar precios, decisiones de autorización o stock en manos de Angular. Intentar entradas inválidas sin tocar datos reales.
- Verificar subida/recuperación de imágenes, tipo/tamaño/extensión/nombre, no path traversal ni ejecución; CSP/headers solo afirmar lo realmente implementado/observado.
- Revisar logs, errores, URLs, request/response, archivos `.env`, fixture manifests, imágenes/metadatos y evidencia para evitar credenciales, rutas locales personales, tokens, información privada o contactos reales. **No publicar logs crudos ni comandos nativos privados.**
- **Privacidad heredada H7:** preservar el informe privado y las excepciones históricas expresamente aprobadas (tres referencias A y conjunto cerrado de 251 B, huella `a2317785f87a041e2d2ad8ba936e736d6a58759878d245f9497f62fc60e14028`). No ampliar su alcance, no reproducir valores y no reescribir H0–H7. Toda evidencia *nueva* H8 debe pasar revisión estricta; cualquier hallazgo nuevo C/D bloquea publicación y exige nueva auditoría externa.
- Preservar inmutabilidad de snapshots y auditoría; nada de manipular tablas de datos reales. Preferir evidencia sintética y resultados resumidos sanos con procedencia y límites.

## 4. H8.2 — Documentación técnica y manuales

Actualizar documentación vigente **sin reescribir ni falsificar los informes históricos H0–H7**:

1. `README.md`: corregir títulos obsoletos que siguen diciendo “H4 local”, “H5 candidato local”, “H6 local” o “H7 candidato local”; identificar claramente qué está integrado académicamente, qué es DEMO y qué sigue fuera de alcance. Incluir requisitos, comandos y límites efectivamente comprobados.
2. Guía `docs/manual-instalacion.md` (nombre ajustable): requisitos macOS/Linux/Windows **solo si han sido probados**; instalación limpia con Node/npm/lockfiles, Docker Compose, puertos, variables privadas, migraciones, seeds no destructivos, arranque de backend/frontend, Swagger, Mailpit, smoke test, detención y resolución de problemas. Diferenciar tareas de instalación, datos ficticios y procedimiento de reseteo descartable.
3. Guía `docs/manual-administrador.md`: sesión/usuarios, productos, imágenes, categorías, presentaciones, stock/apertura, pedidos, confirmación manual, notas, estados/cancelación P01, métodos/tarifa/contacto DEMO, reintentos de notificaciones, reportes/CSV. Capturas sanitizadas referenciadas como “Figura n.” cuando se redacte documentación de capturas, con ruta/evidencia clara.
4. Guía `docs/manual-cliente.md`: búsqueda, producto, UNIT/METER/ROLL, carrito, cotización, términos DEMO, pago simulado y estado/consulta, con límites de no reserva y sin prometer cobro real.
5. Arquitectura y modelo: diagramas legibles del monolito Angular/NestJS/Prisma/PostgreSQL/Mailpit, flujos críticos, reglas transaccionales e idempotencia, diagrama ER o equivalente derivado del Prisma real, especificación OpenAPI 0.10.0/Swagger conforme, mapeo de pantallas/Figma y componentes. Sin diagramas inventados o desactualizados.
6. `docs/milestones/H8-matriz-trazabilidad.md`: requisito de PS/plan → módulo real → ruta/archivo → test/resultado/candidato → evidencia → estado. Diferenciar `CUMPLE`, `PARCIAL`, `NO CUMPLE` y `NOT RUN`; no inventar fuentes académicas ni aprobaciones institucionales.
7. `docs/milestones/H8-deuda-y-limitaciones.md`: deuda actual por hito (Review nativo H3–H5 y documental H7 con sus excepciones, accesibilidad incompleta, recuperación incierta, límite de almacenamiento/sesiones, SMTP at-least-once, rutas históricas heredadas, P04–P07, stock compartido, integración real del proveedor pendiente). Distinguir riesgo académico del riesgo productivo y no presentar la demo como listo para desplegar.
8. Documentar cómo ejecutar una demostración académica reproducible con dataset sintético y limpieza **solo de recursos de propiedad H8**, sin scripts destructivos genéricos.

No ampliar el sistema con un instalador, pipeline de despliegue o backend nuevo solo para escribir manuales. Si falta una función crítica para una captura/manual, registrar ausencia y elevar cambio; nunca describirla como implementada sin prueba.

## 5. H8.3 — Preparación del cierre de la Práctica Supervisada

**Separar dos puertas independientes:** `cierre técnico de software` y `cierre académico de PS`. No confundirlas.

- El plan de PS2 contiene un compromiso académico total de **200 horas**. No equivale a 200 horas ejecutadas ni a saldo automáticamente cumplido. No convertir duraciones de CLI/agentes, cantidad de commits, ventanas de chat ni proyecciones en horas efectivamente trabajadas.
- Registrar una plantilla de conciliación **por actividad y fecha**, con horas reales aportadas y validadas por la persona, tarea/hito asociado, evidencia y observación. Si todavía no existe el registro humano, dejar `PENDIENTE DE VALIDACIÓN` y no declarar cumplimiento de 200 h ni completar artificialmente la planilla.
- El primer informe de avance y las reuniones/validaciones con tutor deben reflejar el estado realmente comunicado y lo formalmente aprobado, sin asumir aval institucional por commits o reviews técnicos. Preparar material de apoyo cuando haya fuentes suficientes, pero **no entregar ni firmar informes académicos sin revisión y autorización del usuario**.
- P10: describir que la versión académica incluye **pagos simulados**, no pasarela real; no inventar motivos de decisión del cliente ni declarar cobro bancario automático. Las funciones reales pendientes y reglas P04–P07 se identifican como proyección de evolución, no como implementadas.
- Preparar `docs/milestones/H8-cierre-academico-borrador.md` con resumen de objetivos/resultados, tecnologías y arquitectura, evidencias, límites, registro de horas pendiente y trazabilidad; identificar expresamente lo que debe aprobar el usuario/tutor.
- Si faltan horas o firmas, H8.1/H8.2 podrán recibir aprobación técnica externa, pero **H8.3 permanecerá PARCIAL**. No bloquear la validación del producto por falta de documentación administrativa, ni declarar terminada la PS sin esa documentación.

## 6. Gestión de defectos y revisión por riesgo

- No implementar cambios comerciales nuevos. Un defecto `P0/P1` reproducido en flujo, autorización, integridad de dinero/stock o privacidad detiene la aceptación de esa superficie; aislar causa, corregir en un commit acotado y repetir pruebas del código afectado, PostgreSQL/browsers según corresponda.
- Los defectos `P2` visuales/documentales deben tener decisión explícita de corregir o registrar deuda, evitando sobreingeniería y ciclos infinitos. Cambios mínimos, una ronda de corrección y recheck por hallazgo; si el alcance crece, elevar decisión en este chat.
- Si se cambia backend, frontend, contratos o migración después del candidato revisado, indicar exactamente qué evidencias dejaron de aplicar y revalidar el delta. No convertir evidencias históricas en PASS del nuevo candidato sin fundamento.
- Review independiente de seguridad/concurrencia/privacidad y Verify independiente sobre candidato técnico definitivo. Review nativo con procedimientos oficiales **por superficies pequeñas cohesivas**, consentimiento y ACK solo cuando existan; no fabricar autoridad ni abrir un Review documental enorme que exceda presupuesto. Si falla por transporte/contexto/`next_action:stop`, conservar el bloqueo y solicitar dictamen externo; nunca deshabilitar seguridad para “aprobar”.
- Si el sistema no requiere correcciones funcionales, no generar commits de código vacíos por cumplir una cuota de trabajo. Documentar el candidato técnico idéntico a H7 y las verificaciones finales efectivamente ejecutadas.
- Proteger los 19 worktrees previos y el WIP. No usar Git rebase/squash/force-push/reset, ni publicar ramas originales que contengan evidencia privada.

## 7. Evidencia y entregables auditables

Crear en el worktree H8, con sanitización **antes** de `git add`, al menos:

- `docs/milestones/H8-informe.md`: base/HEAD/árbol exactos, inventario de archivos, alcance H8.1–H8.3, matriz Q01–Q30, resultados de instalación limpia, migraciones/seeds, tests/CI si efectivamente existen, E2E PostgreSQL/Mailpit/Angular, hashes de invariantes, navegador y capturas, revisión independiente/nativa, deuda y nivel de aprobación solicitado.
- `docs/milestones/H8-matriz-trazabilidad.md` y `docs/milestones/H8-deuda-y-limitaciones.md`.
- Manuales de instalación, administrador y cliente y actualización del README y diagramas, con enlaces internos validados.
- Borrador de cierre académico separado, con horas reales solo si están validadas, y campos pendientes claramente marcados.
- Evidencia con nombres neutros, capturas inspeccionadas, PII ficticia, hashes y manifiesto verificable; no rutas absolutas personales ni token/clave de revisores/credenciales en el repositorio.

**Estado por criterio:** reportar `CUMPLE/PARCIAL/NO CUMPLE/NOT RUN`, además de `PASS/FAIL/SKIP` para ejecución. No confundir `exit0` de una herramienta con certificación del sistema. Indicar exactamente qué pruebas corrieron sobre qué SHA/árbol, cuáles son reutilizadas y cuáles no.

**Barrera final:** no hacer push, PR, merge, tag `h8-approved`, deploy, envío de email externo, reseteo/destrucción de bases ajenas ni iniciar una evolución productiva. Al finalizar H8, **detenerse para auditoría externa en este chat**. Una eventual integración y cierre académico requieren autorizaciones separadas después de revisar `H8-informe.md`.
