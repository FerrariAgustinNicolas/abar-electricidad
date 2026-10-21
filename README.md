# ABAR Electricidad

## Backend y servicios locales (H1–H3 integrados y H4 local)

Esta sección describe la base local del backend y sus dependencias: NestJS, PostgreSQL y Mailpit. El frontend Angular se documenta más abajo. H1 mantiene autenticación por sesión y administración de usuarios; H2 integra catálogo, presentaciones, galería y stock auditado; H3 integra carrito y presupuesto autoritativo desde la base aprobada `d08adc1`. H4 agrega checkout de invitado y simulación académica en su rama local, pendiente de auditoría externa. El entorno es para desarrollo local; no es una configuración de producción.

### H2 integrado: catálogo y stock

OpenAPI candidato **0.5.0** se congeló antes del desarrollo paralelo. Home,
`/productos`, `/productos/:slug`, `/admin/productos`, `/admin/categorias` y
`/admin/stock` consumen la API real. UNIT/METER/ROLL usan precios y saldos
independientes; la apertura manual auditada convierte rollos cerrados en metros.
H2 no incluye carrito, checkout, pedidos, pagos ni reservas. H3 extiende esa base como se detalla abajo.

Consultar [informe H2](docs/milestones/H2-informe.md), [contrato y límites](docs/decisions/H2-contract.md)
y [prompt revisado](docs/milestones/H2-prompt.md). Las pruebas y revisiones por
unidad no equivalen a aprobación global ni productiva. Validación estática:
`npm --prefix backend run contract:validate`; tests:
`node --test scripts/h0-contract-validate.test.mjs scripts/h2-contract.test.mjs`.
El runner LIVE histórico usa un target fijo: no ejecutarlo contra una base
existente suponiendo que es un fixture descartable.

### H3 integrado: carrito y presupuesto autoritativo

Contrato aditivo **0.6.0**: `/carrito` conserva únicamente IDs de presentación y
cantidades enteras en almacenamiento local versionado. El detalle agrega la
presentación vendible seleccionada; metros y rollos permanecen independientes.
El resumen consume `GET /api/v1/public/settings`,
`GET /api/v1/public/payment-methods?deliveryMode=PICKUP` y
`POST /api/v1/public/checkout/quotes`. El servidor lee precios/visibilidad/saldo de
H2, calcula importes ARS exactos y persiste un snapshot con vigencia técnica.
La tarifa inicial de entrega es $0 **de demostración**, configurable en backend;
retiro no cobra esa tarifa. Los métodos `DEMO_*` son ficticios, no instrucciones
bancarias ni servicios de cobro. P05 continúa pendiente para operación real.

Presupuestar **no garantiza disponibilidad futura ni crea pedido, pago o reserva**.
No modifica saldos/movimientos ni abre rollos. La aceptación explícita del nuevo
resumen no crea pedidos; H4 revalida al registrar el pedido. La recarga requiere presupuesto y
aceptación nuevos, sin borrar el carrito, salvo la reconciliación de una solicitud cuyo
resultado sea desconocido (ver H4).

Consultar [contrato H3](docs/decisions/H3-quote.md),
[alcance autorizado](docs/milestones/H3-prompt.md) e
[informe del candidato](docs/milestones/H3-informe.md). Las migraciones históricas
H1/H2 se conservan; la migración H3 es aditiva y no habilita administración H6.
Verificaciones reproducibles del contrato:

```sh
node --test scripts/h0-contract-validate.test.mjs scripts/h2-contract.test.mjs scripts/h3-contract.test.mjs
npm --prefix backend run contract:validate
```

### H4 local: checkout y pedidos de demostración

Contrato aditivo **0.7.0**, [decisión H4](docs/decisions/H4-orders-payments.md) y
[alcance autorizado](docs/milestones/H4-prompt.md). La evidencia y las limitaciones,
no una aprobación automática, se registran en [informe H4](docs/milestones/H4-informe.md).

