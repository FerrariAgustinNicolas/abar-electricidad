# H1 — Corrección de cuatro fallas post-merge

**Resultado: cuatro fallas corregidas; todas las suites ejecutadas terminan sin fallas, con omisiones explícitas. No se declara H1 aprobado.** Fecha local: 2026-10-19. Sin H2, push, merge ni tags.

## Candidato consolidado

- Rama: `chore/h1-postmerge-validation`, continuada desde `b6a05851158787750ca1fba93ebc06d4d85ab528`; historial de main `18c39e9` conservado y WIP original intacto.
- **Commit final de corrección, Review y Verify:** `8308f8c423aef2550deaa97464735002509d4d46`.
- Árbol: `ee2045b8f61776aeff7dfee66fba16966872fb96`. Este informe se incorpora posteriormente como evidencia pasiva, sin modificar ese candidato.
- Cambios: solo tres archivos de tests, 12 líneas agregadas y 8 retiradas. Contrato, autenticación, arquitectura, dependencias, migraciones y código de producción sin cambios.

## Causas verificadas y archivos modificados

| Archivo | Causa reproducida y corrección |
|---|---|
| `backend/src/auth/login.service.spec.ts` | Expectativa H0 de título/descripción/versión `0.1.0` frente al Swagger integrado H1 `0.4.0`. Al corregirla emergió otra aserción obsoleta del mismo test: CSRF ya documenta seguridad opcional `[{}, {AdminSessionCookie: []}]`, igual que OpenAPI. Se actualizaron las expectativas, conservando comparaciones estrictas y el resto de sus checks. |
| `backend/test/app.e2e-spec.ts` | La expectativa del header CSRF omitía `pattern: ^[A-Za-z0-9_-]{43}$`, presente en Swagger y en `components.schemas.CsrfNonce` del contrato. Se agregó a `toEqual`; no se alteró el contrato ni se relajó la comparación. |
| `backend/scripts/h1-real-e2e.test.py` | Dos fixtures construían targets desde el alias macOS `/var/folders/...`, mientras `HostFilesystem` canonicaliza la raíz a `/private/var/folders/...`. La contención rechazaba el target antes de abrir/escribir o llegar a `fsync`. Se aplicó `.resolve(strict=True)` únicamente a esas dos raíces temporales, antes de derivar targets. |

La hipótesis Python se comprobó con subprocess real y stderr capturado: alias → `AdmissionError: filesystem path outside project`; raíz canónica → escritura exclusiva modo `0600`. Un segundo probe llegó a `fsync`, dejó el marcador y obtuvo `stalled_reaped`, helper terminado/recolectado con `-9`, dentro de los límites originales. Review independiente reprodujo alias rechazado con cero llamadas a fsync y raíz canónica con dos llamadas; el intento de reemplazo conservó los bytes anteriores.

No se cambió `HostFilesystem`, `O_NOFOLLOW`, creación exclusiva, permisos, aislamiento, fail-closed, tiempos límite ni manejo del subproceso. El blob del harness de producción es idéntico en base/candidato: `b795b49d4cd342522357b9ef1a99fe528ed71770`. Producción ya deriva su raíz canónica mediante `__file__.resolve()`; los fixtures ahora representan ese contexto.

## RED → GREEN focalizado

Toolchain fijado: **Node 24.18.1, npm 11.16.0, Python 3.14.7**. Salidas stdout/stderr y exit codes conservados; no se modificaron tests para ocultar fallas.

| Comando (Jest desde backend; Python desde raíz) | Antes | Después |
|---|---|---|
| `node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/auth/login.service.spec.ts --cacheDirectory <scratch>/jest-cache` | exit 1: 73 pass, 1 fail; paso intermedio también exit 1 por seguridad CSRF obsoleta | exit 0: 74 pass |
| `node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand --runTestsByPath test/app.e2e-spec.ts --cacheDirectory <scratch>/jest-cache` | exit 1: 5 pass, 1 fail | exit 0: 6 pass |
| `PYTHONDONTWRITEBYTECODE=1 python3 backend/scripts/h1-real-e2e.test.py IndependentGuardContractTests.test_sidecar_stall_kills_and_reaps_only_its_helper_and_parent_exits_bounded` | exit 1: no llega al marcador fsync | exit 0: conserva fsync, kill/reap y límites |
| `PYTHONDONTWRITEBYTECODE=1 python3 backend/scripts/h1-real-e2e.test.py IndependentGuardContractTests.test_spawned_sidecar_helper_preserves_private_exclusive_write` | exit 1: `failed` en vez de `written` | exit 0: conserva exclusividad, bytes y modo 0600 |

Los dos tests Python se ejecutaron juntos después, 2/2 exit 0. Verify reprodujo además las dos fallas contra el baseline sin corregir, exit 1. No se suprimió ninguna prueba ni se agregó una omisión.

## Suites completas y verificaciones finales

Todas las siguientes ejecuciones del Verify independiente sobre `8308f8c` finalizaron con **exit 0**. Los comandos npm se ejecutaron desde la raíz con `--prefix` equivalente al cwd backend/frontend del registro.

