# H3 — Verify independiente: PARCIAL

Candidato exacto `09a532d3f2a562af22ef6082533211edb08308f1`, árbol `b8ee9964abfedb2bb6bb9378fbc168aea463c307`; base `c91ccd4b436ecb2e4585d7c33e12b7b1a45d16ff`. Código extraído con `git archive`, dependencias copiadas físicamente mediante APFS `cp -cR`. No se modificó implementación. Sin publicación ni aprobación global.

## Resultado reproducible

| Comando | Exit | Evidencia |
|---|---:|---|
| `node --version`; `npm --version` | 0 | Shell inicial v26.4.0 / 11.17.0; comandos posteriores shell v24.18.1. No afirmar runtime uniforme. |
| `npm --prefix backend run prisma:validate` | 0 | Esquema válido. |
| `npm --prefix backend run prisma:generate` | 0 | Generación aislada. |
| `npm --prefix backend run build`; `run lint` | 0 / 0 | Build y lint. |
| `npm --prefix backend test -- --runInBand` | 0 | 29 suites, 1234 tests PASS; 1 suite/test omitido. |
| `npm --prefix frontend run test --watch=false` | 1 | 93 PASS / 1 FAIL; 19 archivos. |
| `npm --prefix frontend run build`; `run lint` | 0 / 0 | Build y lint. |
| `node --test scripts/h0-contract-validate.test.mjs scripts/h2-contract.test.mjs scripts/h3-contract.test.mjs` | 0 | 20/20. |
| `node scripts/h0-contract-validate.mjs` | 0 | OpenAPI y 11 ejemplos. |
| `npm --prefix backend run test:e2e -- --runInBand test/h3-checkout-postgres.e2e-spec.ts` | 1 | 3 FAIL en setup: upgrade Product sin updatedAt. |

## Bloqueos

1. `frontend/src/app/features/cart/cart-page.component.spec.ts:74`: `does not accept an expired authoritative quote`, expected true / received false. Usa reloj REAL: `expiresAt=Date.now()-1`, mientras `component.now` se capturó al construir. No se repitió ni parcheó el test.
2. `backend/test/h3-checkout-postgres.e2e-spec.ts:101`: PostgreSQL rechaza INSERT Product sin `updatedAt` (NOT NULL). Las cinco migraciones sí se aplicaron en base limpia; upgrade H2 con datos NO quedó validado.
3. El mismo test intenta escribir `quoteTtlSeconds=3`, incompatible con CHECK real `CheckoutPolicy_quoteTtlSeconds_check`. Se reprodujo SQLSTATE23514 mediante probe independiente. No debilitar constraint para adaptar el test.

## Evidencia HTTP y navegador reales

Nest completo propio en `127.0.0.1:60074`; Angular real en `127.0.0.1:60075`; PostgreSQL propio en puerto60017. Swagger real contra `validateH1Semantics`: cero diferencias. Sin CSRF: 201,400 (campo monetario adicional y cantidad0),409 (stock insuficiente),503 (policy JSON vacía válida estructuralmente para DB) y429 con code/message/requestId saneados. El probe inicial terminó exit1 intentando TTL3: sus pasos previos NO equivalen a PASS del script entero. Probe final exit0.

Sumas exactas observadas: metro125×2+rollo12500=12750; precio175+tarifa400 da13250. Dos quotes concurrentes completados. BD conserva seis snapshots. Hash saldos/versiones/operaciones/entries antes y después de errores/configuración: `7841496880846f925361a000f1ed0871fed6e0a5f4d0309aa6b5f3375e2181b2`; cero operaciones y entries. Expiración emitida y snapshots presentes; suite real fallida impide afirmar cobertura integral.

Navegador CUA real: detalle→añadir metro→añadir rollo independiente→carrito→recarga conserva ambas líneas→entrega coordinada→quote13075→aceptación explícita. Cambio propio precio225/tarifa800→quote13525 con aviso de ambas diferencias→aceptación renovada mediante Enter. Producto oculto→409 y aviso genérico, conserva carrito y elimina resumen anterior. No pedido/pago.

Reflow medido 360/768/1440: scrollWidth idéntico a innerWidth; screenshots `h3-verify-{360,768,1440}.png`. Tab llega a botón Aumentar con outline solid. Zoom nativo200% NO verificado. Capturas muestran resumen autoritativo nuevo y metadatos anteriores fuera del resumen; no confundirlos con una tercera cotización.

## Cobertura por especificación

S1–S3: alcance H3 observado; preflight histórico corresponde al padre. S4–S5: contrato y dinero cubiertos parcialmente por runtime; snapshot/no-stock y demo observados. S6: flujo real metros/rollos y recarga cubierto; parseo/acciones restantes cubiertos por suite93PASS, sin inventar cobertura individual. S7: runtime principal cubierto, upgrade y suite real pendientes por bloqueos. S8: conflicto y aceptación reales cubiertos. S9: PARCIAL por dos comandos obligatorios fallidos, upgrade no probado y zoom pendiente. S10: evidencia creada, sin commit/publicación; informe final corresponde al padre.

## Recursos retenidos para corrección dirigida y limpieza del padre

