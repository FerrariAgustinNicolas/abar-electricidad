# ABAR Electricidad

## Backend y servicios locales (H1 integrado)

Esta sección describe la base local del backend y sus dependencias: NestJS, PostgreSQL y Mailpit. El frontend Angular mínimo de H0.2 se documenta más abajo. H1 integra autenticación por sesión y administración de usuarios; los endpoints comerciales de H2 no están implementados. El entorno es para desarrollo local; no es una configuración de producción.

### Contrato H2 en preparación

El contrato candidato 0.5.0 agrega catálogo/stock de H2, con DTOs y ejemplos
validados antes del desarrollo paralelo. Esto no declara funcionalidad H2 ni
paridad Swagger/runtime: la implementación sigue pendiente. Ver
[decisiones H2](docs/decisions/H2-contract.md) y
[prompt revisado](docs/milestones/H2-prompt.md). La validación estática se mantiene
con `npm --prefix backend run contract:validate`; las pruebas de contrato son
`node --test scripts/h0-contract-validate.test.mjs scripts/h2-contract.test.mjs`.
No ejecutar el verificador LIVE suponiendo que H2 ya está implementado.

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

El esquema Prisma contiene `AdminUser`, `AuthSession`, `AuthPreAuthContext` y `AdminUserAudit`, con tres migraciones H1. No incluye modelos comerciales ni seed automático. El cliente generado se escribe explícitamente en `backend/src/generated/prisma`; vuelve a generarlo con el script de Prisma al instalar o actualizar dependencias. La configuración de Nest no carga archivos `.env`; define la conexión local explícitamente al iniciar:

```sh
DATABASE_URL='postgresql://abar_local:abar_local_demo_only@127.0.0.1:5432/abar_local?schema=public' npm --prefix backend run start:dev
```

La API escucha solo en `127.0.0.1:3000`. `GET /health` ejecuta `SELECT 1` antes de responder `200 {"status":"ok"}`. Si PostgreSQL no está disponible, devuelve `503` con un error seguro y un `requestId` UUID. Swagger está en `/api/docs` y `/api/docs-json`; OpenAPI 3.0.3 describe health y las nueve operaciones auth/admin integradas. Para iniciar H1, además de `DATABASE_URL`, exportá una `AUTH_CSRF_ENCRYPTION_KEY` aleatoria de 32 bytes en base64url (por ejemplo, generada con `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`); mantenela privada y estable durante la sesión local. No la versiones. Desarrollo admite HTTP únicamente en loopback; producción requiere Secure y orígenes HTTPS explícitos.

Con PostgreSQL y Mailpit en ejecución, verifica conexión real, OpenAPI, errores seguros, el 503 al probar una base local no disponible y captura SMTP local:

```sh
node scripts/h0-backend-smoke.mjs
```

El script usa una API local ya disponible o inicia el backend compilado con configuración ficticia explícita de loopback y luego detiene únicamente el proceso que inició. Envía correo solo a `@example.test` y comprueba su captura en Mailpit; no hay envío externo. Compose puede quedar ejecutándose y el volumen nombrado permanece intacto al usar `stop`.

## H1 integrado: contrato y verificaciones

`main` integró H1 en `18c39e9b86b7b7bf45263fe5bad4fe77125a6386`. `contracts/openapi.yaml` conserva la versión 0.4.0 candidata: nueve operaciones auth/admin más health, sin aprobación externa ni promesa productiva. P01–P10 y las reglas comerciales siguen fuera de alcance. Ver [decisión H1](docs/decisions/H1-auth.md), [validación post-merge](docs/milestones/H1-postmerge-validation.md) e [historial contractual](contracts/CHANGELOG.md).

```sh
npm --prefix backend run contract:validate
node --test scripts/h0-contract-validate.test.mjs
```

Los marcadores Info `x-abar-milestone`, `x-abar-runtime-stage: h0` y `x-abar-projected-areas` se preservan como **marcadores históricos del freeze**, porque el validador integrado los exige literalmente. No describen la disponibilidad actual: `x-abar-integrated-runtime-stage: h1` y `x-abar-integrated-commit` identifican la integración. No se cambiaron rutas, esquemas, errores, seguridad ni versión. Su futura unificación con Swagger requiere una actualización coordinada del validador, no una alteración funcional incidental en esta regularización.

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

## Frontend Angular (H1 integrado)

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

El shell público toma como referencia documental Home CORREGIDA (`17:256`), sin afirmar acceso o reproducción directa de Figma. H1 incorpora login, cambio obligatorio de contraseña y administración de usuarios; catálogo, carrito y checkout permanecen fuera de alcance. Las pruebas con Vitest/jsdom verifican DOM, rutas y HTTP, no son pruebas de navegador real ni certifican responsive/contraste.

Para iniciar procesos backend y frontend propios, comprobar que el landing se sirve y que el proxy recibe el health real de PostgreSQL:

```sh
node scripts/h0-frontend-smoke.mjs
```

El smoke requiere que `127.0.0.1:3000` esté libre, inicia backend propio en ese puerto (target fijo del proxy) y elige un puerto frontend loopback disponible. Usa únicamente una URL PostgreSQL local ficticia explícita, no lee archivos de entorno, no inicia ni detiene Compose y termina solo los procesos que inició. Si 3000 está ocupado, falla sin contactar ni detener ese proceso.

El mapa completo de nodos/rutas, brechas y criterios visuales pendientes está en `docs/figma-map.md`. Las corridas históricas de navegador se conservan en el informe H1; el informe post-merge distingue lo repetido sobre este candidato de lo todavía pendiente. Compilar y jsdom no sustituyen una nueva verificación visual.
