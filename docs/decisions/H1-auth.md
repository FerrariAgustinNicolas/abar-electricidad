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

## C16.1 — Verificación offline de un grafo de identidad OCI suministrado

`verifyOciIdentity(input)` comprueba únicamente los bytes suministrados para un índice OCI, el manifiesto seleccionado y su configuración. La política del llamador aporta una etiqueta de repositorio, el digest SHA-256 del índice y una plataforma Linux explícita (`architecture` y `variant`, incluido `null`). El índice debe contener exactamente un descriptor estructuralmente válido cuya plataforma explícita coincide; la selección se cuenta antes de validar la idoneidad del tipo de artefacto. Se admiten solo manifiestos OCI o Docker schema 2, con su tipo de configuración correspondiente. Los digests y tamaños enlazan los bytes exactos, sin serialización canónica ni normalización JSON.

La función calcula `imageId` como SHA-256 de los bytes exactos de configuración. Un `declaredImageId` propio es opcional, pero si se suministra debe ser un digest canónico que coincida con esa configuración; su ausencia significa que no se comparó un ID local. La variante solicitada debe coincidir también con la configuración; esta regla local estricta no infiere el valor predeterminado OCI. Se validan metadatos acotados de capas permitidas, pero no se suministran, descargan ni verifican bytes de capas.

Los tres documentos son copias privadas de `Uint8Array` auténticos del mismo realm; se rechazan Buffer, subclases, prototipos personalizados, almacenamiento compartido/redimensionable, backing vacío y vistas detached. Cada documento está limitado a 262144 bytes (total redundante 786432). Antes de parsear, un escáner UTF-8/JSON acotado rechaza BOM, sintaxis inválida, claves duplicadas decodificadas en cualquier subárbol, sustitutos aislados y excesos de profundidad, claves, elementos, strings o tokens. Los SHA-256 se calculan sobre los bytes originales antes de parsear. La salida de éxito es un DTO nuevo y profundamente congelado; toda denegación usa el mismo objeto de error fijo y congelado.

Las propiedades seleccionadas de los registros de entrada deben ser datos propios: no se llaman getters ni se leen campos desconocidos. Las excepciones de reflexión se convierten en denegación, pero esto no aísla las trampas de un `Proxy` ni es un sandbox. La etiqueta de repositorio la aporta el llamador y **no queda autenticada criptográficamente por el contenido del índice**. Ningún pin publicado se aprueba o fija aquí. La aceptación de bytes suministrados no demuestra autoría, firma de publicador, procedencia, frescura, propiedad local, contenido real de capas, disponibilidad, ejecución, readiness ni permiso para obtener o crear recursos OCI/Docker.

### Correcciones probatorias C16.1

El registro de plataforma del llamador, igual que los demás registros seleccionados, debe ser ordinario o de prototipo nulo; un prototipo personalizado deniega. La decodificación previa valida cada par sustituto UTF-16 y rechaza sustitutos altos/ bajos aislados tanto en valores como en claves desconocidas, antes de `JSON.parse`; los pares válidos se conservan.

El límite lexical es inclusivo en 8192 tokens, contando cada signo de puntuación y cada token escalar/string una vez. Los fixtures enlazados demuestran configuraciones válidas de 8191 y 8192 tokens y denegación de 8193. **8192 sí es alcanzable:** un objeto desconocido vacío añade dos signos de puntuación y permite la paridad par sin alterar el esquema. No se alega aislamiento de un helper privado ni se cambia la unidad/capacidad. También se comprueban por separado claves y valores UTF-8 de 4096 bytes aceptados y 4097 rechazados.

## C17.1 — Observación standalone de catálogo PostgreSQL

`observePostgresEvidence(pair, options?)` acepta únicamente un par v2 provisionado validado por el `validatePair` existente. Copia los datos antes de esperar y deriva conexión explícita a `127.0.0.1`, puerto asignado, base, rol y contraseña de migración; no admite DSN, credenciales ambientales ni opciones de conexión del llamador. Por defecto construye un `pg.Client` sin conectarse durante importación. El factory de cliente propio es solo un seam de pruebas en memoria y la salida distingue `pg-client` de `injected-client`.

