# H1 — Dirección de autenticación congelada, runtime pendiente

**Estado:** contrato candidato preparado; no implementación ni aprobación externa. [OpenAPI](../../contracts/openapi.yaml) es la única norma de interfaces; esta decisión explica su protocolo y los prerrequisitos operativos. No amplía DTOs, permisos ni alcance comercial. Ver [prompt H1](../milestones/H1-prompt.md) e [informe parcial](../milestones/H1-informe.md).

## Protocolo e interfaces

Son nueve operaciones H1 más `GET /health` existente. Todos los administradores tienen iguales capacidades; no hay roles ni login de clientes.

| Operación | Resultado exitoso / regla |
|---|---|
| `GET /api/v1/auth/csrf` | 200 `CsrfMetadata {csrfToken, headerName}`; contexto pre-auth anónimo o nonce de sesión ordinaria. Sesión restringida: 403 `PASSWORD_CHANGE_REQUIRED`. |
| `POST /api/v1/auth/login` | `{email,password}` → 200 `AdminSessionView`, cookie y nonce rotados; destruye contexto pre-auth y borra su cookie. |
| `GET /api/v1/auth/me` | 200 `AdminSessionView`; permite restaurar sesión restringida y recuperar nonce existente por cabecera. |
| `POST /api/v1/auth/logout` | 204 sin cuerpo; siempre valida Origin. Con sesión activa exige CSRF, revoca y borra cookie; sin sesión activa solo borra cookie obsoleta. |
| `POST /api/v1/auth/change-password` | `{currentPassword,newPassword}` → 204 sin cuerpo; renueva sesión actual y revoca las otras atómicamente. |
| `GET /api/v1/admin/users` | 200 `AdminUserList {items,pageInfo}`; paginación y ordenamiento acotados. |
| `POST /api/v1/admin/users` | `{name,email,temporaryPassword}` → 201 `AdminUserView`, activo, versión 1, cambio obligatorio. |
| `PATCH /api/v1/admin/users/{id}` | `expectedVersion` y al menos `name` o `active` → 200 `AdminUserView`; email/password no editables aquí. |
| `POST /api/v1/admin/users/{id}/reset-password` | Solo `{temporaryPassword,reason}` → 204; sin `expectedVersion`, fuerza cambio, incrementa versión y revoca todas las sesiones del destino, también si es el llamador. No cambia active. |

`AdminSessionView` contiene únicamente `admin {id,name,email,mustChangePassword}` y `expiresAt`. `AdminUserView` contiene `id,name,email,active,mustChangePassword,version,createdAt,updatedAt`; no hashes ni datos internos de sesión. Objetos H1 rechazan propiedades adicionales. IDs UUID opacos; fechas H1 RFC3339 UTC con `Z`. Nombre: 1–100 puntos de código Unicode; email: formato email, máximo 254.

Todos los resultados H1, incluidos errores, llevan `Cache-Control: no-store`. `X-CSRF-Token` es obligatorio en me/login 200 y change-password 204, **no** en el DTO de identidad. Las cabeceras `Set-Cookie` múltiples son campos separados, nunca unidos por comas. Los 429 llevan `Retry-After` en segundos enteros no negativos. El sobre de error sigue `code,message,fieldErrors?,requestId` sin valores de entrada, SQL ni stack.

| Control | Dirección seleccionada |
|---|---|
| Sesión | Identificador independiente CSPRNG de 32 bytes, base64url sin padding. PostgreSQL guarda solo SHA256 del identificador; nonce CSRF independiente de 32 bytes, recuperable de forma protegida. Sin HMAC casero ni JWT. El nonce solo no autentica. |
| Pre-auth | Contexto separado en PostgreSQL: ID aleatorio hasheado y nonce independiente, TTL 15 min; no es sesión autenticada. Login exitoso lo destruye. |
| Cookie | `abar_admin_session`: host-only, sin Domain, HttpOnly, SameSite=Lax, Path=/api/v1, Expires y Max-Age explícitos. `abar_auth_context`: mismas defensas, Path=/api/v1/auth. Secure en HTTPS; excepción solo HTTP loopback dev/test. Borrado con atributos coincidentes, Max-Age=0 y Expires pasado. |
| Estado servidor | Verificar active, expiración absoluta/idle y revocación en cada acceso. Ausencia, cookie desconocida/malformada o sesión vencida/revocada no resucitan sesión. Fallo de DB es 503, **no ausencia**, incluso en logout. |
| Origin y CSRF | Toda mutación exige Origin exacto de allowlist configurada. Missing/null/mismatch: 403 `ORIGIN_INVALID`, sin fallback Referer ni confianza en Forwarded/request. CSRF ligado a contexto/sesión; SameSite no basta. Logout sin sesión activa no exige prueba pre-auth. |
| Cambio obligatorio | Solo me/change-password/logout; no login, csrf ni users. No ampliar esta allowlist. Cambio propio verifica credencial actual, limpia la restricción y rota ID/nonce conjuntamente. |
| Revocación | Desactivación y reset revocan todas las sesiones destino. Cambio propio revoca otras y renueva actual. Login rota ID y nonce; no rotación por petición. |
| Pestañas | CSRF solo en memoria, nunca storage/logs. Una pestaña obsoleta puede refrescar me para un **futuro reintento explícito del usuario**; nunca reproducir escrituras automáticamente. |
| Email / versión | Trim y lowercase antes de guardar/comparar; unicidad PostgreSQL. PATCH incrementa versión atómicamente; obsoleta → 409 `VERSION_CONFLICT`. Reset también incrementa versión. |
| Última activa | Serializar protección para impedir cero admins activos aun con concurrencia; conflicto 409 `LAST_ACTIVE_ADMIN`. No basta comprobación previa fuera de transacción. |

