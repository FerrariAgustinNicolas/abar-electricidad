# H0 — Informe de avance PARCIAL

**Estado global: PARCIAL.** Se completó la unidad backend/servicios locales de H0.2 y se verificó técnicamente el candidato transversal H0.3, incluida la igualdad semántica live de Swagger para health. H0.4 (mapa/UI), la auditoría/aprobación global de H0 y la revisión final siguen pendientes. No se declara cerrado H0 ni se inicia H1.

## Estado Git y alcance

- Raíz verificada: `/Users/agustin/Repos/personal/abar-electricidad`; rama `chore/h0-base`; estado H0.3 iniciado desde HEAD/base `1545ab93168b920420e853a695428877ac0c8d88`. La observación histórica al inicio de H0.2 fue `120499f24cad23d2d557e6096781256958c971fd` (H0.1). Base inicial H0: `b7bca3e1eee63e3c63a436d4eb9eaeeea2100fd2`.
- El informe y la implementación son cambios locales sin commit. No se cambió de rama ni se ejecutaron acciones remotas.
- El `.env.example` sin seguimiento fue creado por el usuario con valores ficticios confirmados. No se leyó ni modificó con herramientas de archivos. Las operaciones Compose autorizadas lo consumieron. No se leyó `.env`; `git check-ignore .env backend/.env` confirmó que ambas rutas están ignoradas.
- Se mantuvo el alcance backend/servicios: no hay frontend, endpoints comerciales, autenticación, tablas/modelos comerciales, migraciones ni seeds. El esquema Prisma está vacío; el cliente generado explícitamente bajo `backend/src/generated/prisma` sí es código de infraestructura.

### Incidente Git y control nativo previo

La documentación de la tarea registra que una sesión anterior tomó `/Users/agustin` como raíz Git; el usuario confirmó el repositorio independiente de ABAR y la sesión previa observó inicialización en `main`. El registro de worktree falló con `Session Git identity changed; cannot register a worktree`. La raíz, rama y HEAD indicados arriba se verificaron en esta continuación.

Evidencia de sincronización nativa suministrada por el padre, no repetida aquí:

- Dry run exacto: `/Users/agustin/.pi/agent/npm/node_modules/gentle-pi/.gentle-ai/v4.0.0/gentle-ai sync --agent pi --dry-run`; exit 0. Resumen: Agents `pi`; componentes `engram/skills/context7/permissions/gga/claude-theme/opencode-gentle-logo/persona`; `prepare 1`, `apply 14`; sin diff detallado. El usuario autorizó expresamente aplicar esa vista resumida.
- El mismo comando sin `--dry-run` terminó con exit 0: “no managed sync actions needed”, assets al día, ningún archivo cambiado. Antes y después, `git status --short` fue ` M .gitignore` y `?? docs/decisions/`; `git diff --stat` indicó una adición en `.gitignore`.
- La misma fachada INSPECT, seleccionando `docs/decisions/H0-base.md`, volvió a `ready`; `managed_assets_outdated` desapareció. Review H0.1 de fiabilidad media fue aprobado/acknowledged con lineage `review-1a644f6fced379e9`. No se repitió sync ni se invocó el ciclo de review.
- El verificador independiente `mur5p3hr-4-x12j` informó consistencia de alcance PASS y el fallo de `git show --format= --check 120499f24cad23d2d557e6096781256958c971fd`: exit 2 por espacios finales intencionales de hard-break Markdown en `docs/decisions/H0-base.md`, líneas 3–4. No se alteraron los documentos fuente del plan/prompt ni se debilitó el chequeo. Tras autorizarse la superficie, se reescribieron esas tres líneas de cabecera sin espacios finales; `git diff --check` actual pasa. El fallo del commit histórico sigue registrado como evidencia histórica.

## Agentes, herramientas y limitaciones

