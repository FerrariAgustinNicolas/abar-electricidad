# H7 — Dashboard y reportes básicos: informe del candidato local

**Estado del candidato saneado:** preparado localmente para NUEVA validación externa; no está autorizado para publicación. El dictamen académico previo corresponde al candidato original. Contrato, backend y frontend tienen revisión nativa aprobada y ACK confirmado. Esto no constituye aprobación externa, certificación productiva ni autorización de publicación.


## Procedencia y alcance del saneamiento

Esta copia parte de H6 y materializa el snapshot funcional original sin heredar los commits H7 que contenían evidencias sensibles. La rama original `codex/h7-dashboard-reports` y sus evidencias crudas permanecen intactas. La nueva rama es `codex/h7-publication-sanitized`.

Los commits y árboles de la tabla identifican los candidatos originales, no nuevos commits de esta rama. Los bytes y modos funcionales se conservan; solo cambian documentación, evidencias y seguimiento. Las evidencias publicables son derivados identificados como saneados: se omiten rutas personales, inventarios de worktrees ajenos, ubicaciones temporales y comandos/tokens nativos. El [manifiesto de transformación](../evidence/h7/publication-sanitization-manifest.json) conserva la procedencia de cada archivo preexistente transformado; los artefactos nuevos se enumeran por separado. Ninguna redacción constituye una nueva ejecución ni una nueva aprobación nativa.

Las métricas históricas, skips, seis advertencias backend, corrección asíncrona y excepción `lens_context_budget_exceeded` permanecen. No se repiten suites extensas porque no cambia el código. Se requiere una nueva decisión externa sobre este entregable documental. No se hará push, PR, merge ni tags hasta nueva aprobación explícita. Se añadió un worktree aislado: los 18 existentes deben permanecer intactos, total 19.

## Alcance y referencias exactas

H7.1–H7.3 exclusivamente, conforme a [H7-prompt.md](H7-prompt.md). Sin H8, contabilidad, gateway real, reintegros, nuevas reglas comerciales ni cambios en confirmaciones, stock o notificaciones H1–H6.

| Referencia | Identidad |
|---|---|
| Base H6 `main` / `origin/main` local | `8ff38e932eae7a09ffb1c531d4d040d4ca6ed9e8` |
| Árbol aprobado H6 | `ca6565085fc6abe6d403c299b3e8680aa019132d` |
| Tag anotado `h6-approved` | objeto `08101131ff1d5fad6698e1f42f4238497255bb15`, peel al commit H6 |
| Rama H7 | `codex/h7-dashboard-reports` |
| Freeze y ajustes de contrato | `671470c99cf2dbe87741de04cb53302b9d221a84`, `e08016102c66e8a11bbfae57f710c8847ec54e25`, `6b3605084a1980989b0ccfa1a8177e29bd0d50a8`, `cdcebfc42dc67a0547a62631d965a970ca381cb6` |
| Árbol freeze corregido y ACK | `08255694d028495aa0be1c6275c77e794e2d7a4c` |
| Backend candidato | commit `ed55dce8ac972143916b0b58a65682bb415b8c31`, árbol `ff54bb41cfb10e262c9ef94c7bd42b7fd085032a` |
| Frontend candidato | commit `857dac2a82f690eb3c8e1586c646bd9d2b541b4d`, árbol `4fb0e6ec886530eb604304d3ae469a0b6893718c` |
| Árbol técnico backend + frontend inicial, revisado/verificado | `0e23b8b8be42ca10395a5156bb509712f8d86d2d` |
| Árbol técnico corregido, recheck acotado | `1a7504cd1f7d429ba95714c323b9c1ff8092bb33` |

El árbol técnico final incluye la corrección de concurrencia del frontend; no incluye este informe ni las últimas evidencias documentales todavía pendientes de commit. No se lo presenta como un commit inexistente. La unidad backend contiene 1073 adiciones y 8 bajas: es una unidad coherente mayor que la referencia orientativa de 400 líneas, con agregación, pruebas, fixture y expectativas; no se comprimió ni fragmentó artificialmente el contrato o el comportamiento para reducir su tamaño. Publicación y topología de PR quedan diferidas por prohibición expresa.

## Protección de Git y recursos

Inventario histórico original: 17 worktrees protegidos; durante H7 se creó uno adicional, total 18. Las evidencias enlazadas [antes](../evidence/h7/preservation-before.json), [después](../evidence/h7/preservation-after.json) y [control final](../evidence/h7/preservation-final.json) son resúmenes saneados: conservan los resultados agregados de preservación, no los inventarios privados por worktree. El control original comparó HEAD, estado, índice, diff y archivos no versionados; confirmó los 17 intactos y las ramas, tags y referencias de seguimiento preexistentes sin cambios. Una referencia transitoria de captura nativa dejó de aparecer; se registra sin publicar su identificador, atribuir una causa no probada ni restaurarla. Los inventarios crudos permanecen en la rama auditada original. El prompt original no versionado permaneció intacto. No se eliminó ningún worktree.