- Scratch `/private/tmp/abar-h3-verify.2Mixv0`; logs separados, scripts `live-probes.mjs`, `final-probes.cjs`, `start-owned.cjs` y `services.json`.
- `owned-env.json` contiene exclusivamente credenciales propias; modo0600; NO copiar/publicar.
- Contenedor `af0c5800f8f32d8ce23acf79b1a50522a8263067616e286c64fa1d17f1e6056e`, owner `fdaa68c2-db75-43bd-b79b-0340bb38f739`, purpose integration, tmpfs, postgres17.11-bookworm,127.0.0.1:60017. No otros contenedores tocados.
- PID API33010; launcher Angular33011. Preservados para padre. Browser2/tab1 retenido para handoff.
- Base limpia ahora tiene fixture demo oculto y política fee800/TTL600 restaurada; upgrade quedó parcialmente H2 (categoría insertada, Product falló). No reejecutar suite destructivamente sobre estas bases: nueva pareja de bases propias o recuperación dirigida autorizada por padre.

## Omisiones

No se repitió E2E H2 stock completo; auth/CSRF/catalog/stock unitarios incluidos en Jest. No diferencial ejecutable contra base H2 ni zoom nativo; contratos legacy H1/H2 sí cubiertos por tests20/20. Rate limiter propio agotado al terminar; esperar ventana antes de UI futura. Estado PARCIAL, sin autoaprobar hito.

## Recheck dirigido — corrección única f2277c5

Candidato `f2277c5331c178bac465097dd1651ebcafe0f55c`, árbol `fbc91c13156d4b1e5d60b41aad18ad2323d5796e`. Extracción nueva exacta; tres archivos,9 inserciones/4 eliminaciones respecto de09a532d. Los fallos originales arriba se conservan como evidencia, no se sustituyen.

**Resultado de los mismos bloqueos: RESUELTOS en el recheck.** Runtime expiry conserva dependencia reactiva now y consulta reloj real al evaluar; test determinista cubre llegada entre ticks. Fixture upgrade incluye updatedAt y el caso503 usa enabledDeliveryModes[] compatible con constraints.

| Comando dirigido | Exit | Resultado |
|---|---:|---|
| `node --version`; `npm --version` | 0 | v24.18.1 /11.16.0 |
| `npm --prefix frontend run test -- --watch=false --include=src/app/features/cart/cart-page.component.spec.ts` | 0 | 9/9 |
| `npm --prefix frontend run test -- --watch=false` | 0 | 94/94;19 archivos |
| `npm --prefix frontend run build`; `run lint` | 0 /0 | Cambio runtime compila y cumple lint |
| `npm --prefix backend run prisma:generate`; `run build` | 0 /0 | Prerrequisitos aislados |
| `npm --prefix backend run test:e2e -- --runInBand test/h3-checkout-postgres.e2e-spec.ts` | 0 | 3/3 reales PostgreSQL |

La suite real ahora completa migraciones limpias y upgrade H2 con datos, snapshots exactos y precio/tarifa modificados, concurrencia sin reserva, rechazos/configuración/stock y rutas públicas sin CSRF con429. Readback adicional: clean5 quotes/0operaciones/0entries/1policy; upgrade0quotes/0operaciones/0entries/1policy; producto previo conserva nombre,precio4321,saldo7,versión1. No tablas de pedido/pago añadidas.

Recursos NUEVOS retenidos: scratch `/private/tmp/abar-h3-recheck.P9oFWx`; `owned-env.json` privado modo0600; contenedor `2c5a060b2ccc48500d5acb54686f72c615e9ce8d74a8766f8a46d407af5770e6`; owner `a5d07146-c5d1-41ea-8854-9ce2b44a1be4`; PostgreSQL loopback60390; purpose integration,tmpfs,imagen cached17.11-bookworm,pullnever. Sin API/Angular nuevos; no se alteraron recursos originales. Bases nuevas ahora pobladas: no repetir suite de base vacía sin nueva fixture.

Proveniencia final: checks completos/backend1234/static contratos/UI y screenshots pertenecen a09a532d; delta expiry y fixtures,frontend94/94 y PostgreSQL3/3 pertenecen af2277c5. No se repitió fullbackend ni flujo UI; el diff no cambia backend runtime. Zoom nativo200% y diferencial profundo contra H2 siguen omitidos. S7/S9 resuelven los bloqueos señalados, sin convertir omisiones en PASS ni autoaprobar el hito. Recheck limitado a corrección única, sin nueva barrida.

## Cierre de recursos por el orquestador

Después del recheck se verificó propiedad exacta de ambos contenedores H3 y se detuvieron (sin rm de contenedor/imagen/volumen). API33010 y Angular33011 se identificaron por cwd scratch y puertos antes de SIGTERM. Se eliminaron exclusivamente los dos scratch propios y sus credenciales privadas tras preservar esta evidencia. No ejecutar comandos del informe contra puertos ahora detenidos sin provisionar fixtures nuevos. El informe inicial PARCIAL y sus fallos se conservan; el recheck resuelve esos bloqueos, no las omisiones declaradas.