- En esta continuación trabajó un único writer package-owned; no se invocaron subagentes. El padre conserva revisión y ciclo de vida nativos.
- La tarea H0.1 registra el explorer `mur4tqws-1-kh2z`, el verificador de inventario `mur4v92m-2-tw93` y el writer `mur50u2v-3-ty61`; el verificador más reciente fue `mur5p3hr-4-x12j`. Se conserva la limitación previa del explorer (sin shell/web en su runtime).
- Inventario previo registró Node 24.18.1, npm 11.16.0, Git 2.54.0, Docker 29.7.2, Compose 5.5.1, Gentle AI 3.7.0 y Pi 1.0.0; el verificador también distinguió PATH Gentle AI 3.7.0 de assets bundled 4.0.0. No se cambiaron instalaciones globales ni configuración de agentes.
- No había herramienta de navegador disponible; no se afirma verificación visual. La salida H0.2 no reemplaza el review H0.2 ni la revisión/verify globales del padre.

## Resultado H0.2: backend y servicios

- NestJS 11 modular y mínimo; configuración validada para URL PostgreSQL, entorno, puerto y binding loopback; carga automática de `.env` deshabilitada.
- `GET /health`, fuera de prefijos comerciales, hace un `SELECT 1` real. Responde `200 {"status":"ok"}` solo al conectar. Ante dependencia no disponible, el filtro devuelve `503 {"code":"SERVICE_UNAVAILABLE","message":"Servicio temporalmente no disponible","requestId":"<uuid>"}` sin detalles internos. Se incorporaron request IDs UUID, `ValidationPipe` base y errores HTTP uniformes.
- Swagger en `/api/docs`; verificación HTTP confirmó OpenAPI 3.0.3 compatible y que solo se documenta `/health`.
- Prisma 7.10.0 usa `@prisma/adapter-pg`, `pg` y salida explícita `src/generated/prisma`. La conexión es lazy para que el servidor pueda responder salud degradada cuando PostgreSQL no esté disponible. El schema sin modelos validó y generó cliente; no se inventó modelo/tablas para habilitar generación. La prueba HTTP observó tanto `SELECT 1` real exitoso contra PostgreSQL como el contrato 503 real con un puerto local no disponible.
- Compose fija `postgres:17.11-bookworm` y `axllent/mailpit:v1.31.3`. PostgreSQL y Mailpit tienen healthchecks, puertos publicados exclusivamente en `127.0.0.1` y volúmenes nombrados `postgres_data` y `mailpit_data`. No se eliminaron volúmenes.
- `scripts/h0-backend-smoke.mjs` comprueba health, Swagger/OpenAPI, error 404 seguro y envía un mensaje SMTP únicamente a `@example.test`; verifica su captura mediante Mailpit HTTP. Si inicia el backend compilado, lo detiene al terminar. No realiza envío externo.
- README contiene instrucciones locales solo para backend/servicios. Las credenciales ficticias no son aptas para producción.

### Versiones instaladas y ajustes de dependencias

`npm --prefix backend ls --depth=0` observó los pins instalados siguientes: Nest core/common/platform-express/testing `11.2.7`; CLI `11.0.24`; schematics `11.1.0`; Swagger `11.4.7`; Prisma CLI/client/adapter-pg `7.10.0`; `pg 8.23.1`; TypeScript `5.9.3`; Jest `30.5.2`; ts-jest `29.4.14`; Supertest `7.3.1`; ESLint `9.39.5`; typescript-eslint parser/plugin `8.71.0`; reflect-metadata `0.2.2`; RxJS `7.8.2`.

Se añadieron pins compatibles requeridos por la base: `@nestjs/config 4.0.4`, `class-validator 0.14.2`, `class-transformer 0.5.1`, `@types/express 5.0.3`, `@types/node 24.0.10`, `@types/jest 30.0.0`, `@types/supertest 7.2.1` y `@eslint/js 9.39.5`. `@nestjs/config` difiere del 4.0.2 propuesto inicialmente, actualizado dentro de la misma major para corregir la auditoría.

