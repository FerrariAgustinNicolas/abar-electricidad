# H4 — Cierre complementario de validación

**Dictamen complementario: PARCIAL.** R3 corregido y comprobado; recuperación incierta segura dentro de sus límites. Review/Verify independientes favorables. **Review nativo del runtime bloqueado por lens_context_budget_exceeded después del consentimiento propio. No hay aprobación nativa del runtime ni autorización de integración. Se detiene para auditoría externa.**

## Candidatos y alcance

| Referencia | Commit | Árbol |
|---|---|---|
| Base H3 aprobada | d08adc17efbdd62cd847fea7c16d1371a14436f3 | 1dc52587aa56909f6256ed36eb1b05eaa8508dce |
| Técnico auditado | 826c17057993e2108118f8431555f71f5f92e751 | a45f95bedaa125c7896cfca5780bbc3ca7f54624 |
| Inicio complementario (informe anterior) | 5d1d5647dc679c1d2d648cd135465cd6d254ea08 | de6bbcd5cc7a09c86d5087a7cd6377a2a1196334 |
| Corrección técnica final R3 | 0a1d296a3791ebb3e8f09aace1ce30ed08e03e2b | 904c895866f78651530b5b6826e3468b1a81df6c |

Rama: codex/h4-orders-demo-payments. La corrección contiene exactamente tres archivos frontend, 120 adiciones/20 eliminaciones. Backend y contratos son idénticos al candidato auditado. El informe anterior y sus evidencias se preservan sin reinterpretar sus resultados PARCIALES. No se ejecutó push, PR, merge, tag ni H5.

## R3: reproducción, causa y corrección mínima

El enlace HTML original asignaba value antes de insertar las opciones recibidas asíncronamente. El navegador mostraba la primera opción mientras la señal conservaba DEMO_SIMULATION. El payload se construía desde esa señal, no desde la opción visible.

Se reprodujo sobre el código anterior con las nuevas pruebas: cuatro fallos reales (opciones asíncronas, recarga, respuesta tardía y opción incompatible). La corrección utiliza FormsModule/ngModel para que el ControlValueAccessor de Angular vuelva a aplicar el valor cuando se registran las opciones. No incorpora retardos ni lectura imperativa del DOM. Además:

- La selección inicial vacía no inventa un método; cargar métodos conserva una selección válida o elige la primera disponible.
- Un contador de revisión descarta éxito, error y finalización de respuestas antiguas.
- Durante carga, envío o resultado incierto no se modifica el intento.
- Se rechazan métodos incompatibles antes de generar clave o enviar HTTP.
- Un intento incierto reutiliza su cuerpo y clave capturados; escenario solo para simulación habilitada.

Archivos: frontend/src/app/features/orders/order-result-page.component.ts y su spec; frontend/src/app/features/checkout/checkout-page.component.spec.ts. Ninguna regla comercial cambió.

## Pruebas observadas

| Comprobación | Resultado |
|---|---|
| Resultado sobre baseline5d1d564 con nuevos casos | 4 fallan / 4 pasan, exit1 (RED) |
| Checkout + resultado corregidos | 14/14, exit0 |
| Suite frontend completa | 118/118, 26 archivos, exit0 |
| Frontend lint / build producción | exit0 / exit0 |
| Review independiente, archivo inmutable | Sin bloqueos; 14/14 + dos probes adicionales de cuerpo/clave congelados y error tardío |
| Verify independiente, archivo inmutable | 14/14;118/118;lint/build; HTTP/PostgreSQL real favorables |
| Backend completo | No repetido: no afectado |
| Backend generación Prisma + build en scratch | exit0 después de generar cliente ausente en archivo Git |
| Contratos/backend diff contra baseline | Sin cambios |

Verify retuvo errores de harness: ruta singular incorrecta404, comparación con enum PAID inexistente y primera compilación sin Prisma generado. Se corrigió el harness/preparación, no el producto. También se preservan los fallos RED y no se presentan como fallos del candidato final.

