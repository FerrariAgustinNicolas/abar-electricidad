# H5 — Confirmación manual de pagos y gestión de pedidos

**Dictamen propio: PARCIAL.** H5.1–H5.3 tienen implementación local y evidencia funcional con PostgreSQL real. El contrato tiene Review nativo aprobado y ACK consumido; el runtime **no tiene aprobación ni ACK**: tres lentes admitidas y resiliencia indisponible después de dos fallos de transporte. La validación responsive requerida también es parcial. **Se detiene para auditoría externa; no se declara H5 integrable, aprobado ni productivo.**

## 1. Identidad y preservación

- Base local `main` / `origin/main` / `h4-approved^{commit}`: `e435c222d4c7245faad0a125c0ff6438e05425c3`; árbol `eadf133c62f8dac8846b11778d4a7a103f6114c4`. Se verificaron referencias locales; no hubo consulta ni escritura remota. PR #50 es la base informada por el usuario, no una nueva validación GitHub.
- Rama: `codex/h5-manual-confirmation-orders`; worktree independiente `/Users/agustin/Repos/personal/abar-electricidad-worktrees/h5-manual-confirmation-orders`, creado desde `main` aprobado. No se trasladó el índice/WIP original.
- **HEAD técnico final:** `7712c45ac8c98a04644d2e6bcbdf68c5abec70ce`; árbol `ce1218d765d5a60891b92b6084c9a07ab83747da`. Las evidencias posteriores son documentales; no cambian esos bytes técnicos.
- Checkout original en `feat/h1-change-password-review-blocks`, HEAD `9582df938c35ddb251b2446a568e32d9f60e9206`. Se preservaron H1-informe modificado, prompts H2–H5, scripts H1, docs/testing y worktrees no rastreados. SHA256 del diff original: `00cbe4677d1db6c9f1b7547dbf6d3e59bc966b67c3ebec99e8a19f09be5271e7`.
- **15/15 worktrees previos sin cambios**, comparando HEAD, estado, diff de índice/trabajo y hashes de archivos no rastreados antes/después; total 16 al añadir H5. [Comprobación final](evidence/H5/protected-worktrees-final.json). No reset, limpieza de WIP, push, PR, merge ni tags.
- Inventario técnico base→HEAD: **43 archivos, 2900 inserciones, 49 eliminaciones**; [lista exacta](evidence/H5/technical-diff.txt). No se reescribió ninguna migración histórica ni informe H0–H4.

| Unidad | Commit exacto |
|---|---|
| Prompt incorporado selectivamente | `ed46c3059d75b9ea4f1fd5c044e1311dadaf43bd` |
| Freeze OpenAPI antes de implementar | `655766c2162811a0aaf354a50c308cdc1bf8d869` |
| Corrección de vinculación contractual sin ampliar H2 | `45c78cf4f3b29e64d4d1982b5c7057850edbc424` |
| Transacción, persistencia, gestión y pruebas PostgreSQL | `9ab79ea7ab52727419ef33ccf12bf44f7f77d20a` |
| Panel y lecturas administrativas | `2de9336c9e33b783417311e0594ce364f253abc5` |
| Corrección de movimientos/indicador de stock | `f8325b918d721a707d34ac0b80de4dee22d73d95` |
| Probe HTTP independiente fijado como regresión | `7712c45ac8c98a04644d2e6bcbdf68c5abec70ce` |

El commit documental que contiene este informe y su árbol se identifican mediante `git log -1 --format='%H %T' -- docs/milestones/H5-informe.md`; no se inventa una identidad autorreferente. Su SHA se entrega por separado al finalizar. El manifiesto SHA256 de evidencia está [versionado aquí](evidence/H5/manifest.json).

## 2. Alcance, contrato y responsables

Fuentes leídas completas: prompt H5 y sus referencias, plan, decisiones H2–H4, contrato, Prisma, README, informes/seguridad H1 y mapa Figma. CodeGraph no pudo inicializarse; se documentó fallback a lectura acotada. No hubo nueva inspección Figma.