Listado: page=1, pageSize=20, máximo 100; sort `name`, `email`, `createdAt`, con prefijo `-` opcional, defecto `-createdAt` y desempate id ascendente. No coerción silenciosa de consultas fuera de rango; páginas vacías conservan pageInfo. Reset reason: 1–500 caracteres, controles saneados; auditoría sin contraseña ni eco de entradas.

Errores por operación están enumerados en OpenAPI: validación/política 400; credenciales genéricas o sesión vencida 401; Origin/CSRF/restricción 403; usuario inexistente 404 solo tras autorización; email/versión/última activa 409; límites 429; dependencia 503. Login inexistente, incorrecto o inactivo devuelve el mismo `INVALID_CREDENTIALS` con trabajo equivalente de verificación.

## Contraseñas y blocklist pendiente

Argon2id mínimo **m=19456 KiB, t=2, p=1**, salts de biblioteca. Nuevas/temporales: 15–128 puntos de código Unicode después de NFC; preservar whitespace, sin composición arbitraria ni truncamiento. Login/currentPassword acepta 1–128 para verificación incorrecta genérica; aplicar NFC consistentemente. No registrar contraseñas, cookies, identificadores o nonces completos.

**Propuesta de fuente offline, no descargada ni implementada:** [SecLists — Passwords/Common-Credentials/10k-most-common.txt](https://github.com/danielmiessler/SecLists/blob/master/Passwords/Common-Credentials/10k-most-common.txt). Antes de entregar backend, el writer debe revisar procedencia/licencia, fijar commit completo y SHA256 del recurso y documentar actualización por revisión explícita de un nuevo pin/digest. **Commit y digest de la lista siguen sin resolver**; el enlace mutable es un localizador, no un pin. Comparar contraseña completa y entradas normalizadas NFC, no subcadenas; runtime totalmente offline, sin enviar contraseñas a terceros. Una lista derivada de contexto obvio (p. ej. nombre del comercio) es opcional, justificada y no implementada; políticas nuevas requieren decisión del padre, no cambio silencioso de norma.

## Defaults y validación operativa futura

| Parámetro | Default / límite de evidencia |
|---|---|
| Sesión | Absoluta 8 h; idle 30 min; pre-auth 15 min. |
| Login | IP 10/60 s y cuenta normalizada 10/15 min; respuestas no enumerables. |
| CSRF anónimo | 30/60 s. |
| Rate limiter | Por proceso, reset al reiniciar; sin lockout permanente ni Redis obligatorio. |
| Argon concurrente | **Propuesta 4**, benchmark no realizado; validar cola/bounds y carga antes de entrega. |
| Orígenes locales | `http://localhost:4200`, `http://127.0.0.1:4200`; tests pueden inyectar origen local explícitamente propio. Proxy same-origin; no CORS credentialed arbitrario. |

Nombres exactos de variables, límites de configuración, protección del nonce recuperable, limpieza acotada de contextos/sesiones, recursos del limiter y bootstrap seguro se resolverán y validarán en backend; no se inventan variables ni contenido de entorno aquí. `argon2@0.45.1` tiene metadata/native prebuild consultados, **no** prueba de carga nativa o rendimiento. Respetar política de scripts; no scripts forzados ni compilador global. Si hace falta actualizar el ejemplo de entorno, pedir edición manual ficticia acotada: la denegación sensible H0 sigue vigente, sin bypass. Runbook y comando bootstrap aún no existen.

## Fuentes y gate

El explorer `murf6fch-j-wlly` leyó las siete fuentes requeridas del hito. El challenge `murfeu8d-l-lvvt` respaldó la separación estándar sesión/nonce; el verificador `murf70ic-k-6xzs` obtuvo HTTP 200 de las guías oficiales siguientes (evidencia previa, no nueva consulta aquí):

- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html)

El digest de norma y evidencia static están en el informe. Falta LIVE transicional H0 y review nativa de la unidad normalizada completa antes de cerrar freeze. Cualquier incompatibilidad de interfaz/seguridad pausa el frente afectado para decisión; no se parchea la norma automáticamente. Review + Verify del mismo candidato final son obligatorios antes de auditoría H1. P01–P10, reglas de comprador y rollout comercial siguen abiertos/cerrado respectivamente; H2 no iniciado.
