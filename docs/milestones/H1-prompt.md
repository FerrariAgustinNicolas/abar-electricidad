# ABAR Electricidad — H1 · Autenticación administrativa

**Referencia normativa:** `docs/plan.md` + H0 aprobado e integrado (`h0-approved`).  
**Único hito autorizado:** H1 — Autenticación desde el comienzo.  
**Salida obligatoria:** `docs/milestones/H1-informe.md`.

## 1. Contexto y estado inicial

H0 fue auditado externamente como **CUMPLE**, integrado por fast-forward en `main` y publicado junto con el tag anotado `h0-approved`.  
El repositorio remoto es `origin`. La rama `chore/h0-base` se conserva. H1 todavía no fue iniciado.

Antes de escribir:

1. Verificá raíz Git, rama, `origin`, árbol limpio y que `main`/`origin/main` coincidan con el commit etiquetado `h0-approved`.
2. Leé completos:
   - `docs/plan.md`
   - `docs/milestones/H0-informe.md`
   - `docs/decisions/H0-base.md`
   - `docs/decisions/H0-contract.md`
   - `contracts/openapi.yaml`
   - `docs/figma-map.md`
3. Inventariá el código H0 existente. No reemplaces el bootstrap, contrato, proxy, filtros, requestId, Compose, Mailpit, Prisma ni estructura Angular salvo que H1 lo requiera.
4. Creá una rama de trabajo desde `main`, por ejemplo `feat/h1-auth`.
5. Conservá el orquestador y agentes existentes. Podés usar workers, reviewers y verify según dependencias reales. No cambies configuración global de Pi/Gentle-AI.
6. No hagas push, merge a `main`, tags ni avances a H2.

Si el estado real contradice este contexto, detenete y reportá la diferencia antes de modificar historia o archivos compartidos.

## 2. Objetivo de H1

Entregar autenticación administrativa real, persistente y revocable desde el comienzo del sistema:

- sesión administrativa en servidor;
- login/logout;
- consulta/restauración de sesión;
- cambio obligatorio y voluntario de contraseña;
- protección CSRF y validación de origen;
- autorización real en backend;
- login y layout administrativo integrados en Angular;
- gestión básica de administradores;
- revocación de sesiones;
- protección de la última cuenta administrativa activa;
- contrato OpenAPI y pruebas reales.

No existe login de clientes.

## 3. Límites de alcance

### Incluido

H1.1 — Sesión y controles:
- entidad `Admin`;
- sesiones persistidas en PostgreSQL;
- hash Argon2id;
- cookie opaca HttpOnly;
- expiración/revocación;
- CSRF;
- validación de origen;
- rate limit del login y superficies públicas de autenticación donde corresponda;
- autorización de rutas administrativas;
- bootstrap local seguro de la primera cuenta;
- migraciones necesarias.

H1.2 — Frontend:
- `/admin/login`;
- restauración de sesión al recargar;
- guard de navegación;
- manejo 401/403;
- cambio obligatorio de contraseña;
- logout;
- layout administrativo funcional;
- estados loading/error/submit;
- integración real con API, sin mocks persistentes una vez integrada.

H1.3 — Usuarios administradores:
- listado;
- alta;
- activación/desactivación;
- cambio de nombre permitido por contrato;
- restablecimiento de contraseña;
- control de versión;
- impedir desactivar la última cuenta activa;
- revocar sesiones cuando corresponda.

### Fuera de H1

No implementar:
- catálogo/productos/categorías;
- stock, aperturas de rollos o movimientos;
- carrito, checkout, pedidos o pagos;
- reportes;
- emails comerciales de H6;
- roles complejos, permisos por rol o RBAC;
- login/registro de clientes;
- recuperación pública de contraseña por email;
- OAuth;
- JWT almacenado en navegador;
- Redis obligatorio;
- cloud/hosting/CI productivo.

Los placeholders de H0 pueden evolucionar solo en las superficies necesarias para H1.

## 4. Reglas de seguridad y arquitectura obligatorias