Padre: Git, OpenAPI, Prisma/migración (único responsable), backend, integración, navegador y entrega. `h5_source_map` comprimió fuentes; `h5_contract_verify` verificó contrato; `h5_admin_ui` implementó la unidad frontend; `h5_runtime_verify` ejecutó Verify independiente y recheck acotado del delta stock. Workers/explorer gpt-6-luna/high; Verify gpt-6.1-sol/medium. Skills exactas inyectadas. El worker UI tocó dos seams fuera de su allowlist inicial (modelos core/orders y app.routes.spec); el padre los inspeccionó y adoptó dentro del alcance global. **Desviación de routing registrada, no ocultada.** No se tocaron superficies ajenas al hito.

Seguimiento local ignorado `odd/tasks/h5-manual-confirmation-orders.md`, cinco tareas y espejo Engram; no se configura tooling global. Las unidades backend/UI superan la heurística de 400 líneas para conservar comportamiento, pruebas y coherencia; no se minificó ni omitió evidencia. Review separó contrato de runtime, no tomó toda la rama acumulada. El runtime de 1397 líneas sigue siendo un frente incompleto, no una aprobación por tamaño.

**OpenAPI 0.8.0**, `manual-confirmation-v1`, DTOs cerrados y siete rutas bajo `/api/v1/admin/orders`:

| Método / sufijo | Función |
|---|---|
| GET `/` y GET `/{id}` | Filtros/paginación y detalle privado con acciones calculadas |
| POST `/{id}/payment-confirmation` | Confirmación manual del importe histórico completo |
| PATCH `/{id}/status` | PREPARING→READY→DELIVERED, exclusivamente pagados |
| POST `/{id}/cancel` | RECEIVED impago, motivo obligatorio |
| POST `/{id}/notes` | Nota interna append-only |
| GET `/{id}/history` | Historial paginado |

Sesión H1 activa; mutaciones Origin/CSRF/Idempotency-Key; `no-store`. Confirmación: `attemptId`, `expectedVersion` y `confirmedAmount` con `amountMinor` string/ARS. `expectedVersion` controla **Order.version del agregado**, no una versión inventada de Payment. Notas/nuevas mutaciones/nuevo intento H4 incrementan una vez; replay no incrementa. Las lecturas públicas solo amplían estados y eliminan acciones imposibles, sin PII/notas/saldos. [Decisión y límites](../decisions/H5-manual-confirmation.md), [CHANGELOG](../../contracts/CHANGELOG.md).

## 3. Persistencia, dinero e inventario

Migración aditiva `20261021000100_h5_manual_confirmation`: conserva enums/tablas H4, añade PAID y estados operativos, metadatos de confirmación, OrderNote y actor de OrderEvent. CHECK de PAID exige actor/fecha; `StockOperation.paymentId` único impide otro débito para el pago; FK compuesta `(paymentId,orderId)` vincula pago y pedido correctos. CHECK exige ambos identificadores solo a PAYMENT_CONFIRMATION, y ninguno a ajustes/aperturas. Triggers impiden UPDATE/DELETE de eventos/notas. Prisma schema y SQL sin drift observado.

Una transacción ReadCommitted: revalidación y locks H1 AdminUser/AuthSession → Order → Payment/intento vigente → todas las presentaciones ordenadas → balances ordenados. Compatible con orden H2, sin intercalar locks presentación/balance. No bloquea/revaloriza catálogo ni abre rollos: snapshot histórico y BigInt mandan. Agrupa líneas de la misma presentación; comprueba todos los saldos antes del débito. Revalida autoridad antes de devolver.

Un solo commit de negocio contiene balances/versiones, operación y entradas, PAID/PREPARING, evento con actor, jobs pendientes/dedupe y replay cifrado reutilizando H4. Replay bajo lock antes de rechazar versión/estado, después de autoridad: mismo cuerpo/clave devuelve el original; cuerpo distinto/nueva clave/otro actor no habilitan otro débito. Clave de stock derivada/aislada evita colisiones H2. No hay retry infinito ni compensación parcial.