Las referencias remotas verificadas son las referencias de seguimiento locales. No se hizo una nueva consulta autenticada a GitHub ni se reutilizaron credenciales o sesiones remotas. No hubo push, PR, merge, tag ni despliegue.

Se usaron contenedores PostgreSQL nuevos, con etiquetas de propiedad H7, tmpfs y puerto exclusivamente loopback. La imagen local fue `postgres:17.11-bookworm`; el runner no descarga imágenes. Los procesos API/Angular se iniciaron en puertos libres 3000/4200, con administrador ficticio, hasher H1 real y claves nuevas privadas. Se detuvieron únicamente sus PID/grupos/directorios verificados y se eliminó su contenedor propio. No hubo despacho SMTP ni acceso a bases ajenas.

## Contrato, datos y métricas

OpenAPI `0.10.0`, marcador `dashboard-reports-v1`, congelado antes de paralelizar. Los 45 objetos de rutas y 107 esquemas anteriores permanecen estructuralmente iguales. Un único cálculo sirve dashboard, reporte JSON y CSV. Sesión H1 administrativa real, revalidación dentro del snapshot y nuevamente fuera de él antes de devolver datos; respuestas sin caché y sin PII.

- Venta: `Payment.status=PAID` con `confirmedAt` dentro del período. `PaymentAttempt.APPROVED` sin pago confirmado no suma.
- Creación: `Order.createdAt`, como dimensión independiente. Estados y método corresponden a su valor actual, no a una reconstrucción retrospectiva.
- Buenos Aires IANA; fechas locales `[desde,hasta)`, años 2000–2099, máximo 366 días. Dashboard: mes calendario local actual.
- ARS en centavos exactos como strings; promedio con redondeo half-up entero; período vacío devuelve cero. Importes/snapshots históricos no se recalculan con catálogo o tarifa vigente.
- Cantidades separadas por presentación/unidad/longitud histórica; ranking por importe y desempate estable. CSV UTF-8, 24 columnas, secciones no aditivas entre sí, escape y neutralización de fórmulas; tarifa nunca repetida por renglón de presentación.
- **No migration required.** Se aplicaron las ocho migraciones H1–H6 existentes, sin drift. `migrate deploy` sobre el fixture H6 ya poblado fue no-op y conservó el hash de hechos.

### Expectativas previas del fixture

[Dataset declarado](../evidence/h7/dataset-expected.json), corregido por aritmética y restricciones existentes antes de las corridas exitosas; no derivado de respuestas del sistema.

| Período local 2026-10-01 a 2026-10-04 exclusivo | Esperado |
|---|---:|
| Ventas confirmadas | 2 |
| Productos / entrega / total, centavos ARS | 14500 / 500 / 15000 |
| Ticket promedio | 7500 |
| Pedidos creados / impagos activos / cancelados impagos | 5 / 2 / 1 |
| Pagos rechazados / intentos vigentes rechazados | 1 / 1 |
| UNIT | cantidad 2, subtotal 6000 |
| ROLL, longitud 10 m | cantidad 1, subtotal 5500 |
| METER | cantidad 3, subtotal 3000 |

Series: día 01 → 9500; día 02 → 5500; día 03 → 0. Dos filtros `DEMO_TRANSFER` + `PAID`: 1 confirmación, total 9500. El conjunto adicional de dinero grande suma `9007199254740998` sin pasar por float. El caso 5/2 redondea a 3 centavos. La política vigente se cambia a 999999 sin alterar los 500 históricos. Se prueba una orden creada antes y confirmada dentro, otra creada dentro y confirmada en el límite exclusivo, intentos/eventos/jobs múltiples y cambios de estado sin una venta adicional.

## Pruebas y resultados reales