| Comando / comprobación | Resultado |
|---|---|
| `npm --prefix backend run build`, `run lint`, `run prisma:validate` | Compilación, lint y esquema válidos. |
| `npm --prefix backend test -- --runInBand` | 1152 pass, 1 omitida, 0 fail. |
| `npm --prefix backend run test:e2e -- --runInBand` | 6 pass, 4 omitidas, 0 fail. |
| `npm --prefix frontend run build`, `run lint` | Ambos correctos. |
| `npm --prefix frontend test -- --watch=false` | 39 pass. |
| `npm --prefix backend run contract:validate` | OpenAPI y ejemplos válidos. |
| `node --test scripts/*.test.mjs backend/scripts/*.test.mjs` | 418 pass. |
| `node frontend/scripts/h1-contrast.test.mjs` | 2 pass; no certifica accesibilidad visual. |
| `PYTHONDONTWRITEBYTECODE=1 python3 backend/scripts/h1-real-e2e.test.py` | 78 pass; spot check adicional del padre: 78/78, exit 0. |

El primer intento sandbox del Verify encontró EPERM; se preservó separado y no se contó como defecto del candidato. La corrida autorizada con acceso local requerido terminó en verde.

### PostgreSQL y autenticación reales

Probe local copiado de la validación previa, cambiando únicamente su directorio temporal, ejecutado con Node 24 y `process.execPath` también en sus hijos. Imagen existente `postgres:17.11-bookworm`, `--pull never`, puerto aleatorio solo loopback, datos tmpfs y credenciales sintéticas privadas no versionadas:

- Prisma `migrate deploy --config <scratch>/prisma.config.cjs`: tres migraciones reales en **cada una de dos bases nuevas**, con configuración explícita y guard Prisma original intacto.
- Bootstrap literal del README: cuenta Argon2id, cambio obligatorio, rechazo de URL remota/clave débil/confirmación distinta y replay, sin alterar snapshots tras rechazos.
- Helper HTTP existente `runAdminProductE2E`: **9/9**; login, CSRF, me, logout, cambio, listado, creación, patch y reset. Revocación, auditoría y negativos incluidos en su alcance; persistencia de sesión comprobada tras reiniciar el proceso API.
- OpenAPI real `/api/docs-json` contra norma mediante `validateH1Semantics`: **10 operaciones, cero diferencias**.
- `node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand test/admin-users-concurrency.e2e-spec.ts`, con URL privada de la segunda base propia: **1/1**, exit 0.

El contenedor propio y la API se eliminaron/detuvieron después de verificar ID inmutable y etiqueta de propiedad. Archivo temporal Docker con secretos eliminado; ningún contenedor, volumen ni secreto ajeno fue utilizado.

## Review y Verify del mismo commit

| Actor / mecanismo | Evidencia y alcance |
|---|---|
| Review independiente `correction_review` | Inspección de objetos Git inmutables de `8308f8c`, sin hallazgos ni advisories; reprodujo contención/canonicalización/fsync/exclusividad y los dos tests Python. No evaluó un diff distinto. |
| Verify independiente `correction_verify` | Mismo commit y árbol; suites completas y PostgreSQL/HTTP reales anteriores. Sin correcciones del producto durante la verificación. |
| Revisión nativa consentida | `review-630abcc44028477f`, lente confiabilidad; **APPROVED sin hallazgos y acknowledged**, `authority: burned`, para el rango `b6a0585..8308f8c`. Target `sha256:e4e677a11fad062aa78621db46db2dda8ff9fb81e8a76b71bff13b19cab6e9d7`; acuse `gentle-ai.review-acknowledged/v1`. No está bloqueada para este candidato. |

No se transfiere esta aprobación a todo H1 ni se recupera autoridad histórica de U5. No hubo cambios en los tres archivos del candidato después de las revisiones; el informe posterior es pasivo.

## Omisiones y auditoría externa

- **Concurrencia omitida en unit/e2e generales:** mismo test gated, ejecutado separadamente con PostgreSQL propio: 1/1.
- **Tres TODOs persistencia con `describe.skip`:** no se declaran ejecutados. Cobertura alternativa observada: identidad/hash privado mediante snapshot y Argon2; email normalizado duplicado mediante rechazo HTTP con uppercase; `active`, `mustChangePassword`, `version` mediante creación/cambio/patch/reset/desactivación reales. Esto no convierte los TODOs en PASS.
- **Navegador responsive/foco/zoom y harness Python real congelado:** NOT RUN en esta corrección; las pruebas de contraste y fake/sidecar no los sustituyen.
- **Auditoría externa y aprobación global de H1:** pendientes de decisión externa. Sin implementación H2 ni autorización de publicación.

Evidencia local saneada no versionada: `odd/checks/h1-correccion-tests/` (focalizados antes/después, diagnóstico/probes, Review, Verify, exit codes y acuse nativo). Temporales propios limpiados tras retenerla. El [informe post-merge anterior](H1-postmerge-validation.md) se conserva como evidencia histórica, no como resultado de esta corrección.

Risk: none (solo expectativas y fixtures de tests; producción, contrato y protecciones sin cambios).