**P01 académico:** RECEIVED PENDING/REJECTED puede cancelarse con motivo. Cancela demanda impaga, no saldo ni versión de inventario; no permite reintentar luego. PAID no puede cancelarse ni por endpoint genérico. READY/DELIVERED no descuentan otra vez. La cantidad pagada pendiente de entrega se muestra aparte: **ya está descontada**, no se vuelve a restar. APPROVED del simulador mantiene pago PENDING y stock intacto hasta confirmación manual explícita.

UI: revisión de importe/intento/saldos y checkbox explícito antes de confirmar, revisión de motivo antes de cancelar, notas interpoladas, estados/errores y filtros. Mantiene cuerpo y clave de la intención desconocida en sessionStorage; no renueva clave/reenvía automáticamente. Sin gateway, envío SMTP, reembolso, devolución, apertura automática, reservas de impagos ni H6 completo.

## 4. Comandos y resultados observados

Entorno observado: Node **26.4.0**, npm **11.17.0**, Nest **11.2.7**, Angular **21.2.25**, TypeScript **5.9.3**, Prisma **7.10.0**, PostgreSQL **17.11-bookworm**. No se confunde Node observado con requisito documental Node24. Dependencias aisladas reutilizadas localmente, sin actualizaciones/global installs.

| Comando (desde raíz salvo indicación) | Resultado / evidencia |
|---|---|
| `node --test scripts/*contract*.test.mjs` | 31/31, exit0; [log](evidence/H5/h5-contract-runtime-suite.log) |
| `npm --prefix backend run contract:validate` | OpenAPI3.0.3 y 13 ejemplos, exit0; [log](evidence/H5/h5-contract-static.log) |
| `backend/node_modules/.bin/redocly lint contracts/openapi.yaml` | exit0 [log final](evidence/H5/h5-redocly.log); una corrida contractual previa emitió dos warnings no bloqueantes de propiedades bajo not/anyOf [log conservado](evidence/H5/h5-contract-correction-lint.log) |
| `npm --prefix backend run prisma:validate` / `prisma:generate` | exit0; generate también en build; [Verify](evidence/H5/h5-independent-verify.Ywh15t-prisma-validate.log) |
| `npm --prefix backend run build` / `lint` | exit0; [build](evidence/H5/h5-backend-build.log), [lint](evidence/H5/h5-backend-lint-final.log) |
| `npm --prefix backend test -- --runInBand` | **1252 pass, 1 skip**, 30 suites pass/1 skip, exit0; [log](evidence/H5/h5-backend-unit-green.log). El skip no es PASS. |
| `node backend/scripts/h5-postgres.mjs` | **13/13, exit0**, candidato7712; clean/upgrade aislados, 7 migraciones, SQL real; [log](evidence/H5/h5-postgres-committed-probe.log) |
| `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` con config propia | exit0 dentro del test Q01, sin drift; ledger y hash histórico en mismo log |
| `npm --prefix frontend test -- --watch=false` | **131/131, 29 archivos**, exit0; [log](evidence/H5/h5-frontend-final-suite.log) |
| `npm --prefix frontend run build` / `lint` | exit0 en UI y delta final; [build](evidence/H5/h5-stock-ui-build.log), [lint](evidence/H5/h5-stock-ui-lint.log) |
| Prueba focal stock UI y recheck independiente | RED2 fallan/6 pasan → GREEN8/8; [RED](evidence/H5/h5-stock-ui-red.log), [GREEN](evidence/H5/h5-stock-ui-green.log), [Verify delta](evidence/H5/h5-stock-delta-verify.tzoswc-stock-delta-test.log) |

El harness crea contenedor **nuevo propio**, sin pull, puerto loopback aleatorio y tmpfs, con etiqueta de propiedad; no usa bases existentes. `--help` exit0, opción desconocida exit2. La ruta del socket Docker es específica del entorno local; otra máquina requiere adaptación explícita. No se versionan URLs con contraseña ni fixture.json. PostgreSQL no es un mock de locks.

### Matriz de criterios (dictamen propio, no aprobación externa)

