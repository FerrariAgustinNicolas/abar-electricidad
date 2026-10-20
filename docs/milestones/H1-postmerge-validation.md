# H1 — Validación post-merge

**Resultado: validación parcial; no PASS global ni cierre de H1.** Los flujos reales acotados funcionan, pero las suites completas conservan cuatro fallas reproducibles también en el main integrado. Fecha local: 2026-10-19. H2, push, merge y tags fuera de alcance.

## Identidad y alcance

- Main integrado verificado: `18c39e9b86b7b7bf45263fe5bad4fe77125a6386` (merge de H1).
- Commit documental verificado: `57fdb2fe2f9459246b30ebf51532f96eaad241f7`, rama `chore/h1-postmerge-validation`; padre directo `18c39e9`, sin reescribir historial.
- Árbol probado y posteriormente comprometido **sin cambiar bytes**: `61ed99003754f3c67a55d5445ed80b1daff382d1`. La primera corrida se vinculó por igualdad de árbol; la corrida final Node 24 se ejecutó directamente sobre este commit. Este informe se agrega después como evidencia pasiva, no como cambio de runtime.
- Solo README, Info/tags descriptivos de OpenAPI, CHANGELOG y decisión H1. Sin cambios en código, tests, migraciones, dependencias ni secciones funcionales OpenAPI (comparación estructural contra main).
- Worktree aislado; checkout original y WIP preservados. `origin/main` actualizado mediante fetch autorizado; no se movió el main local anterior.

## Comandos y resultados observados

Corrida final: **Node 24.18.1, npm 11.16.0 y Python 3.14.7**, con PATH fijado al Node 24 instalado y `process.execPath` en los hijos del probe. La primera corrida Node 26 se repitió íntegramente en Node 24, incluidos baseline y bases nuevas; resultados idénticos. Comandos desde la raíz, salvo indicación. Dependencias copiadas físicamente desde la instalación local, con ambos lockfiles idénticos; sin instalación por red ni enlaces de escritura al checkout original.

| Comando / comprobación | Resultado observado |
|---|---|
| `npm --prefix backend run prisma:validate` | PASS, exit 0. |
| `npm --prefix backend run build` / `run lint` | PASS, ambos exit 0; Prisma, TypeScript y recursos incluidos. |
| `npm --prefix backend test -- --runInBand` | **FAIL**, exit 1: 1151 pass, 1 omitida, 1 falla. |
| `npm --prefix backend run test:e2e -- --runInBand` | **FAIL**, exit 1: 5 pass, 4 omitidas, 1 falla. |
| `npm --prefix frontend run build` / `run lint` | PASS, ambos exit 0. |
| `npm --prefix frontend test -- --watch=false` | PASS, exit 0: 39 tests / 7 archivos. |
| `npm --prefix backend run contract:validate` | PASS, exit 0: OpenAPI y 7 ejemplos externos. |
| `node --test scripts/*.test.mjs backend/scripts/*.test.mjs` | PASS, exit 0: 418 pruebas. |
| `node --test frontend/scripts/h1-contrast.test.mjs` | PASS, exit 0: 2 pruebas; no prueba visual de navegador. |
| `PYTHONDONTWRITEBYTECODE=1 python3 backend/scripts/h1-real-e2e.test.py` | **FAIL**, exit 1: 76 pass / 78, 2 fallas. |
| `node --test scripts/h0-contract-validate.test.mjs` (spot check del padre) | PASS, exit 0: 11/11; incluidas también en las 418, no sumables. |
| `git diff --check` y comparación del árbol preparado con el árbol probado | PASS; cuatro documentos idénticos al candidato revisado. |

### Fallas y omisiones: no se corrigen fuera de alcance

Las cuatro fallas se reprodujeron una vez en una copia externa de `18c39e9`, con los mismos resultados:

1. `backend/src/auth/login.service.spec.ts:296`: espera identidad/versionado OpenAPI H0 `0.1.0`; runtime entrega candidato H1 `0.4.0`.
2. `backend/test/app.e2e-spec.ts:107`: expectativa de schema CSRF sin el `pattern` presente en runtime.
3. Python `test_sidecar_stall_kills_and_reaps_only_its_helper_and_parent_exits_bounded`: no observa el marcador de fsync privado.
4. Python `test_spawned_sidecar_helper_preserves_private_exclusive_write`: obtiene `failed`, esperaba `written`.

La reproducción en baseline demuestra que no las introdujo el delta documental; no demuestra su causa raíz ni autoriza modificar tests/runtime. La suite de persistencia continúa con `describe.skip`; no se declara ejecutada. La prueba PostgreSQL de concurrencia omitida en la corrida general sí se ejecutó separadamente a continuación.

## PostgreSQL limpio, bootstrap y HTTP reales

Verificador independiente, sin mocks ni `.env`: imagen local existente `postgres:17.11-bookworm`, `--pull never`, puerto aleatorio ligado a `127.0.0.1`, datos en tmpfs y etiqueta de propietario por ejecución. Contraseñas sintéticas aleatorias fuera de Git; archivo de entorno temporal modo 0600, eliminado al terminar.

