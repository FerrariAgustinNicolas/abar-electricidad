# H0 — Informe final consolidado para auditoría

> **Estado de entrega: Entregado para auditoría; PARCIAL respecto de verificación visual.** Este documento consolida el candidato técnico final y la evidencia disponible. **No constituye aprobación formal de H0, no lo declara cerrado y no autoriza ni inicia H1.** La auditoría visual de navegador y los criterios responsive/accesibilidad siguen pendientes.

## 1. Dictamen ejecutivo y alcance

El candidato técnico H0 es `4a938727dc5d8181dfb431aea5bf106b381fdd63` (`feat: bootstrap H0 Angular layouts and UI map`), en la rama local `chore/h0-base`. La verificación independiente final de `murdovjr-h-di09` informó ese HEAD y árbol inicial/final limpios; sus verificaciones técnicas listadas abajo finalizaron con exit 0. El trabajo autorizado se limitó a H0.1–H0.4. H1–H8, funciones comerciales y decisiones pendientes P01–P10 permanecen fuera de alcance.

Este informe es documentación únicamente, fuera del commit candidato. Se entregará en un commit documental pasivo separado, posterior a la comprobación de este informe. **No se anticipa ni inventa el hash de ese commit**: luego de que el padre lo cree, se resuelve con `git log -1 --format='%H %s' -- docs/milestones/H0-informe.md`. El candidato técnico no cambia por ese commit documental.

| Frente | Resultado consolidado |
|---|---|
| H0.1 Inventario y versiones | Candidato realizado; manifiestos y lockfiles de frontend/backend separados, pins exactos y evidencia de compatibilidad registrada. |
| H0.2 Entorno local | Backend Nest/Prisma y Angular mínimos, PostgreSQL/Mailpit, conectividad real y smoke frontend↔API verificados. No hay autenticación ni operaciones comerciales. |
| H0.3 Contrato | OpenAPI 3.0.3 y ejemplos validados; solo `GET /health` es operación implementada. Áreas comerciales son proyección, no 51 endpoints. |
| H0.4 Mapa UI | Mapa, rutas, layouts, brechas y criterios documentados; UI H0 mínima probada con jsdom y smoke real. Inspección visual real pendiente. |
| Decisión de cierre | Entrega para auditoría; conservar parcialidad visual y esperar decisión humana. No iniciar H1. |

## 2. Git, procedencia y cambios

- **Raíz Git verificada independientemente:** `/Users/agustin/Repos/personal/abar-electricidad`; remoto `origin` preservado y `main` intacta. El checkout actual se confirmó en `chore/h0-base`, HEAD `4a938727dc5d8181dfb431aea5bf106b381fdd63`. La salida observada al comenzar esta consolidación fue árbol limpio.
- **Incidente inicial, distinguido de la evidencia actual:** el registro de tarea documenta como antecedente informado por el usuario/sesión previa que se resolvió `/Users/agustin` como raíz, se observó inicialización en `main` y falló el registro de worktree con `Session Git identity changed; cannot register a worktree`. No se presenta ese antecedente como estado actual verificado. La raíz ABAR, remoto y checkout actuales se verificaron de forma independiente; se preservaron el repositorio padre y `main`.
- El commit documental inicial en `main`, `b7bca3e1eee63e3c63a436d4eb9eaeeea2100fd2`, incluyó exactamente `.gitignore`, `docs/plan.md` y `docs/milestones/H0-prompt.md`. La rama de trabajo `chore/h0-base` se creó desde él.
- Unidades locales integradas en el candidato: `120499f24cad23d2d557e6096781256958c971fd` (inventario), `1545ab93168b920420e853a695428877ac0c8d88` (backend/servicios), `529388c922244b1bd410411812bae34b3a329dee` (contrato), `0680f130e3b538fc7d851d4fd4ddf1bc38942980` (seguimiento correctivo del validador) y `4a938727dc5d8181dfb431aea5bf106b381fdd63` (frontend/UI y smoke). La revisión final cubrió la slice `529388c..4a93872`, **no toda la rama**.
- `git diff --name-only b7bca3e1eee63e3c63a436d4eb9eaeeea2100fd2..HEAD` enumeró 73 rutas rastreadas modificadas desde el commit documental inicial; la lista íntegra está en el apéndice. La lista es inventario histórico de cambios de H0, no afirma que todos sean cambios sin commit.
- El escaneo independiente histórico examinó 54 blobs históricos y 42 archivos rastreados y no detectó coincidencias con las firmas de secretos comprobadas; `.env` y contenido de entorno sensible se excluyeron del escaneo. Esto no es una prueba exhaustiva ni prueba del candidato actual por sí sola. La instancia del ejemplo fue creada manualmente por el usuario con datos ficticios; no se leyó su contenido con herramientas. `.env` tampoco se leyó. Las rutas `.env` y `backend/.env` se verificaron ignoradas. No hubo acceso a otro proyecto.
- No hay migraciones ni seeds: **NO APLICA EN H0**. El schema Prisma vacío es deliberado; no existe modelo de negocio, autenticación o tablas que justifiquen una migración. No se introdujeron datos de relleno.