La auditoría inicial encontró 4 vulnerabilidades: 3 moderadas y 1 alta (`@nestjs/config`/lodash y Swagger/js-yaml); al añadir Prisma CLI se revelaron 4 altas (`deepmerge-ts` y `mysql2` además de sus paquetes padres). Se fijó `@nestjs/config 4.0.4` y se aplicaron overrides compatibles en la resolución probada: `js-yaml 5.4.2` bajo Swagger, `deepmerge-ts 8.0.2` y `mysql2 3.24.5` bajo Prisma. Sin `audit fix --force` ni cambio de major de los paquetes seleccionados. La auditoría final observó cero vulnerabilidades. npm aún advierte que ESLint 9.39.5 está deprecado/no soportado y que algunos scripts de instalación de dependencias están restringidos; `npm ci`, generación, build y pruebas sí funcionaron.

## Evidencia TDD

- **RED:** antes de implementar salud, `npm --prefix backend test -- --runInBand` falló las dos pruebas de salud: faltaba `SELECT 1` y la API devolvía `starting`/no rechazaba al fallar la base.
- **GREEN:** tras implementación/generación, las pruebas unitarias pasaron; ver resultado final de 9 tests en la tabla.
- **TRIANGULATE:** casos de configuración inválida, PostgreSQL indisponible (incluido HTTP real 503), requestId/error 404 seguros, datos DTO válidos/inválidos y rutas Swagger/OpenAPI.
- Scaffold, pins y texto documental no tenían un RED conductual previo significativo; se validaron con instalación, generación, lint/build y Compose.

## Verificación observada

Los comandos con errores iniciales se diagnosticaron y luego volvieron a ejecutarse con resultado final PASS. Se preservan los fallos iniciales abajo en vez de ocultarlos.

| Comando exacto | Resultado observado |
|---|---|
| `npm --prefix backend install` | exit 0; instalación inicial de 669 paquetes. En ese estado npm reportó 4 vulnerabilidades; ver corrección y auditoría final arriba. |
| `npm --prefix backend ci` | exit 0; 797 paquetes añadidos, auditoría 0 vulnerabilidades. Avisos de scripts de instalación restringidos; no bloquearon la generación/build. |
| `npm --prefix backend run lint` | PASS, exit 0 final. El primer lint falló por la regla base `no-unused-vars` sobre propiedades de constructor; se configuró el plugin TS y volvió a pasar. |
| `npm --prefix backend run build` | PASS, exit 0 final; Prisma generó cliente y TypeScript compiló. El primer build incluyó por error un spec bajo `src`; se excluyeron specs del build de producción, manteniéndolos dentro del runner Jest. |
| `npm --prefix backend test -- --runInBand` | PASS, exit 0 final: 3 suites, 9 tests. RED inicial observado: 2 fallos conductuales (respuesta `starting` y ausencia de error al fallar DB). Un test de transformación también falló hasta declarar conversión explícita con `class-transformer`; el caso negativo permanece probado. |
| `npm --prefix backend run test:e2e -- --runInBand` | PASS, exit 0 final: 1 suite, 4 tests HTTP. Dos ejecuciones previas fallaron primero por establecer env después de importar el módulo y luego por faltar class-validator; se corrigió el orden, se fijaron ambas dependencias de validación y pasó sin eliminar aserciones. |
| `npm --prefix backend run prisma:validate` | PASS, exit 0; schema vacío válido. Un intento previo, antes de añadir el CLI local, terminó exit 127 (`prisma: command not found`); se añadió Prisma CLI local `7.10.0`. |
| `npm --prefix backend run prisma:generate` | PASS, exit 0; cliente Prisma `7.10.0` generado en `backend/src/generated/prisma` con schema sin modelos. El intento previo al pin del CLI local terminó exit 127. |
| `npm --prefix backend ls --depth=0` | PASS, exit 0; pins instalados coinciden con la lista anterior, incluidos validator/transformer. |
| `npm --prefix backend audit --json` | PASS, exit 0; 0 info/low/moderate/high/critical vulnerabilidades al finalizar. |
| `docker compose --env-file .env.example config --quiet` | PASS, exit 0; Compose resuelve configuración. Se usó como operación autorizada; el archivo no fue abierto con herramientas de lectura. |
| `docker compose --env-file .env.example up -d` | PASS, exit 0. Descargó las imágenes fijadas, creó volúmenes nombrados; al incorporar persistencia Mailpit recreó solo el contenedor Mailpit creado durante esta tarea, sin eliminar volúmenes. |
| `docker compose --env-file .env.example ps` | PASS, exit 0; PostgreSQL y Mailpit `healthy`, puertos publicados en `127.0.0.1` (`5432`, `1025`, `8025`). |
| `node --check scripts/h0-backend-smoke.mjs` | PASS, exit 0. |
| `node scripts/h0-backend-smoke.mjs` | PASS, exit 0: `SELECT 1` real con PostgreSQL disponible, Swagger/OpenAPI 3.0.3, 404 seguro, SMTP ficticio capturado por Mailpit y HTTP 503 real con PostgreSQL local no disponible, manteniendo el error seguro/UUID. El script detuvo sus procesos backend al acabar. |
| `git diff --check` | PASS, exit 0 para cambios rastreados actuales. |
| `if grep -nE '[[:blank:]]+$' README.md scripts/h0-backend-smoke.mjs docs/milestones/H0-informe.md docs/decisions/H0-base.md compose.yaml; then exit 1; else test $? -eq 1; fi` | PASS, exit 0; sin espacios finales en los documentos/scripts/Compose revisados. Los tests y lint cubren el código backend nuevo. |
| `git check-ignore .env backend/.env` | PASS; ambas rutas ignoradas. No se abrió ninguna. |
| `lsof -nP -iTCP:3000 -iTCP:5432 -iTCP:1025 -iTCP:8025 -sTCP:LISTEN` | Tras smoke solo Docker escucha en loopback `5432`, `1025`, `8025`; no quedó proceso backend escuchando en `3000`. El comando devuelve exit 1 cuando no encuentra una de las cuatro coincidencias, comportamiento normal de `lsof`. |

