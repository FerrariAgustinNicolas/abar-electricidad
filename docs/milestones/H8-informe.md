# H8 — Informe de integración y validación local

**PARCIAL — CANDIDATO LOCAL PARA AUDITORÍA EXTERNA.** H8.1/H8.2 no aprobados aquí; H8.3 solo borrador. Sin push/PR/merge/tags/deploy ni cierre de PS. Detención final para auditoría externa.

## Identidades y preservación
Base `main`/`origin/main`/`h7-approved^{commit}`: `e2dba6f244e926610891cb927d8942825aeaf264`; árbol `61e1e04eb5109f898ca6372d6109070059e60cde`; tag anotado objeto `9e54337dd82693cae0b86f4c19a83b82b3aaba64`. Rama H8 `codex/h8-final-integration-academic`, worktree independiente desde esa base. Candidato técnico local, pendiente de aceptación nativa, `51fd7e898a650249cd616d69b6dbffe6732e6c0f`, árbol `2659c64056f2c5a3bd2876daf85d4979af9cb763`. La identidad documental del índice se entrega por separado para evitar un hash autorreferencial; no hay commit documental mientras está abierta la decisión nativa.
Preflight: índice/árbol rastreado original limpios; prompt H8 y WIP preexistente preservados.19 registros/12 directorios presentes/7 temporales H1 ausentes. El usuario autorizó continuar sin podar/reconstruir; H8 agrega el registro20 y el directorio13. Comparación final de los19 registros: HEAD/status/índice/diff/no rastreados sin diferencias en los12 presentes;7ausentes intactos. No se modificaron archivos de refs/reflogs preexistentes heads/remotes/tags ni packed-refs desde el snapshot. El hash global de refs sí cambió con snapshots auxiliares de Codex entre turnos y no pudo reconstruirse exactamente; no se afirma inmutabilidad global de esas refs. Referencias remotas solo locales: no se hizo fetch ni verificación remota nueva.

## Fuentes, alcance y candidatos
Lectura completa: plan, README, YAML/CHANGELOG, mapa Figma, Compose, Prisma,19 decisiones y8 informes H0–H7. Sus estados son históricos; no se reescribieron informes. Contrato0.10.0. [Plan literal Q01–Q30](H8-plan-validacion.md) · [trazabilidad](H8-matriz-trazabilidad.md) · [deuda](H8-deuda-y-limitaciones.md).
Instalación/suites iniciales y navegador: export Git limpio del árbol H7 anterior, sin copiar node_modules. CLI observado Node24.18.1/npm11.16.0; Docker29.7.2/Compose5.5.1. El navegador interactivo usó procesos Node26 detectados al cierre; luego se relanzaron ambos con Node24.18.1 explícito y health/proxy/Swagger dieron200. Ese smoke no repite los recorridos previos ni los convierte en evidencia Node24. Delta H8: corrección de preparación del test H4 y recuperación acotada de replay. Pruebas anteriores del código afectado no prueban automáticamente el delta.