### Historial de unidades y revisiones

| Unidad | Commit / evidencia y límite |
|---|---|
| H0.1 inventario | `120499f`; review aprobada/acknowledged, lineage `review-1a644f6fced379e9`, fiabilidad media. El fallo histórico de whitespace del commit se corrigió en unidad posterior; véase §5. |
| H0.2 backend/servicios | `1545ab9`; review aprobada/acknowledged, lineage `review-4f1a84dd1e036080`, fiabilidad media. Advisory no bloqueantes conservados: `R3-health-timeout` (`health.service.ts:10`) y `R3-smtp-error` (`scripts/h0-backend-smoke.mjs:170`). |
| H0.3 contrato | `529388c`; review aprobada/acknowledged, lineage `review-efcf59ee8e7fb568`. |
| Seguimiento validador | `0680f13`; revisión nativa medium, `reviewDue=false`, `under_budget` fue diferida desde la slice anterior; **no** se cuenta como aprobación independiente de esa unidad. Advised `R3-example-failure-overwritten` y `R3-semantic-constraints-dropped` se corrigieron en el seguimiento. |
| Candidato final | Slice `529388c..4a93872`: revisión de alta señal en ruta de autenticación, cuatro lentes en orden riesgo, resiliencia, legibilidad y fiabilidad; todas aprobadas y acknowledgement exacto consumido, lineage `review-ec03c3cff7f99dcf`. Advisory no bloqueantes pendientes: `R3-health-request-unbounded` (`frontend/src/app/core/health/health-api.service.ts:11–18`) y `R4-health-stalled-request` (línea 11). Se mantienen como deuda; no bloquearon ni reabrieron la revisión. No se inventa contenido de findings a partir de IDs. |

Los resultados nativos son evidencia de revisión de transacciones, no permiso de entrega ni aprobación formal de H0. Los commits locales de estas unidades fueron autorizados por el usuario. La consolidación documental es pasiva y posterior.

## 3. Alcance técnico, versiones y decisiones

### Inventario seleccionado

Las versiones indicadas son las seleccionadas y fijadas en los manifiestos/lockfiles del repositorio, no propuestas obsoletas del inventario inicial.

| Componente | Versión fijada/observada |
|---|---|
| Angular framework/compiler/router | `21.2.25`; CLI y `@angular/build` `21.2.24`; TypeScript `5.9.3`; RxJS `7.8.2`; angular-eslint `21.4.0`; ESLint `9.39.5`; typescript-eslint `8.71.0`; Vitest `4.1.11`; jsdom `27.4.0`. |
| NestJS core/common/platform-express/testing | `11.2.7`; CLI `11.0.24`; schematics `11.1.0`; Swagger `11.4.7`. |
| Prisma CLI/client/adapter-pg | `7.10.0`; `pg` `8.23.1`; class-validator `0.14.2`; class-transformer `0.5.1`. |
| Contrato y backend test | Redocly CLI `2.57.0`; AJV `8.18.0`; YAML `2.8.3`; Jest `30.5.2`; ts-jest `29.4.14`; Supertest `7.3.1`. |
| Servicios | PostgreSQL `17.11-bookworm`; Mailpit `v1.31.3`. |
| Host/herramientas | Node `24.18.1`; npm `11.16.0`; Git `2.54.0`; Docker client/engine `29.7.2`; Docker Desktop `4.90.0`; Compose `5.5.1`; Gentle AI en PATH `3.7.0`, assets bundled `4.0.0`; Pi `1.0.0`. |