**Estado al entregar:** Compose queda en ejecución con PostgreSQL y Mailpit saludables; volúmenes locales intactos. No se detuvieron servicios Compose ni se ejecutó `down`. El servidor backend hijo del smoke se detuvo.

## Avance H0 y pendientes

| Frente | Estado | Evidencia / límite |
|---|---|---|
| H0.1 inventario/versiones | Hecho previamente | Documento y commit `120499f`; review H0.1 aprobada según lineage informado. El fallo histórico whitespace se documenta arriba y el arreglo actual pasa `git diff --check`. |
| H0.2 backend/servicios | Hecho para esta unidad | Tests, build, Prisma, Compose, conexión PostgreSQL, HTTP/OpenAPI y recepción SMTP. Review con lineage `review-4f1a84dd1e036080` aprobada/acknowledged; autoridad consumida. Advisories no bloqueantes R3-health-timeout (`health.service.ts:10`) y R3-smtp-error (`scripts/h0-backend-smoke.mjs:170`); no se infiere texto de findings más allá de sus identificadores/ubicaciones. Commit `1545ab93168b920420e853a695428877ac0c8d88`. |
| H0.3 contrato transversal | Implementado y verificado técnicamente; candidato pendiente de auditoría | Contrato, tres ejemplos, decisión, changelog, validador y metadata Swagger de health coinciden semánticamente. Validación documental, negativa, e2e y live pasan; no representa aprobación comercial ni cierre global. |
| H0.4 mapa UI/frontend | Pendiente | No hay frontend ni verificación visual; el worker no afirma haber inspeccionado Figma. |
| Verify/review global | Pendiente | No se inició review nativa de este candidato ni revisión de H0 completo. |

## H0.3 — Evidencia de esta continuación

El trabajo partió de `chore/h0-base` en `1545ab93168b920420e853a695428877ac0c8d88`; el árbol estaba limpio. No se cambió rama, no se hicieron commits ni operaciones remotas, y no se tocó backend runtime, `.env`, `.env.example`, infraestructura ni configuración global. La dependencia backend aprobada se preservó. No se afirma que los pendientes P01–P10 estén resueltos.