La sesión usa configuración de solo lectura, transacción `BEGIN READ ONLY`, consultas parametrizadas de `pg_catalog` con límites y plazos finitos, y cierre acotado. La salida allowlisted y congelada describe identidad, atributos del rol, propietario y CONNECT de la base, propietario y USAGE/CREATE del esquema `public`, esquemas no sistémicos y nombres de tablas. Los hechos restrictivos o inventarios no vacíos se informan, no se convierten en admisión implícita. Las denegaciones usan un mensaje fijo sin causa del driver; no se devuelve configuración, contraseña, SQL ni filas adicionales.

Esto es observación, no prueba de propiedad/procedencia Docker, preparación, frescura, readiness, certificación ni permiso de migración. El censo de tablas no demuestra ausencia de otros tipos de objetos ni elimina carreras entre consultas. No añade una regla de igualdad de propietarios ni altera C09/C12/C15/C16. Pruebas deterministas usan únicamente clientes falsos en memoria; no se ejecutaron PostgreSQL, Docker, conexiones reales, recursos ni fixtures físicos.

### C17.1 — Corrección acotada tras verificación independiente bloqueada

La consulta CONNECT ahora liga `$1` a `datname` y `$2` a `record.migrationRole`; la prueba compara SQL y parámetros con expectativas fijas, no deriva su esperado de la consulta observada. Al construirse el cliente default, se fijan también `replication: 'false'` y `sslnegotiation: 'postgres'`. El driver pg 8.23.1 usa fallback ambiental por truthiness para esos campos; `binary: true` explícito suprime igualmente su fallback, y el cliente se restaura a modo de resultados de texto (`client.binary = false`) antes de conectar.

Este pinning cubre las opciones públicas de pg usadas por esta conexión: host/port/database/user/password, SSL, formato de resultados, replication, negociación SSL, aplicación/codificación, startup options y plazos. Los timeouts cuya API de pg desactiva fallback con el argumento explícito `false` mantienen esa conducta; `connectionTimeoutMillis` evita `PGCONNECT_TIMEOUT`. No se leen ni se cambian valores ambientales. No se afirma sandbox ni ausencia universal de influencia ambiental fuera de los campos públicos revisados del constructor pg.

El cierre captura `end` antes de validar `connect`/`query`; deniega si el driver emite `error` durante teardown incluso cuando `end()` resuelve, y conserva el listener hasta completarlo. Los mocks prueban una emisión durante `end` y query no invocable con end invocable. El cierre acotado de un mock no demuestra quiescencia física de una conexión arbitraria.


## GET /api/v1/auth/csrf — implemented boundary; verification limits

The first implemented auth operation is registered as a Nest controller. It creates and reuses a separate pre-auth context with a SHA-256 identifier and an AES-256-GCM protected random nonce, or returns the unchanged session-bound nonce after checking account/session state. Restricted sessions receive `PASSWORD_CHANGE_REQUIRED`; unknown, expired, revoked, inactive, corrupt, key-unavailable, and storage-failure session contexts fail closed without becoming anonymous. Anonymous contexts expire at the configured 15-minute limit. Success and route errors are `no-store`; only the anonymous response sets the host-only HttpOnly/SameSite=Lax pre-auth cookie, with configured Secure policy. Per-process IP limiting is bounded and uses the direct socket address, not forwarded headers.

`AUTH_CSRF_ENCRYPTION_KEY` is recognized but is not part of `AuthConfig` or `AuthRuntime`. It must be canonical unpadded base64url for exactly 32 bytes. The cipher uses a private `KeyObject`, fresh 12-byte IVs, 16-byte GCM tags, and AAD bound to context kind, hashed row ID, and nonce version. Missing/unusable keys and failed decryptions produce safe 503 responses; there is no plaintext persistence or anonymous fallback. Rotation/operational key management remains deferred.

Persistence is represented by the new `AuthSession` and `AuthPreAuthContext` tables in migration `20261009000200_h1_auth_context`; the prior AdminUser migration and deferred persistence test were not changed by this unit. The focused isolated Jest command passed 47/47 tests across four suites. Prisma schema validation and offline build also passed. These checks do not certify PostgreSQL migration/application, database uniqueness/concurrency, deployed key provisioning, a live HTTP/browser flow, or full H1 readiness. No server/e2e or PostgreSQL command was run.