## Ejecución inicial sobre H7 exacto
| Comando/alcance | Salida/código observado |
|---|---|
| npm ci backend/frontend; Prisma validate/generate; backend build/lint; frontend lint/build | PASS, exit0; sin cambios de versiones |
| backend npm test -- --runInBand |1313PASS1SKIP,36suitesPASS1SKIP, exit0 |
| backend npm run test:e2e -- --runInBand sin variables propias |12PASS35FAIL24SKIP, exit1; no sustituye runners con fixture |
| frontend npm test -- --watch=false |160PASS1FAIL, exit1; aislado reportes9PASS, exit0 |
| node --test scripts/*contract*.test.mjs |41PASS, exit0 |
| node --test backend/scripts/*.test.mjs |403PASS2SKIP, exit0 |
| docker compose config --quiet |PASS, exit0 |
| h5-postgres.mjs --keep / h6-postgres.mjs --keep / h7-postgres.mjs |15/15/10PASS, exit0; fixtures PostgreSQL propios, H6 Mailpit real |
| H1 último administrador, BD nueva propia |1PASS, exit0; exactamente1activo/1auditoría |
| H4 runner estricto original |11FAIL por assert histórico de6migraciones, exit1 |
Fallos ambientales iniciales: EPERM caché Prisma/socket/loopback y build Angular134; aislamiento HOME/caché y permiso de ejecución resolvieron esos bloqueos sin alterar guards. Se conservan intentos fallidos; no se sustituyen sus resultados por PASS retroactivo.
H6: ocho migraciones desde vacío, upgrade H5 poblado y drift PASS. Hash antes/después idéntico `15a8619cb2e3cd3d33bf88ca7f6008be6bfe405e1f50f1ef8bf83deb1b06f100`. Seeds de suites sintéticos; seed H2 standalone no reejecutado aún.

## Defectos y delta H8
Preparación H4: conservar cinco migraciones anteriores, afirmar preservación H3→H4 y aplicar después H5/H6. Ownership intacto. Recheck10PASS1FAIL expuso carrera misma clave201/503. Diagnóstico PG: un intento/clave/incremento, error `P2010` con cause.kind `TransactionWriteConflict`, no duplicado. El catch no reconocía ese formato.
Corrección: reconocer solo ese conflicto, reutilizar replay cifrado y revalidar posesión/expiración antes de devolverlo. Sin retry de transacción, sin cambiar aislamiento ni contrato. RED unit2FAIL2PASS→GREEN4PASS; corrida real final H4 11PASS, H5 15PASS, H6 15PASS y H7 10PASS (todos exit0). Backend final build/lint exit0 y suite1316PASS1SKIP. H6 hash preservado `04031e077a15da7546476f352b8d50da917d6bcfe49d9e742df910fa6b05ee25`. Riesgo: ítems2 y4 (acceso y concurrencia), requiere Verify independiente.

## Navegador real y evidencia
Sobre producto H7: catálogo→producto→carrito→quote aceptado→checkout ficticio→pedido→intento APPROVED; sigue impago/stock50. Admin login→detalle→confirmación PAID/stock49→READY→DELIVERED/stock49→reportes→CSV:1pedido,15000centavos, tarifa0,1UNIT. Sobre el backend final se repitió creación desde producto/carrito y cancelación impaga con motivo/auditoría, manteniendo49UNIT; faltan todos los errores y teclado integral. [Manifest SHA256](../evidence/h8/manifest.json).
Figura1: [pedido sintético](../evidence/h8/buyer-order.jpg); Figura2: [comprador360](../evidence/h8/buyer-360.jpg); Figura3: [reporte360](../evidence/h8/report-360.jpg). Capturas originales inspeccionadas, solo datos ficticios, sin credenciales/token. Anchos comprador y reportes360/768/1440: scrollWidth igual a viewport; tablas con scroll interno, operabilidad integral pendiente. Zoom nativo200% NOT RUN; no sustituido por viewport/CSS. Sin certificación WCAG ni nueva inspección Figma.
CSV descargado:42filas/24columnas, total15000/tarifa0; no celdas de fórmula en este dataset. H7 unit/PG ejercitan neutralización. Sobre el candidato final: dispatcher exit0,9jobs SENT, Mailpit27mensajes (incluye fixtures previos de esta ejecución), destinatarios solo example.test. Hash de negocio antes/después igual `ba72915f721a8bb923655e8adef167a0`. LIVE health/docs/docs-json200;56/56operaciones0.10.0 y comparación semántica dereferenciada sin diferencias. El comando compuesto salió1 por helper H0 obsoleto health-only adicional; no se oculta ni se atribuye al producto.

## Revisión y salida
Review independiente: sin bloqueador introducido en seguridad/concurrencia/privacidad del delta. Verify independiente: PASS acotado, instalación fresca, build/lint,4unit,11PG,12contrastes base/candidato. Posesión inválida/expirada403, error desconocido503, replay reconocido201, cuerpo distinto409, un solo efecto. No es PASS global. Review nativo: evaluación HIGH; inventario resuelto, consentimiento granted, tres lentes ejecutados. Estado correction_required, sin ACK. Bloqueador abierto: revalidar acceso también en conflictos históricos cambia el replay si el token vence o falla la lectura del pedido. No se debilitó el control ni se envió un plan de corrección sin resolver esa política; requiere dictamen externo. No se atribuye CI PASS. H3–H5 y documentalH7 conservan sus bloqueos históricos. Evidencia nueva no amplía excepciones3A/251B; no se publican logs/manifiestos privados/comandos nativos privados.
Entregables vigentes: README, tres manuales, arquitectura/modelo equivalente, plan Q, matriz, deuda y borrador académico. Horas/firmas PENDIENTE DE VALIDACIÓN;200h planificadas no acreditadas. Se solicita únicamente auditoría externa del candidato y sus límites, no aprobación global/productiva ni institucional. Riesgo: ítems2y4 (acceso/concurrencia).

## Actualización tras auditoría externa
La política ya fue resuelta por el usuario: acceso vigente antes del replay de intentos; no hay excepción por obtener ACK. El [cierre correctivo](H8-cierre-validacion.md) actualiza frontend161PASS, recorrido completo Node24, matriz y deuda. Los apartados anteriores conservan resultados de la primera ejecución, no son el resultado final correctivo. H8.1/H8.2 permanecen PARCIAL; la matriz no afirma aprobación total. Resumen de preservación saneado en evidencia; infraestructura propia detenida: dos procesos y diez contenedores retirados tras verificar IDs/labels/tmpfs/loopback, doce scratch exactos retirados; logs privados preservados fuera del repositorio.