`/carrito` → aceptación explícita del presupuesto → `/checkout` →
`/pedido/:id/resultado`. `/consultar-pedido` ofrece solo estado mínimo mediante
número y contacto coincidente; no recupera la credencial privada. El comprador
incluye nombre, apellido, correo y teléfono; la entrega coordinada requiere
dirección y localidad. Las condiciones mostradas son provisionales, académicas
y versionadas, no términos legales aprobados por ABAR.

Un pedido no tiene vencimiento comercial automático ni edición de renglones.
El presupuesto y la credencial tienen vigencias técnicas independientes.
**Crear, simular o reintentar no reserva ni descuenta existencias.**
APPROVED corresponde al intento demo: el pago comercial permanece PENDING y el
pedido RECEIVED. REJECTED conserva el pedido y permite otro intento. No hay H5,
confirmación manual, datos bancarios/tarjetas ni correo enviado; las notificaciones
se registran como trabajos pendientes. `requestedUnpaidQuantity` es demanda
informativa por presentación en stock administrativo, nunca disponibilidad neta.

#### Configuración privada local

La creación y los replays requieren `H4_REPLAY_KEY_BASE64`: 32 bytes aleatorios,
codificados en base64, aportados por entorno privado al proceso backend. No
versionar el valor ni imprimirlo. Conservar la misma clave para reemitir respuestas
históricas; regenerarla por arranque rompe la reconciliación. No se incluyó una
clave operativa de ejemplo ni una rotación automática.

`H4_DEMO_SIMULATION_ENABLED=true` habilita escenarios exclusivamente del lado
servidor; el frontend no puede activarlos. `H4_ACCESS_TTL_SECONDS` controla solo
acceso temporal (por defecto 86400; límites técnicos 60–604800). Sin clave válida,
las operaciones que necesitan replay fallan de forma cerrada con 503. El destino
administrativo de notificaciones pendientes es ficticio/configurado; no se usa SMTP.

La misma intención conserva request y `Idempotency-Key` después de un timeout.
En esa pantalla puede reconciliarse incluso si venció posteriormente el presupuesto.
Al recargar tras un resultado desconocido se conserva solo un marcador no sensible
y se impide crear silenciosamente otra intención. La consulta mínima no restaura
el formulario ni la credencial; esa limitación debe distinguirse de recuperación
completa. El carrito se vacía únicamente después de constatar un 201 de creación
(o replay). No se guardan datos personales en el almacenamiento del carrito;
la credencial temporal usa únicamente memoria o sessionStorage y viaja por header,
nunca por URL.

#### Verificación

```sh
node --test scripts/*contract*.test.mjs
npm --prefix backend run contract:validate
npm --prefix backend run prisma:validate
npm --prefix backend run build
npm --prefix frontend test -- --watch=false
npm --prefix frontend run lint
npm --prefix frontend run build
```

`node backend/scripts/h4-orders-postgres.mjs` exige cuatro variables privadas:
`H4_ORDERS_CLEAN_DATABASE_URL`, `H4_ORDERS_UPGRADE_DATABASE_URL`,
`H4_ORDERS_CONTAINER_ID` y `H4_ORDERS_OWNER`. **No usa DATABASE_URL como fallback.**
Se deben proporcionar bases nuevas `h4_orders` y `h4_orders_upgrade`, usuario
`h4_orders`, en un contenedor propio `postgres:17.11-bookworm`, con las etiquetas
`com.abar.h4-orders-owner=<UUID>` y `com.abar.h4-orders-purpose=integration`,
PostgreSQL en tmpfs, sin volúmenes ni binds y puerto únicamente loopback. Verifica
estas condiciones antes de aplicar migraciones. No ejecutarlo contra un fixture
usado ni limpiar una base existente para satisfacer el guard. La prueba H3 histórica
mantiene su corte de migraciones; H4 verifica por separado el upgrade desde ese corte.

### Requisitos

- Node.js 24.x y npm 11.x.
- Docker con Docker Compose.

### PostgreSQL y Mailpit

Desde la raíz del repositorio:

```sh
docker compose --env-file .env.example config --quiet
docker compose --env-file .env.example up -d
docker compose --env-file .env.example ps
```