| Criterio | Dictamen | Evidencia y límite |
|---|---|---|
| Q01 clean + H4 poblado | CUMPLE | Siete migraciones, constraints/drift; Order/Payment/attempt/event y snapshot de ítem conservados |
| Q02 simulación sin confirmar | CUMPLE | APPROVED sin PAID ni débito |
| Q03 UNIT/METER/ROLL | CUMPLE | Débito exacto, actor/evento/jobs, precios históricos pese a cambio de catálogo |
| Q04 importe/intento inválido | CUMPLE | Falso importe, viejo/rechazado/sim pendiente: rechazo sin efectos parciales |
| Q05 multilínea insuficiente | CUMPLE | Rollback total, ningún saldo parcial |
| Q06 idempotencia/unicidad | CUMPLE | Replay exacto; cuerpo/nueva clave/dos actores no duplican operación |
| Q07 última unidad | CUMPLE | Dos waiters reales observados en PostgreSQL; solo un ganador, saldo no negativo |
| Q08 H2/H4 concurrentes | CUMPLE | Ajuste/apertura/reintento serializados, puntero consistente, sin doble efecto |
| Q09 fallos inyectados | CUMPLE | Operación, evento y NotificationJob fallan separadamente; rollback total |
| Q10 cancelar impago | CUMPLE | PENDING/REJECTED, motivo/evento/replay, demanda baja, balance/versiones idénticos |
| Q11 cancelar PAID | CUMPLE | API409; UI no ofrece acción; no reintegro ni refund |
| Q12 transiciones | CUMPLE | Confirmación→PREPARING→READY→DELIVERED y rechazos de saltos; sin otro débito |
| Q13 autoridad | PARCIAL | H1 real: token público401, CSRF/Origin403, password-change403, revocación401 y revocación bajo lock. Suite H1 verde; no se ejecutó un caso H5 separado de expiración temporal de sesión. |
| Q14 privacidad/lecturas | CUMPLE | Admin ve notas/PII/saldo; público no, sin retry imposible; notas no interpretadas como HTML |
| Q15 navegador extremo a extremo | CUMPLE | Angular→Nest→PG propio, checkout/login/confirmación/stock/listo/entrega y cancelación alternativa |
| Q16 regresión/responsive | PARCIAL | Builds/lint/tests/contracts verdes. Solo1280×720 y Tab hasta skip-link; **360/768/1440 y auditoría completa de foco/reflow NO ejecutados**. No se repitió toda la e2e histórica H1–H4. |
| Review nativo de contrato | CUMPLE acotado | Tres lentes, approved + ACK consumido, solo candidato contractual |
| Review nativo runtime | PARCIAL | Tres artefactos admitidos, resiliencia indisponible; sin veredicto global ni ACK |
| Verify independiente | CUMPLE acotado | Candidato2de, probe adicional fijado en7712, recheck del deltaf832; no aprueba navegador ni recepción documental |
| Protección WIP/no publicación | CUMPLE |15/15 comparaciones idénticas, referencias aprobadas sin mover |
| Integrabilidad/aprobación externa | NO CUMPLE aún | Faltan decisión externa sobre Review incompleto y prueba UI pendiente; este informe no concede aprobación |

### Hashes y conteos interpretables

En [PostgreSQL final](evidence/H5/h5-postgres-committed-probe.log): histórico Q01 SHA256 `ff3eb29665d6b7dc7cbf98eda295dab0fb7ba7b315df732c55d1f42734cdb31f`; snapshot ítem `a59bebf1d307836af5843f774e43d9453166a3dee347f3bba2eb95e40c20f28f`, antes=después. Q03 balances antes `16cfeb40fcee24cfde52a12a0038c3735b393fafb6f250af829eae0a36a30340`, después `403cca6e630f729a9a88e30b3bcaaf4735a1c23bebaaafc1cd2102656342c0a9`. Q07 observa **2 waiters** y asserts de un ganador/una operación/saldo final. Probe HTTP compara hash compuesto de saldos+pedido+pago+conteos operación/eventos/jobs tras403/400 y tras replay/409: igualdad exigida; hash posconfirmación `a012b7a8ee3e363ddd5bcf4675d24cbf396dc6625fcfe55cead6cecd5a76f1db`. Los hashes de IDs/fechas cambian entre ejecuciones; no son fixtures mágicos de aceptación.