1. **Sesión revocable en servidor.** No JWT como mecanismo principal del navegador. No token administrativo en `localStorage`/`sessionStorage`.
2. La cookie de sesión contiene un identificador aleatorio opaco. Persistí únicamente una representación protegida (por ejemplo, hash) que no permita reconstruir el token.
3. Cookie:
   - `HttpOnly`;
   - `SameSite` explícito;
   - `Secure` en HTTPS;
   - excepción documentada únicamente para localhost HTTP;
   - path y expiración explícitos.
4. Rotar identificador al autenticar y cuando una acción de seguridad lo requiera.
5. Logout revoca la sesión y elimina la cookie.
6. Desactivar una cuenta y restablecer su contraseña revoca sus sesiones.
7. Cambiar la propia contraseña revoca las demás sesiones y renueva la sesión actual.
8. Contraseñas con **Argon2id**. Verificá parámetros contra la guía oficial vigente de OWASP antes de fijarlos y registrá fuente/decisión. No inventes reglas de composición arbitrarias si la guía no las requiere.
9. Login de email inexistente, contraseña incorrecta o cuenta inactiva devuelve un error genérico que no permita enumerar cuentas.
10. No registrar contraseñas, tokens de sesión, tokens CSRF completos ni cookies en logs/informes/tests.
11. Todas las rutas `/api/v1/admin/**` se autorizan en el backend. El guard Angular mejora navegación, pero no constituye autorización.
12. Las mutaciones con cookie requieren protección CSRF y validación de origen. `SameSite` no es la única defensa.
13. Una cuenta con `mustChangePassword=true` solo puede:
    - consultar `/auth/me`;
    - cambiar su contraseña;
    - cerrar sesión.
    El backend impone esta restricción.
14. Todos los administradores tienen las mismas capacidades en esta PS. No introducir roles.
15. Proteger la última cuenta activa: ninguna operación puede dejar cero administradores activos.
16. Email administrativo normalizado y único.
17. Ediciones con `expectedVersion` y conflicto 409 cuando corresponda.
18. Mantener errores con `code`, `message`, `fieldErrors?`, `requestId`; no exponer stack/SQL.
19. Mantener todo ligado a loopback en desarrollo.
20. No incluir credenciales reales en Git, seeds, ejemplos, screenshots o informe.

## 5. Modelo mínimo H1

Implementar mediante Prisma/PostgreSQL al menos:

### `admins`
- `id` opaco;
- `name`;
- `email` normalizado único;
- `password_hash`;
- `active`;
- `must_change_password`;
- `version`;
- `created_at`;
- `updated_at`.

### `admin_sessions`
- `id`;
- `admin_id`;
- identificador de sesión protegido;
- `expires_at`;
- `revoked_at?`;
- fechas necesarias;
- relación Admin 1:N Session.

La implementación puede agregar un registro mínimo de auditoría de seguridad para operaciones de usuarios si es necesario para cumplir el requisito de auditoría del plan. Si se agrega una tabla/evento persistente, documentá la decisión, el contenido saneado y por qué es proporcional. No registrar secretos.

Generá migraciones reales y verificá migración desde base limpia.

## 6. Bootstrap inicial

H1 necesita una primera cuenta sin versionar una contraseña conocida.

Implementá un procedimiento **solo local/operativo** para crear el primer administrador cuando no exista ninguno. Debe:

- recibir credenciales por un mecanismo que no las incorpore a Git;
- no imprimir la contraseña;
- no aceptar una contraseña hardcodeada de demo en el repositorio;
- ser repetible de forma segura o fallar claramente si ya existe un administrador;
- documentarse en README.

No crear credenciales reales en seeds públicos. Si una política nativa impide leer/escribir una superficie sensible, detenerse y pedir una acción manual acotada; no eludir el control.

## 7. Contrato H1 a congelar antes de paralelizar

Mantener prefijo comercial `/api/v1`. `/health` sigue separado y `/api/docs` sigue siendo Swagger.

Endpoints a implementar:

### Autenticación