| Comando / comprobación | Resultado observado |
|---|---|
| `node --test scripts/*contract*.test.mjs` | 41 PASS, exit 0, independiente |
| `node scripts/h0-contract-validate.mjs` | OpenAPI + 16 ejemplos válidos, exit 0 |
| Backend `npm run build` / `npm run lint` | PASS, exit 0; build independiente también PASS |
| Backend `npm test -- --runInBand` en archivo inmutable compilado | 1313 PASS, 1 SKIP; 36 suites PASS, 1 SKIP; exit 0 |
| Swagger `npm test -- --runInBand src/configure-application.openapi.spec.ts` | 58/58 PASS, exit 0 |
| Login + Swagger tras ajuste exclusivo de metadatos | 132/132 PASS, exit 0 |
| Frontend `npm test -- --watch=false` en árbol inicial inmutable | 159 PASS, 39 archivos, exit 0 |
| Frontend lint / build con Node 24 | PASS, exit 0 |
| `node backend/scripts/h7-postgres.mjs` | 10/10 PASS reales, ocho migraciones, drift limpio, exit 0; repetido independientemente |
| HTTP H1 real, dashboard/reporte/CSV y errores | 19 comprobaciones PASS; [detalle](../evidence/h7/http-consistency.json) |
| Recheck de corrección Blob tardío | 9/9 componente + probe diferido PASS, exit 0, independiente |

La suite completa frontend de 159 corresponde al árbol anterior a la última corrección de carrera. Después de esa corrección solo se repitió el componente afectado (9/9), lint y el probe independiente: no se afirma una nueva corrida completa ni de navegador. El skip backend sigue explícito y no es PASS. Los resultados HTTP/browser son del orquestador, inspeccionados por Verify; no se atribuyen falsamente como nuevas sesiones recreadas por Verify.

### Fallos iniciales y correcciones

- RED inicial de módulos/validador inexistentes; primera generación de contrato falló por sintaxis. Gates de versión H3–H6 y expectativas de metadatos requirieron extensión aditiva, sin alterar DTO/reglas previas.
- Verify inicial encontró cambio no solicitado en el texto del diagnóstico H6: se restauró la salida exacta; diferencial CLI/API 0/1/1 conservado.
- Native freeze detectó que faltaban validaciones de valores de encabezados: una corrección acotada protegió no-store y encabezados CSV, con RED→GREEN y validación dirigida.
- Primer PostgreSQL falló `Order_terms_check`; el fixture usaba términos incorrectos y carecía de actor de confirmación requerido por H5. Se corrigió el fixture, nunca las migraciones. Se descartó el escenario imposible PAID sin confirmedAt: la restricción H5 lo prohíbe.
- Primeros comandos de suite/build encontraron EPERM; se preservaron logs y la ejecución local autorizada resolvió permisos de ejecución. Un archivo inmutable sin `dist/auth` produjo fallos de prerrequisito; compilarlo antes de Jest resolvió el problema.
- La integración restauró exactamente una prueba de rutas H4–H6 eliminada accidentalmente por el worker; corrigió claves de grupos históricos, manejo de 403 Blob y preservación de errores H1 durante recheck.
- El primer lanzamiento manual Angular omitió el proxy y devolvió HTML donde se esperaba JSON; se corrigió únicamente el comando de lanzamiento.
- Desviación de herramientas: un `npx jest` desde la raíz anunció descarga al caché externo npm y falló con exit 1. No cambió manifests/lockfiles, no se reintentó ni borró el caché; las verificaciones posteriores utilizaron binarios locales cacheados.

## Matriz H7-Q01–Q16

| Caso | Evidencia y alcance |
|---|---|
| Q01 | Fresh ocho migraciones y drift independiente; no-op H6 poblado + hash conservado del orquestador. Sin migración H7. |
| Q02 | Simulación APPROVED/PENDING excluida: PostgreSQL y filtros HTTP. |
| Q03 | READY/DELIVERED conserva dos confirmaciones y total 15000; probado sobre fixture descartable. |
| Q04 | Creación septiembre, confirmación octubre; suma venta pero no creación del período. |
| Q05 | Creación dentro, confirmación exactamente en fin exclusivo; no suma venta. |
| Q06 | Vacío y solo impagos: cero ventas/ticket; API y pantalla vacía, sin NaN. |
| Q07 | Aritmética exacta, entrega separada, residuos y dinero mayor que Number seguro. |
| Q08 | Dos intentos, eventos y jobs por orden; hashes antes/después de lecturas iguales. |
| Q09 | UNIT/METER/ROLL separados y ranking 6000/5500/3000. |
| Q10 | Método + estado simultáneos, fechas BA, límites incluidos/excluidos, 400 de filtros inválidos. |
| Q11 | Nombre/precio y política vigente modificados; importes/etiquetas históricos conservados. |
| Q12 | H1 real 401 sin sesión/expirada/revocada; 403 cambio requerido; no-store. No cambia H1. |
| Q13 | JSON/CSV reconciliados; CSV descargado por navegador idéntico al endpoint; escape de fórmula ficticia. |
| Q14 | Angular real + API real + PG propio; 2 ventas, ARS 150,00 y cantidades 2 UNIT / 1 ROLL / 3 METER. |
| Q15 | Capturas/mediciones 360/768/1440, teclado/foco, vacío y error seguro. Zoom nativo 200% y auditoría WCAG completa NOT RUN. |
| Q16 | Regresiones backend/frontend/contrato y hashes de hechos; 1 skip backend. No se afirma repetir todos los flujos históricos E2E de H1–H6. |