### GET /api/v1/auth/csrf — bounded correction and verification (17.5e)

This correction supersedes the immediately preceding implementation statements that unknown, revoked, expired, or inactive session cookies must fail as 503. If the session lookup succeeds and establishes legitimate non-authentication (missing, revoked, absolute/idle expired, or current account inactive), the endpoint now uses/creates the separate anonymous pre-auth context. Database lookup failures, malformed stored state, missing/unusable key, and decrypt/AAD corruption remain safe 503 and never fall back anonymously. A live `mustChangePassword` session remains 403 `PASSWORD_CHANGE_REQUIRED`.

Live ordinary sessions recover the same nonce and conditionally update activity using session ID, revocation state, absolute/idle expiry, nonce version, and current active/non-restricted account state. A lost conditional update gets one fresh read: newly revoked/absent/ineligible state becomes anonymous pre-auth; newly restricted state is 403; still-live unresolved state is 503. The session nonce version is not incremented by activity, and the legacy unconditional update is not used.

The process-local CSRF limiter purges elapsed windows, retains every live exhausted counter up to its 10,000-key capacity, and denies new keys with bounded 429 while full. Backward clock movement cannot expire/reset a live entry; Retry-After is a positive bounded integer. The error filter obtains owned CSRF metadata from a WeakMap, not arbitrary exception properties; invalid Retry-After metadata is omitted. Error classification uses owned route metadata or the matched Express route (case/trailing-slash normalized), not raw pathname spelling. Swagger now describes the 200 response headers and 403/429/503 response schemas/headers.

**Correction TDD/evidence:** accepted regression RED command `npm --offline --prefix backend test -- --runInBand src/auth/csrf.service.spec.ts src/auth/csrf-nonce.cipher.spec.ts src/common/api-exception.filter.spec.ts src/auth/auth-runtime.module.spec.ts` observed exit 1, 18 failed/50 passed/68 total across four suites, with no compile/setup failure. It covered session absence, limiter eviction/clock rollback, arbitrary exception metadata/aliases, conditional activity guard, and Swagger omissions. The original pre-implementation RED remains historically missing and is not recreated by this correction RED. The expected error after a lost activity guard was refined: fresh revoked state returns anonymous metadata/cookie (never the old session nonce), while fresh restricted state remains 403; the stale test expectation is superseded, not weakened.

During correction, one intermediate focused run failed TypeScript compilation because a route-normalization regex was overescaped; it was corrected. The next run exposed two test-expectation issues (a test reading private Retry-After from the exception instead of the HTTP header, and trying to admit 10,000 new IPs in addition to the original key at a 10,000-entry cap). Tests now assert the emitted header and fill the remaining 9,999 slots before checking overflow. Final focused run passed 68/68 tests in four suites. `npm --offline --prefix backend run prisma:validate` and `npm --offline --prefix backend run build` passed. These are local checks only: no migration or PostgreSQL, HTTP server/browser, deployment key, native review, full H0-live certification, or full H1 acceptance was performed. The initial AdminUser migration and deferred auth-persistence test were not edited.

## 17.6 — Integrated `POST /api/v1/auth/login` implementation (writer evidence)

The Nest auth controller now publishes `POST /api/v1/auth/login` with HTTP 200, a closed `{email,password}` body schema, and the frozen `AdminSessionView`. The controller passes the request Origin, CSRF header, cookies and direct socket address to a DI-provided `LoginService`; it does not trust forwarded headers or Host. Success sets `Cache-Control: no-store`, the rotated session and cleared pre-auth cookies as separate `Set-Cookie` values, and the fresh `X-CSRF-Token`. The exception filter maps only login-owned WeakMap metadata to the operation's error codes, safe messages and bounded `Retry-After`; it retains the existing GET CSRF and generic H0 behavior.

The operation validates exact own data properties, normalized email and NFC-preserving 1–128-code-point login passwords. It requires an exact configured Origin and a canonical CSRF token bound to a live pre-auth context or ordinary unrestricted session. Unknown and inactive accounts use a code-owned non-secret PHC with the same Argon2id v=19, m=19456, t=2, p=1, 16-byte salt / 32-byte hash structure; unknown, inactive and wrong-password cases all fail generically after one verifier call. Malformed PHC, storage, cipher/key and hasher failures fail closed as 503. Process-local IP/account counters are bounded to 10,000 live keys each and deny overflow without evicting live entries.

