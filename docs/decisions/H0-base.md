# H0.1 — Inventario y versiones base

**Estado:** inventario y propuesta técnica local; no equivale a instalación, integración probada ni aprobación comercial.  
**Fecha de evidencia:** 2 de octubre de 2026.  
**Alcance:** H0.1 únicamente. No es el informe de cierre de H0.

## Inventario observado

El repositorio está en `chore/h0-base`, basado en `b7bca3e1eee63e3c63a436d4eb9eaeeea2100fd2`, con origen `https://github.com/FerrariAgustinNicolas/abar-electricidad.git`. El bootstrap contiene `.gitignore`, `docs/plan.md` y `docs/milestones/H0-prompt.md`. No hay aplicaciones, manifiestos npm, lockfiles, contratos, migraciones ni README de implementación en ese bootstrap; por tanto, aún no hay dependencias del proyecto instaladas.

El índice local `.codegraph/` fue creado durante la exploración y se conserva; queda excluido de Git junto con `odd/`, que ya estaba ignorado. No se alteraron los documentos fuente ni la configuración global o sesiones de herramientas.

| Herramienta/servicio del host | Versión observada | Evidencia |
| --- | --- | --- |
| Node.js | 24.18.1 | `node --version` |
| npm | 11.16.0 | `npm --version` |
| Git | 2.54.0 | `git --version` |
| Docker CLI | 29.7.2 | `docker --version` |
| Docker Compose | 5.5.1 | `docker compose version` |
| Docker daemon | 29.7.2; accesible | `docker info --format '{{.ServerVersion}}'` |
| Gentle AI | 3.7.0 | `gentle-ai --version` |
| Pi | 1.0.0 | `pi --version` |
| RDD | Activado globalmente | Estado de configuración verificado por el orquestador; no se cambió aquí |

## Versiones propuestas para fijar

Son pins seleccionados para los manifiestos futuros, no software instalado o validado en esta base. Las versiones provienen de metadata exacta de npm y etiquetas de imagen consultadas (HTTP 200); la metadata comprueba que la versión está publicada, no que toda la aplicación sea compatible ni que haya pasado pruebas.

| Área | Pins propuestos |
| --- | --- |
| Angular | framework/compiler `21.2.25`; CLI/build `21.2.24`; TypeScript `5.9.3`; RxJS `7.8.2`; angular-eslint `21.4.0`; ESLint `9.39.5`; typescript-eslint `8.71.0`; Vitest `4.1.11`; jsdom `27.4.0` |
| NestJS | core/common/platform-express/testing `11.2.7`; CLI `11.0.24`; schematics `11.1.0`; Swagger `11.4.7` |
| Prisma/PostgreSQL client | Prisma CLI, client y adapter-pg `7.10.0`; `pg` `8.23.1` |
| Pruebas/herramientas backend | Jest `30.5.2`; ts-jest `29.4.14`; Supertest `7.3.1`; Redocly CLI `2.57.0` |
| Servicios locales | `postgres:17.11-bookworm`; `axllent/mailpit:v1.31.3` |

Compatibilidad publicada consultada: Angular 21 admite Node `^24` y TypeScript `>=5.9 <6`; NestJS 11 requiere Node `>=20`; Prisma 7 requiere Node `>=24` y TypeScript `>=5.4`. El host observado satisface esos mínimos publicados. Esto no reemplaza builds, pruebas de integración ni validación de cada paquete fijado.

**Riesgo abierto:** Prisma 7 con PostgreSQL 17 queda sujeto a una prueba de integración real (conexión, generación y consulta), antes de declarar compatibilidad operativa. La página oficial de compatibilidad de bases específica para la versión no estuvo disponible (404) en la consulta; no se infiere una garantía no verificada. Ninguna aplicación o servicio local está instalado/iniciado por esta decisión.

## Fuentes técnicas

