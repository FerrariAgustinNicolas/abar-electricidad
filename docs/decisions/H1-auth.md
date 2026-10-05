# H1 — Dirección congelada, fundamentos runtime preparados

**Current status:** contract frozen; C01–C10 closed. C11 prepares offline Docker observations only; parent ASSESS, functional Verify, native consent/review and local commit remain pending. Auth/admin endpoints and external audit remain pending. [OpenAPI](../../contracts/openapi.yaml) es la única norma de interfaces; esta decisión explica su protocolo y los prerrequisitos operativos. No amplía DTOs, permisos ni alcance comercial. Ver [prompt H1](../milestones/H1-prompt.md) e [informe parcial](../milestones/H1-informe.md).

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

**Fuente offline seleccionada; generador/asset C03 y loader standalone C04 preparados, integración pendiente:** [SecLists — Pwdb_top-1000000.txt](https://github.com/danielmiessler/SecLists/blob/913b327317496d062bcc7cace524aaad8a693be2/Passwords/Common-Credentials/Pwdb_top-1000000.txt), pin `913b327317496d062bcc7cace524aaad8a693be2`, SHA256 raw `e9a88f67aafe65496682dc374559ee714e978bee50314767494c3e37a18c9fc8`. La reutilización requiere ambos avisos MIT completos: SecLists (2018 Daniel Miessler) y origen ignis-sec/Pwdb-Public (2020 Ata Hakçıl), pin `9b53917431ed5cd57cd6cbec8c3a19cf9a5cd8dd`. La opción 10k se descartó por cobertura insuficiente del filtro de longitud; no se afirma completitud ni cumplimiento NIST. Actualizar solo mediante revisión explícita de nuevo pin/digest. Comparar contraseña completa y entradas normalizadas NFC, no subcadenas; runtime totalmente offline, sin enviar contraseñas a terceros. Una lista derivada de contexto obvio (p. ej. nombre del comercio) es opcional, justificada y no implementada; políticas nuevas requieren decisión del padre, no cambio silencioso de norma.

### Primitiva de política independiente (slice 02)

[`password-policy.ts`](../../backend/src/auth/password-policy.ts) está **standalone, sin registro Nest ni efectos HTTP**. `normalizeCredentialPassword` exige string Unicode bien formado, rechaza surrogates aislados y aplica solo NFC; conserva case, whitespace y controles, con 1–128 puntos de código posteriores a NFC. Es para futura verificación de credenciales, no aplica blocklist.

`deriveBlocklistDigest` produce exclusivamente una **clave pública del índice denylist**: NFC → `String.toLowerCase()` por defecto, independiente de locale → UTF8 → SHA256 hex lowercase. Nunca es prehash ni entrada de Argon. No impone bounds de contraseña a fuente/clave: U+0130 con 13 ASCII tiene fuente14/alias15; con 127 ASCII tiene entrada128/clave129. No trim, nueva normalización post-lower ni filtro adicional.

`validateNewPassword` devuelve el string normalizado privado, case-sensitive, de 15–128 puntos de código; exige `PasswordBlocklistLookup.hasDigest` síncrono y consulta una sola vez el digest completo tras validar entrada. Ausencia, acceso/call fallido y resultados no booleanos (incluidas Promises) cierran con error `unavailable`; true es `blocked`, no fallo de dependencia. Conserva receiver del método. `PasswordPolicyError` expone únicamente kind `invalid`, `blocked` o `unavailable` y mensajes fijos, sin entradas, digest ni causas. El futuro adapter mapeará validación/política a 400 y dependencia a 503; aquí no hay códigos HTTP ni cambios de DTO.

Los tests de C02 usan lookup sintético, **no prueban cobertura offline real**. C03 prepara asset/generador con ambos avisos MIT; C04 añade integración con ese asset, sin afirmar cobertura exhaustiva. C05 prepara Argon standalone; servidor y adaptación HTTP siguen pendientes. Estos ejemplos Unicode no prueban no-encogimiento general ni conteo final del corpus; el filtro histórico pre-lower de 5329 claves no es automáticamente el conteo del asset. Evidencia de probes/licencias permanece separada; este slice no obtiene datos ni crea cuentas.

### Generador offline independiente (slice 03)

[`h1-password-blocklist.mjs`](../../scripts/h1-password-blocklist.mjs) usa solo APIs Node; importar el kernel no accede a filesystem/red. El CLI exige Unicode `17.0`, bytes/SHA/filas del pin fijo y ambos LICENSE íntegros antes de escribir únicamente resource/manifest en rutas fijas del proyecto. `--source` permite ubicación local, **no otra fuente**; sin overrides, repin, env switch ni fetch. Kernel sintético reservado a tests, sin bypass CLI.

Framing medido: 8.755.171 bytes, 1.000.000 LF/filas, cero CR, LF terminal, sin BOM inicial; UTF8 fatal. LF es el único delimitador: se retira solo un LF terminal obligatorio; LFs anteriores representan filas, incluso vacías. CR, U+FEFF (con `ignoreBOM:true`), controles y espacios se conservan como datos; no trim, coerción ni sustitución de Unicode inválido. Framing sin LF terminal se rechaza.

Filtro exclusivo: longitud en puntos de código de **NFC → lowercase por defecto** ≥15; no mínimo de fuente ni máximo128 para fuente/clave, ni NFC posterior. Fixtures protegen fuente14/alias15, entrada128/clave129 y reordenamiento que introduciría NFC posterior. La base independiente Unicode17 cubrió 1.112.064 escalares y 104 reglas raíz SpecialCasing (mínimo1, cero salidas vacías; Final_Sigma produce1). Es fundamento acotado, no prueba de todas las cadenas, conformidad independiente del runtime, otros Unicode/locales o NFC posterior.

Resultado medido nuevo (no heredado del filtro histórico): **5.406 filas elegibles, 5.329 digests únicos, 170.528 bytes**. Binario: registros SHA256 completos de32 bytes, concatenados, orden lexicográfico estricto y sin duplicados/plaintext. SHA256 resource `7a85af89d0f800cc94cbe81ad5a11de7590da24a5ed33c6a5bc5e7f0abea1eb0`; manifest `581027ae246da0bacf0d71a65a35edad5a20a71c5fcfe2d810513b128bfdb510`. JSON canónico versionado con orden fijo/newline, estadísticas derivadas, pin/Unicode/filtro/licencias, sin timestamps ni rutas máquina. Ambos avisos MIT completos, byte-exactos, están en `backend/resources/auth/LICENSE.pwdb.txt` (1069 bytes) y `LICENSE.seclists.txt` (1072 bytes); URLs, commits y SHA quedan en manifest.

Reproducción desde raíz, con cache público ignorado previamente adquirido del URL raw fijado y avisos verificados:

```sh
node --test scripts/h1-password-blocklist.test.mjs
node scripts/h1-password-blocklist.mjs --source odd/probes/h1-blocklist/source.txt
shasum -a 256 backend/resources/auth/password-blocklist.bin backend/resources/auth/password-blocklist.manifest.json
```

Repetir generación produce los mismos hashes de ambos archivos. No versionar/dumpear corpus plaintext. **C03 no incluyó loader ni trust anchor runtime**; C04 los prepara standalone, sin registro Nest. El build de C03 Prisma+`tsc` no copiaba estos resources; C06 añade distribución autenticada, sin integración runtime. Los hashes públicos no son secretos ni hashes Argon. No certificación NIST, completitud, legalidad por entrada ni cobertura de todas las contraseñas. C03 quedó commiteado en `2bcb43b94671ac4b4f63790586ae0df2bd789a75`, con review/Verify históricos registrados en el informe; esa autoridad no aprueba C04.

### Loader offline independiente (slice 04)

[`password-blocklist.ts`](../../backend/src/auth/password-blocklist.ts) exporta `createPasswordBlocklist(resource, manifest)` puro y `loadPasswordBlocklist(trustedDirectory)` explícito. No tiene ruta por defecto, env, lectura al importar, registro Nest, reload, red ni override de pin. La fábrica solo acepta los bytes reales anclados de C03; no hay fixtures que reautoricen producción.

Los SHA256 de resource/manifest están compilados, junto con 5329 registros de32 bytes/170528 bytes. Primero se autentican los bytes raw del manifest, después UTF8 fatal/JSON y esquema/valores exactos (Unicode17, fuente/pin, mínimo15/máximo null, estadísticas y notices). Copias defensivas preceden validación/retención; orden ascendente estricto y unicidad se validan antes de devolver un objeto congelado con buffer privado. `hasDigest` síncrono usa búsqueda binaria O(log n), sin I/O; exige string hex lowercase de64 caracteres. Entrada malformada o dependencia corrupta produce únicamente `PasswordPolicyError('unavailable')`, mensaje fijo sin paths, digests, causas ni errores nativos; nunca false como fallback.

La carga explícita exige cuatro nombres fijos: binario, manifest y ambos LICENSE completos. Abre descriptor, verifica archivo regular/tamaño, asigna buffer acotado, completa lecturas parciales, comprueba EOF y cierra en finally. Caps: resource170528 exactos, manifest32768 máximo, Pwdb1069 y SecLists1072 exactos con sus SHA compilados. Truncamiento, crecimiento detectado, corrupción o falta de cualquier archivo cierran la política. El caller debe proporcionar un directorio confiable; no es sandbox de paths ni defensa contra un propietario hostil del directorio.

La ruta histórica `path.resolve(__dirname, '../../resources/auth')` desde `src/auth` o `dist/auth` carga la fuente, no el artefacto empaquetado. C07 usa la ruta fija al destino compilado descrita abajo; el helper no resuelve ubicaciones por su cuenta. Un probe compilado carga `backend/resources/auth` explícitamente, **no prueba copia/distribución del build**. La integración real con `validateNewPassword` establece primero pertenencia del ejemplo público débil; no crea cuentas/bootstrap ni certifica runtime H1. C04 quedó cerrado en `e65c4d620fd332ec8ffe0d470e7a723901edc5ba`, tree `b946b83a84fbef3534cba4517acac3b83c549cf9`: review histórica `review-2898763254cded6d`, cuatro lentes aprobados/acuse consumido, Verify independiente 80 loader/486 unit/6 suites/15 comandos. Esa evidencia no aprueba C05; distribución, PostgreSQL propio, sesiones/bootstrap/admin, frontend/navegador y full H1 LIVE siguen pendientes.

### Argon acotado independiente (slice 05)

[`PasswordHasher`](../../backend/src/auth/password-hasher.ts) exige snapshot defensivo congelado de concurrency1–4/queue0–64; no defaults propios ni lectura de env. C1 proporciona defaults1/16. Dependencia backend fijada `argon2@0.45.1`, instalada normalmente sin bypass: warning de scripts no cubiertos registrado, **no aprobación de scripts**. Importar carga el addon nativo normalmente; no inicia hashes/jobs ni lee configuración global, sin afirmar cero I/O del loader.

Credencial privada: NFC solamente, case/whitespace preservados, 1–128 puntos de código; sin SHA, lower, trim ni truncamiento. Política nueva15–128/blocklist permanece upstream y separada. Hash Argon2id v19/m19456KiB/t2/p1/hash32, salt aleatorio por biblioteca (16 bytes); sin salt/parametrización públicos. PHC privado limitado a256 ASCII, seis segmentos exactos, factores únicos exactos en cualquier orden y base64 estándar canónico sin padding (salt16/hash32). Se valida antes de admitir verify y también el resultado de hash. Metadatos corruptos/costos distintos no llegan al nativo; mismatch nativo booleano es el único false.

Una FIFO compartida hash/verify reserva slots síncronamente y espera acotada, incluso queue0; finally libera y arranca el siguiente sin robo de turno. Config inválida/getters, overload, fallos nativos y resultados inválidos producen error nuevo `PasswordPolicyError('unavailable')`, mensaje fijo sin causas; credencial inválida conserva `invalid`. Sin HTTP/adapters, timers, registro Nest, cuentas ni logging. Strings en espera permanecen necesariamente en memoria JS: no garantía de zeroización.

86 tests incluyen FIFO determinista con mocks/deferred, límites1–4/capacidad0/16/64/mutación del caller/cleanup, guard PHC y tres tests nativos funcionales con **cinco hashes exitosos (2+1+2)**; el probe compilado independiente añade un hash por separado. No son certificación de carga/RSS/seguridad ni autorización para aumentar capacidad nativa: default1 conservador, 2–4 requieren revisión futura de recursos. Verify funcional independiente C05 **GREEN** (`musb0v7p-1n-cnwe`), sin códigos numéricos de salida expuestos; documentación normalizada antes del freeze. C05 cerrado en `497648503b8f357c7488dac4e10082dd70420f6b`, branch `feat/h1-auth-05-argon`: review `review-cbe322421715bff4`, cuatro lentes APPROVED/acuse exacto consumido; Verify independiente y commit comparten tree `96087c61dad61f5d9c077c0cb0d957e44e281aa0`. Cuatro SHA funcionales preservados durante normalización documental. Historia RED/GREEN y evidencia independiente separadas en el informe; aprobación workspace no transfiere autoridad al rango commiteado ni a H1 completo.

### Empaquetado offline completo (slice 06)

El build ejecuta [`copy-auth-resources-cli.mjs`](../../backend/scripts/copy-auth-resources-cli.mjs) después de Prisma generate y `tsc`; esta entrada llama a la biblioteca [`copy-auth-resources.mjs`](../../backend/scripts/copy-auth-resources.mjs). Resuelve desde `import.meta.url` la fuente fija `backend/resources/auth` y el destino `backend/dist/resources/auth`, sin selección por caller, cwd, env ni flags. Copia exactamente binario, manifest y ambos LICENSE completos, sin borrar archivos ajenos; admite repetición.

El loader C04 compilado en `backend/dist/auth/password-blocklist.js` autentica la fuente **antes de crear/copiar el destino** y autentica el destino después de las cuatro copias. Pins/counts permanecen exclusivamente en C04. Importar el copier no carga recursos ni el loader; API de cero argumentos, separada del CLI deliberadamente ejecutable (no utility importable). El CLI rechaza argumentos y llama incondicionalmente al copier, sin depender de `import.meta.main`, igualdad argv/realpath ni patch floor de Node24.x. Cualquier fallo expone solo `Auth resource packaging failed.`, sin causa/path/bytes; CLI termina con código1. No hay rollback transaccional: un fallo de copia puede dejar artefacto parcial, nunca certificado como completo.

15 tests con réplicas temporales propias verifican bytes completos, ambos avisos MIT, cwd ajeno/repetición, falta/corrupción de cada archivo, destino corrupto y errores redactados. La regresión elimina y comprueba ausencia de `import.meta.main` solo en una réplica temporal del entry: RED exit1 (1 failed/14 passed, CLI exit0 sin artefacto) → GREEN exit0 (15/15). Node24.0/24.1 no fueron ejecutados: defecto inferido de la política Node24.x y API introducida en24.2; simulación en24.18.1, sin certificar todas las patches. Build y probe real del destino compilado confirman carga síncrona; no es certificado solo con mocks. C06 cerrado en `777dbfac9df307a635e3f91fc9edac9bdb19e09f`: review `review-60c6c78737ad0617`, cuatro lentes APPROVED/acuse consumido; Verify independiente fresco, todos exit0, tree `1a976b69e5d2f39fc6482b51d9daa8270557933d` idéntico al commit y postcommit limpio. Ver detalle histórico en el informe; no transfiere aprobación workspace al rango commiteado ni a runtime completo.

### Composición runtime Nest (slice 07 — snapshot histórico pre-freeze)

El estado pendiente de este snapshot se conserva; el cierre posterior figura abajo.

[`AuthRuntimeModule`](../../backend/src/auth/auth-runtime.module.ts), registrado en AppModule, exporta solo el token `AUTH_RUNTIME` y su singleton cohesivo `{config,blocklist,hasher}` por contenedor. La fábrica captura `{...process.env}` una vez al instanciar, no al importar; entrega el record raw completo a C01, conservando validación de AUTH_* desconocidos y NODE_ENV. No usa el resultado del validador H0, que elimina AUTH_*; ConfigModule conserva `ignoreEnvFile:true`.

C04 carga los cuatro archivos autenticados desde `resolve(__dirname, '../../dist/resources/auth')`: tanto `src/auth` en Jest como `dist/auth` compilado resuelven el mismo destino empaquetado. Sin cwd/env switch, override de directorio, fallback a fuente ni pins duplicados. Después construye un único PasswordHasher C05: misma instancia/FIFO para todos los consumidores. Congela el wrapper, no los internos mutables del hasher; config/orígenes ya llegan congelados. Importar el módulo no valida env, carga recursos ni construye hasher.

**Prerrequisito operativo explícito:** ejecutar `npm --prefix backend run build` antes de tests, `start` o `start:dev`. El watch de Nest no ejecuta el packager; no se añade automatización ni fallback para ocultar assets faltantes. Se mantiene Node24.x, sin haber ejecutado24.0/24.1.

Los [26 tests](../../backend/src/auth/auth-runtime.module.spec.ts) incluyen source Jest con carga real empaquetada y rechazo en `NestFactory.create` con `abortOnError:false`. Once casos usan réplicas temporales propias de JS compilado y cuatro archivos públicos, resolución normal de dependencias y cwd ajeno: singleton/lookup booleano positivos; config inválida y falta/corrupción de cada archivo rechazan antes de devolver aplicación. Sin Prisma, PG, socket, hash nativo, override productivo ni mutación del candidato. Los negativos source con loader mock son aislamiento, no esta prueba de integridad compilada.

El flujo main existente `NestFactory.create(AppModule)` → configureApplication → puerto → listen no cambia; un fallo del proveedor rechaza creación antes de avanzar a listen. Los cinco e2e H0 con Prisma mock permanecen GREEN. Esto prueba el artefacto **AuthRuntimeModule standalone**, no arranque completo AppModule con DB ni endpoints H1. Review C07, Verify independiente y commit pendientes del padre; PostgreSQL propio, sesiones/bootstrap/admin, Angular/navegador, carga/RSS y full H1 siguen pendientes.

### C07 cerrado; frontera CLI C08 preparada (historical pre-freeze snapshot)

C07 quedó cerrado en `71e6abf590721466a6ea8572a948a69174964437`, tree
`9af840430c1291a22fcef538eb929ddc2bf29f94`. Review nativa
`review-10051ed7f7701d1d`: cuatro lentes APPROVED, acknowledgement exacto consumido.
Verify independiente: todos exit0, 26 runtime, 598 unit/ocho suites, 15 packaging,
cinco mock e2e, 10 generador, 11 contractuales/siete ejemplos, build/lint/tres parses,
pins y cinco SHA estables. Los once fixtures compilados prueban AuthRuntimeModule,
**no arranque AppModule/DB completo ni certificación H1**. Supersede solo el pendiente
histórico C07; no transfiere autoridad a C08.

C08 sustituye la selección accidental de conexión por una denegación incondicional
en `backend/prisma.config.ts`, sin env, fallback, datasource ni inferencia argv.
`backend/prisma.schema.config.ts` exporta un objeto de configuración con el mismo
schema; generación/validación/build lo seleccionan con `--config`. No cambian schema,
generator, output, dependencias ni kernels C01–C07. Uso y límites en [README](../../README.md#prisma-configuración-explícita-sin-datasource-c08).

La frontera impide uso **accidental por defecto**, no selección deliberada de otro
`--config`/`--url`. Bare generate/validate/migrate status están intencionalmente
cerrados. El loader instalado es real; los tests usan solo flags booleanos y error
fijo. Las negativas CLI seleccionan una copia del config real en fixtures propios,
con HOME/XDG/TMP/Jiti aislados y env saneado. Prisma escribe commands.json antes de
cargar config: aislamiento no equivale a ausencia absoluta de I/O o sandbox de red.

ASSESS, review nativa, Verify independiente y commit C08 quedan **PENDING** del padre.
Guard de propiedad/runner/config confiable de migraciones/provisión y PG real C09+
quedan separados y pendientes. Se conserva la autorización futura de PostgreSQL
`17.11-bookworm` nuevo, exclusivo/local, sin tocar Compose/H0/bases existentes ni
borrado automático; no se ejerce en esta unidad.

## C08 closed; C09 offline ownership contract

C08 **CLOSED** at `80e32a754512011a4c51a42198a55bb56d34a2c4`, tree
`46cce4da053ee60c902cf0d2ac0d7611c183204b`. Native review
`review-ce3c99e320c9a121` returned four APPROVED lenses; the exact ACK was BURNED.
Independent verification completed 18 checks, all exit 0, plus exact BASE71
eight-file generated-client SHA equality. This supersedes only C08's historical
pending status above, not later units. No consumed authority is replayed.

### Decision: persistent recovery, not automatic adoption

C09's [importable contract](../../backend/scripts/h1-owned-postgres.mjs) has no CLI,
import/direct-execution I/O, Docker/PG adapter, datasource config or child execution.
The future persistent location is `odd/probes/h1-owned-postgres/state/`; C09 never
opens or creates it. Private helpers execute only against uniquely owned test
fixtures. A local record is a mutable accidental-misuse control, not cryptographic
ownership authentication against hostile same-user/root access.

The following table preserves the **historical C09 v1** contract; C10 supersedes
its credential and mount schemas below, without retroactively certifying v1.

| Contract | Fail-closed rule |
|---|---|
| Pair | Exact version-1 record/secret keys, generated run/DB/role/password, cross-file run/version binding, fixed `postgres:17.11-bookworm`. `creating` is recoverable but not migratable; only complete `provisioned` records reach gates. |
| Resource | Exact container ID, immutable image ID, generated container/volume identity and labels, explicit PG17 data-volume mount, read-only secret mount, allocated port on `127.0.0.1`, running state. No caller URL/owned flag. |
| Files | Existing private fixture directory 0700; exclusive new files 0600; descriptor regular-file/owner/mode/single-link checks, actual reads capped at 8192 bytes, fatal UTF-8, final no-follow and component symlink rejection. No chmod repair or overwrite. |
| Lock/recovery | Exclusive token/inode-bound lock; conflicts and stale locks deny. Release only the acquired inode/token. Two exclusive file writes are not an atomic pair: partial, missing, malformed or mismatched pairs deny; uncertain originals and the acquired ambiguity-barrier lock remain; release/read/retry deny after any failed pair write, including a possible late sync failure. No automatic reclaim, resource cleanup or lifecycle overwrite. |
| Gates | Snapshot complete pair → inspect exact ID and compare all resource fields → authenticated expected DB/role, existing DB, no superuser/CREATEDB/CREATEROLE, public-only schema and empty table inventory → immediate final reinspection → fixed plan. |
| Plan | Explicitly `offline-injected-not-certified`; local Node + installed Prisma path, `migrate deploy`, fixed future `backend/prisma.h1-owned.config.ts`. Only generated `H1_OWNED_DATABASE_URL` in child env; no ambient env, npx, arbitrary args/config/URL, or executor. The plan is sensitive and must not be logged. |

Local POSIX filesystem assumptions are explicit: Node has no directory-fd/openat
path binding here, so ancestor checks do not protect against hostile concurrent
same-user/root replacements. Network-filesystem semantics, Windows ACLs and crash
power-loss durability are not certified by fsync or these tests. The JSON secret
mount is a provenance shape, **not** a PostgreSQL password-file implementation.
Credential extraction/transport, safe lifecycle updates, role grants, full freshness
queries, platform isolation and real installed-Prisma behavior need later adapters.

### Official constraints for later adapters

These supplied references constrain design; neither documentation nor fake evidence
certifies a real fresh owned PostgreSQL resource:

- [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/): loopback publishing has pre-28 same-L2 exposure and bridge/direct-routing caveats; port checks alone are not isolation proof.
- [Postgres image](https://hub.docker.com/_/postgres): `POSTGRES_USER` is a superuser; PG17 requires an explicit data mount to avoid an anonymous volume. Initialization applies only to an empty data directory; password `*_FILE` handling still needs a safe adapter, not this JSON mount.
- [pg_isready](https://www.postgresql.org/docs/17/app-pg-isready.html): valid credentials are not required for readiness. Readiness cannot establish authentication or freshness.
- [CREATE ROLE](https://www.postgresql.org/docs/17/sql-createrole.html): respect role defaults and avoid exposing password SQL in logs; the migration role must lack all three privileged attributes.
- [Node filesystem](https://nodejs.org/api/fs.html): exclusive `wx`, no-follow and OS/device sync have platform-specific limits; no atomic-pair or universal durability claim.
- [Prisma config](https://www.prisma.io/docs/orm/reference/prisma-config-reference): explicit config/env loading must be deliberate; the dedicated variable alone is not ownership proof.
- [migrate deploy](https://www.prisma.io/docs/orm/reference/prisma-cli-reference#migrate-deploy): may create a missing database; it does not reset, use a shadow DB or detect drift. Existence/freshness gates must precede it.

### C09 closure (supersedes historical pending snapshots)

C09 **CLOSED** at `4cd1b752db62604aabe441613ef44876985e2bee`, tree
`2a5b26343507c2d3797cea5caee0095c05aa4d98`. Independent verification observed
62 passing tests, two parser checks and diff check, all exit 0. Four native reviewers
APPROVED; the exact ACK was consumed/BURNED; post-commit Git was clean. No replay
or authority transfer to C10 or real PostgreSQL. Incident24 remains preserved,
nonblocking historical follow-up; no external namespace access or cleanup here.

## C10: separate roles and raw password-file projection (offline v2)

**Deliberate compatibility break:** only exact v2 pairs/resources can reach a plan.
Legacy v1 retained files fail closed and require separately authorized manual
recovery. No adoption, conversion, overwrite or stale-lock reclaim is provided;
old bytes and ambiguity locks remain intact. The future state path is policy only.

| Boundary | v2 decision |
|---|---|
| Retained pair | Record has version/run/state/image/database/bootstrapRole/migrationRole (plus resource only when provisioned). Private JSON secret has version/run/bootstrapPassword/migrationPassword. Both names and distinct credentials are internally generated and cross-bound; image remains `postgres:17.11-bookworm`. |
| Bootstrap | Generated `h1_bootstrap_<run>` is the image-init `POSTGRES_USER` superuser, never the migration role. Exact normalized bootstrap evidence contains role and passwordFile only; arbitrary environment/extra fields deny. No init or grant operations execute. |
| Migration | Generated `h1_migration_<run>` authenticates the expected existing DB with non-superuser/NOCREATEDB/NOCREATEROLE evidence, public-only schema and empty table inventory. Only its credential enters the dedicated URL; no bootstrap credential enters the fixed nonexecuting plan. |
| Projection | Exclusive private `bootstrap-password.txt` contains exactly the bootstrap password, with no JSON or newline. Retained `secret.json` is not mounted. Exact provenance binds version/run/file, future run-scoped source, `/run/secrets/h1-bootstrap-password` target and readOnly=true. Resource version/run and bind mount must agree. |
| Fixture API | `writePair` exclusively creates three files under its lock; partial writes retain the ambiguity barrier. `readPair` verifies actual bounded plaintext; `readProjection` exposes that plaintext with code-owned future provenance, not a claim of an actual mount. All private/no-follow/single-link protections apply. |
| Offline gates | `planOffline` requires exact inspect/authenticate/readProjection functions: inspect → actual-shaped projection check → migration authentication → projection recheck → immediate final inspect → frozen fixed plan. No executor, public runner or real-state API. |

The v2 evidence remains **offline-injected-not-certified**. Labels, an empty
inventory, an arbitrary caller boolean or a named-volume creation response cannot
prove ownership or freshness. Fixture provenance does not prove actual daemon
mounts, authentication, grants, UID permissions or continuity.

Supplied source evidence (no new network research): official image commit
`2603e26e245e558218728ee14e0a42dcb020dc7f` reads raw `file_env` text, rejects
env+FILE, skips initialization on PG_VERSION and uses a socket-only temporary
server; PG17.11 declares UID999/data VOLUME `/var/lib/postgresql/data`. Docker28 /
API1.48 has exact Id/mount/nullable-port shapes; named volumes can be reused,
and PublishAllPorts/restarts are not ownership/continuity proof. Future adapters
must establish actual projection/mount/permissions, immutable image/platform,
role grants/authentication and complete fresh-existing-DB provenance independently.
Installed Prisma behavior and real-PG certification remain pending.

C10 parent ASSESS, independent Verify, native review/ACK and local work-unit commit
remain **PENDING**. No real resource or migration was executed; C01–C08 checks
were not rerun. This does not certify H1 authentication or final audit readiness.

## Configuración validada; composición DI preparada

[`validateAuthConfig`](../../backend/src/auth/auth.config.ts) valida únicamente su argumento, sin leer `process.env`, registrar módulos ni modificar entradas. Devuelve objeto y lista de orígenes congelados. C07 conecta estos settings al proveedor de fundamentos en AppModule; no implementa sus futuros consumidores HTTP ni acredita hosting productivo o autenticación desplegada.

| Variable | Default | Límites inclusivos / regla |
|---|---|---|
| `NODE_ENV` | `development` | Solo `development`, `test`, `production`. |
| `AUTH_ALLOWED_ORIGINS` | Dev/test: `http://127.0.0.1:4200,http://localhost:4200` | Producción: explícitos HTTPS; 1–16 distintos. |
| `AUTH_COOKIE_SECURE` | true en producción o con cualquier origen HTTPS; false en otro caso | Booleano o strings exactos `true`/`false`; false solo HTTP loopback dev/test. |
| `AUTH_SESSION_ABSOLUTE_SECONDS` | 28800 (8 h) | 60–86400 |
| `AUTH_SESSION_IDLE_SECONDS` | 1800 (30 min) | 30–14400; ≤ absoluta |
| `AUTH_PREAUTH_SECONDS` | 900 (15 min) | 30–1800 |
| `AUTH_LOGIN_IP_LIMIT` | 10 | 1–1000 |
| `AUTH_LOGIN_IP_WINDOW_SECONDS` | 60 | 1–3600 |
| `AUTH_LOGIN_ACCOUNT_LIMIT` | 10 | 1–1000 |
| `AUTH_LOGIN_ACCOUNT_WINDOW_SECONDS` | 900 | 1–3600 |
| `AUTH_CSRF_IP_LIMIT` | 30 | 1–1000 |
| `AUTH_CSRF_IP_WINDOW_SECONDS` | 60 | 1–3600 |
| `AUTH_ARGON2_CONCURRENCY` | 1 | 1–4; cargas mayores requieren revisión de recursos |
| `AUTH_ARGON2_QUEUE_LIMIT` | 16 | 0–64; 0 sin espera en helper C05, compartido por C07 |

Unset significa `undefined`; null y tipos no admitidos se rechazan. Los números solo aceptan strings decimales sin signo ni whitespace o números enteros seguros; no coerción arbitraria, fracciones ni exponentes textuales. Flags `AUTH_*` desconocidos generan mensaje constante sin eco del nombre ni valor; campos ajenos se ignoran para permitir futura composición con configuración validada. Errores solo exponen nombres públicos conocidos, reglas y bounds, no entradas.

Los orígenes configurados se canonicalizan a `URL.origin`, deduplicados en orden; se rechazan userinfo, rutas salvo raíz, query/fragment incluso vacíos, wildcards, null y entradas vacías. La prohibición de wildcards se verifica tanto en sintaxis raw como en hostname canónico: percent-decoding e IDNA pueden introducir `*`; la regresión determinista confirma rechazo sin eco de URL. HTTP solo para hostname loopback `localhost`, `127.0.0.1` o `[::1]` en dev/test, sin DNS ni llamadas externas. La futura comparación del Origin entrante será **exacta contra el valor canónico configurado**, sin normalizar la petición; este slice no implementa middleware.

HTTPS personalizado exige cookie Secure. Un esquema mixto activa Secure global y puede afectar clientes HTTP; preferir esquemas consistentes. Secure=true en HTTP local es protección superior permitida, **no garantía de flujo de navegador**. No se agregan overrides SameSite/Domain/Path: los atributos del protocolo congelado siguen intactos. Rate limiting futuro por proceso, reinicio resetea límites, sin lockout permanente ni Redis.

El probe nativo previo de `argon2@0.45.1` fue GREEN con 26 hashes (2 warmups + 24 muestras), match/mismatch y salts aleatorios; permite escoger default conservador 1, no afirmar capacidad de aplicación. Fue aislado e ignorado: no aprobó dependencia backend ni autenticación/pool bajo carga. C05 agrega ahora la dependencia fijada y el helper, sin transferir autoridad del probe. Protección del nonce, limpieza acotada, persistencia, recursos del limiter y bootstrap siguen pendientes. Respetar política de scripts y denegación sensible H0, sin bypass; no se requiere editar ejemplos de entorno para este helper. Runbook y comando bootstrap aún no existen.

## C10 closure and C11 observation-only contract

C10 is **CLOSED** at `779db7b062b536190f1518dd3fe7d68c6abbc94f`, tree
`cb6df8038042157d57042d78a56d9a9ca683aac9`. Independent evidence: 108/108
pass, both Node parser checks and diff check exit 0; native four reviewers
APPROVED, exact acknowledgement BURNED, post-commit clean, no push. Historical
pending notes and the initial count-capture gap/corrective TAP run remain preserved,
not amended or replayed as C11 authority. Parent full textual mirror readback
completed; remote newline byte-fidelity was not certified.

[`parseDockerObservations`](../../backend/scripts/h1-owned-postgres-docker-observations.mjs)
accepts `{ createResponse, inspectResponse, volumeResponse, expected }` as JSON-like
plain/null-prototype records. It returns a detached deeply frozen observation or
throws `Error('Invalid Docker observations.')`, without cause, input echo or logs.
No import-time IO, environment reads, operational CLI or kernel integration exists.

### Exact comparison and output schemas

`expected` has exactly these ten required fields: `containerId`, `containerName`,
`imageReference`, `containerLabels`, `volumeName`, `volumeDriver`, `volumeLabels`,
`dataDestination`, `bindSource`, `bindDestination`. Labels are string maps; other
fields are nonempty strings. Container names compare literally (including Docker's
leading slash). Only 64-hex container IDs normalize case to lowercase. Label
expectations are a subset: every expected pair must match, but **all** observed
pairs are retained. Expected names, labels and paths are comparisons, not authority.

Output has exactly `{ container, volume }`:

- `container`: `id`, `name`, `imageId`, `imageReference`, `labels`, `dataMount`,
  `bootstrapMount`, `port`. Data mount: `{ type, name, source, destination, rw }`;
  bootstrap mount: `{ type, source, destination, rw }`; port: `{ hostIp, hostPort }`.
- `volume`: `name`, `driver`, `mountpoint`, `labels`, `scope`, `options`, `createdAt`.
  Absent CreatedAt becomes null; a present value must be calendar-valid RFC3339
  (1–9 fractional digits, no leap seconds). No timestamp is freshness proof.

### Open wire schema versus strict local acceptance

Source pin: [Moby v28.0.0, Docker Engine API v1.48](https://raw.githubusercontent.com/moby/moby/v28.0.0/docs/api/v1.48.yaml).
Docker response objects are OPEN. Unknown raw keys, including getters, are ignored;
known accessed fields and all string-map entries require own data descriptors.
Arrays must be dense ordinary arrays; accessed records must be plain or
null-prototype. Accessors, missing required fields, null and malformed types fail
closed. Bounds are local policy: 4096 UTF-16 units per selected string/key and
128 entries per selected map/array. Hostile proxies/runtime are outside the threat
model; this does not guarantee arbitrary JavaScript objects cannot execute code.

Create Id and Warnings are required; [] is valid. Nonempty warnings are rejected
as local ambiguity policy, not a wire mandate. Inspect Image is retained separately
from Config.Image: neither a manifest digest claim nor proof of tag immutability.
Selected mounts require unique data-volume and bootstrap-bind destinations,
matching volume name and fixed RW true/false respectively. Both destinations and
the bootstrap source are literal absolute POSIX comparison paths, without
normalization or filesystem certification. Volume source and Mountpoint are retained
independently, not treated as canonical filesystem equivalence. Other mount
Destinations/Types are validated then omitted; their irrelevant optional fields
are not accessed. Driver/Mode/Propagation are not selected mount fields; no mount
labels are invented. Required selected mount fields are **our** narrower policy,
not universal wire requirements.

Ports `5432/tcp` must contain exactly one binding with HostIp `127.0.0.1` and a
canonical decimal HostPort string 1–65535. Nullable/empty/multiple bindings fail;
no arbitrary binding selection or actual reachability/daemon-isolation claim.
Volume requires Name, Driver, Mountpoint, Labels, Scope and Options. Scope must be
local. Options nullability is unspecified in the pin; this strict slice rejects
null without promising real-daemon compatibility. The source's null-Labels
system-df example conflicts with explicit non-null schema: this is a selected
strict response policy, not a universal Docker response certificate.

VolumeCreate/Inspect share Volume and expose no created-versus-reused discriminator.
Same-name/label observations never establish ownership, allocation or freshness.
No URL, command, normalized current resource, planOffline result or ownership flags
are returned. Future gates must establish live provenance, mounts/UID permissions,
image/platform, authentication/grants, freshness and execution separately.
C11 parent ASSESS, functional Verify, native consent/review and guarded commit are
**PENDING**; a commit requires fresh human permission. No provisioning, state-ledger,
recovery, adoption, cleanup or live PostgreSQL certification is included.

## Fuentes y gate

El explorer `murf6fch-j-wlly` leyó las siete fuentes requeridas del hito. El challenge `murfeu8d-l-lvvt` respaldó la separación estándar sesión/nonce; el verificador `murf70ic-k-6xzs` obtuvo HTTP 200 de las guías oficiales siguientes (evidencia previa, no nueva consulta aquí):

- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html)

El digest de norma y evidencia static están en el informe. El freeze ya recibió LIVE transicional H0 y review nativa de la unidad normalizada completa, según el informe; esa atribución no aprueba este nuevo slice de configuración. Cualquier incompatibilidad de interfaz/seguridad pausa el frente afectado para decisión; no se parchea la norma automáticamente. Review + Verify del mismo candidato final son obligatorios antes de auditoría H1. P01–P10, reglas de comprador y rollout comercial siguen abiertos/cerrado respectivamente; H2 no iniciado.

## C12.1 — Offline Docker image DTO

[`parseDockerImageResponse`](../../backend/scripts/h1-owned-postgres-docker-image-observations.mjs)
projects only selected image-response fields into detached, deeply frozen metadata.
It performs no I/O or integration. The exact success keys are `ok` and `image`; the
image contains `id`, RepoTags state/count, RepoDigests state/hash suffixes, platform
strings/variant, and only the Config.User category. Raw tags, repository prefixes,
configuration, environment, and user text are never retained. Malformed inputs
produce only the fixed denial `Invalid Docker image response.`

This is a deliberately strict **local DTO policy**, not a statement that Docker
requires these constraints on every wire response: lowercase exact `sha256:` IDs,
ASCII-control-free bounded strings, arrays capped at 128 entries, strings capped at
4096 UTF-16 units, and own-data-only selected fields. Missing, null, and present
RepoTags/RepoDigests remain distinguishable. Unknown response keys are ignored
without enumeration; selected accessors are denied without getter invocation.
Plain/null-prototype records and dense ordinary arrays are accepted; hostile Proxy
traps are caught where possible but arbitrary proxy code is not sandboxed.

The in-memory tests use synthetic values only. They establish projection behavior,
redaction, descriptor handling, bounds, detachment and freezing—not real daemon or
wire compatibility, observed image provenance, ownership, freshness, locality,
platform/runtime compatibility, PostgreSQL UID/grants, eligibility or H1 readiness.
The focused TAP run observed 19 tests passed, zero failed/cancelled/skipped/todo,
zero suites; both MJS syntax checks and `git diff --check` passed. Operational
observation and real provisioning checks remain separate and pending.

## C13.1 — Bounded Unix image observation transport

`backend/scripts/h1-owned-postgres-docker-transport.mjs` exports only
`observeDockerImage(input)`. It accepts plain/null-prototype records with own data
fields `socketPath`, `timeoutMs?` and `maxResponseBytes?`; selected accessors,
present-undefined options, malformed values and out-of-range limits return the fixed
frozen denial without I/O. It selects one explicit absolute POSIX Unix socket path,
never discovers or canonicalizes paths, reads configuration, or selects TCP/proxy.
The caller may lower the 12,000 ms and 262,144-byte ceilings.

Each valid operation creates a private non-keepalive Agent and issues one GET for
`/v1.48/images/postgres:17.11-bookworm/json`, with only the fixed `Host: localhost`,
`Accept: application/json` and `Connection: close` headers. It sets an 8,192-byte
header limit and strict HTTP parsing. Only status 200, the narrow JSON/optional
UTF-8 content type, absent/identity content encoding, and one exact Content-Length
or chunked framing are accepted. Duplicate selected headers, mixed/unsupported
framing, malformed UTF-8/JSON, a BOM, nonempty trailers, truncation and body overflow
fail closed. One binary body buffer is allocated after accepted headers; the byte
cap does not bound Node's incoming chunks, decoding, JSON/projection allocations,
queues or total heap. Successful JSON passes through unchanged
`parseDockerImageResponse`; only its detached frozen DTO is returned. Errors expose
only `{ok:false,error:'Unable to observe Docker image.'}`.

A monotonic whole-operation deadline is checked around asynchronous and synchronous
processing boundaries and enforced by a timer. This is cooperative: it cannot
preempt event-loop stalls or synchronous CPU work. The operation settles once,
clears its timer/body reference and destroys its own request, response, socket and
private Agent. Late error handlers remain guarded until close; destruction is
requested, not claimed to synchronously close the OS socket. The transport is not a
Docker-wide compatibility certificate or an ownership/freshness/provisioning gate.

Tests use only fresh private `mkdtemp('/tmp/h1-c13-*')` directories, their own short
Unix HTTP sockets, and nonexistent children of those directories. Receipts include
process and exact directory/socket identities when captured. The no-response and
trickle deadline cases instrument exactly one client `ClientRequest.destroy()` and
confirm the fixture response had not emitted `finish` before its peer closed; other
fixtures require observed peer close before teardown without inferring which side
initiated it. Setup registers cleanup first, tracks async operations, gates delayed
continuations, and aborts in-flight Unix listen. Bounded cleanup drains operations,
server close and peers before identity/empty-directory checks; any mismatch preserves
the directory. No TCP, daemon, PostgreSQL, existing service, external fixture,
configuration or persistent resource is contacted or inspected.

## C14.1 — Observación aislada de versión Docker por socket Unix

C14.1 agrega `observeDockerDaemonVersion(input)` como exportación asíncrona autónoma. Solo hace un `GET /v1.48/version` a través del `socketPath` Unix elegido por quien llama; no descubre sockets, ejecutables, configuración ni variables de entorno, no reintenta, no sigue redirecciones y no participa en coordinación de imágenes, bootstrap o aprovisionamiento.

La respuesta pública es un DTO nuevo y profundamente congelado con `version`, `apiVersion`, `minimumApiVersion`, `os` y `architecture`. La ausencia upstream de `MinAPIVersion` se representa como `{kind:'absent'}`, sin fabricar un mínimo. Se eliminan campos desconocidos y datos de `Platform`, `Components`, `Details`, Git, Go, kernel y build. Todos los rechazos comparten el mensaje fijo `Unable to observe Docker daemon version.`; no se exponen ruta, cabeceras, cuerpo, errores ni stack.

### Restricciones locales y evidencia upstream

La política local exige `Version`, `ApiVersion`, `Os` y `Arch` como cadenas propias no vacías, ASCII y acotadas; la API y el mínimo presente deben tener forma numérica `major.minor`. Son restricciones del observador, no garantías de presencia o límites definidos por Docker. No se valida semver, sistema/arquitectura permitidos ni compatibilidad de rangos: una versión legacy, plataforma desconocida o par de rangos contradictorio sigue siendo un reporte observable, no una decisión de elegibilidad.

La definición fijada de Moby v28.0.0 en [SystemVersion OpenAPI](https://github.com/moby/moby/blob/v28.0.0/docs/api/v1.48.yaml#L6312) declara las cinco propiedades raíz como cadenas sin lista `required`, ni reglas explícitas de patrón/longitud, ni anotaciones explícitas `deprecated`. La estructura `Platform` y `Components` contiene requisitos anidados, no raíz. [El tipo Go](https://github.com/moby/moby/blob/v28.0.0/api/types/types.go#L48) comenta que los campos legacy del Engine están deprecados para compatibilidad hacia atrás; en el tipo Go solo `MinAPIVersion` lleva `omitempty`. El comentario de Go y la ausencia de anotación Swagger son hechos distintos. Ni una estructura Go ni el OpenAPI convierten por sí solos estas observaciones en prueba de disponibilidad o compatibilidad.

### Transporte y límites

La petición usa un Agent privado y efímero, cabeceras fijas `Host: localhost`, `Accept: application/json`, `Connection: close`, parser HTTP estricto y cabecera máxima de 8192 bytes. Se acepta únicamente HTTP 200, JSON UTF-8 válido y framing no ambiguo soportado (longitud, chunked o cierre); se rechazan codificación no identity, cabeceras seleccionadas duplicadas, trailers anunciados/reales, discrepancias de longitud, cuerpos incompletos, BOM, JSON inválido/no objeto y exceso del cap. Un solo Buffer binario cuenta el límite configurado (máximo 262144 bytes); esto no limita el heap total del proceso.

Socket Unix absoluto de 2–4096 unidades UTF-16 sin controles; timeout entero 1–12000 ms y cuerpo 1–262144 bytes, con defaults solo cuando los campos opcionales no existen. Un deadline monotónico cooperativo abarca la operación y destruye únicamente request/response/Agent propios al vencer; no preempta trabajo síncrono ni demuestra cierre instantáneo del socket. El resultado no demuestra frescura, identidad, procedencia, soporte de API, disponibilidad de imagen, propiedad ni readiness.

## C15.1 — Admisión pura de compatibilidad declarada

`admitDockerObservations(input)` compara únicamente los datos propios seleccionados de los DTOs: reporte de versión del daemon, plataforma proyectada de imagen y arquitectura esperada explícita por quien llama. Acepta únicamente Linux en ambos reportes, igualdad exacta de las arquitecturas declaradas y el API fijo `1.48` dentro del rango informado inclusivo (`minimumApiVersion` hasta `apiVersion`). No negocia API, consulta el host, normaliza alias/caso ni favorece una arquitectura.

La función exige registros ordinarios o de prototipo nulo y propiedades propias de datos; getters seleccionados no se invocan. Los campos desconocidos se ignoran. Versiones numéricas `major.minor` y tokens de arquitectura tienen límites ASCII locales; la comparación de componentes es numérica sin convertirlos a `Number`. Una denegación usa siempre el mismo resultado congelado y redactado. El éxito devuelve un DTO nuevo y profundamente congelado, sin referencias a la entrada.

**La ausencia de `minimumApiVersion` se deniega por política local humana conservadora; no se afirma que Docker/Moby exija upstream ese campo.** El éxito solo expresa aceptación local de compatibilidad declarada entre reportes seleccionados. No autoriza crear recursos ni demuestra soporte efectivo, disponibilidad, identidad, frescura, procedencia, propiedad, aprovisionamiento o readiness de H1. Quedan fuera la autenticidad completa del DTO y las comprobaciones de ID, digests, tags, variante, usuario y pin.