### Correspondencia visual / HTTP / PostgreSQL

Producción Angular → proxy local del harness → NestJS real → PostgreSQL17.11 nuevo, propio, tmpfs. Sin mocks; contactos sintéticos. Pedido ABAR-20261020-1577C586E7:

| Acción visible | HTTP methodCode/scenario | PostgreSQL secuencia/estado |
|---|---|---|
| Inicial después de cargar opciones | DEMO_SIMULATION / PENDING | 2 / PENDING |
| Escenario aprobado | DEMO_SIMULATION / APPROVED | 3 / APPROVED |
| Escenario rechazado | DEMO_SIMULATION / REJECTED | 4 / REJECTED |
| Cambio explícito a retirar | DEMO_PAY_ON_PICKUP, sin scenario | 5 / PENDING |
| Recarga de resultado y nuevo intento | DEMO_PAY_ON_PICKUP, sin scenario | 6 / PENDING |

Los cinco POST devolvieron201 y coinciden con el selector visible y la fila persistida. IDs exactos, capturas y log HTTP sanitizado: ../testing/h4-cierre/browser.md, proxy-sanitized.jsonl y browser-before-unknown.json. APPROVED no confirmó cobro; pedido Recibido. Las respuestas tardías se prueban determinísticamente, no se atribuye ese control de tiempos a la prueba visual.

Verify comprobó retiro incompatible con entrega coordinada409 y escenario en método manual400; hash persistido sin cambios después de rechazos. Stock antes/después idéntico: 91e3c2b89339929770079cd3680459e1c82c9920883c9dee1bc6b4507c4f529e. Pagos PAID:0. No reservas ni descuentos.

## Creación incierta tras recarga

Prueba real: proxy de harness perdió una sola respuesta después del201 y commit reales. La pantalla informó resultado desconocido y ofreció la misma solicitud, sin cambiar cuerpo/clave. Al recargar checkout apareció únicamente el bloqueo preventivo y consulta mínima; no se generó otro pedido ni se reenvió automáticamente.

Lecturas PostgreSQL antes/después de recargar: idénticas byte a byte, cmp exit0; orders4/createKeys4/paid0. Son cuatro intenciones de prueba distintas, no cuatro duplicados. La última entrada HTTP sigue siendo un único create201 con dropped:true. Prueba focalizada adicional espía crypto.randomUUID: cero nuevas invocaciones después de recargar e intentar enviar; marcador intacto.

El guard existente guarda solamente quoteId/idempotencyKey en sessionStorage, no comprador ni cuerpo de creación. No se introdujo persistencia adicional de datos personales o tokens. El acceso privado existente a resultados no se amplió.

**Límites explícitos:** tras recarga no puede reconstruirse automáticamente el cuerpo sensible perdido. La consulta mínima requiere número/contacto y no restaura acceso privado; si se perdió la respuesta original, puede faltar el número. La protección es de sesión de pestaña, no una garantía entre dispositivos ni después de limpiar/bloquear/corromper almacenamiento. No se presenta la consulta como recuperación automática completa.

## Review y Verify

Actores independientes sobre0a1d296/tree904c895, en archivos Git temporales distintos. Review no encontró bloqueo causado por candidato; Verify corroboró pruebas y HTTP/PG. La comprobación visual posterior del padre cerró la brecha visual explícitamente pendiente en sus handoffs. No se solicitó otra corrección ni se repitieron miles de pruebas backend. Véanse review.md, verify-summary.md y browser.md.

Risk: item4 (orden de respuestas asíncronas y congelamiento de intención de reintento).

## Review nativo del runtime

Modo nativo ON/global, sin cambios. La evaluación R3 fue high/item4. Primer intento dentro del sandbox falló al crear índice Git temporal (operation not permitted); misma evaluación con permisos apropiados exit0. Esto no es una aprobación.