Success uses a serializable Prisma transaction: it conditionally rechecks and row-locks the target account, consumes the unexpired pre-auth row or conditionally revokes the old ordinary session, then stores a SHA-256 session identifier and AES-GCM ciphertext for a fresh independent nonce bound to the new session ID/version. The transaction-fake tests stage and roll back changes and serialize replay attempts. This is source/mock evidence only; it is not a PostgreSQL atomicity, concurrency, timing-equivalence or native Argon resource certification.

**Observed local verification:** the authorized focused Jest command passed 127/127 tests in five suites, including the unchanged CSRF service/cipher/runtime suites, success/error controller invocation, DI/Swagger reflection, generic verifier-work shape, limiter boundaries/capacity, transactional rollback and replay. `npm --offline --prefix backend run prisma:validate` reported the schema valid. `npm --offline --prefix backend run build` returned after generating Prisma Client and emitted no reported TypeScript/copy-stage diagnostics; no numeric exit code was surfaced by the command tool. The E2E Swagger-path assertion was updated but E2E was not run. No PostgreSQL, migration, socket/server, browser, native hashing benchmark, deployment key or credential was used. Remaining H1 operations, PostgreSQL-backed verification and independent review are still pending; this unit does not declare H1 ready.


## 17.6e — Login expiry, nonce-version and owned-status correction (GREEN evidence; independent verification pending)

The login service now validates the injected clock through one fail-closed reader (invalid/throwing time maps to safe 503), checks the validated context again after asynchronous password verification, and refreshes time inside the serializable transaction after account guards and immediately before context consumption or old-session revocation. Pre-auth deletion predicates include the immutable validated nonce version and expiry greater than the transaction-time timestamp. Ordinary-session revocation predicates retain the validated nonce version, current account state, and both absolute and idle expiry guards. The new session lifetime is measured from that fresh transaction issuance time; it is not capped by the old context lifetime. Created/activity timestamps and configured absolute/idle expiries share the same issuance instant.

The owned exception filter now obtains private WeakMap metadata before reading any exception status method and derives owned status/body/retry headers solely from that immutable metadata. Unowned HttpException status handling and generic H0 bodies remain on the existing fallback path. The login transaction fake continues to clone mutable staged state and evaluates the actual supplied expiry/version conditions without an ambient-clock guard.

**Preserved RED history:** the admitted RED suite observed exit 1, 4 failed/128 passed/132 total, two failed and three passed suites, 3.059 s. The focused regression run observed 4 failed/1 passed/70 skipped, exit 1. The ordinary rollback test first failed on the shared-row `revokedAt` assertion (1 failed/44 skipped, 1.154 s, exit 1); after only staged-state deep cloning, it passed (1 passed/47 skipped, 0.951 s, exit 0). These observations remain historical and are not replaced by GREEN.

During GREEN, the first combined focused run passed five login regressions plus rollback but failed the owned-error assertion because the test expected a body without the established safe `message` field (1 failed/5 passed/70 skipped, exit 1, 0.826 s). The assertion was corrected to require the existing safe `Solicitud inválida` message, without changing production behavior. The next focused run passed 8/8 selected regressions (70 skipped; two suites; exit 0; 0.816 s), including pre-auth and ordinary expiry while awaiting verification, a second clock advance at transaction scheduling, idle-only expiry at transaction time, invalid-clock 503, concurrent pre-auth nonce rotation, owned throwing-status accessor, and ordinary-session rollback.

**Final authorized checks:** the exact offline Jest command passed 135/135 tests in five suites (3.214 s; tool did not expose a numeric process exit, while all suites passed). `npm --offline --prefix backend run prisma:validate` reported the schema valid (numeric exit/timing not exposed). `npm --offline --prefix backend run build` generated Prisma Client and emitted no TypeScript/copy diagnostics (numeric exit/timing not exposed). SHA/byte guards before and after checks matched for the other seven manifest files, both docs still had their exact supplied whole-file SHA/byte prefixes at append time, main/aux tracker pins and dated deferred-test pin matched. This remains mocked/local evidence only: no PostgreSQL transaction/isolation, HTTP/browser/E2E, native Argon timing/resource, live H0, Swagger annotation completion, independent verification, Git operation, or H1 acceptance is claimed. Existing CSPRNG-failure direct-coverage and Swagger-header annotation gaps remain outside this correction.