- **Migraciones PASS:** `node backend/node_modules/prisma/build/index.js migrate deploy --config <scratch>/prisma.config.cjs` (CLI ejecutado desde backend con rutas absolutas). Configuración temporal explícita: schema y migrations del candidato, datasource únicamente `process.env.DATABASE_URL` privada de la base propia. Tres migraciones verificadas en `_prisma_migrations`: `20261009000100_h1_admin_user`, `20261009000200_h1_auth_context`, `20261009000300_h1_admin_audit`. Se repitió sobre una segunda base vacía para concurrencia; el guard Prisma por defecto no se modificó.
- **Primer administrador PASS:** se extrajo y ejecutó literalmente el JS del [procedimiento README](../../README.md#primer-administrador-local-procedimiento-manual-no-seed-de-producto). Creó una sola cuenta con Argon2id m=19456/t=2/p=1 y `mustChangePassword=true`. URL remota, contraseña débil y confirmación distinta rechazadas con exit 1 y base sin cambios. Reejecución válida rechazada sin alterar usuarios, sesiones ni auditoría. No se imprimieron credenciales.
- **Autenticación PASS acotado:** CSRF/login, credenciales inválidas, restricción users antes del cambio obligatorio, cambio real, revocación de sesión anterior, `/me` saneado y persistencia de sesión tras reiniciar el proceso backend.
- **Administración PASS acotado:** `runAdminProductE2E` de `backend/scripts/h1-product-e2e.mjs` contra el listener real: 9/9 checks de csrf/login/me/logout/change-password/list/create/patch/reset-password. Incluye rechazos Origin/CSRF sin cambios SQL, duplicados, versión obsoleta, reset con auditoría/revocación, desactivación y carrera de última cuenta activa. Los checks se superponen con autenticación; no son una certificación de todos los casos posibles.
- **OpenAPI live PASS:** `validateH1Semantics` de `scripts/h0-contract-validate.mjs`, norma contra `GET /api/docs-json`: 10 operaciones y cero diferencias semánticas. No equivale a identidad textual de Info.
- **Concurrencia PASS:** desde backend, `H1_ADMIN_USERS_CONCURRENCY_DATABASE_URL` privada de la segunda base propia y `node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand test/admin-users-concurrency.e2e-spec.ts`: exit 0, 1 suite / 1 test.

Orquestador final: `node /private/tmp/h1-live-node24.bl9AZ1/probe.cjs` con Node 24 explícito, exit 0. Una aserción del probe inicial Node 26 exigía orden textual de parámetros Argon2; se corrigió solo ese probe para comparación semántica, antes de la corrida final. Ningún producto fue corregido. Los tres contenedores propios de todas las corridas fueron eliminados por ID inmutable tras verificar etiqueta; procesos API detenidos, sin tocar contenedores/volúmenes existentes.

## Review / Verify y deuda restante

| Punto del informe histórico | Estado post-merge |
|---|---|
| C14: revisión/Verify del candidato completo | **Parcial**: nuevas pruebas reales y revisión independiente del procedimiento; suites completas fallan. No se declara aprobado todo H1. |
| Revisión nativa U5 históricamente BLOCKED | **Pendiente histórico preservado**; no se recuperó ni consumió su autoridad. La revisión documental nueva no lo resuelve. |
| Nueva revisión de los cuatro documentos | **APPROVED y acknowledged**, lentes riesgo/legibilidad, `review-16e73427346b6570`, target `sha256:1939e90f915b14c9dd82f6b9167a865dee21776497487810ebc1c6c402a344a9`; acuse `gentle-ai.review-acknowledged/v1`, `authority: burned`. Alcance: árbol documental citado, no runtime completo. |
| Proyección nativa committed-only | ASSESS high; preflight ofrece otra identidad (`2bab480d…`) para los mismos árboles. No se inició otra revisión de bytes idénticos ni se transfirió autoridad entre targets. No se afirma recibo propio de esa proyección. |
| C15: secretos/guardas | Sin credenciales nuevas en el delta; bootstrap parametrizado y guardado verificado. No se repitió auditoría exhaustiva de todos los blobs históricos. |
| Navegador responsive/teclado/foco/zoom/contraste | **NOT RUN** en esta ejecución; la evidencia histórica no se promueve al candidato post-merge. |
| Harness Python congelado real | **NOT RUN**; no se fabricaron calificación, engine ni volúmenes fijados. Las pruebas reales anteriores usaron el probe separado descrito, no ese gate oficial. |
| Auditoría externa / aprobación global | **Pendiente**; este informe no declara H1 cerrado ni listo para producción. |

Advertencia nativa no bloqueante `R2-bootstrap-drift`: el procedimiento manual depende de módulos compilados y SQL del esquema; futuros cambios pueden desactualizarlo. Revalidarlo al cambiar esos elementos; convertirlo en CLI mantenido requiere alcance separado. Los marcadores OpenAPI históricos exigidos literalmente por el validador también quedan como deuda de unificación, explícitos y sin modificar contratos funcionales.

Evidencia local saneada y no versionada: `odd/checks/h1-postmerge-validation/{offline-node24,live-node24}/` (comandos, exits, hashes, resultados, logs y probe). Los temporales originales se limpian después de retener esa evidencia; los paths scratch en comandos describen la corrida realizada, no una instalación permanente. Para reproducir bootstrap, usar el README y una nueva base descartable; no reutilizar secretos ni targets de la corrida.

**Siguiente paso fuera de esta ejecución:** decidir la corrección acotada de las cuatro fallas y completar los gates pendientes. No se implementó H2 ni se publicó nada.

Risk: item 2 (procedimiento operativo de creación del primer administrador; verificación independiente ejecutada).