El ejemplo contiene credenciales ficticias y exclusivas para desarrollo local. PostgreSQL está publicado en `127.0.0.1:5432`; el SMTP de Mailpit en `127.0.0.1:1025`; su interfaz/API HTTP en `127.0.0.1:8025`. Compose conserva PostgreSQL en `postgres_data` y los mensajes capturados en Mailpit en `mailpit_data`. Para detener los contenedores sin eliminar los volúmenes:

```sh
docker compose --env-file .env.example stop
```

No uses estas credenciales ni este Compose en una red compartida o productiva.

### Instalar, validar y ejecutar el backend

```sh
npm --prefix backend ci
npm --prefix backend run prisma:validate
npm --prefix backend run prisma:generate
npm --prefix backend run build
npm --prefix backend run lint
npm --prefix backend test -- --runInBand
npm --prefix backend run test:e2e -- --runInBand
```

### Prisma: configuración explícita sin datasource (C08)

Los scripts públicos `prisma:generate`, `prisma:validate` y `build` seleccionan
`backend/prisma.schema.config.ts` explícitamente. Esa configuración solo indica
`prisma/schema.prisma`: no lee `DATABASE_URL`, no carga dotenv ni aporta datasource.
El build conserva el orden generate → TypeScript → empaquetado autenticado de recursos.

Desde `backend`, el equivalente directo es:

```sh
./node_modules/.bin/prisma generate --config prisma.schema.config.ts
./node_modules/.bin/prisma validate --config prisma.schema.config.ts
```

La configuración descubierta por defecto (`prisma.config.ts`) rechaza siempre con
un mensaje fijo seguro. Los comandos Prisma sin selección explícita, incluidos
`generate`, `validate` y `migrate status`, quedan denegados intencionalmente: nunca
seleccionan por accidente la conexión de la aplicación ni un fallback local.
Esto **no es autorización absoluta**: un operador puede elegir deliberadamente
otra configuración con `--config` o un target con `--url` donde Prisma lo admita.
Tampoco habilita `generate --sql`, que requiere datasource.

La configuración schema-only no migra ni provisiona recursos. Para migraciones, usá una configuración explícita revisada que apunte únicamente a una base nueva y descartable; nunca elimines el guard de `prisma.config.ts`. El harness H1 implementa sus propias verificaciones de propiedad y limpieza. Los pendientes históricos de C08 no describen el código integrado actual.

El esquema Prisma contiene `AdminUser`, `AuthSession`, `AuthPreAuthContext` y `AdminUserAudit`, con tres migraciones H1. H2 agrega siete modelos comerciales/auditables y una cuarta migración aditiva. No hay seed automático al iniciar la aplicación. El cliente generado se escribe explícitamente en `backend/src/generated/prisma`; vuelve a generarlo con el script de Prisma al instalar o actualizar dependencias. La configuración de Nest no carga archivos `.env`; define la conexión local explícitamente al iniciar:

```sh
DATABASE_URL='postgresql://abar_local:abar_local_demo_only@127.0.0.1:5432/abar_local?schema=public' npm --prefix backend run start:dev
```

La API escucha solo en `127.0.0.1:3000`. `GET /health` ejecuta `SELECT 1` antes de responder `200 {"status":"ok"}`. Si PostgreSQL no está disponible, devuelve `503` con un error seguro y un `requestId` UUID. Swagger está en `/api/docs` y `/api/docs-json`; OpenAPI 3.0.3 conserva health y nueve operaciones H1 y agrega las 21 operaciones H2. Para iniciar H1, además de `DATABASE_URL`, exportá una `AUTH_CSRF_ENCRYPTION_KEY` aleatoria de 32 bytes en base64url (por ejemplo, generada con `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`); mantenela privada y estable durante la sesión local. No la versiones. Desarrollo admite HTTP únicamente en loopback; producción requiere Secure y orígenes HTTPS explícitos.

Con PostgreSQL y Mailpit en ejecución, verifica conexión real, OpenAPI, errores seguros, el 503 al probar una base local no disponible y captura SMTP local:

```sh
node scripts/h0-backend-smoke.mjs
```