**Exit-code addendum:** The exact Jest, Prisma validation, and build commands were subsequently rerun with explicit shell exit capture. Jest passed 135/135 in five suites, 3.581 s, exit 0; Prisma schema validation passed, exit 0; Prisma Client generation/build passed without TypeScript/copy diagnostics, exit 0. The earlier command captures did not expose numeric exits; this addendum records the separately observed numeric reruns without changing the prior history.


## 17.6f — Login recovery with a retained stale session cookie (writer evidence; independent verification pending)

Login now gives a canonical session-cookie candidate precedence when its row is live: valid session proof selects the ordinary session even when a pre-auth cookie is also present; wrong or pre-auth-only proof is 403 `CSRF_INVALID`, and a valid proof for a restricted live session remains `PASSWORD_CHANGE_REQUIRED`. A canonical session whose row is genuinely absent, revoked, absolute/idle expired, or owned by an inactive account is treated as unavailable context and may select the separately validated pre-auth cookie/proof. Malformed session data, lookup errors, and live-session cipher failures remain fail-closed 503; they do not fall back. Duplicate cookies and noncanonical tokens remain denied. Once a live session context is selected, its identity/version is retained through verification and transactional guards; concurrent revocation, expiry or nonce-version rotation cannot switch the request to the accompanying pre-auth context.

The selected-context regressions invoke the real `CsrfService.getMetadata` and then the real `LoginService.login` against the same stateful Prisma/cipher/config/clock fixture. The five recovery cases (unknown/missing, revoked, absolute-expired, idle-expired, and inactive context owner distinct from the active credential target) preserve the original stale-session cookie while using the GET-issued pre-auth cookie/header. The fixture implements the exercised GET session activity predicate and existing transaction predicates against staged cloned state; it has no ambient-clock guard. Tests also cover live-session precedence, restricted sessions, wrong/duplicate proofs, lookup/cipher/malformed-row failures and all three during-verification changes.

**Preserved RED evidence:** the admitted phase RED run was exit 1: 13 failed/138 passed/151 total, one failed/four passed suites, 3.279 s; the focused RED had 13 failed/3 passed/51 skipped/67 total, 0.872 s, exit 1. The initial single-case reproduction failed its expected-success assertion (1 failed/51 skipped, 1.08 s, exit 1). Those are historical RED observations, not replaced by GREEN. In that RED, the three live-session change hooks were not reached because the blanket dual-cookie rejection stopped before verification; they are now explicitly reached and asserted after the selection fix.

**GREEN iteration details:** the first expanded focused GREEN run exposed a spec assertion reading the pre-transaction `old.row` object after the mock correctly committed cloned rows into its session map (1 failed/15 passed/51 skipped/67 total, 1.063 s, exit 1). This was a stale test reference, not a production failure. Assertions now inspect persisted map state after commit. An earlier setup attempt had two TypeScript errors because the helper row omitted `lastActivityAt` (0 tests, 0.849 s, exit 1); the fixture was corrected with its existing model timestamps. The final focused selection/regression run passed 16/16 (51 skipped, 0.704 s). The exact five-spec command passed 151/151 tests in five suites, 3.401 s, exit 0; Prisma validation passed, exit 0; build passed, exit 0, generated Prisma Client and emitted no TypeScript/copy diagnostics.

The five recovery cases assert actual GET-provided nonce/cookie, one mocked verifier call, one new hashed session, consumption only of the selected pre-auth row, and unchanged old-session revocation/activity/version/encrypted nonce state. Live proof rotates/revokes the old session and leaves pre-auth unconsumed; a live-only proof mismatch and restricted-session cases do not verify or mutate. Lookup failure, GCM failure and malformed live state remain 503 without fallback. During-verification revoke/idle-expiry/version rotation hooks now run after one verifier call and deny issuance without consuming pre-auth or committing revocation. Existing 135 tests remain passing, including the prior expiry/version/rollback/owned-exception closures. This is local mock/source evidence only—not PostgreSQL isolation, native Argon timing/resources, HTTP/browser/E2E, live H0, Swagger annotation completion, direct CSPRNG-failure coverage, independent acceptance, or H1 readiness. No Git, database, live service, or deployment credential was used.

