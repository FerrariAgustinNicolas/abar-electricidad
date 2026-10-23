# Instalación y demostración local — H8

Versión académica DEMO, no productiva. Estado de ejecución y bloqueos: [informe H8](milestones/H8-informe.md). Los comandos no implican que una prueba haya pasado.

## Requisitos y aislamiento
- Node24.x/npm11.x; versiones observadas en H8:24.18.1/11.16.0. Lockfiles separados, sin actualizar dependencias.
- Docker local con socket Unix, Compose, imágenes locales `postgres:17.11-bookworm` y `axllent/mailpit:v1.31.3`. Los runners no descargan imágenes.
- Plataforma de ejecución H8: macOS; Linux/Windows no probados. No prometer compatibilidad por inferencia.
- Crear export/clon limpio del candidato, sin node_modules ni archivos privados. No copiar `.env` históricos.

## Instalación limpia
Desde la raíz del export limpio:
```sh
node --version
npm --version
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix backend run prisma:validate
npm --prefix backend run prisma:generate
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix backend run lint
npm --prefix frontend run lint
npm --prefix backend test -- --runInBand
npm --prefix frontend test -- --watch=false
npm --prefix backend run contract:validate
node --test scripts/*contract*.test.mjs
docker compose --env-file .env.example config --quiet
```
Prisma sin `--config` está bloqueado deliberadamente. Los scripts schema-only no conectan a una base. No eliminar ese guard ni ejecutar reset.

## Base vacía y Mailpit propios
```sh
node backend/scripts/h6-postgres.mjs --keep
```
El runner crea PostgreSQL/Mailpit nuevos: labels de ownership, tmpfs, puertos aleatorios en127.0.0.1. Aplica ocho migraciones, comprueba upgrade H5 poblado y drift, ejecuta integración H6 y conserva manifiesto privado. `--setup-only --keep` NO ejecuta tests. Verificar IDs, labels y mounts antes de usar o detener recursos. No reutilizar bases históricas ni interpretar la salida exitosa de setup como aceptación funcional.

## Arranque manual y datos ficticios
El proceso Nest no carga `.env`. Aportar privadamente `DATABASE_URL` del fixture propio, `AUTH_CSRF_ENCRYPTION_KEY` (32bytes base64url), `H4_REPLAY_KEY_BASE64` (32bytes base64), `H4_DEMO_SIMULATION_ENABLED=true`, `H6_SMTP_HOST=127.0.0.1`, puerto SMTP asignado y `AUTH_ALLOWED_ORIGINS` igual al origen local Angular. Mantener las claves estables, fuera de logs/URLs/Git. Destinatarios solo `example.test`.
```sh
npm --prefix backend start
npm --prefix frontend start
```
Backend escucha127.0.0.1:3000; Angular127.0.0.1:4200. Si3000 está ocupado, detener el arranque propio: no matar el proceso ajeno. El proxy pasa `/api` y `/health`; medios usan rutas `/api` del catálogo. Abrir `/estado`, `/api/docs` y `/api/docs-json`; `/health` exige SELECT1 real.

No hay bootstrap automático de administrador. El procedimiento manual acotado de [README](../README.md#primer-administrador-local-procedimiento-manual-no-seed-de-producto) exige otra base vacía con nombre `h1_local_<16hex>` y API detenida; no adaptarlo al fixture H6. El seed H2 exige una base nueva `h2_seed`/`h2_catalog`, `H2_SEED_OWNED=1`, URL explícita e image directory exclusivo; crea datos ficticios sin actualizar existentes. No es un instalador universal ni autorización para borrar datos. Las suites propias crean sus fixtures sintéticos; no asumir que sus cuentas quedan disponibles para una demo interactiva.

## Demostración y detención
Seguir [cliente](manual-cliente.md) y [administrador](manual-administrador.md), incluyendo confirmación manual antes de entrega/reportes. Despachar correo con `npm --prefix backend run notifications:dispatch -- --limit 20` solo hacia Mailpit propio. Verificar destinatarios ficticios en la interfaz del puerto8025 asignado, sin capturar credenciales.
Detener únicamente los procesos iniciados en esta ejecución. Eliminar contenedores solo tras comparar ID+owner+mounts del manifiesto de esa ejecución; no usar `docker compose down -v`, podas globales ni reseteos genéricos. Manifiestos y scratch son privados y no se versionan.

## Resolución de problemas
503 health: revisar base/puerto/propiedad;503 auth/replay: revisar claves privadas válidas;403: revisar Origin/CSRF o cambio obligatorio;409: recargar estado sin inventar nueva intención;SMTP caído: negocio persiste y job es reintentable. Imagen local faltante/socket inaccesible: bloqueo de entorno, no cambiar versiones ni relajar guards para obtener PASS.

## Límite de reproducibilidad del bootstrap
El recorrido correctivo usó un export limpio51fd7e8 y npm ci --offline, procesos Nest/Angular con executable Node24.18.1 verificado en cada proceso. El fixture H6 se creó con --setup-only --keep y base vacía nueva h6_browser. La demostración requirió un script privado ad hoc para administrador sintético con hasher real, catálogo/presentaciones, saldos y configuración; no existe un bootstrap público validado que componga esos pasos bajo los guards H1/H2. Ese script no se publica porque contiene preparación/credenciales privadas y NO es un instalador soportado. Por tanto la secuencia anterior instala/valida, pero no reproduce por sí sola una demo interactiva completa: requiere preparación manual autorizada en base propia, sin adaptar nombres ni relajar guards. Esta brecha permanece abierta.
La exportación comprobada usó fecha desde2026-10-23 hasta2026-10-24(exclusiva); un intervalo vacío o fechas omitidas responde400. El nuevo cierre verifica el recorrido completo Node24 y no reclasifica las capturas antiguas Node26. [Evidencia](milestones/H8-cierre-validacion.md).

## Q29 — evaluación complementaria, no procedimiento validado
Los mecanismos existentes no aceptan la misma identidad de base:

| Mecanismo | Target permitido | Límite |
|---|---|---|
| Primer administrador H1 | `h1_local_<16hex>`, loopback, API detenida, cero administradores | Hash/política reales y cambio obligatorio |
| Seed H2 | `h2_seed` o `h2_catalog`, `H2_SEED_OWNED=1`, URL explícita, directorio de imágenes privado absoluto | No usar en base H1/H6 ni editar guard |
| Setup H6 | Bases nuevas `h6_notifications/settings/upgrade/browser/verify` del runner | Migraciones/Mailpit, no bootstrap público conjunto |

Ruta manual factible, **NOT RUN**: base exclusiva con nombre H1 permitido→ocho migraciones mediante preparación propia autorizada→bootstrap H1 existente→login/cambio obligatorio→categoría/producto/presentaciones sintéticos por API/UI autenticada→stock inicial mediante ajuste auditado normal→Mailpit propio y claves estables privadas. La creación de presentaciones deja saldo cero: no insertar balances directamente para simular un procedimiento soportado.

Faltan un procedimiento exacto aprobado de ownership/contenedor/base H1, una invocación de ocho migraciones que no reutilice la configuración restringida de E2E, el dataset/orden de pasos autenticados verificable y una ejecución completa de esa ruta. El cambio obligatorio de credenciales requiere intervención humana, no una contraseña versionada. No se rebautizan bases para burlar guards, copian usuarios privilegiados ni reutilizan cuentas pobladas de suites. No se construyó instalador ni se ejecutó esta propuesta: **Q29 sigue PARCIAL, pendiente de decisión externa sobre preparar/validar ese runbook**. Instalación limpia y demo preconfigurada son evidencias distintas.