- Angular, matriz de compatibilidad de versiones: https://angular.dev/reference/versions
- Angular, releases: https://angular.dev/reference/releases
- NestJS, notas de migración v11 (fuente fijada): https://raw.githubusercontent.com/nestjs/docs.nestjs.com/bdefe854568c2f679c45d1d6cea0ac76797a3553/content/migration.md
- Prisma 7, guía de actualización: https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-to-prisma-7
- Prisma, requisitos del sistema: https://www.prisma.io/docs/orm/reference/system-requirements
- PostgreSQL, política de versiones soportadas: https://www.postgresql.org/support/versioning/
- Mailpit, instalación con Docker: https://mailpit.axllent.org/docs/install/docker/
- Paquetes npm y etiquetas Docker: metadata exacta de los pins consignados; consultadas y respondieron HTTP 200. Son fuentes de publicación, no matrices de compatibilidad.

## Decisiones de estructura y reproducibilidad

1. Un único repositorio para `frontend/` Angular y `backend/` NestJS; **no** introducir un gestor de monorepo. Cada aplicación tendrá su propio `package.json` y lockfile npm (`package-lock.json`), generado y usado con `npm ci` desde su directorio. No compartir lockfile raíz.
2. Fijar versiones exactas en los manifiestos y conservar los lockfiles revisados. Fijar también tags de imagen; evitar `latest`. Una estrategia de ramas simple y local: rama de trabajo por hito/cambio, partiendo de la base acordada; no se modifica aquí la rama ni el remoto.
3. PostgreSQL y Mailpit se planifican como servicios auxiliares locales. Cuando se configure Compose, ligar todos los puertos publicados a loopback (`127.0.0.1`), conservar los volúmenes y no ejecutar SMTP externo. No se han creado todavía archivos Compose.
4. Cualquier credencial de ejemplo será ficticia, local y no reutilizable; no representa credenciales reales. No incluir secretos en Git ni en la interfaz. No se ha creado aquí ningún archivo de credenciales.

## Contrato operativo fijado antes del frontend

- `GET /health` es una ruta operativa **sin** prefijo `/api/v1`.
- Solo devuelve HTTP `200` con `{"status":"ok"}` después de que el backend confirme conectividad a PostgreSQL mediante `SELECT 1`.
- Si la comprobación falla o la base no está disponible, devuelve HTTP `503` con el formato uniforme de error: `{"code":"SERVICE_UNAVAILABLE","message":"Servicio temporalmente no disponible","requestId":"<uuid>"}`. El texto es seguro y en español; `requestId` es un UUID.
- Los errores HTTP usan una envoltura uniforme `code`, `message`, `fieldErrors?`, `requestId`; no exponen trazas ni detalles internos. El cuerpo anterior es la forma concreta acordada para este fallo de salud.
- Swagger se publica en `/api/docs`. La API de negocio se proyecta bajo `/api/v1`; esta base no implementa operaciones comerciales.
- La respuesta de salud no expone versiones, credenciales ni detalles de la base de datos. No añadir datos de entorno o causa interna al cuerpo público.

Este es un contrato previo al consumo desde frontend, no evidencia de endpoint ya implementado o probado.

## Límites y reglas vigentes

No se implementan funciones comerciales, autenticación, ni endpoints de negocio como parte de H0.1. Los pendientes P01–P10 de `docs/plan.md` siguen abiertos; esta nota no los resuelve. Se conservan las reglas confirmadas existentes, en particular compra como invitado, cantidades enteras para unidad/metro/rollo, rollos cerrados, stock propio del e-commerce, pedido impago sin reserva, descuento solo al confirmar manualmente el pago, simulación sin cobro real, entrega de costo fijo configurable inicialmente cero, email y WhatsApp manual. No se atribuyen nuevas decisiones al negocio.

El consumo de horas de proyecto continúa pendiente por falta de evidencia; no se estima ni se inventa aquí. El informe integral H0 se emitirá únicamente al completar sus otros frentes y verificaciones.