## Review, Verify y revisión nativa

- **Review independiente:** árbol `0e23…`; un bloqueo de carrera Blob reproducido. Corrección en una tanda; recheck sobre `1a7504…` resuelto con probe y 9/9 pruebas, sin otra barrida. Advertencia no bloqueante: el fixture positivo de tarifa usa PICKUP, por lo que no prueba un segundo grupo COORDINATED; no se observó error del agregado.
- **Verify independiente:** 1313 backend / 159 frontend / 41 contrato / 10 PG; comparación de rutas/esquemas y diferencial legacy. No reprodujo otro defecto. Inspeccionó evidencias HTTP/browser, sin recrearlas.
- **Native freeze:** tres lentes concurrentes, una corrección; validación dirigida aprobó. ACK confirmado `authority=burned`, lineage `review-0301a7be05401e1f`, target `sha256:f341bb2222b782626a02f4d55ca022900daade40ace419d9ca7feee10737f137`. Solo cubre el freeze corregido, no el backend ni la interfaz completa.
- **Native backend:** cuatro lentes concurrentes, aprobado sin corrección; ACK confirmado `authority=burned`, lineage `review-bd4e3911c9569e41`, target `sha256:9d9cf81b8e2d49bc5ff1fd3b05f95a58b92f55b2ba2969535cd567124b074d4a`. Seis advertencias informativas: duplicación de filtros por alias, dependencia administrativa sin uso, tipo CSV `any`, contexto genérico de errores del runner y falta de pruebas automatizadas HTTP y de revocación entre ambos rechecks. Las 19 comprobaciones HTTP manuales no reemplazan esas regresiones automatizadas. No reabren la revisión.
- **Native frontend:** commit separado `857dac2a82f690eb3c8e1586c646bd9d2b541b4d`, 704 adiciones y 2 bajas, unidad coherente por encima de la referencia orientativa. Evaluación elevada por concurrencia; consentimiento específico otorgado. Cuatro lentes concurrentes aprobaron sin hallazgos ni corrección. ACK confirmado `authority=burned`, lineage `review-047ff832a270e9ae`, target `sha256:529ef67d42cd0e65538375bf71b62533a22733c12d4676f042c07198b9dc8c88`. El orquestador repitió el componente afectado: 9/9 PASS, exit 0.

- **Native cierre documental:** candidato `7228cc51051eb16dc70542728a954662d52c54ca`, árbol `3088de1ec9d2644f28c0b12b33ad4d86db460bfc`, target `sha256:0eb0a1d0786374b55590fda68f536f1a153ba5322f1f318a0800b9adaead6180`. El usuario otorgó consentimiento; START rechazó el rango de 73 archivos/7119 líneas con `lens_context_budget_exceeded`, `mutation_outcome=not_started`: no se creó autoridad, no hubo revisión ni ACK documental. [Proyección saneada del resultado nativo histórico](../evidence/h7/native-documentary-review-unavailable.json). No se reintentó, truncó evidencia ni reescribió historia. Las aprobaciones técnicas anteriores permanecen vigentes. Revisión documental nativa **no disponible para este rango**; queda explícita para auditoría externa.

## Deuda, horas y siguiente barrera

Siguiente barrera: auditoría externa solicitada; no se continuará con publicación ni H8. Las seis advertencias nativas backend anteriores permanecen como deuda no bloqueante. También quedan la revisión nativa documental no disponible por presupuesto de contexto, el skip explícito, zoom nativo/WCAG completa, realismo de segundo modo de entrega y la falta de una nueva consulta remota de referencias. Las evidencias crudas originales contienen rutas/topología privadas y permanecen solo en la rama auditada local. Este derivado las sanea; su revisión de privacidad y nueva validación externa no deben confundirse con una autorización de publicación.

No existe un registro de horas efectivamente dedicadas validado por una persona. Las **200 horas comprometidas en PS2 no son horas ejecutadas**. Ni duración de agentes ni estimaciones se convierten en horas trabajadas.

No se modifica historia H0–H6. No hay certificación productiva ni autorización implícita de publicación. El candidato original quedó cerrado localmente; este nuevo derivado se detiene para una nueva validación externa. Los candidatos técnicos exactos son los commits backend y frontend de la tabla; la unidad documental posterior solo incorpora informe, log y evidencias, sin alterar esos bytes fuente.

Risk: item 2 (autorización administrativa/CSV), item 3 (contrato y metadatos compartidos), item 4 (ordenamiento asíncrono de errores).