## 17.6g — Login Swagger metadata (self-verified; independent verification pending)

The admitted production-generated-document RED was preserved: five metadata assertions failed (required `Origin`, required `X-CSRF-Token`, separate login cookie-security alternatives, and both cookie scheme definitions); the document identity/response-contract assertion passed. The focused RED was 5 failed/1 passed/67 skipped in 1.404 s (exit 1). The exact five-suite RED was 5 failed/152 passed/157 total, one suite failed/four passed, 3.48 s (exit 1). An earlier matcher-only TypeScript setup failure had three TS2532 and three TS2339 diagnostics and zero tests in 0.867 s (exit 1); only that spec matcher was repaired before the behavioral RED.

The bounded correction adds required request-header metadata matching the frozen contract and two separate `ApiSecurity` decorators, in the frozen OR order. The actual `configureApplication` builder now registers the `AuthPreauthCookie` and `AdminSessionCookie` cookie apiKey schemes with their frozen names. No login execution, validation, cookie handling, authentication service, middleware, global security requirement, H0 metadata, or route behavior changed. The production-configured test invokes the real configuration against an uninitialized mock-backed Nest app and real `SwaggerModule.createDocument`; only `SwaggerModule.setup` is stubbed, with the `api/docs` call checked. It asserts the exact header descriptions/shapes, two OR alternatives, resolved cookie schemes, H0 document identity, no root/CSRF global security, and existing login responses/body.

After strengthening the assertions to check frozen header schemas/descriptions and absence of global security, the focused metadata tests passed 6/6 (67 skipped, 1.257 s, exit 0). The exact five-suite run passed 157/157 (five suites, 3.499 s, exit 0), including the 151 existing tests. `npm --offline --prefix backend run prisma:validate` passed (exit 0; duration unavailable); `npm --offline --prefix backend run build` passed (exit 0; total duration unavailable), generated Prisma Client in 19 ms, with no TypeScript or copy diagnostics. These are this writer's local self-checks, not independent acceptance or an HTTP/PG/native-Argon result.

Historical timing statements above remain unchanged and unreconciled: the docs' 151/151 and focused timings (3.401 s and 0.704 s) differ from the writer handoff (3.107 s and 0.843 s; focused numeric exit unavailable); their exact run identity and cause are unknown. The separate previously recorded independent 151/151 check (Jest 3.282 s, wall 3.567 s; Prisma 0.468 s; build 0.871 s; RAM probe 0.257 s, all exit 0) is retained as its own record and is not reconstructed or retroactively attributed to these runs.

All six historical documentation prefixes remain byte-identical: decision 74,027 bytes `cbd448c17cf2f8b41ebc07068171d68f5949bf1cc0521efb088ce8dccfd6be51`, 69,892 bytes `e6a815566a8ac455e98b1e75df8fc6b341ffd6a04ea426525d70c1b0e85f8fe3`, 66,987 bytes `570b6b95032a51982bdb009d9a2af65574e8a8c7ab700161bad5a7117fcc25fc`; milestone 94,890 bytes `686b90b966348f71915c4db2991e1c821eacc90f460dde601b765fb38ddfebe5`, 90,755 bytes `ea686383760445a3ad17c7a8bc53fc3abad2de41362536871e5601501a670f55`, 85,921 bytes `ac362f248b35dcd592d45c2f1510813f187d07a5c4d702f4a5692f1766e2fd9d`. Direct CSPRNG-failure coverage remains a separate gap. Independent verification is pending; no delivery, Git, live H0, H1, PostgreSQL, native Argon, or HTTP acceptance is claimed.