Archivos de H0.3:

- `contracts/openapi.yaml`: OpenAPI 3.0.3 candidata; la única operación es GET `/health`. Proyecta, no implementa, las áreas `/api/v1/public`, `/api/v1/auth` y `/api/v1/admin`; componentes comerciales marcan su carácter candidato. Incluye dinero ARS en cadena minor-unit, unidades/cantidades/longitudes, IDs/fechas, paginación, enums separados, errores, cookie administrativa/CSRF, idempotencia y expectedVersion. Documenta explícitamente ausencia de reserva en pedido impago/aprobación simulada, débito único solo en confirmación manual atómica, apertura manual de rollos y rollout cerrado hasta autorización.
- `contracts/examples/{health-ok,health-unavailable,money-ars}.json` y `contracts/examples/CHANGELOG.md`: fixtures ficticios y saneados.
- `contracts/redocly.yaml`: permite solo avisos conocidos por licencia, localhost de desarrollo, 4xx ausente en health y componentes intencionalmente proyectados/no usados; OpenAPI errors siguen siendo bloqueantes.
- `scripts/h0-contract-validate.mjs` y `.test.mjs`: Redocly 2.57.0 + AJV/YAML validan el documento, JSON externo, estructuras negativas y comparación semántica Swagger. La opción `--live` inicia backend únicamente con env ficticio explícito, comprueba HTTP health real y detiene solo sus procesos.
- `backend/package.json` / `backend/package-lock.json`: `contract:validate`, `contract:validate:live`; pins de desarrollo `@redocly/cli 2.57.0`, `ajv 8.18.0`, `yaml 2.8.3`.
- `backend/src/health/health.controller.ts`: solo documentación Swagger; `HealthOk` y `ApiError` incluyen `additionalProperties: false`, campos obligatorios y constraints normativos, con `fieldErrors` opcional y cerrado. Sin cambio de lógica, ruta ni comportamiento.
- `backend/test/app.e2e-spec.ts`: assertion HTTP de igualdad del schema Swagger completo para 200 y 503.
- `docs/decisions/H0-contract.md`, `README.md`, este informe: límites/proyección, uso y evidencia.

### TDD y verificación

- **RED:** En la continuación, `npm --prefix backend run test:e2e -- --runInBand` falló primero en la nueva assertion de schema: Swagger carecía de `additionalProperties: false` en health 200 (503 tampoco tenía schema). La ejecución previa de `npm --prefix backend run contract:validate:live` también había fallado exit 1 por ambas diferencias.
- **GREEN:** tras corregir exclusivamente los metadatos Swagger, la e2e pasó 5/5 y `npm --prefix backend run contract:validate:live` verificó Swagger, HTTP 200 PostgreSQL-backed y error HTTP 503 seguro; ambos procesos iniciados fueron detenidos.
- **TRIANGULATE:** `node --test scripts/h0-contract-validate.test.mjs` pasó 5/5 e incluye negativos que vuelven a detectar `additionalProperties` ausente en health 200 y schema ausente en 503. También rechaza amountMinor numérico, unidad no permitida, cantidad cero, ApiError con UUID inválido/campo extra y contrato ausente/inválido. Los JSON positivos se validan con AJV.