- `GET /api/v1/auth/csrf`
  - público;
  - inicializa/devuelve metadata/token CSRF según el mecanismo elegido;
  - puede responder 429.

- `POST /api/v1/auth/login`
  - público + CSRF + origen válido;
  - request: `{ email, password }`;
  - 200: `AdminSessionView` + cookie rotada;
  - 401: `INVALID_CREDENTIALS` genérico;
  - 429: límite de intentos.

- `GET /api/v1/auth/me`
  - sesión administrativa;
  - 200: identidad saneada + `mustChangePassword` + `expiresAt`;
  - nunca devuelve id/token de sesión;
  - 401: `SESSION_EXPIRED` o equivalente contractual aprobado.

- `POST /api/v1/auth/logout`
  - sesión/CSRF según mecanismo;
  - 204;
  - repetición segura, sin revivir sesión.

- `POST /api/v1/auth/change-password`
  - sesión + CSRF;
  - `{ currentPassword, newPassword }`;
  - 204;
  - revoca otras sesiones y renueva la actual;
  - 400 `PASSWORD_POLICY`;
  - credencial actual incorrecta con respuesta que no filtre información sensible.

### Administradores

- `GET /api/v1/admin/users`
  - autenticado;
  - paginación estándar H0;
  - devuelve vistas saneadas.

- `POST /api/v1/admin/users`
  - autenticado + CSRF;
  - `{ name, email, temporaryPassword }`;
  - 201;
  - nuevo usuario con `mustChangePassword=true`;
  - 409 `EMAIL_IN_USE`.

- `PATCH /api/v1/admin/users/{id}`
  - autenticado + CSRF;
  - nombre/activo + `expectedVersion`;
  - 200;
  - 409 `LAST_ACTIVE_ADMIN` / `VERSION_CONFLICT`.

- `POST /api/v1/admin/users/{id}/reset-password`
  - autenticado + CSRF;
  - `{ temporaryPassword, reason }`;
  - 204;
  - marca cambio obligatorio y revoca sesiones;
  - 404;
  - 400 `PASSWORD_POLICY`.

### DTOs contractuales mínimos

`AdminSessionView`:
- `admin: { id, name, email, mustChangePassword }`
- `expiresAt`

`AdminUserView`:
- `id`
- `name`
- `email`
- `active`
- `mustChangePassword`
- `version`
- fechas públicas necesarias.

No exponer `passwordHash`, session hash, CSRF secret, cookies internas ni metadata sensible.

Actualizar `contracts/openapi.yaml`, ejemplos y validador. Swagger generado debe ser semánticamente compatible con el contrato normativo. No crear un segundo contrato.

Si durante implementación necesitás cambiar un endpoint/DTO/error de esta sección de manera incompatible, registrá:
- motivo;
- impacto frontend;
- impacto backend;
- migración;
y pausá ese frente para revisión. Cambios locales compatibles pueden documentarse en el informe.

## 8. Trabajo Backend

Como mínimo:

1. Modelos Prisma y migraciones H1.
2. Repositorio/servicio de admins.
3. Hash/verify Argon2id.
4. Generación criptográfica de sesiones.
5. Persistencia, expiración y revocación.
6. Middleware/guard de sesión.
7. restricción `mustChangePassword`.
8. CSRF + origen.
9. rate limit.
10. endpoints contractuales.
11. bootstrap inicial.
12. control de concurrencia/versiones de usuarios.
13. `LAST_ACTIVE_ADMIN`.
14. revocación por desactivación/reset/cambio de contraseña.
15. errores saneados y requestId.
16. pruebas unitarias, integración y e2e con PostgreSQL real.

No usar una base mock/SQLite para certificar sesiones, unicidad o concurrencia.

## 9. Trabajo Frontend

Usar el design system/tokens H0 y la referencia visual del Figma. El login no fue localizado como frame real durante la auditoría previa, así que construir una pantalla coherente con Foundations sin afirmar que es copia pixel-perfect de Figma.

Implementar:

1. `/admin/login`.
2. formulario reactivo tipado;
3. email/password con validación y mensajes accesibles;
4. obtención/uso del token CSRF según contrato;
5. servicio de sesión;
6. restauración mediante `/auth/me` al recargar;
7. guard de rutas privadas;
8. redirección a login si no hay sesión;
9. preservación segura de la ruta destino;
10. flujo `mustChangePassword` a una pantalla/ruta dedicada;
11. logout;
12. manejo 401/403 sin loops;
13. layout admin funcional usando el esqueleto H0;
14. pantalla básica `/admin/usuarios`;
15. alta, activación/desactivación, edición permitida y reset de contraseña;
16. conflictos de versión y última cuenta activa mostrados claramente;
17. loading/empty/error/submitting;
18. no persistir contraseña/token administrativo.

No inventar permisos cliente. El backend decide autorización.

## 10. Paralelismo y ownership

Después de congelar el contrato H1:

### Backend
Puede avanzar en:
- Prisma/migraciones;
- auth/session;
- CSRF;
- users;
- tests.

### Frontend
Puede avanzar en:
- login;
- session state;
- guards/interceptors;
- layout;
- usuarios con mocks que validen el contrato.

### Integración
Debe controlar:
- `contracts/**`;
- schema/migraciones compartidas;
- archivos raíz;
- `.env.example`/README cuando haga falta;
- regeneración/verificación de tipos;
- smoke real.

No permitir dos escritores simultáneos sobre OpenAPI, Prisma migrations, README o archivos raíz.

## 11. Variables de entorno

Agregar solo las necesarias y documentarlas en `.env.example` con valores ficticios/no secretos cuando la política lo permita.

Esperables conceptualmente:
- duración de sesión;
- configuración de cookie/entorno;
- origen permitido;
- secretos/pepper si el diseño elegido realmente los necesita;
- configuración de rate limit;
- bootstrap solo mediante entorno operativo si se usa ese mecanismo.

No inventar secretos dentro de Angular. No versionar valores de bootstrap reales.

Si una política nativa bloquea `.env.example`, aplicar el mismo patrón seguro de H0: pedir al usuario crear/modificar manualmente solo el ejemplo necesario y reanudar después.

## 12. Pruebas mínimas obligatorias

### Backend

Cubrir al menos:

- hash/verify Argon2id;
- login válido;
- email inexistente, password incorrecta e inactivo → mismo error genérico;
- sesión persistida y `/auth/me`;
- cookie con atributos esperados;
- expiración;
- logout;
- sesión revocada no vuelve a funcionar;
- CSRF inválido/ausente;
- origen inválido;
- rutas admin sin sesión;
- `mustChangePassword` bloquea endpoints admin;
- change-password revoca otras sesiones y conserva/rota la actual según diseño;
- alta de admin;
- email duplicado;
- desactivación revoca sesiones;
- última cuenta activa protegida;
- reset de contraseña revoca sesiones y fuerza cambio;
- `expectedVersion` conflictivo;
- password hash nunca aparece en respuestas;
- rate limit del login;
- migración desde base limpia.

### Frontend

Cubrir al menos:
- formulario login;
- error genérico;
- loading/submitting;
- restauración de sesión;
- guard;
- 401;
- flujo must-change;
- logout;
- listado de usuarios;
- alta/desactivación/reset;
- conflictos de negocio visibles;
- secretos/contraseñas no persistidos.

### Integración

Recorrido real:
1. bootstrap de primer admin;
2. login;
3. cookie/sesión;
4. reload + `/auth/me`;
5. acceso a `/admin`;
6. creación de segundo admin;
7. login del temporal;
8. obligación de cambio de password;
9. cambio de password;
10. desactivar una cuenta no final;
11. intento de desactivar la última activa bloqueado;
12. logout y acceso posterior denegado.

Usar PostgreSQL real.

## 13. Verificación visual y accesibilidad

Ahora existe una UI funcional que justifica revisar parte de la deuda visual de H0.

Cuando haya navegador/herramienta disponible, verificar al menos login, cambio de contraseña, layout admin y usuarios en:
- 360 px;
- 768 px;
- 1440 px;
- teclado/foco;
- zoom/reflow;
- contraste de combinaciones principales.

