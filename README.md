# ABAR Electricidad

## Backend y servicios locales (H0.2)

Esta es únicamente la base local del backend y sus dependencias: NestJS, PostgreSQL y Mailpit. No hay frontend, autenticación ni endpoints comerciales implementados todavía. El entorno es para desarrollo local; no es una configuración de producción.

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

## Contrato transversal candidato (H0.3)

`contracts/openapi.yaml` es la referencia normativa candidata. Solo `GET /health` está implementado; `/api/v1/public`, `/api/v1/auth` y `/api/v1/admin` son áreas proyectadas, sin endpoints comerciales implementados. Los pendientes P01–P10 siguen abiertos y no se han finalizado las reglas de campos del comprador.

Validá OpenAPI 3.0.3 y los ejemplos JSON externos:

```sh
npm --prefix backend run contract:validate
node --test scripts/h0-contract-validate.test.mjs
```

Para comparar el Swagger real con el contrato y comprobar health 200/503 en procesos locales que el script inicia y detiene, ejecutá después de compilar el backend y con PostgreSQL local disponible:

```sh
npm --prefix backend run contract:validate:live
```

La opción live usa únicamente variables explícitas ficticias de desarrollo (nunca lee `.env` ni `.env.example`), liga el backend a loopback y detiene solo los procesos que inicia. Requiere PostgreSQL local accesible para comprobar 200; un segundo proceso usa un puerto de base deliberadamente inaccesible para verificar el error 503. Los componentes comerciales, convenciones de sesión e idempotencia son candidatos documentales, no funcionalidades. El rollout comercial permanece cerrado hasta autorización explícita; H1 no se inicia con este cambio.
