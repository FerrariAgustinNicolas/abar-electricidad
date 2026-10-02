# ABAR Electricidad

## Backend y servicios locales (H0.2)

Esta sección describe la base local del backend y sus dependencias: NestJS, PostgreSQL y Mailpit. El frontend Angular mínimo de H0.2 se documenta más abajo. No hay autenticación funcional ni endpoints comerciales implementados. El entorno es para desarrollo local; no es una configuración de producción.

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

El esquema Prisma está vacío deliberadamente: no introduce modelos comerciales, tablas, migraciones ni seeds. El cliente generado se escribe explícitamente en `backend/src/generated/prisma`; vuelve a generarlo con el script de Prisma al instalar o actualizar dependencias. La configuración de Nest no carga archivos `.env`; define la conexión local explícitamente al iniciar:

```sh
DATABASE_URL='postgresql://abar_local:abar_local_demo_only@127.0.0.1:5432/abar_local?schema=public' npm --prefix backend run start:dev
```

La API escucha solo en `127.0.0.1:3000`. `GET /health` ejecuta `SELECT 1` antes de responder `200 {"status":"ok"}`. Si PostgreSQL no está disponible, devuelve `503` con un error seguro y un `requestId` UUID. Swagger está en `/api/docs`; el documento OpenAPI usa 3.0.3 y contiene solo la ruta de salud implementada.

Con PostgreSQL y Mailpit en ejecución, verifica conexión real, OpenAPI, errores seguros, el 503 al probar una base local no disponible y captura SMTP local:

```sh
node scripts/h0-backend-smoke.mjs
```

El script usa una API local ya disponible o inicia el backend compilado con configuración ficticia explícita de loopback y luego detiene únicamente el proceso que inició. Envía correo solo a `@example.test` y comprueba su captura en Mailpit; no hay envío externo. Compose puede quedar ejecutándose y el volumen nombrado permanece intacto al usar `stop`.

## Contrato candidato (H1 normativo / runtime H0)

`contracts/openapi.yaml` es la única referencia normativa candidata: versión 0.4.0, nueve operaciones H1 auth/admin definidas para implementación futura más `GET /health`. **Solo health está implementado**; Swagger actual sigue mostrando runtime H0. No hay login funcional ni endpoints comerciales implementados. Los pendientes P01–P10 siguen abiertos y no se han finalizado las reglas de campos del comprador. Ver [protocolo H1](docs/decisions/H1-auth.md), [informe parcial](docs/milestones/H1-informe.md) e [historial contractual](contracts/CHANGELOG.md).

Validá OpenAPI 3.0.3 y los ejemplos JSON externos:

```sh
npm --prefix backend run contract:validate
node --test scripts/h0-contract-validate.test.mjs
```

Para comparar explícitamente el **subset transicional H0** (Swagger y health 200/503) en procesos locales que el script inicia y detiene, ejecutá después de compilar el backend y con PostgreSQL local disponible:

```sh
npm --prefix backend run contract:validate:live -- --stage=h0
```

Sin `--stage=h0`, `npm --prefix backend run contract:validate:live` usa H1 por defecto y **rechaza las rutas H1 aún no implementadas**. El subset H0 no certifica autenticación. El runbook runtime H1 y el procedimiento/comando bootstrap seguro están pendientes de implementación; no hay comando de login/bootstrap disponible.

La opción live usa únicamente variables explícitas ficticias de desarrollo (nunca lee `.env` ni `.env.example`), liga el backend a loopback y detiene solo los procesos que inicia. Requiere PostgreSQL local accesible para comprobar 200; un segundo proceso usa un puerto de base deliberadamente inaccesible para verificar el error 503. Los componentes comerciales e idempotencia siguen proyectados; el protocolo de sesión H1 está documentado, no implementado. El rollout comercial permanece cerrado hasta autorización explícita; esta preparación contractual no inicia implementación H1 ni acredita aprobación externa.

## Frontend Angular (H0.2)

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

El shell público toma como referencia documental Home CORREGIDA (`17:256`), sin afirmar acceso o reproducción directa de Figma. Login y administración son placeholders explícitos; no existe autenticación funcional, operaciones, CRUD, catálogo, carrito o checkout en H0.4. Las pruebas con Vitest/jsdom verifican DOM, rutas y HTTP, no son pruebas de navegador real ni certifican responsive/contraste.

Para iniciar procesos backend y frontend propios, comprobar que el landing se sirve y que el proxy recibe el health real de PostgreSQL:

```sh
node scripts/h0-frontend-smoke.mjs
```

El smoke requiere que `127.0.0.1:3000` esté libre, inicia backend propio en ese puerto (target fijo del proxy) y elige un puerto frontend loopback disponible. Usa únicamente una URL PostgreSQL local ficticia explícita, no lee archivos de entorno, no inicia ni detiene Compose y termina solo los procesos que inició. Si 3000 está ocupado, falla sin contactar ni detener ese proceso.

El mapa completo de nodos/rutas, brechas y criterios visuales pendientes está en `docs/figma-map.md`. La verificación real en navegador a 360/768/1440 px, teclado, zoom y contraste sigue pendiente; compilar y jsdom no la sustituyen.