El script usa una API local ya disponible o inicia el backend compilado con configuración ficticia explícita de loopback y luego detiene únicamente el proceso que inició. Envía correo solo a `@example.test` y comprueba su captura en Mailpit; no hay envío externo. Compose puede quedar ejecutándose y el volumen nombrado permanece intacto al usar `stop`.

## H1 integrado: contrato y verificaciones

`main` integró H1 en `18c39e9b86b7b7bf45263fe5bad4fe77125a6386`. La base aprobada para H2 es `5c0e0fc200c1c22eaa2731298eb7e8bf968a8466`, con H1 y su cierre correctivo integrados. `contracts/openapi.yaml` es ahora 0.6.0 candidata (extensión H3); conserva las nueve operaciones auth/admin más health y añade H2, sin promesa productiva. P01–P10 y las reglas comerciales siguen fuera de alcance. Ver [decisión H1](docs/decisions/H1-auth.md), [validación post-merge](docs/milestones/H1-postmerge-validation.md) e [historial contractual](contracts/CHANGELOG.md).

```sh
npm --prefix backend run contract:validate
node --test scripts/h0-contract-validate.test.mjs
```

Los marcadores Info `x-abar-milestone`, `x-abar-runtime-stage: h0` y `x-abar-projected-areas` se preservan como **marcadores históricos del freeze**, porque el validador integrado los exige literalmente. No describen la disponibilidad actual: `x-abar-integrated-runtime-stage: h1` y `x-abar-integrated-commit` identifican la integración. Los marcadores históricos no sustituyen al marcador H2 ni al informe actual; la extensión H2 mantiene las rutas, esquemas, errores y seguridad H1. Su futura unificación con Swagger requiere una actualización coordinada del validador, no una alteración funcional incidental en esta regularización.

`npm --prefix backend run contract:validate:live` compara semántica H1 con procesos locales; `-- --stage=h0` verifica únicamente el subset health y NO certifica H1. El runner histórico `python3 backend/scripts/h1-real-e2e.py --execute --cleanup-owned --qualification <archivo-local>` exige su calificación estricta, imágenes y recursos fijados; no se deben fabricar esos prerrequisitos ni trasladar aprobaciones de otra corrida. La nueva evidencia y sus omisiones se registran en el informe post-merge.

### Primer administrador local (procedimiento manual, no seed de producto)

No hay CLI bootstrap ni endpoint público de registro. Usá este procedimiento **solo con la API detenida y una base PostgreSQL nueva, exclusiva, descartable y bajo tu control**, ya migrada con los tres SQL H1. No apunta al volumen Compose existente. Para reducir errores, exige host literal `127.0.0.1` y base `h1_local_<16 hex aleatorios>`; verificá primero que el puerto y la base pertenecen al contenedor que acabás de crear. Nunca adaptes el guard para producción o una base compartida.

Después de instalar dependencias y compilar el backend, desde la raíz, guardá el siguiente programa en un archivo temporal privado. La contraseña y URL se solicitan sin eco, no van en argumentos, historial, archivos versionados ni salida de errores. No uses `set -x`, grabación de terminal ni logs de consultas/parámetros.