| Comando exacto | Resultado observado |
|---|---|
| `npm --prefix backend install --save-dev @redocly/cli@2.57.0 ajv@8.17.1 yaml@2.8.1` | exit 0; audit inicial halló 2 moderadas directas en Ajv/YAML, por eso se fijaron versiones corregidas antes de cerrar. |
| `npm --prefix backend install --save-dev ajv@8.18.0 yaml@2.8.3` | exit 0; auditoría incluida observó 0 vulnerabilidades. |
| `npm --prefix backend install --save-dev --save-exact @redocly/cli@2.57.0 ajv@8.18.0 yaml@2.8.3` | exit 0; fijó versiones exactas en `package.json`; auditoría incluida observó 0 vulnerabilidades. |
| `npm --prefix backend ci` | exit 0, 799 paquetes; 0 vulnerabilidades. Se mantienen avisos npm de paquetes/scripts de instalación restringidos y deprecación `glob`/ESLint heredados. |
| `npm --prefix backend run contract:validate` | PASS; Redocly acepta el OAS 3.0.3 y AJV valida los tres ejemplos JSON externos. |
| `node --test scripts/h0-contract-validate.test.mjs` | PASS: 5 tests, 0 fallos. |
| `npm --prefix backend run contract:validate:live` (intento previo) | FAIL, exit 1: HTTP 200/503 runtime se confirmó, pero Swagger 200 omitía `additionalProperties: false` y Swagger 503 no tenía schema. |
| `npm --prefix backend run test:e2e -- --runInBand` (antes de metadata) | RED, exit 1: la nueva assertion detectó la ausencia de `additionalProperties: false` en schema 200; el schema 503 tampoco estaba documentado. |
| `npm --prefix backend run test:e2e -- --runInBand` (tras metadata) | PASS: 1 suite, 5 tests; incluye schema Swagger health 200/503 exacto. |
| `npm --prefix backend run contract:validate:live` (tras metadata) | PASS: Swagger semánticamente coincide con OpenAPI; PostgreSQL-backed 200 y error safe 503 pasan. Validator detuvo exclusivamente sus dos procesos backend. |
| `npm --prefix backend run build` | PASS; cliente Prisma 7.10.0 generado y TypeScript compilado. |
| `npm --prefix backend run lint` | PASS, exit 0. |
| `npm --prefix backend test -- --runInBand` | PASS: 3 suites, 9 tests. |
| `npm --prefix backend audit --json` | PASS, exit 0; 0 vulnerabilidades tras subir Ajv/YAML. El primer audit de pins previos falló con 2 moderadas y se corrigió, no se ocultó. |
| `git diff --check` | PASS, exit 0; cambios rastreados sin whitespace inválido. |
| `if grep -nE '[[:blank:]]+$' README.md backend/package.json backend/package-lock.json backend/src/health/health.controller.ts backend/test/app.e2e-spec.ts docs/milestones/H0-informe.md contracts/openapi.yaml contracts/redocly.yaml contracts/examples/health-ok.json contracts/examples/health-unavailable.json contracts/examples/money-ars.json contracts/examples/CHANGELOG.md docs/decisions/H0-contract.md scripts/h0-contract-validate.mjs scripts/h0-contract-validate.test.mjs; then exit 1; else test $? -eq 1; fi` | PASS, exit 0; todos los archivos rastreados/añadidos modificados en esta continuación sin espacios finales. |

La primera comparación live falló ante la brecha metadata-only; la corrección autorizada quedó verificada con equality semántica, sin relajar el contrato ni el comparador. Este handoff global sigue **PARCIAL** por H0.4 y auditoría/revisión global pendientes; no se declara H0 cerrado ni se habilita H1.

## H0.3 validator correctness follow-up — separate work unit

Este seguimiento partió de `chore/h0-base` en el commit ya integrado `529388c922244b1bd410411812bae34b3a329dee`, con árbol limpio. La review nativa de ese commit está aprobada/acknowledged y consumida bajo lineage `review-efcf59ee8e7fb568`; no hay ruta de corrección ni se reabre esa review. Advisory IDs no bloqueantes, sin inferir contenido no provisto: `R3-example-failure-overwritten` en `scripts/h0-contract-validate.mjs:114-138` y `R3-semantic-constraints-dropped` en `scripts/h0-contract-validate.mjs:138-152`.

Cambios de este seguimiento, sin dependencias ni comportamiento backend:

- `validateContractFile` ahora devuelve `valid`/`errors` derivados del resultado de ejemplos; proyecta solo metadatos permitidos y no deja que `shape.valid` sobrescriba un fallo externo.
- La opción CLI `--contract <file>` permite validar una fixture temporal aislada y comprobar código de salida no cero sin tocar los ejemplos reales.
- La comparación de schemas incluye constraints de longitudes, arrays, composición, `nullable` y demás restricciones OAS pertinentes. Canonicaliza claves de objetos y conjuntos `required`/`enum`, así como ramas de composición, para evitar diferencias causadas solo por orden.
- El test copia únicamente el OpenAPI, configuración Redocly y JSON normativos actuales a su directorio temporal bajo `scripts/`; muta allí `amountMinor` a número y limpia ese directorio al terminar.

### RED/GREEN y verificación

- **RED de prueba de regresión:** la primera ejecución de `node --test scripts/h0-contract-validate.test.mjs` terminó exit 1 por `SyntaxError` en la prueba recién escrita; se corrigió antes de considerar evidencia conductual.
- **RED conductual:** la ejecución válida terminó exit 1 con 5 pases/2 fallos: el ejemplo Money inválido devolvía `valid: true`, y un schema lógicamente equivalente con distinto orden daba falso drift.
- **GREEN:** `node --test scripts/h0-contract-validate.test.mjs` pasó 7/7 tras preservar la invalidez del ejemplo, implementar canonicalización y habilitar la CLI sobre la fixture.

| Comando exacto | Resultado observado |
|---|---|
| `node --test scripts/h0-contract-validate.test.mjs` (RED conductual) | exit 1; detectó los dos defectos descritos, 5 tests pasaron y 2 fallaron. |
| `node --test scripts/h0-contract-validate.test.mjs` (GREEN) | exit 0; 7 tests pasaron, incluyendo CLI exit 1 ante JSON Money inválido, detección de constraints perdidas y equivalencia con orden distinto. |
| `npm --prefix backend run contract:validate` | exit 0; contrato y tres ejemplos normales válidos. |
| `npm --prefix backend run contract:validate:live` | exit 0; Swagger, health PostgreSQL 200 y error safe 503 verificados; script detuvo únicamente sus procesos backend. |
| `git diff --check` | PASS, exit 0 después de esta edición de informe. |

La review de `529388c...` no fue alterada ni reabierta. Esta unidad no hizo commit ni alteró servicios/Compose, archivos de entorno o dependencias. H0 y H0.3 siguen sujetos a la auditoría/global verification descrita en este informe.

## Integridad del candidato y verificación previa suministrada

El padre informó que H0.2 fue aprobado/acknowledged bajo lineage `review-4f1a84dd1e036080` y que su autoridad quedó consumida. Independiente verifier `murapcpm-7-1ao6` reprodujo `npm ci` (797 paquetes), backend tests/build/lint/audit 0, Prisma y pruebas reales de PostgreSQL/SMTP. Advisories no bloqueantes conservados: `R3-health-timeout` en `health.service.ts:10` y `R3-smtp-error` en `scripts/h0-backend-smoke.mjs:170`; el proveedor dio solo IDs/ubicaciones y no se inventa el texto de findings. El override transitive deepmerge 7.1.5→8.0.2 fue probado en el CLI ejercitado, sin afirmar compatibilidad universal; advertencias de deprecación siguen como deuda.

El padre informó también que la transición del índice fue su `git add` selectivo explícito, no mutación del worker; el candidato congelado `ccc9a3679269408305be0bf04eb678ed3b43cec2` tuvo el mismo árbol que el commit. En ese momento `git diff --cached --check` pasó y `git diff --exit-code` fue limpio. H0.1 whitespace inicial se corrigió en `1545ab9`; la evidencia previa reporta que el commit previo `1545ab9` está en la rama objetivo. Esta continuación no realizó staging ni commit.

Las horas consumidas siguen sin evidencia y quedan pendientes. No se inventa saldo frente a las 200 horas del plan. H0.3 está en el commit padre `529388c922244b1bd410411812bae34b3a329dee`; este seguimiento queda sin commit. H0.4, verificación global y cierre siguen pendientes; H1 permanece detenido hasta auditoría/autorización explícita.