En navegador: UNIT10/v1→9/v2 **solo** al confirmar; METER100/v1 y ROLL5/v1 intactos; exactamente1 operación/1 entrada/0 aperturas. READY/DELIVERED y cancelación alternativa conservan stock y versiones. Demanda impaga1→0 al cancelar, saldo9/v2 igual. [Lecturas antes/después y prueba resumida](evidence/H5/h5-browser-proof.json): hash antes `ba95f1a37bbacbfebda2d629bb9e264b5176241636078fa7905dfee7063ab1b8`; después confirmación/listo/entrega/cancelación `c1f3898364eafc102d67f80c92e4aa6ff2f2a4ba28355c2bb20106185bc8b89e`.

## 5. Navegador y correcciones observadas

Angular43156→Nest43155→BD nueva propia h5_browser. Compradores ficticios `.test`; sin tokens/clave de replay en evidencia. Primer pedido terminó DELIVERED/PAID/v4; segundo CANCELLED/PENDING/v2. Login real H1, no bypass de guard.

| Momento | Captura |
|---|---|
| Pedido impago / listado privado | [público](evidence/H5/h5-browser-public-unpaid.png), [admin](evidence/H5/h5-browser-admin-list.png) |
| Revisión explícita / pago confirmado | [revisión](evidence/H5/h5-browser-payment-review.png), [PREPARING](evidence/H5/h5-browser-paid-preparing.png) |
| Entrega / consulta pública | [admin](evidence/H5/h5-browser-delivered.png), [público](evidence/H5/h5-browser-public-delivered.png) |
| Cancelación alternativa | [admin](evidence/H5/h5-browser-cancelled-admin.png), [público](evidence/H5/h5-browser-public-cancelled.png) |
| Stock final separado / movimiento correcto | [saldos](evidence/H5/h5-browser-stock-final-top.png), [movimiento](evidence/H5/h5-browser-stock-final-movements.png) |

El navegador detectó PAYMENT_CONFIRMATION mostrado como “Apertura de rollo” por un ternario H2 de dos tipos. [Fallo preservado](evidence/H5/h5-browser-stock-label-before.png). Se corrigió con mapa explícito de tres tipos/filtro y se añadió cantidad pagada pendiente independiente sin restarla del disponible. RED/GREEN y Verify del delta referenciados arriba. El login inicial503 fue un fixture con PHC argon2 de parámetros distintos: se regeneró usando **PasswordHasher H1 canónico**, sin debilitar autenticación.

## 6. Review nativo y Verify independientes

**Contrato:** rango `ed46c30..45c78cf`, árbol final `d43afd58d8df48218e56b454cbcfc76873c85dae`, lineage `review-dd37ccd89c8cd691`, target `sha256:e0c254ea81cda9cdfcd7e1123538db0971296259ac7c5562b91511ab88bb1cff`. Consentimiento propio granted; risk/readability/reliability reales concurrentes. Resultado approved y operación exacta ACK exit0 `gentle-ai.review-acknowledged/v1`, autoridad burned; revisión consumida `sha256:18811b3142fc46977c2920a255ee30928b4df7bf859750f42d146c04f84a8fcc`. [Resumen saneado](evidence/H5/native-contract-summary.json). Advisories no bloqueantes: diagnósticos de versión H3/H4 y cantidad de operaciones H1 obsoletos; validador no comprueba valor enum no-store. No equivale a runtime aprobado.

**Runtime:** rango `45c78cf..7712c45`, base árbol `d43afd58d8df48218e56b454cbcfc76873c85dae`, candidato `ce1218d765d5a60891b92b6084c9a07ab83747da`, **34 paths/1397 líneas**, presupuesto de corrección200. Lineage `review-c62cd2c64c186b83`, target `sha256:7530aca94e5f6e07ef55ad244f9c7d1055591485b26269b26539c9a01e8a2127`. Consentimiento propio granted. Capturas risk/resilience/readability/reliability lanzadas concurrentemente en orden nativo. Risk/readability/reliability admitieron artefactos; **no se interpreta eso como veredicto global**.