```sh
umask 077
bootstrap_dir=$(mktemp -d)
cat > "$bootstrap_dir/bootstrap.cjs" <<'JS'
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const requireBackend = createRequire(path.resolve('backend/package.json'));
const { Client } = requireBackend('pg');
const { PasswordHasher } = require(path.resolve('backend/dist/auth/password-hasher.js'));
const { loadPasswordBlocklist } = require(path.resolve('backend/dist/auth/password-blocklist.js'));
const { validateNewPassword } = require(path.resolve('backend/dist/auth/password-policy.js'));
(async () => {
  let client;
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    const url = new URL(input.databaseUrl);
    if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' ||
        !url.port || !/^\/h1_local_[a-f0-9]{16}$/.test(url.pathname) ||
        url.search || url.hash || input.password !== input.confirmation) throw Error();
    const password = validateNewPassword(input.password,
      loadPasswordBlocklist(path.resolve('backend/dist/resources/auth')));
    const hash = await new PasswordHasher({ argon2Concurrency: 1, argon2QueueLimit: 0 }).hash(password);
    client = new Client({ connectionString: input.databaseUrl,
      connectionTimeoutMillis: 5000, statement_timeout: 5000 });
    await client.connect();
    await client.query('BEGIN');
    await client.query('LOCK TABLE "AdminUser" IN EXCLUSIVE MODE');
    const count = await client.query('SELECT count(*)::int AS n FROM "AdminUser"');
    if (count.rows[0].n !== 0) throw Error();
    await client.query(`INSERT INTO "AdminUser"
      ("name","email","passwordHash","active","mustChangePassword","version","updatedAt")
      VALUES ($1,$2,$3,true,true,1,CURRENT_TIMESTAMP)`,
      ['Local Administrator', 'admin@example.test', hash]);
    await client.query('COMMIT');
    console.log('Local administrator created; password change required.');
  } catch {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('Local bootstrap refused or failed; no credentials printed.');
    process.exitCode = 1;
  } finally {
    if (client) await client.end().catch(() => {});
  }
})();
JS
python3 -c 'import getpass,json; print(json.dumps({"databaseUrl":getpass.getpass("Owned local database URL: "),"password":getpass.getpass("Temporary password: "),"confirmation":getpass.getpass("Repeat password: ")}))' | node "$bootstrap_dir/bootstrap.cjs"
bootstrap_status=$?
rm -f "$bootstrap_dir/bootstrap.cjs"
rmdir "$bootstrap_dir"
test "$bootstrap_status" -eq 0
```

La contraseña temporal debe tener 15–128 puntos Unicode tras NFC y superar la blocklist offline autenticada. La inserción parametrizada usa el hasher real Argon2id (m=19456, t=2, p=1); la transacción y el bloqueo rechazan una segunda ejecución si ya existe cualquier administrador. No modifica cuentas existentes ni crea sesiones. No equivale al flujo auditado de creación de usuarios por un administrador existente.

Iniciá la API con esa misma base y su clave CSRF privada; abrí `/admin/login`, ingresá `admin@example.test`, cambiá la contraseña obligatoria y comprobá `/admin/usuarios`. Antes del cambio, users debe responder 403 `PASSWORD_CHANGE_REQUIRED`; luego verificá logout e imposibilidad de reutilizar la sesión anterior. No conserves la contraseña temporal. Para otra base local, creá un nuevo contenedor/base descartable en vez de borrar datos existentes. Los resultados efectivamente ejecutados están en el informe, no se deducen de estos pasos.

## Frontend Angular (H1–H4)

El frontend es una aplicación Angular standalone/zoneless con dependencias fijadas en `frontend/package.json` y lockfile separado. Requiere Node.js 24.x y npm 11.x. No se añadió gestor de monorepo.

Con PostgreSQL/Mailpit locales y el backend iniciado en loopback `127.0.0.1:3000` (ver comandos anteriores), desde la raíz:

```sh
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend test -- --watch=false
npm --prefix frontend start
```

Abrí `http://127.0.0.1:4200`. El servidor Angular se liga solo a loopback y el proxy conserva `GET /health` fuera de `/api/v1`; también pasa `/api` sin reescribirlo. El estado visible consulta la respuesta normativa `{"status":"ok"}` y muestra carga, disponibilidad, error o reintento. El endpoint solo responde saludable cuando PostgreSQL contestó `SELECT 1`.

El shell público toma como referencia documental Home CORREGIDA (`17:256`), sin afirmar acceso o reproducción directa de Figma. H1 incorpora login, cambio obligatorio de contraseña y administración de usuarios; H2 agrega catálogo público y administración de catálogo/stock. H3 incorpora carrito y H4 incorpora checkout y consulta de pedidos de demostración, sin cobros reales. Las pruebas con Vitest/jsdom verifican DOM, rutas y HTTP, no son pruebas de navegador real ni certifican responsive/contraste.

Para iniciar procesos backend y frontend propios, comprobar que el landing se sirve y que el proxy recibe el health real de PostgreSQL:

```sh
node scripts/h0-frontend-smoke.mjs
```