Si el entorno no ofrece navegador real, no inventar PASS. Registrar lo pendiente y entregar una checklist manual acotada.

## 14. Review

Los reviewers deben inspeccionar especialmente:

### Seguridad
- hashes;
- cookies;
- sesiones;
- CSRF/origen;
- rate limit;
- enumeración;
- logs;
- bootstrap;
- revocación;
- última cuenta activa.

### Contrato
- OpenAPI vs runtime;
- errores;
- paginación;
- versionado;
- `mustChangePassword`.

### Frontend
- no confiar en guard como seguridad;
- ausencia de tokens en storage;
- 401/403;
- loops de navegación;
- formularios y accesibilidad.

### Base
- migraciones;
- uniqueness;
- índices;
- FK;
- expiración/revocación;
- no borrar historia o usar cascadas peligrosas.

### Alcance
- no adelantar H2;
- no introducir roles/OAuth/cliente login.

## 15. Verify

El verificador independiente debe ejecutar contra el **mismo commit candidato** que se entregue:

- instalación desde lockfiles cuando corresponda;
- frontend build/lint/tests;
- backend build/lint/unit/e2e;
- Prisma validate/generate;
- migración desde base limpia;
- OpenAPI static/live;
- PostgreSQL real;
- smoke H1 completo;
- comprobaciones de cookies/sesiones/CSRF sin imprimir secretos;
- ausencia de secretos rastreados;
- estado Git limpio;
- revisión de cambios desde `h0-approved`;
- verificación visual si la herramienta existe.

No asignar PASS a algo no ejecutado. Usar PASS / FAIL / BLOCKED / NOT APPLICABLE.

## 16. Criterios de aceptación H1

H1 puede entregarse para auditoría solo si:

1. Login/logout/revocación funcionan realmente.
2. Sesiones sobreviven recarga y se validan desde PostgreSQL.
3. Passwords usan Argon2id con parámetros documentados.
4. CSRF + origen protegen mutaciones.
5. Endpoint admin sin sesión es inaccesible.
6. `mustChangePassword` se impone en backend y frontend.
7. Gestión básica de admins funciona.
8. No se puede dejar cero administradores activos.
9. Reset/desactivación/cambio de password revocan sesiones según regla.
10. OpenAPI coincide con runtime.
11. Frontend y backend están integrados sin mocks residuales en el flujo entregado.
12. Migraciones arrancan desde base limpia.
13. Build/lint/tests/smoke finales pasan o cualquier bloqueo real queda explícito.
14. Review + Verify cubren el candidato exacto.
15. No hay secretos/versiones de credenciales en Git/evidencia.
16. `docs/milestones/H1-informe.md` existe.
17. H2 no fue iniciado.

## 17. Git

- partir de `main` aprobado/tag `h0-approved`;
- rama sugerida `feat/h1-auth`;
- commits locales pequeños/revisables;
- no reescribir historial;
- no force-push;
- no push;
- no merge a main;
- no tag de H1;
- conservar `chore/h0-base`.

La integración y publicación de H1 se autorizan únicamente después de la auditoría externa.

## 18. Informe final

Guardar `docs/milestones/H1-informe.md`.

Debe incluir:
- estado inicial/final;
- rama, commit base y candidato;
- workers/reviewers/verify realmente utilizados;
- archivos y migraciones;
- modelo final H1;
- mecanismo de sesión;
- mecanismo CSRF;
- cookie y expiración;
- Argon2id/parámetros/fuente;
- procedimiento bootstrap;
- endpoints y cambios de contrato;
- pruebas con comandos, exit code y conteos;
- smoke real;
- Review;
- Verify;
- verificación visual o limitación;
- secretos/guardas;
- incidentes y RED/GREEN relevantes;
- deuda técnica;
- matriz criterio por criterio;
- cualquier cambio de contrato;
- confirmación explícita de que H2 no comenzó.

No declarar H1 aprobado ni cerrado. Detenerse después de entregar el informe para auditoría.