El ACK anterior corresponde exclusivamente al contrato2fc9ceef8b67081d0a8b6904ea541995a35962df y no se reutilizó. La evaluación y preflight cubrieron desde ese límite contractual hasta432c6430d5faccaf40a3b18034c6db2d85ff4c20, árbol dfb3f33287d0f99908985d244da2baf98c64d8df. Este commit conserva el mismo código técnico0a1d296; agrega únicamente informe/evidencias (ff0131322b45416c9127af9159777c6a17bcbd99 y432c6430d5faccaf40a3b18034c6db2d85ff4c20).

Preflight exit0 emitió el START exacto para target sha256:b7c85ad37b9ff6e3bcb33f95d13aedf67dc12e177323fca33acec9c92b1d6ecd, lineage review-51f374dc90e1bb9d. START relay exit0 solicitó consentimiento/v3; el usuario respondió literalmente granted. Se ejecutó una sola vez la invocación granted exacta de ese envelope, sin reconstruir argumentos.

**Resultado real: exit1, gentle-ai.review-integration.failure/v2.**

| Campo | Valor exacto |
|---|---|
| operation | review.start |
| phase | preflight |
| code | lens_context_budget_exceeded |
| mutation_outcome | not_started |
| authority_applicability | not_evaluated |
| retry_safe | true |
| replayability | not_replayable |
| next_action | stop |

Mensaje literal del proveedor:

> The candidate's complete reviewer evidence exceeds the native context budget, so no review authority was created; review this change as smaller candidates that each fit under it.

La causa detallada indica que no se produjo el contexto de reviewer, no se creó autoridad, no hay nada que abandonar/reparar, la evidencia inmutable no se trunca y repetir este mismo candidato no puede tener éxito. Sugiere candidatos menores en secuencia. Aunque retry_safe es true, no se lo interpretó como permiso para repetir frente a esa prohibición específica y next_action stop.

**No hubo capturas de reviewers nativos, ACK ni aprobación del runtime.** No se fraccionó la revisión, reescribió historia, inició otra lineage, reparó estado ni deshabilitó la herramienta. Se conserva el impedimento exacto y se detiene conforme a la autorización del usuario. Los cuatro JSON native-runtime-* contienen evaluación, preflight, consentimiento e impedimento; no se atribuye a Review/Verify independiente autoridad nativa.

## Preservación y limpieza

Los15 worktrees y sus ramas se preservan. main/origin/main/h3-approved^{commit} conservan d08adc17efbdd62cd847fea7c16d1371a14436f3. WIP original: diff SHA25600cbe4677d1db6c9f1b7547dbf6d3e59bc966b67c3ebec99e8a19f09be5271e7; manifiesto de archivos untracked SHA256460a142af5b5425291f3253bcde1b5141da7e9e1e483b710e7faad88f4be969f, ambos iguales al preflight (directorios de worktree excluidos).

Se cerró la pestaña propia, terminaron PIDs5517/5518 y se detuvo/eliminó únicamente el contenedor3d13ea63e2101ed84340bcf8b0ba5cd85967a29eca9f75260f19e18bed94c7a8 con ownerfc00dd63-89d6-4333-88dc-24e891aaeac8 verificado, sin mounts externos. Se eliminaron seis scratch conocidos de esta validación, incluidos secretos efímeros del fixture, tras exportar evidencia sanitizada. No se limpiaron recursos ajenos.

## Deuda y siguiente barrera

- Review nativo del runtime bloqueado por presupuesto de contexto aun con consentimiento propio. Una futura revisión fraccionada requiere una nueva decisión de alcance; no se ejecutó como workaround. Review/Verify independientes y ACK contractual no sustituyen esa aprobación.
- Límites de recuperación descritos arriba, sin persistencia sensible añadida.
- Deuda y exclusiones previas siguen vigentes: confirmación administrativa de pago, descuento de existencias, gestión completa de pedidos y H5 fuera de alcance.
- Sin autorización de integración. Bloqueo nativo documentado; trabajo detenido para nueva auditoría externa.

Evidencias: ../testing/h4-cierre/SHA256SUMS. Los archivos de configuración privada, cabeceras/tokens y cuerpos con contactos no se incorporaron.