**Current-phase run chronology (all retained):** the first focused GREEN after implementation passed 6/6 (67 skipped, 1.251 s; numeric exit not surfaced); the first exact five-suite GREEN passed 157/157 (3.585 s; numeric exit not surfaced). Initial schema validation passed with no numeric exit surfaced. Initial build output showed Prisma Client generated in 20 ms and no diagnostics, with numeric exit not surfaced. The final focused run after strengthening frozen-header/root-security assertions passed 6/6 (67 skipped, 1.257 s, exit 0); the final exact five-suite run passed 157/157 (3.499 s, exit 0). Schema validation was rerun with exit 0; build was rerun with exit 0 and Prisma Client generated in 19 ms. Earlier setup/RED failures remain documented above, not superseded.

## 17.me — Read-only current-session restoration (writer implementation; independent verification pending)

`GET /api/v1/auth/me` now uses only the AdminSessionCookie and returns the current sanitized `AdminSessionView`, its existing bound nonce in `X-CSRF-Token`, explicit 200 and `Cache-Control: no-store`. Restricted `mustChangePassword` sessions are recoverable; no Origin, CSRF request header, or body is required. There are no storage mutations, idle renewal, absolute-expiry extension, nonce/cookie rotation, cookie clearing, or pre-auth fallback. Missing/noncanonical/duplicate/unknown/revoked/expired/inactive-owner sessions map to 401 `SESSION_EXPIRED`; lookup, clock, cipher, and malformed encrypted-state failures map to safe 503 `SERVICE_UNAVAILABLE`. The implementation re-reads session/account state after decrypt and fails closed on mixed snapshots. Existing Prisma, CSRF cipher and frozen auth runtime config are reused; login and GET-CSRF behavior remain unchanged.

Admitted RED receipts remain separate and intact: route RED 1 failed/27 passed, exit 1, 1.373 s (initial NestExpress typing setup failure ran no assertions, exit 1, 1.490 s); behavioral RED against the neutral null scaffold 12 failed/29 passed, exit 1, 1.536 s; full six-suite RED 12 failed/159 passed, exit 1, 4.126 s. Extended behavioral RED for cookie parsing, invalid clocks, delayed expiry and state races was 22 failed/29 passed, exit 1, 1.522 s. A `revokedAt` narrowing setup error ran zero tests. After service behavior landed, filter/Swagger RED was 7 failed/50 passed, exit 1, 1.521 s. A missing mock-`prisma` setup error also ran zero tests. These setup failures are not RED.

GREEN evidence: focused session/filter tests 59/59, two suites, exit 0, 1.287 s; approved six-suite command 189/189, six suites, exit 0, 3.616 s. The five existing suites passed. Schema validation passed, exit 0, 0.484 s. Build passed, exit 0, 0.948 s; Prisma Client generation reported 20 ms and TypeScript/resource packaging emitted no diagnostics. The offline mocks exercise cloned Dates/Buffers, existing encrypted test nonces, exact expiry boundaries, no-mutation checks, controller headers/DTO, delayed clocks and session/account/version races; synthetic nonce/cookie values are not logged.

Guard-script incidents are retained: one pre-command guard accidentally compared four intentionally changed in-scope files to their old pins and aborted before validation; corrected current-file guards passed. Prisma validation itself exited 0; its initial post-guard script mistyped the login-service path, then corrected 27-file guards and all ten documentation-prefix guards passed. These were guard/setup errors, not source drift or behavioral failures. This is writer self-verification only: independent current contract/privacy review remains pending. No Git/native review, live H0, PostgreSQL, HTTP, native Argon, deployment, or H1 completion is claimed.

**Post-document privacy-assertion rerun:** after changing two test assertions to compare booleans instead of rendering synthetic cookie/encrypted-state values on failure, focused session/filter Jest passed 59/59 (two suites, command exit 0; Jest 1.392 s, measured command 1.731 s). The exact approved six-suite command passed 189/189 (six suites, command exit 0; Jest 3.589 s, measured command 3.856 s). No production behavior changed after the earlier successful build and schema validation.

## 17.me.c — Corrective GREEN (writer evidence; independent recheck pending)

Applied only the two admitted fixes: `parseSessionCookie` now rejects C0 controls other than HTAB and DEL before any split/trim/parse; the auth exception filter now applies `no-store` to owned session metadata independent of matched-route metadata. No token sanitizing, lookup/decrypt fallback, session/expiry/nonce/cookie mutation, route change, or H0/login ownership change. Ordinary spaces and HTAB formatting remain accepted. The existing interior-CRLF/NUL/DEL denial and valid ordinary/restricted restore controls remain covered.