La decisión H0.1 registra compatibilidad publicada consultada previamente (sin una nueva consulta en esta consolidación): [Angular versions](https://angular.dev/reference/versions), [Angular releases](https://angular.dev/reference/releases), [NestJS v11 migration notes](https://raw.githubusercontent.com/nestjs/docs.nestjs.com/bdefe854568c2f679c45d1d6cea0ac76797a3553/content/migration.md), [Prisma 7 upgrade](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-to-prisma-7), [Prisma system requirements](https://www.prisma.io/docs/orm/reference/system-requirements), [PostgreSQL versioning](https://www.postgresql.org/support/versioning/) y [Mailpit Docker install](https://mailpit.axllent.org/docs/install/docker/). Se registró Angular 21 compatible con Node `^24` y TS `>=5.9 <6`, NestJS 11 con Node `>=20` y Prisma 7 con Node `>=24`/TS `>=5.4`; el host satisface esos mínimos. Los pins de paquetes npm y etiquetas de imágenes se comprobaron antes en metadata de registro como publicados (HTTP 200), que no equivale a matriz de compatibilidad. La fuente específica de compatibilidad Prisma 7/PostgreSQL no estuvo disponible (404); se deja esa limitación, sin inferir garantía.

Decisiones y límites:

- Un repositorio y dos proyectos npm aislados, cada uno con manifiesto y lockfile; no se agregó monorepo.
- El override de Angular `piscina 5.3.2` permaneció en la misma major y se ejercitó. Overrides backend `js-yaml 5.4.2`, `deepmerge-ts 8.0.2` y `mysql2 3.24.5` se probaron en las herramientas ejercitadas; esto no afirma compatibilidad universal de `deepmerge-ts`. La auditoría inicial encontró vulnerabilidades y la final de cada aplicación quedó en cero. Se conservaron avisos de deprecación/no soporte y restricciones de scripts npm, sin eludirlos.
- `GET /health` es operativo, fuera de `/api/v1`, y comprueba `SELECT 1`; Swagger vive en `/api/docs`. La única operación implementada es salud. Las áreas `/api/v1/public`, `/api/v1/auth` y `/api/v1/admin`, los DTO de negocio y convenciones de dinero, inventario, sesión, idempotencia y concurrencia son proyección contractual; no son 51 endpoints ejecutados ni autorización para construirlos.
- Placeholders `/admin/login` y `/admin` son inertes, no autentican ni exponen operaciones o datos privados. No hay catálogo, carrito, checkout, mutación comercial o cobro real. Pago impago no reserva stock; aprobación simulada no equivale a pago ni descuenta; confirmación manual futura es una operación de dominio fuera de H0; apertura de rollos permanece manual.
- README documenta comandos locales reales: frontend Angular en loopback `4200`, backend en loopback `3000`, PostgreSQL `127.0.0.1:5432`, Mailpit SMTP `127.0.0.1:1025` e interfaz/API HTTP `127.0.0.1:8025`; usa `npm ci`, scripts del backend/frontend y smoke locales. `.env.example` contiene valores de ejemplo ficticios y manualmente creados por el usuario, no verificados mediante lectura de archivo ni aptos para producción.
- El registro de horas permanece **PENDIENTE** (P09); no se inventa consumo/saldo. P01–P10 siguen abiertos cuando no se cuenta con resolución aportada.

## 4. Incidentes, fallos históricos y resolución

Se conservan fallos reales en esta cronología; su existencia no contradice el estado actual PASS cuando hay una repetición/corrección posterior identificada.

| Incidente histórico | Evidencia y estado actual |
|---|---|
| Raíz Git/identidad de sesión | Incidente previo registrado como informado por usuario/sesión; fallo de registro de worktree por identidad. Raíz/branch/HEAD ABAR y preservación de `main` fueron verificados después. No se atribuye causa adicional. |
| `managed_assets_outdated` | INSPECT nativo se bloqueó inicialmente. Dry run exacto de bundled Gentle AI 4.0.0 con `--agent pi` terminó exit 0, pero fue una vista resumida (`prepare 1`, `apply 14`, ocho componentes) sin paths/diffs. El usuario aceptó expresamente esa vista. Sync real exacto terminó exit 0 con “no managed sync actions needed / all assets up to date / no files changed”; antes/después el estado ABAR fue igual (` M .gitignore`, `?? docs/decisions/`, diffstat una adición). INSPECT repetido quedó `ready`, managed block desapareció. No se reinstalaron configuraciones/modelos ni se evadió control. |
| Escritura del ejemplo de entorno | La escritura nativa de `.env.example` fue bloqueada por error explícito de política. El usuario lo creó manualmente con valores ficticios derivados de configuración existente y autorizó reanudar. Los tasks de implementación y verificación no abrieron el archivo con herramientas de lectura; Compose autorizado lo consumió. Error original: `Gentle AI safety policy blocked access to sensitive path: .env.example. Ask the user for an explicit safer plan.` |
| Whitespace H0.1 | `git show --format= --check 120499f24cad23d2d557e6096781256958c971fd` falló exit 2 por espacios finales de hard-break Markdown en `docs/decisions/H0-base.md` líneas 3–4. Se corrigió en `1545ab9`; las comprobaciones posteriores informadas pasan. El fallo del commit histórico no se borra. |
| Auditorías iniciales | Backend registró 4 vulnerabilidades iniciales (3 moderadas, 1 alta), y al añadir CLI aparecieron 4 altas más en árbol transitivo; frontend detectó 2 críticas en `piscina <5.3.2`. Se investigaron, se aplicaron pins/overrides acotados y los audits finales de ambas apps reportaron cero. |
| RED de tests y setup | Hubo REDs conductuales intencionales de health, validación, metadata Swagger, Angular UI, argumentos smoke y validador semántico; están descritos en §6. También hubo errores de setup/sintaxis (Angular runner browser, test con SyntaxError, import/env e2e), separados de los REDs de comportamiento y corregidos antes de cierres verdes. No se borraron aserciones para conseguir PASS. |
| Docker indisponible temporalmente | Verificador `murcsh9p-c-1827` observó `desktop-linux`, cliente Docker sin servidor y socket ausente `/Users/agustin/.docker/run/docker.sock`; las operaciones Compose fallaron y TCP `127.0.0.1:5432`/HTTP `127.0.0.1:8025` dieron `ECONNREFUSED`. No se supo por qué desapareció el endpoint. No se diagnosticó como fallo de SQL interno ni se presume reinicio por agentes. |
| Recuperación de Docker | Luego el usuario confirmó funcionamiento y autorizó recuperación no destructiva. `murd1ygm-e-v5rl` reportó Docker disponible y `docker compose ... up -d postgres mailpit` exit 0, servicios healthy, SQL/TCP y Mailpit HTTP/SMTP PASS, volúmenes nombrados preservados. No se ejecutó `down` ni se borraron volúmenes. Las comprobaciones finales de Compose y humo detalladas abajo pasaron. |
| Smoke Angular | El smoke falló dos veces antes de la corrección por PostgreSQL no disponible (backend 503) y no llegó a probar Angular. Después, el diagnóstico aisló que Angular CLI 21.2.24 rechazaba `--no-progress` (`Unknown argument: progress`, exit 1). Se quitó solo ese argumento, se añadió test de regresión y diagnóstico stderr acotado; test y smoke reales posteriores pasaron. |
| H0.3 validador | Live y e2e detectaron inicialmente schema Swagger incompleto (200 sin `additionalProperties:false`, 503 sin schema); se corrigió metadata, sin cambiar runtime ni relajar comparación. El seguimiento del validador detectó ejemplo inválido reportado como válido y falso drift por orden de claves; test de regresión primero tuvo SyntaxError y luego RED conductual 2 fallos/7, corregido y verde 7/7. |

### Comandos exactos de sincronización y preflight

```sh
/Users/agustin/.pi/agent/npm/node_modules/gentle-pi/.gentle-ai/v4.0.0/gentle-ai sync --agent pi --dry-run
/Users/agustin/.pi/agent/npm/node_modules/gentle-pi/.gentle-ai/v4.0.0/gentle-ai sync --agent pi
```

Ambos terminaron con exit 0. El dry-run enumeró `engram, skills, context7, permissions, gga, claude-theme, opencode-gentle-logo, persona`, sin diff detallado. El sync informó que no necesitaba acciones ni cambió archivos. Antes y después se ejecutaron exactamente:

```sh
git -C /Users/agustin/Repos/personal/abar-electricidad status --short
git -C /Users/agustin/Repos/personal/abar-electricidad diff --stat
```

Las salidas fueron idénticas. Se repitió el STATUS mediante la misma llamada de fachada que había devuelto el bloqueo: `gentle_review` con `{"operation":"inspect","untrackedScope":"select","intendedUntracked":["docs/decisions/H0-base.md"]}`. Su resultado pasó de `blocked / managed_assets_outdated` a `ready`; no se reconstruyó ni ejecutó un STATUS de shell alternativo.

## 5. Evidencia de review, verify y entorno

La verificación independiente final `murdovjr-h-di09` se ejecutó contra el candidato exacto `4a938727dc5d8181dfb431aea5bf106b381fdd63`. Informó árbol/índice/HEAD limpios al inicio y al final. Todos los comandos siguientes terminaron exit 0; se conservan los resultados y alcances concretos:

| Comando exacto | Resultado independiente observado |
|---|---|
| `npm --prefix frontend ci` | PASS, instalación reproducible desde lockfile. |
| `npm --prefix frontend run build` | PASS, build Angular. |
| `npm --prefix frontend run lint` | PASS. |
| `npm --prefix frontend test -- --watch=false` | PASS, 6 tests. |
| `npm --prefix frontend audit --json` | PASS, 0 vulnerabilidades. |
| `npm --prefix backend run build` | PASS, generación de cliente Prisma y compilación TypeScript. |
| `npm --prefix backend run lint` | PASS. |
| `npm --prefix backend test -- --runInBand` | PASS, 9 tests. |
| `npm --prefix backend run test:e2e -- --runInBand` | PASS, 5 tests. |
| `npm --prefix backend audit --json` | PASS, 0 vulnerabilidades. |
| `npm --prefix backend run prisma:validate` | PASS, schema vacío válido. |
| `npm --prefix backend run contract:validate` | PASS, OpenAPI 3.0.3 y tres ejemplos externos validados. |
| `node --test scripts/h0-contract-validate.test.mjs scripts/h0-frontend-smoke.test.mjs` | PASS, 8 tests. |
| `npm --prefix backend run contract:validate:live` | PASS, Swagger y health real PostgreSQL 200 / error seguro 503. |
| `node scripts/h0-backend-smoke.mjs` | PASS, salud/DB, health/OpenAPI, Swagger 404/503 seguro y SMTP capturado en Mailpit. |
| `node scripts/h0-frontend-smoke.mjs` | PASS, landing Angular en loopback y proxy health PostgreSQL-backed 200. El puerto observado fue `59415`. |
| `docker compose --env-file .env.example config --quiet` | PASS, exit 0. El archivo no se abrió con herramienta de lectura. |
| `docker compose --env-file .env.example ps` | PASS; PostgreSQL y Mailpit healthy. |
| Verificaciones Git de raíz/HEAD/estado/diff y guardas de archivos rastreados/ignorados | PASS según el verificador: rama/candidato limpios, `main`/`origin` preservados, cuatro rutas de entorno/generadas ignoradas, guardia sobre 75 archivos rastreados y sin estado personal de herramientas. No se infiere que los contenidos sensibles se leyeran. |
| Auditoría histórica de firmas | PASS sin coincidencias en 54 blobs/42 archivos examinados, con contenido de entorno excluido. Es una comprobación histórica, no prueba exhaustiva del candidato actual. |
| `lsof` enfocado a puertos propios `3000`/`59415` | Exit 1 observado sin listeners al finalizar; resultado esperado de cleanup, no falla de smoke. No se afirma una comprobación actual distinta ni procesos persistentes. |

El verificador independiente previo `murd1ygm-e-v5rl` ejecutó también `npm --prefix backend ci` desde lockfile y reportó exit 0 y audit cero, además de build/lint/tests, Prisma, contrato, servicios y smoke backend. En esa ejecución el smoke frontend aún falló; su PASS independiente posterior corresponde al verificador final. El conteo de 797 paquetes pertenece a la verificación anterior `murapcpm-7-1ao6`, no se atribuye a esta recuperación. **El verificador final de `4a93872` no ejecutó backend `npm ci`**, así que no se le atribuye ese comando; su evidencia corresponde a la ejecución independiente previa indicada.

Estado de procesos/servicios: los contenedores PostgreSQL y Mailpit quedaron healthy en `docker compose ps`, con volúmenes preservados. Los scripts de smoke terminan los procesos de aplicación que ellos mismos inician; las aplicaciones no se declaran servidor persistente ejecutándose. La comprobación enfocada de listeners de smoke terminó sin listeners. No se afirma que Compose se haya detenido.

### Evidencia visual y de privacidad

No había navegador real/herramienta de captura disponible. Vitest/jsdom acredita DOM, rutas y estados probados, no layout, pixels, teclado completo, zoom/reflow o contraste visual. Los viewports **360, 768 y 1440 px**, teclado/foco, zoom/reflow y medición real de contraste quedan **PENDIENTE**. Figma solo se refiere mediante documentación previa del plan; no hubo inspección nueva del archivo. Los criterios del mapa no equivalen a conformidad WCAG.

## 6. TDD e historial de fallos técnicos relevantes

| Frente | Evidencia conductual preservada |
|---|---|
| Health backend | RED: dos tests fallaron porque faltaba `SELECT 1` y la API devolvía `starting`/no rechazaba fallo de DB. GREEN: respuesta real healthy/503 segura y 9 unit tests finales. |
| Contrato Swagger | RED: live/e2e encontraron metadata incompleta 200/503. GREEN: metadata corregida, e2e 5/5 y live 200/503. |
| Validador contrato | Fallo de setup: SyntaxError en test nuevo, corregido antes de observar RED de conducta. RED conductual: 2 fallos/7 (ejemplo inválido sobrescrito; drift por orden distinto). GREEN: test 7/7, constraints preservadas y orden canonicalizado. |
| UI Angular | RED: test conductual observó estado accesible de salud ausente. GREEN: suites Angular 6/6. Error previo de runner browser fue setup, no RED conductual. |
| Smoke Angular | Diagnóstico real: CLI rechazaba `--no-progress`. RED: test falló detectando argumento no soportado; GREEN: test 1/1 y smoke completa landing + proxy PostgreSQL-backed 200. Fallos previos por DB inaccesible no habían probado Angular y quedan registrados en §4. |
| Lint/build iniciales | Fallos de regla TS, inclusión de spec en build, orden de env e2e, dependencia validator/transformer y Prisma CLI faltante se corrigieron sin retirar casos; ejecuciones finales listadas en §5 pasaron. |

La presente edición es documental; no tiene un RED conductual significativo. No se atribuyen nuevos comandos o evidencia de implementación a esta consolidación.

## 7. Matriz de aceptación (según el encargo H0)

| # | Criterio | Estado | Justificación |
|---:|---|---|---|
| 1 | Inventario/versiones y preservación de trabajo | **CUMPLE** | Manifiestos/lockfiles, versiones, commits/unidades y estado del repositorio documentados; raíz ABAR y `main` preservadas. |
| 2 | Ambas aplicaciones compilables y arrancables con instrucciones | **CUMPLE** | Build frontend/backend y smoke real de landing/API pasaron; README contiene comandos locales. |
| 3 | PostgreSQL/Mailpit locales, conexión real y loopback | **CUMPLE** | Compose `ps` healthy, `SELECT 1`, TCP/SMTP/HTTP y puertos loopback informados; volúmenes preservados. |
| 4 | `/health` y frontend↔backend según contrato | **CUMPLE** | Live contract 200/503 real y smoke Angular proxy PostgreSQL-backed 200. |
| 5 | OpenAPI y ejemplos coherentes, sin afirmar endpoints comerciales | **CUMPLE** | OpenAPI 3.0.3/ejemplos validados; solo health es operación implementada; proyección comercial señalada. |
| 6 | Mapa UI, brechas y responsive documentados; límites identificados | **PARCIAL** | Mapa y criterios 360/768/1440 están escritos; no hubo navegador ni verificación visual. |
| 7 | Lint y pruebas mínimas reales en ambos frentes | **CUMPLE** | Lint, frontend 6, backend 9/e2e 5 y pruebas de contrato/smoke pasaron. |
| 8 | Sin secretos en Git, navegador o evidencia | **CUMPLE** | Ejemplo manual ficticio; rutas reales ignoradas; no se leyó `.env`/ejemplo. Guardas/escaneo informados con el límite de cobertura indicado, no como prueba absoluta. |
| 9 | Review y verify reales sobre estado entregado | **CUMPLE** | Revisión terminal de la slice y verificación independiente final exacta `4a93872`; advisories no bloqueantes listados. |
| 10 | Informe y detención antes de H1 | **CUMPLE** | Informe consolidado para auditoría; no formaliza aprobación, no autoriza ni ejecuta H1. |

**Conclusión:** el candidato técnico tiene PASS de implementación/verificación para los criterios funcionales indicados; el criterio visual sigue PARCIAL. La autoridad de auditoría/cierre permanece con el usuario. Solicitar la auditoría formal y completar la verificación visual antes de considerar H0 cerrado o pedir autorización para H1.

## 8. Agentes, herramientas y capacidades

- Se usaron los roles configurados de orquestación/exploración, writers acotados, verificadores de solo lectura y revisiones nativas; el detalle de IDs, unidades y resultados se conserva arriba y en el historial H0.1–H0.4. No se reemplazó la arquitectura ni se atribuye acceso/capacidad no disponible.
- Exploración/verificación: los explorers iniciales no siempre tuvieron shell/web; verificación independiente posterior cubrió inventario, compatibilidad publicada, servicios y comandos. `murdovjr-h-di09` es el verificador final del candidato exacto; sus resultados se distinguen de ejecuciones previas.
- Writers implementaron slices secuenciales con superficies delimitadas. La corrección del smoke se limitó al argumento CLI no soportado, test y documentación asignada. No se invocaron agentes adicionales para esta consolidación.
- La interfaz nativa tuvo inicialmente `managed_assets_outdated`; el dry-run resumido y sync sin cambios se detallan en §4. No hubo reinstalación/bypass de configuración global. No se hizo acceso a otros repositorios.
- Capacidades ausentes: navegador visual/Figma no disponibles en la verificación final; por eso no se afirma evidencia visual.

### Inicio local reproducible desde la raíz de ABAR

```sh
docker compose --env-file .env.example up -d postgres mailpit
npm --prefix backend ci
npm --prefix backend run build
node --env-file=.env.example backend/dist/main.js
```

En otra terminal, también desde la raíz:

```sh
npm --prefix frontend ci
npm --prefix frontend start
```

Frontend: `http://127.0.0.1:4200`; API: `http://127.0.0.1:3000/health`; Swagger: `http://127.0.0.1:3000/api/docs`; Mailpit: `http://127.0.0.1:8025`. El ejemplo es exclusivamente local. No se necesita crear ni versionar un `.env` real. Los comandos de inicio son instrucciones para el operador; la evidencia de arranque observada corresponde a los scripts de smoke de §5, que crean y limpian sus propios procesos.

## 9. Próximos pasos y cierre

1. Presentar este informe y el candidato técnico `4a93872` para auditoría del usuario; registrar luego el hash real del commit documental pasivo mediante el comando indicado en §1.
2. Completar revisión visual real a 360/768/1440 px, teclado/foco, zoom/reflow y contraste; corregir y volver a verificar únicamente dentro del alcance autorizado.
3. Mantener P01–P10 y horas sin resolver como pendientes hasta evidencia/decisión correspondiente. Advisories no bloqueantes siguen como deuda a evaluar, sin inferir findings adicionales.
4. Detenerse aquí. **No ejecutar H1**; requiere auditoría de H0 y autorización explícita posterior.

## Apéndice A — Rutas rastreadas modificadas desde el commit inicial

Inventario íntegro de las 73 rutas devueltas por `git diff --name-only b7bca3e1eee63e3c63a436d4eb9eaeeea2100fd2..HEAD`, agrupado para revisión:

**Raíz y configuración**
- `.env.example`
- `.gitignore`
- `README.md`
- `compose.yaml`

**Backend**
- `backend/eslint.config.mjs`
- `backend/jest.config.js`
- `backend/package-lock.json`
- `backend/package.json`
- `backend/prisma.config.ts`
- `backend/prisma/schema.prisma`
- `backend/src/app.module.ts`
- `backend/src/common/api-exception.filter.ts`
- `backend/src/common/base-validation.pipe.ts`
- `backend/src/common/request-id.middleware.ts`
- `backend/src/config/environment.spec.ts`
- `backend/src/config/environment.ts`
- `backend/src/configure-application.ts`
- `backend/src/health/health.controller.ts`
- `backend/src/health/health.module.ts`
- `backend/src/health/health.service.ts`
- `backend/src/main.ts`
- `backend/src/prisma/prisma.module.ts`
- `backend/src/prisma/prisma.service.ts`
- `backend/test/app.e2e-spec.ts`
- `backend/test/health.spec.ts`
- `backend/test/jest-e2e.json`
- `backend/test/validation-pipe.spec.ts`
- `backend/tsconfig.build.json`
- `backend/tsconfig.json`

**Contratos**
- `contracts/examples/CHANGELOG.md`
- `contracts/examples/health-ok.json`
- `contracts/examples/health-unavailable.json`
- `contracts/examples/money-ars.json`
- `contracts/openapi.yaml`
- `contracts/redocly.yaml`

**Documentación**
- `docs/decisions/H0-base.md`
- `docs/decisions/H0-contract.md`
- `docs/figma-map.md`
- `docs/milestones/H0-informe.md`

**Frontend**
- `frontend/angular.json`
- `frontend/eslint.config.js`
- `frontend/package-lock.json`
- `frontend/package.json`
- `frontend/proxy.conf.json`
- `frontend/src/app/app.component.spec.ts`
- `frontend/src/app/app.component.ts`
- `frontend/src/app/app.config.ts`
- `frontend/src/app/app.routes.ts`
- `frontend/src/app/core/health/health-api.service.ts`
- `frontend/src/app/core/health/health-ok.ts`
- `frontend/src/app/features/admin/admin-placeholder-page.component.ts`
- `frontend/src/app/features/auth/auth.routes.ts`
- `frontend/src/app/features/auth/login-placeholder-page.component.ts`
- `frontend/src/app/features/home/home-page.component.ts`
- `frontend/src/app/features/status/status-page.component.ts`
- `frontend/src/app/layouts/admin-layout.component.ts`
- `frontend/src/app/layouts/auth-layout.component.ts`
- `frontend/src/app/layouts/public-layout.component.ts`
- `frontend/src/app/shared/ui/health-status.component.spec.ts`
- `frontend/src/app/shared/ui/health-status.component.ts`
- `frontend/src/app/shared/ui/not-found-page.component.ts`
- `frontend/src/index.html`
- `frontend/src/main.ts`
- `frontend/src/styles.css`
- `frontend/src/styles/tokens.css`
- `frontend/tsconfig.app.json`
- `frontend/tsconfig.json`
- `frontend/tsconfig.spec.json`

**Scripts y soporte**
- `scripts/h0-backend-smoke.mjs`
- `scripts/h0-contract-validate.mjs`
- `scripts/h0-contract-validate.test.mjs`
- `scripts/h0-frontend-smoke.mjs`
- `scripts/h0-frontend-smoke.test.mjs`

No se reportaron archivos rastreados de `odd/`, `.atl/`, `.pi/`, `.codegraph/` ni salida generada de entorno. El ejemplo manual de usuario se incluye como ruta del historial Git, pero su contenido no se leyó con herramientas y no se afirma como credencial productiva.