Resiliencia devolvió exit1, `gentle-ai.review-integration.failure/v2`, `invalid_request`, `mutation_outcome:not_started`, causa `invoke provider reviewer: codex reviewer transport failed: exit status 1: Reading prompt from stdin...`. STATUS exacto ligado reofreció idéntico slot; se ejecutó **una vez** y repitió el fallo. STATUS final continúa `collect/reviewer_results_required` con solo resiliencia pendiente. **No approved, no ACK, no autoridad consumida; sin corrección nativa aplicada.** No hubo `lens_context_budget_exceeded` ni cambio de modo. No más reintentos automáticos, no se reutilizó excepción H4. [Resultado y fallos](evidence/H5/native-runtime-summary.json). Se conservan comandos exactos privados fuera de Git para eventual continuidad solo tras decisión externa.

**Verify:** gpt-6.1-sol/medium, scratch propio sobre `2de9336`, sin editar implementación: backend build/lint/unit1252+1skip, contratos31/estática13/Prisma, PG12 y probe HTTP adicional13, frontend129/build/lint. Sin blocker técnico reproducido. Probe copiado **byte por byte** a7712 y padre repitió PG13; deltaf832 tuvo recheck independiente8/8/build/lint. Suite final frontend131 por padre. H5-Q15 y recepción del informe no se atribuyen a Verify. Logs `h5-independent-verify.*` y `h5-stock-delta-verify.*` en el manifiesto. No se sustituye Review con Verify.

## 7. Fallos conservados, omisiones y cierre

- Contract RED inicial; fixture legacy olvidaba quitar marcador/rutas H5. Verify contractual detectó vinculación solo descriptiva y ampliación global maxItems2→100: se corrigieron con oneOf por tipo, conservando H2max2;31tests verdes después. No se debilitó contrato de producción.
- Backend RED inicial fue compilación sin servicio (no se vende como RED funcional). Primer build detectó tipos Buffer/Uint8Array y constructor de fixture incorrecto. Primer unit tuvo10 fallos de expectativas Swagger/version/stock; se actualizaron fixtures tras reproducir y quedó1252+1skip.
- Harness PG falló inicialmente por reemplazar nombre de usuario al cambiar DB, token H1 no canónico, Category.updatedAt inexistente y luego SyntaxError de apóstrofo en help. Se corrigieron fixtures/URL.pathname/help; `--check`, help y opción inválida válidos; corrida final13/13. Los logs anteriores se conservan.
- Verify inicial sandbox: backend100 fallos EPERM por listeners, PostgreSQL sin iniciar y frontend esbuild134. Se conservan exit1/134 y reruns con permiso acotado: son PASS posteriores, no borrado del fallo ni relajación de guards.
- No CI remota, pagos/correo reales, Figma nuevo, toda la e2e histórica H1–H4 ni responsive360/768/1440. No aprobación productiva/legal. No todas las pruebas de auth históricas son probes específicos de cada ruta H5.
- Se detuvieron exclusivamente listeners43155/43156 y contenedores propios tras verificar labels/ID/mounts; scratch propio eliminado tras exportar evidencia saneada. Contenedor de primer fallo recuperado por puerto/owner/nombre/imagen/mounts. No se eliminaron recursos ajenos. [Limpieza](evidence/H5/cleanup.json).

**Necesita decisión externa:** Review runtime incompleto por transporte, validación responsive/foco pendiente y cobertura temporal H5 de sesión expirada. Auditar también los advisories y el alcance de evidencia antes de considerar integración. No se pide ni infiere permiso de publicación. La ejecución se detiene aquí; no se inicia H6.

**Risk: items1,2,3,4** — migración/datos, autoridad administrativa, contrato consumido y concurrencia de dinero/stock. Evidencia funcional y Verify no eliminan estos riesgos ni conceden aprobación externa.