El smoke requiere que `127.0.0.1:3000` esté libre, inicia backend propio en ese puerto (target fijo del proxy) y elige un puerto frontend loopback disponible. Usa únicamente una URL PostgreSQL local ficticia explícita, no lee archivos de entorno, no inicia ni detiene Compose y termina solo los procesos que inició. Si 3000 está ocupado, falla sin contactar ni detener ese proceso.

El mapa completo de nodos/rutas, brechas y criterios visuales pendientes está en `docs/figma-map.md`. Las corridas históricas de navegador se conservan en el informe H1; el informe post-merge distingue lo repetido sobre este candidato de lo todavía pendiente. Compilar y jsdom no sustituyen una nueva verificación visual.

### Verificación aislada del modelo H2

La migración H2 es aditiva; no ejecutar reset sobre una base existente.
`node --test backend/scripts/h2-schema.test.mjs` solo ejecuta SQL con
`H2_TEST_DATABASE_URL` y `H2_TEST_OWNED=1` explícitos, host loopback, base
`h2_schema` y usuario `h2_runner` de un fixture nuevo y propio. Sin fixture,
reporta SKIPPED; no usa `DATABASE_URL`. Ver los resultados y pendientes en
[decisiones de persistencia H2](docs/decisions/H2-persistence.md).


### Fixtures e imágenes H2

Después del build, `node backend/scripts/h2-seed.mjs` exige
`H2_SEED_OWNED=1`, `H2_SEED_DATABASE_URL` explícita hacia una base **nueva y
propia** `h2_seed` o `h2_catalog` en loopback, y `CATALOG_IMAGE_DIRECTORY`
absoluto y exclusivo del fixture. Esos guards no prueban propiedad: verificar
el recurso antes de aportar los valores. No usar credenciales/base existente ni
resetear datos para satisfacerlos. Crea demostraciones ficticias sin actualizar
precios/stock/cuentas existentes; no provisiona un administrador.

La API usa `CATALOG_IMAGE_DIRECTORY` o, por defecto, `.local/catalog-images`
relativo al proceso backend. PNG: 5 MiB, 4096 píxeles por eje, ocho imágenes.
`node backend/scripts/h2-image-cleanup.mjs` exige su propia autorización de
fixture (`H2_IMAGE_CLEANUP_OWNED=1`, URL explícita e imagen directory) y coordina
la eliminación de hasta cien archivos huérfanos con las publicaciones. Consultar
[política de imágenes](docs/decisions/H2-images.md); no ejecutar limpieza sobre
archivos ajenos ni interpretar un fallo de transacción como rollback confirmado.

## H5 — Confirmación manual y pedidos (candidato local)

OpenAPI 0.8.0 agrega `/api/v1/admin/orders`: listado/detalle/historial, confirmación manual completa, notas, cancelación impaga y transiciones READY/DELIVERED. Solo confirmar pago descuenta stock, una vez por pago/presentación; APPROVED de simulación no es PAID. Cancelar un pago confirmado está prohibido; no hay devoluciones automáticas ni despacho H6. Sesión H1 y Origin/CSRF siguen siendo obligatorios. [Decisión H5](docs/decisions/H5-manual-confirmation.md). No implica aprobación externa ni disponibilidad productiva.

Verificación propia sobre PostgreSQL 17 nuevo, con Docker local e imagen `postgres:17.11-bookworm` previamente instalada:

```sh
node backend/scripts/h5-postgres.mjs
```

El runner crea dos bases aisladas en un contenedor con ownership y puerto loopback aleatorio, despliega migraciones y comprueba upgrade H4 poblado, snapshots, drift, confirmación/rollback, locks reales, replay, transiciones y seguridad H1. No acepta DATABASE_URL como destino ni reutiliza bases ajenas. `--keep` conserva exclusivamente el contenedor de esa ejecución para evidencia local; verificar su manifest privado/labels antes de detenerlo. Los manifests temporales contienen credenciales efímeras: nunca versionarlos, capturarlos ni incluirlos en informes. Fallar el runner no constituye PASS ni autoriza fallback a otra base.