Final focused command, `npm --offline --prefix backend test -- --runInBand src/auth/session.service.spec.ts src/common/api-exception.filter.spec.ts`, passed 66/66 in two suites (exit 0; Jest 1.199 s, measured command 1.471 s). The exact approved six-suite command passed 196/196 in six suites (exit 0; Jest 3.685 s, measured command 3.961 s). `npm --offline --prefix backend run prisma:validate` passed (exit 0, 0.523 s); `npm --offline --prefix backend run build` passed (exit 0, 0.988 s; Prisma Client generated in 20 ms).

Production correction is two one-line replacements: `session.service.ts` 9,423→9,476 bytes, still 213 lines; `api-exception.filter.ts` 4,124→4,154 bytes, still 78 lines. No net production line growth. The two regression specs remain unchanged from the admitted RED checkpoint: session spec 17,113 bytes/341 lines/SHA-256 `d28a7ac55b3ed92a66a80d4506fc7d9fe48027277c3eeca97eadac965d14f7ee`; filter spec 13,266 bytes/263 lines/SHA-256 `fff34ed7d78c796324112b8d93ddafe8e7fc85e53fdc59ee76725a96c95cc488`. Focused/full GREEN totals include the 7 new cases; the formerly failing four pass, and the three already-denied control cases remain denied.

Historical failures remain distinct: admitted corrective RED was focused 4 failed/62 passed (Jest 1.419 s, measured 1.718 s) and full six-suite 4 failed/192 passed (Jest 3.318 s); its wrapper timer failed after Jest, so wall time remains unavailable. One later pre-command guard attempt also aborted because its script contained an incorrect milestone-prefix digest; no tests ran in that attempt. Corrected 31-file/12-prefix guards passed before and after validation/build and full tests. This is writer self-verification only. Parent independent verification remains pending; no PostgreSQL, HTTP/browser, native Argon, live H0, deployment, H1 readiness, Git or native-review acceptance is claimed.

## 17.me.d — Logout route wiring (writer verification; independent review pending)

`POST /api/v1/auth/logout` delegates to the existing `LogoutService`, registered through the real `AuthModule`. The public production Swagger operation declares optional `AdminSessionCookie` security and a bodyless 204 response. Sessionless success and active-session proof/revocation policy remain in the service.

The controller applies `Cache-Control: no-store`, forwards only the single-string Origin and CSRF headers plus the cookie header, and emits the service-produced clearing cookie. The documented cookie header specifies matching path/attributes, `Max-Age=0`, and past `Expires`; the operation exposes only 403 origin/CSRF and 503 service errors.

Writer offline verification passed after two narrow source corrections: the initial focused Swagger check exposed the security metadata shape, and the first full auth-suite run exposed optional Nest injection needed by legacy manually constructed controllers. Final focused logout/filter tests passed 93/93; the seven-suite auth run passed 254/254; Prisma schema validation and build passed. Independent whole-change verification remains pending. No live database, HTTP/browser, native Argon, deployment, or H1 readiness is claimed.


## 17.me.e — Integración HTTP de cambio de contraseña (implementación, sin verificar)

`POST /api/v1/auth/change-password` delega en el servicio aprobado y conserva la compatibilidad de constructores previos: si el proveedor no está disponible, responde 503 sin simular éxito. La fábrica reutiliza el runtime de autenticación, Prisma y el cipher existentes; no crea otro runtime ni otra conexión. El éxito declara `no-store`, cookie renovada y nonce CSRF, y termina en 204 sin JSON.

El parser JSON acotado a esta ruta entrega errores malformados como 400 `VALIDATION_ERROR`; la metadata propia viaja separada del error del parser y no expone cuerpo, causa ni mensaje privado. El filtro consume metadata inmutable del servicio y del parser, reconoce la ruta Nest ya coincidente (sin clasificar por URL cruda) y preserva el fallback global y las respuestas de las demás rutas. `PASSWORD_POLICY` usa el mensaje seguro «La contraseña no cumple la política de seguridad». La verificación HTTP, DI, filtro y regresiones queda pendiente del padre; esta nota no declara GREEN.
