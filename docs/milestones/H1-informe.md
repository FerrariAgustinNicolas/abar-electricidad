# H1 — Informe parcial de contrato y fundamentos

## Estado consolidado — 2026-10-18

**El candidato `8c9b467` queda preparado para auditoría externa, con las reservas explícitas de la matriz y el dictamen incorporados a continuación. C9 y C10 cuentan con evidencia real acreditada dentro de sus alcances; la corrección C10 está en `1fa46d4` y la auditoría incremental C14/C15 no identificó hallazgos accionables. La revisión nativa continúa bloqueada.** Este bloque consolida evidencias retenidas; no representa una nueva ejecución, una aprobación nativa ni una declaración de H1 aprobado o cerrado.

Referencias de entrega local: `2cabc1f` (contraste), `50c97f9` (consolidación documental), `eec3830` (U6: interfaz de usuarios y navegación administrativa, E7) y `0751819` (runner de captura y sus pruebas, E8/E9). La aceptación real E1 corresponde a `3e509d3d96539483db0024a0d47a910cf327bbfe` más los tres archivos de administración verificados por separado en E3. Los dos commits de lint conservan el comportamiento según E4/E5. La corrección posterior de contraste se verificó por separado en E6, con parches idénticos a los del commit; no se repitió el E2E sobre esos commits. Las seis pruebas unitarias del runner se ejecutaron después en una copia temporal con Node; los dos archivos comprometidos coinciden con los hashes probados (E8/E9). E10 vinculó las fuentes entonces copiadas de las otras cuatro suites a 93 pruebas unitarias aprobadas. Sus unidades de entrega quedaron en los commits locales `c775c28`, `a394235`, `ccbd52e` y `04fc2a3` (E11–E14). La revisión independiente posterior de U5 identificó dos problemas de UI corregidos en `09082e3` y verificados de forma aislada (E15–E17). La revisión estática ordinaria posterior de los once archivos del harness/probe sobre `0370c22` identificó tres P2, corregidos y verificados de forma focalizada en `abc285e` (E18/E19). Ninguna de estas correcciones posteriores se incluye retroactivamente en E1/E6 ni en las 93 pruebas históricas de E10. No se repitieron pruebas para crear los commits ni para esta actualización.

| Criterio | Estado y evidencia observada | Alcance y límite |
|---|---|---|
| HTTP/SQL y administración | **PASS acotado**, 24/24, exit 0; auditoría y limpieza completas (E1). | PostgreSQL nuevo y temporal. No acredita automáticamente todos los casos del contrato. |
| Concurrencia PostgreSQL | **PASS acotado**, 1/1, exit 0 (E1). | Prueba directa de servicio sobre otra base vacía; no equivale a una prueba HTTP. |
| Flujos de navegador, tamaños y teclado/foco | **PASS acotado**, 11 comprobaciones; responsive 360/768/1440 y teclado/foco incluidos (E1). | La corrida original conservó su resultado PARTIAL, exit 1, por el zoom omitido. No se reescribe ese resultado. |
| Zoom nativo al 200 % | **PASS acotado**, observación posterior autenticada en `/admin/usuarios` (E2). | Indicador nativo 200 %, DPR 2→4, ancho de layout 761→380, escala visual 1; sin desbordamiento horizontal del documento. La tabla conserva desplazamiento local. Pestaña temporal controlada, no perfil descartable. |
| Administración UI aislada | **PASS acotado**, 3 pruebas focalizadas, 24 pruebas en 7 archivos, build/lint y 7 comprobaciones finales independientes (E3). | Copia temporal con los tres archivos de administración identificados en `overlays`; las comprobaciones aisladas no sustituyen la integración real de E1. |
| Backend y correcciones de lint | **PASS acotado**, lint completo con 0 errores y 0 advertencias; compilación y 1127 pruebas aprobadas, 1 omitida (E4). | La prueba PostgreSQL omitida en esta suite no se declara ejecutada allí. Se preserva por separado la evidencia real de E1. |
| Contraste de combinaciones principales | **PASS acotado**, 11 estados observados en login, cambio de contraseña, layout admin y usuarios (E6). | Bordes 8,868:1 y foco mínimo 8,171:1; cabecera 8,868:1. Incluye 2 pruebas de contraste RED→GREEN, 24 pruebas frontend, lint/builds y verificación independiente. No certifica todos los estados de error, éxito o hover ni accesibilidad integral. |
| Runner de captura: pruebas unitarias | **PASS acotado**, 6/6, exit 0, sin omisiones; copia temporal con Node 24.18.1 (E8). | Commit local `0751819`: dos archivos y 227 líneas agregadas, idénticos a los bytes probados (E9). No ejecutó Python, Docker ni E2E y no acredita la portabilidad del CLI completo. |
| Cuatro suites unitarias restantes del harness | **PASS histórico acotado**, 93/93, cero fallos y omisiones; una ejecución por suite en copia temporal física (E10). | Producto Node 3/3, fixture Node 14/14, regresión 1/1 y Python fake 75/75, todos exit 0; hashes de las fuentes de esa corrida coincidentes antes/después. Python y probe cambiaron posteriormente en `abc285e`; E10 no certifica esos bytes nuevos ni el CLI/probe integral. |
| U5: revisión independiente y correcciones de UI | **PASS acotado de las dos correcciones**, commit `09082e3` (E15–E17). | Revisión estática independiente del U5 corregido; límite NFC del login y acción de logout en reautenticación corregidos. RED reproducido, 10 pruebas focalizadas, 27 unitarias frontend, lint de cuatro archivos y 14 pruebas de verificación independiente aprobadas. No son conteos acumulables ni aprobación nativa; sin nuevo E2E ni bases reales. |
| Harness/probe: tres P2 de ciclo de vida | **PASS acotado de las correcciones**, commit `abc285e` (E18/E19). | Node 14/14 (8 de ciclo de vida y 6 del runner), Python fake 78/78; recheck independiente limitado a los bloqueos: Chrome 2/2 y Python 4/4, más prueba causal del sidecar. Spot check del padre 8/8. Conteos superpuestos, no sumables; sin navegador real, Docker, bases ni E2E nuevos. |
| C9: revocación por desactivación | **PASS real acotado**, 14/14 aserciones, exit 0 (E22). | Dos sesiones independientes del usuario objetivo quedaron revocadas en PostgreSQL y ambas devolvieron 401/no-store; la sesión del administrador actuante permaneció válida. Complementa la evidencia previa de reset/cambio de contraseña; no repite esos casos ni el E2E. |
| C10: OpenAPI del AppModule completo | **PASS semántico operativo**, 10 operaciones, cero divergencias semánticas y de extensiones de rutas (E24). | 53 headers requeridos presentes y marcados, estados coincidentes y tres 204 sin cuerpo. No hay identidad documental exacta: la descripción y cinco extensiones Info históricas permanecen diferenciadas. Corrección y prueba en `1fa46d4` (E23/E25). |
| C14: Review + Verify del delta C10 | **PASS incremental ordinario**, sobre los cuatro archivos exactos de `1fa46d4` (E26). | Revisión estática independiente sin hallazgos accionables; hashes comprometidos vinculados a las 12 pruebas focalizadas, lint y captura real ya retenidos. Se compone con la trazabilidad previa, sin reejecutar comprobaciones ni crear aprobación nativa. |
| C15: Git y lista positiva de evidencias | **PASS dentro del alcance auditado**, sin secretos identificados (E26). | Auditoría previa y delta cubren 287 blobs alcanzables en `1fa46d4`, con el binario público validado; el delta documental posterior de `8c9b467` y sus recibos se inspeccionaron por separado. Se verificaron 207 archivos distintos de evidencia y dos recibos de commit en E26. No certifica áreas privadas o ajenas excluidas ni ausencia universal fuera de la lista positiva. |
| Revisión nativa de U5 | **BLOCKED**, según la continuación registrada. | No hay continuación nativa utilizable registrada tras `recover`. Esta edición no consulta ni modifica su estado y no transfiere aprobación desde otros candidatos. |
| Cierre y entrega restante | **DICTAMEN INCORPORADO; auditoría externa pendiente**. | La matriz de los 17 criterios y el dictamen evalúan `8c9b467`, con alcances, diferencias históricas y bloqueo nativo explícitos. Esta incorporación documental posterior no repite verificaciones ni autoriza publicación o integración; no declara H1 aprobado o cerrado. |

### Matriz final de los 17 criterios — candidato `8c9b467`

Candidato evaluado: `8c9b467171cfb132c6d59ef5488b90c26a9a37eb`, padre `1fa46d48e5739715c9143615954d5b16cc073748`. La evaluación utiliza evidencias retenidas y su vinculación por hashes y deltas; no representa una ejecución integral nueva. Las referencias E1–E26 se desarrollan en este bloque. **Acreditado** significa acreditado dentro del alcance documentado, no certificación universal. Esta incorporación es un cambio documental pasivo posterior al candidato evaluado.

| N.º | Criterio H1 | Dictamen y evidencia |
|---|---|---|
| 1 | Login/logout/revocación funcionan realmente. | **Acreditado.** HTTP/SQL y flujos reales retenidos, E1. |
| 2 | Sesiones sobreviven recarga y se validan desde PostgreSQL. | **Acreditado.** Evidencias de sesión, restauración y navegador, E1/E3. |
| 3 | Passwords usan Argon2id con parámetros documentados. | **Acreditado.** Parámetros documentados y comprobación del hash real, E1. |
| 4 | CSRF + origen protegen mutaciones. | **Acreditado.** Rechazos HTTP y preservación del estado comprobados, E1. |
| 5 | Endpoint admin sin sesión es inaccesible. | **Acreditado.** Respuesta 401 comprobada en el flujo real, E1. |
| 6 | `mustChangePassword` se impone en backend y frontend. | **Acreditado.** Restricciones y navegación verificadas; correcciones posteriores separadas, E1/E15–E17. |
| 7 | Gestión básica de admins funciona. | **Acreditado.** Listado, creación, modificación y reset reales; UI verificada, E1/E3. |
| 8 | No se puede dejar cero administradores activos. | **Acreditado.** Carrera sobre PostgreSQL real; conservación de un administrador activo, E1. La prueba de concurrencia fue directa de servicio, no HTTP. |
| 9 | Reset/desactivación/cambio de password revocan sesiones según regla. | **Acreditado.** Reset y cambio en evidencia previa; desactivación real 14/14, E22. |
| 10 | OpenAPI coincide con runtime. | **Acreditado semánticamente.** AppModule completo: diez operaciones, cero divergencias semánticas, 53 headers y tres 204 sin cuerpo, E24/E25. No es identidad documental exacta. |
| 11 | Frontend y backend están integrados sin mocks residuales en el flujo entregado. | **Acreditado en el flujo entregado.** Integración real E1/E3; los mocks posteriores pertenecen a fixtures aislados. |
| 12 | Migraciones arrancan desde base limpia. | **Acreditado.** Preparación y migración sobre PostgreSQL nuevo, E1. |
| 13 | Build/lint/tests/smoke finales pasan o cualquier bloqueo real queda explícito. | **Acreditado con límites.** Resultados por unidad y candidato conservados; no se afirma una corrida integral final sobre `8c9b467`. Se mantienen fallos, omisiones y límites documentados. |
| 14 | Review + Verify cubren el candidato exacto. | **Acreditado por composición.** Cobertura previa más revisión independiente del delta C10, hashes coincidentes y comprobación estructural del commit documental, E26 y recibo del candidato. No constituye aprobación nativa. |
| 15 | No hay secretos/versiones de credenciales en Git/evidencia. | **Acreditado en el alcance auditado.** Git alcanzable compuesto, binario público validado, 207 evidencias y dos recibos en E26; delta documental y recibos posteriores inspeccionados sin hallazgos. Se conservan las exclusiones declaradas. |
| 16 | `docs/milestones/H1-informe.md` existe. | **Acreditado.** Consolidación propia comprometida en `8c9b467`; la presente matriz se incorpora después sin alterar sus evidencias históricas. |
| 17 | H2 no fue iniciado. | **Acreditado en el alcance revisado.** Los deltas posteriores corresponden a correcciones, evidencias y documentación de H1. |

### Dictamen para auditoría externa — candidato `8c9b467`

**Candidato preparado para auditoría externa, con reservas explícitas. No se declara H1 aprobado ni cerrado.** La cobertura se acredita por las unidades, candidatos y comprobaciones efectivamente observados, no por una ejecución sintética o una aprobación transferida entre revisiones.

Reservas que acompañan la entrega:

- **Revisión nativa:** continúa BLOCKED según la continuación previamente registrada; no se consultó ni modificó. El Review ordinario no constituye aprobación nativa.
- **OpenAPI:** existe paridad operativa semántica, no identidad documental exacta; la descripción y cinco extensiones Info históricas permanecen diferenciadas. Las normalizaciones representacionales no eliminan restricciones operativas.
- **Verificación por candidato:** no hubo E2E integral nuevo sobre `8c9b467`. Los resultados históricos conservan sus fallos, omisiones y límites, incluida la corrida de navegador PARTIAL y el zoom acreditado posteriormente por separado. No se suman conteos superpuestos ni se presentan como una única corrida final. La limitación conocida de la ruta absoluta a Python del harness no se declara corregida ni portable.
- **Secretos y alcance:** el PASS de C15 corresponde al Git alcanzable compuesto, el recurso público y la lista positiva declarada. No se inspeccionaron ni certificaron áreas privadas o ajenas excluidas; tampoco se afirma ausencia universal fuera de ese alcance.
- **Candidato y WIP:** el checkout permanece deliberadamente con los 17 renglones previos y archivos ajenos sin incorporar. El candidato entregable es el commit delimitado, no ese WIP. El índice estaba vacío y los 180 archivos protegidos mantuvieron bytes/modos al emitir el dictamen en el chat.

La matriz y el dictamen fueron entregados primero en esta conversación mediante revisión sólo en lectura; no se ejecutaron pruebas/E2E ni se crearon archivos en aquella evaluación. El recibo `/var/folders/h5/kkfjlsqs4dg371_bgbs86m080000gn/T/h1-report-c9-c10-audit-commit-EzVZeA/report.json` vincula el commit exclusivo `8c9b467`, su padre, el hash del informe comprometido y la preservación del histórico y los 17 renglones previos; el hash de los cuatro archivos C10 sigue coincidiendo con los overlays de E24. Esta incorporación documental no reejecuta esas verificaciones, no modifica el candidato evaluado y no autoriza commit, push, PR, merge, tag, publicación o integración. La evaluación y aprobación externa posterior quedan pendientes de decisión humana.

### Consolidación de C9, C10 y auditoría incremental C14/C15

La entrega C10 es `1fa46d48e5739715c9143615954d5b16cc073748`, padre `eeb2a23eabb7c169c28c93156725241558eacd4a`: únicamente `backend/src/configure-application.ts`, `backend/src/auth/auth.controller.ts`, `backend/src/auth/admin-users.controller.ts` y la nueva regresión `backend/src/configure-application.openapi.spec.ts` (+130/−16). Sus cuatro hashes comprometidos coinciden con los overlays de la captura real E24 y los archivos verificados en E23/E25. No se repitieron pruebas para crear el commit ni para actualizar este informe.

- **Preparación y fallos conservados (E20/E21):** el primer intento C9/C10 quedó UNAVAILABLE durante la compilación temporal, sin migraciones ni HTTP; el wrapper no conservó el subcomando o diagnóstico exactos y no se atribuye una causa al proyecto. El diagnóstico posterior observó el motor Prisma ausente tras una copia con salida 0; la transferencia por stdin con verificación de hash permitió generar Prisma, compilar TypeScript y copiar recursos, todos exit 0, sin corregir fuentes. El mecanismo exacto del fallo de copia original no quedó demostrado. Un driver que maneja el fallo y termina en 0 no constituye aceptación funcional.
- **C9 real (E22):** usuario objetivo activo, versión 1 y dos sesiones válidas independientes; PATCH del administrador actuante respondió 200/no-store y versión 2. El readback SQL confirmó usuario inactivo, dos de dos sesiones revocadas y una sola auditoría DEACTIVATED del actor al objetivo. Ambas cookies anteriores devolvieron 401/no-store y el actor mantuvo 200. Las 14 aserciones aprobaron en una base nueva temporal; no se repitieron reset, cambio de contraseña, concurrencia, navegador ni E2E.
- **C10: FAIL inicial y corrección (E22/E23):** la primera captura del AppModule completo mostró 38 diferencias reportadas como semánticas, además de diferencias representacionales, metadata y extensiones. Se conservó ese FAIL. La corrección sólo completó anotaciones y schemas Swagger; los cuerpos de controladores y la configuración de middleware permanecieron iguales. La regresión nueva observó RED inicial (11 fallos y una prueba aprobada); incluía una comparación de prosa de cookies corregida en el comparador. Un fallo intermedio de tipado de extensiones también quedó retenido. El GREEN final fue 12/12 y el lint de los cuatro archivos terminó en 0. No se suman esos intentos ni se presentan los fallos de preparación como RED funcional o PASS.
- **C10 real corregido (E24):** una sola petición GET `/api/docs-json`, 200, del AppModule completo construido con la base más los cuatro overlays exactos posteriormente comprometidos. Las diez operaciones coinciden en métodos, estados, schemas y restricciones, Origin/CSRF, alternativas de seguridad por cookies, headers/no-store y `x-abar-errors`; cero divergencias semánticas y de extensiones de rutas, 53 headers obligatorios y tres 204 sin cuerpo. SHA-256 de la captura: `d4469f9a71387f0a83d4e7beb95bb99b722a56134baf4e80f5a675891a63c3ff`. No ejecutó C9, login, health, migraciones, fixtures, suites ni E2E.
- **Metadata explícita, no identidad exacta:** título y versión coinciden. La descripción runtime informa H1 sin copiar la afirmación histórica de que sólo funciona health; cinco extensiones Info congeladas no se proyectan como estado actual. Se retuvieron 202 diferencias estructurales brutas y su clasificación; orden y `parameters` ausente frente a `[]` se distinguen de los requisitos operativos. `info.contact` ausente frente a `{}` es representacional. El contrato congelado no se modificó ni se importó íntegramente para ocultar diferencias.
- **C14 incremental (E26):** `c14_c10_incremental_readonly` (gpt-6.1-sol, medium) revisó los cuatro archivos inmutables del commit y su padre. No encontró defectos introducidos accionables ni una normalización que ocultara requisitos del candidato actual. Verificó los hashes de los blobs, las evidencias de pruebas/lint y el hash de la captura real, sin ejecutar código. El fixture de regresión usa controladores reales y siete servicios simulados; no se confunde con el AppModule completo, acreditado por separado en E24. Este Review ordinario se compone con la cobertura previa y no reanuda ni sustituye la aprobación nativa bloqueada.
- **C15 incremental (E26):** `c15_incremental_binary_evidence` (gpt-6-luna, high) verificó cuatro blobs de texto nuevos sin hallazgos de secretos. La enumeración alcanzable pasó de 283 a 287 blobs, exactamente ese delta; se compone con los 282 blobs de texto previamente auditados y el binario antes excluido. Los 111 candidatos históricos de patrones quedaron clasificados: 60 sintéticos/ejemplos, 51 referencias o expresiones de código, cero confirmados y cero sin resolver; no son 111 secretos ni una nueva ejecución de aquella auditoría.
- **Binario público, reserva resuelta:** `backend/resources/auth/password-blocklist.bin` conserva 170.528 bytes, exactamente 5.329 registros de 32 bytes, ordenados, únicos y sin payload sobrante. SHA-256 `7a85af89d0f800cc94cbe81ad5a11de7590da24a5ed33c6a5bc5e7f0abea1eb0`, coincidente con el manifiesto versionado y sus notices fijados. La procedencia local documenta SecLists/PWDB y licencias MIT. Es un índice público de hashes de contraseñas comprometidas, no versiones de credenciales del proyecto; la comprobación local de integridad no recertifica el upstream.
- **Lista positiva y preservación:** seis manifiestos enumeran 207 archivos distintos: 25 previamente auditados con hashes revalidados y 182 inspeccionados incrementalmente, sin hallazgos de secretos; dos JSON de recibos de commit se comprobaron aparte. Las cuatro entradas de fuentes staged no se cuentan como cuatro evidencias adicionales. La supuesta falta inicial de un manifiesto fue un error de transcripción de ruta, corregido sobre la ruta autorizada; los 38 archivos estaban presentes, no se perdieron recibos. Se verificaron tipos regulares, ausencia de symlinks y hashes, sin recorrer perfiles, archivos privados, copias del informe con contenido ajeno o directorios de revisión.

Los recursos de las ejecuciones anteriores fueron nuevos y temporales; se conservan sus confirmaciones de eliminación verificadas por identidad/etiqueta y la retirada de archivos privados, sin afirmar certificación universal de ausencia o durabilidad. En E24 se auditaron 112 fuentes y 38.504 archivos de dependencias físicas; 45 enlaces internos se materializaron y no hubo escapes. El volumen retenido se utilizó sólo en lectura. E26 no creó archivos ni ejecutó pruebas; su spot check del padre confirmó 180 archivos protegidos sin cambios, HEAD en `1fa46d4` e índice vacío. La presente edición es exclusivamente documental y no vuelve a ejecutar esas comprobaciones funcionales.

### Revisión independiente de U5 y corrección posterior

La auditoría ordinaria de código, separada de la transacción nativa bloqueada, inspeccionó los nueve archivos del rango `f71cd666e2a5e366cd9475cb4e36379578deb693` → `3e509d3d96539483db0024a0d47a910cf327bbfe`. Identificó dos hallazgos P2; las correcciones posteriores quedaron juntas en el commit local `09082e3e0db0a39369efbccd8808e68f3eca85c1`:

- **Login Unicode:** el límite cuenta puntos de código después de normalizar NFC, como el backend, sin normalizar ni recortar la contraseña enviada. La regresión reproduce una contraseña descompuesta válida; se conserva el límite ordinario de 128/129 caracteres.
- **Logout en reautenticación:** después de un cambio de contraseña confirmado y una lectura de sesión fallida, la vista ya no ofrece una acción de logout que omitiría la petición por no tener CSRF. Se conserva el mensaje de contraseña guardada, el enlace de login, la limpieza de secretos y el bloqueo de reenvío. El logout normal mantiene POST con CSRF. No se afirma revocación de la cookie del servidor en la rama de reautenticación; no se modificó el servicio compartido ni el backend.
- **Evidencia y límites:** RED con cuatro fallos y seis pruebas aprobadas antes del cambio de producción; luego 10/10 focalizadas, 27/27 unitarias frontend en siete archivos, lint acotado exit 0 y verificación independiente 14/14 en tres archivos (E15/E16). Los conteos se superponen y no deben sumarse. Los hashes probados coinciden con los cuatro archivos incluidos en `09082e3` (E17). La verificación independiente no encontró bloqueantes causados por esas correcciones dentro de su alcance; no es una aprobación de la revisión nativa ni del contrato completo.

Se conservan como fallos de preparación los dos incidentes de copia temporal registrados: enlaces de dependencias detectados y materializados antes de ejecutar pruebas, y una copia del verificador que omitió bundles `dist` y falló antes de recolectar tests. La copia nueva corregida obtuvo el resultado independiente anterior; no se reescribe el fallo inicial como PASS.

### Revisión del harness/probe y correcciones P2

La revisión estática independiente ordinaria inspeccionó los once archivos exactos del harness/probe en `0370c2293dab7eb48c6e61949ea31e00ab98890d`, separada de la revisión nativa bloqueada. Identificó tres P2; su corrección quedó en `abc285e02be34559279cda543a5142ad8e7f2a13`, exclusivamente en `odd/checks/h1-browser-real.mjs`, `backend/scripts/h1-browser-lifecycle.test.mjs`, `backend/scripts/h1-real-e2e.py` y `backend/scripts/h1-real-e2e.test.py` (+414/−27; E18/E19).

- **CDP:** conexión y comandos tienen deadlines; cierre/error rechazan los pendientes. El contraste focal del padre observó la espera pendiente en la función original y el rechazo controlado en la corregida, con socket fake.
- **Lanzamiento de procesos:** errores asíncronos de backend/Chrome se convierten en fallos controlados de readiness. Las regresiones recorren la función real de arranque de Chrome con procesos fake, además de los helpers.
- **Sidecar Python:** la escritura privada conserva `HostFilesystem.write_private`, pero se ejecuta en un subprocess con espera y terminación acotadas. La prueba causal independiente observó entrada al `fsync` instrumentado, salida del padre en 0,317 s y helper terminado con −9/recolectado en 0,264 s; archivo privado 0600. Es un fallo controlado, no una prueba de bloqueo real ininterrumpible del filesystem ni de quiescencia universal.
- **Fallos y verificación:** la primera corrección dejó una referencia incorrecta al proceso de Chrome y un join implícito no acotado de multiprocessing; el verificador los reprodujo. Una corrección acotada los resolvió y el recheck independiente se limitó a esos bloqueos. Se conservan los resultados anteriores y los fallos de preparación. Los fallos iniciales por export/parámetro ausente no se presentan como RED conductual; se registran aparte las reproducciones causales de Chrome y del sidecar. Las pruebas finales y sus hashes están en E18; E19 acredita que el commit preservó esos bytes, sin repetir pruebas. No es aprobación nativa ni una nueva aceptación integral de H1.

### Dependencias de entrega resueltas y límites conservados

- **Runtime real histórico:** `backend/prisma.h1-e2e.config.ts`, `backend/scripts/h1-product-e2e.mjs` y `backend/scripts/h1-real-e2e.mjs` conservan los hashes de las copias del manifiesto de E6. Python estaba vinculado a ese snapshot y fue versionado en `ccbd52e` (E13), pero cambió posteriormente junto con el probe en `abc285e`; sus bytes actuales se vinculan a E18/E19, no a una nueva ejecución real de E1/E6. La coincidencia de hashes vincula fuentes, no demuestra autoría ni aprobación integral. El CLI del runner conserva una ruta absoluta a Python de Homebrew: esa limitación de entorno no se declara corregida ni portable por estas pruebas.
- **Vinculación de pruebas — POR CANDIDATO:** E10 conserva resultados, comandos, stdout/stderr y hashes de sus ocho fuentes copiadas; no se reetiquetan sus 93 pruebas como una ejecución del candidato nuevo. E18 aporta por separado las verificaciones focalizadas de `abc285e`, incluidos Python fake 78/78 y las nuevas pruebas de ciclo de vida. No se suman conteos superpuestos ni se declara repetida la suite integral.
- **Dependencia de la regresión — VERSIONADA:** `backend/scripts/h1-acceptance-regressions.test.mjs` y `odd/checks/h1-browser-real.mjs` se incorporaron juntos, sin mover ni editar bytes, en `04fc2a3` (E14). Sólo ese probe recibió inclusión forzada; `.gitignore` quedó intacto y el resto de `odd/` no se incorporó. El 1/1 de regresión no acredita ejecución completa del probe ni de su suite acompañante. La guía de navegador conserva su referencia al mismo probe.
- **Auxiliares separados:** el controlador y probe POSIX se declaran de autoría solamente, sin ejecución ni calificación acreditadas; la guía SDK conserva evidencia fake y queda fuera del camino crítico de aceptación del producto. No se atribuye su autoría ni se los convierte en requisitos de cierre.
- **Documentación y procedencia:** las guías de navegador y E2E conservan referencias S12 históricas. Los archivos sin seguimiento no se consideran propios o ajenos sólo por su estado Git. La clasificación y cualquier entrega posterior requieren conservar esas fronteras; los 17 renglones previos pendientes del informe quedan fuera de esta edición.

### Referencias locales de evidencia

Los siguientes informes son archivos temporales retenidos, no artefactos versionados ni una garantía de conservación fuera de este equipo:

- **E1:** `/private/tmp/h1-real-audited-evidence-83er6wpt/report.json` — HTTP/SQL, concurrencia, navegador y auditorías de aislamiento de la repetición controlada.
- **E2:** `/private/tmp/h1-zoom-auth-mwlh8cnd/report.json` — zoom nativo autenticado; restauración al 100 %, cierre de sesión y pestaña, y limpieza de recursos temporales.
- **E3:** `/private/tmp/h1-admin-ui-evidence-zfj4kcke/report.json` — archivos de administración superpuestos, pruebas frontend y comprobaciones aisladas finales.
- **E4:** `/private/tmp/h1-frozen-lint-evidence-wsq45x2y/report.json` — lint backend completo, compilación, suite y verificación independiente. Servicio equivalente byte a byte al emitir sin comentarios; spec con AST equivalente y diferencias sólo de formato.
- **E5:** `/private/tmp/h1-lint-commits-xrlxdowb/report.json` — commits locales `57a832a850442cb1accdcb641dcd31f80de4fd33` y `6be7acbc79af270a5668da3179298ef39303e7d0`; parches idénticos a los verificados, índice vacío y trabajo previo preservado.
- **E6:** `/private/tmp/h1-contrast-fixed-auth-n601xrzc/report.json` — corrección de bordes y foco limitada a los hosts auth/admin; reglas y tokens del sitio público preservados. Se conserva el FAIL anterior en `/private/tmp/h1-contrast-auth-ia7qg_d1/report.json`; no se reescribe como aprobado. La repetición focal utiliza otra base temporal, sin repetir el E2E completo.

- **E7:** `/private/tmp/h1-u6-local-commit-6gcz4so1/report.json` — commit local U6 `eec383072615e2042d994d62227940412ad69c6e`, exclusivamente los tres archivos de usuarios/pruebas/layout; contenido verificado preservado.
- **E8:** `/private/tmp/h1-runner-unit-b7qsmr/report.json` y `hashes.json` del mismo directorio — seis pruebas unitarias aprobadas; stdout/stderr y hashes SHA-256 de ambos archivos retenidos.
- **E9:** `/private/tmp/h1-runner-local-commit-lX3c3n/report.json` — commit local `07518195aa66504072169e956c9970803e6c5444`, exclusivamente runner y pruebas; hashes y parche comprometido coincidentes con la evidencia previa, sin repetir pruebas.

- **E10:** `/private/tmp/h1-four-unit-VzoWNk/run-report.json` y `parent-verification.json` del mismo directorio — 93 pruebas unitarias aprobadas; cuatro suites ejecutadas una vez en copia temporal, Python sólo fake. Incluye hashes de fuentes/copias y resultados; la lectura posterior verificó stdout/stderr y códigos de salida sin repetir pruebas.
- **E11:** `/private/tmp/h1-product-helper-commit-tlLrzl/report.json` — commit local `c775c28c1c310076d389c3250337215735e6d8e7`, exclusivamente helper de aceptación de producto y sus pruebas; hashes y parche comprometido coincidentes con las evidencias retenidas, sin repetir pruebas.
- **E12:** `/private/tmp/h1-http-sql-fixture-commit-0nORgl/report.json` — commit local `a39423505da91efe6c18615405f071bca19fb4a3`, exclusivamente fixture HTTP/SQL, pruebas y configuración Prisma; hashes y parche comprometido coincidentes con las evidencias retenidas, sin repetir pruebas.
- **E13:** `/private/tmp/h1-python-harness-commit-fgcnRL/report.json` — commit local `ccbd52e01da7d58c33f7d5049e46b12f3c993fa1`, exclusivamente harness Python y pruebas fake; hashes y parche comprometido coincidentes con las evidencias retenidas, sin repetir pruebas.
- **E14:** `/private/tmp/h1-regression-probe-commit-5TJMgL/report.json` — commit local `04fc2a341a24d94ddf88200141a878ca354872c0`, exclusivamente regresión y su probe de navegador; hashes y parche comprometido coincidentes con las evidencias retenidas, sin repetir pruebas.

- **E15:** `/private/tmp/h1-u5-two-fixes-uJo4Ts/report.json` — correcciones acotadas de U5; RED/GREEN, 27 pruebas frontend, lint, hashes, guardas de archivos y limpieza de copias de ejecución. Conserva los resultados fallidos de preparación sin transformarlos en aprobación.
- **E16:** `/private/tmp/h1-u5-fix-verify-GBbxnQ/result.json`, `stdout.log` y `workspace-guard.json` del mismo directorio — verificación independiente de 14 pruebas, exit 0; hashes de candidato coincidentes y archivos fuera de alcance preservados. El fallo de preparación previo se conserva en `/private/tmp/h1-u5-fix-verify-GROTqZ/result.json`.
- **E17:** `/private/tmp/h1-u5-corrections-local-commit-jXGcya/report.json` — commit local `09082e3e0db0a39369efbccd8808e68f3eca85c1`, exclusivamente cuatro archivos de páginas auth y pruebas, +64/−2; parche y hashes idénticos a los verificados, sin repetir pruebas ni incluir los 17 renglones previos.

- **E18:** `/var/folders/h5/kkfjlsqs4dg371_bgbs86m080000gn/T/h1-three-p2-umnhYj/report.json` — correcciones de los tres P2, hashes de los cuatro archivos, resultados focalizados y guardas. `retained/` conserva 50 archivos de evidencia, incluidos logs RED/GREEN y del recheck independiente; `parent-node-spot.json` y `parent-cdp-baseline-differential.json` registran los controles del padre. `cleanup.json` registra la retirada de las copias temporales propias; no hubo nuevo E2E, navegador real, Docker ni bases.
- **E19:** `/var/folders/h5/kkfjlsqs4dg371_bgbs86m080000gn/T/h1-three-p2-local-commit-FomAvJ/report.json` — commit local `abc285e02be34559279cda543a5142ad8e7f2a13`, padre `0370c22`; exclusivamente cuatro archivos, +414/−27, con hashes comprometidos idénticos a los verificados. Los 179 archivos guardados conservaron bytes/modos, el índice quedó vacío y los 17 renglones previos y el trabajo ajeno permanecieron intactos. Sin ediciones ni pruebas repetidas durante el commit.

- **E20:** `/var/folders/h5/kkfjlsqs4dg371_bgbs86m080000gn/T/h1-c9-c10-c15-xTRZuW/reports/c9-c10/result.json`, `build-failure.json` y `positive-evidence.json` — intento inicial UNAVAILABLE antes de HTTP/SQL, diagnóstico limitado, confirmaciones de limpieza y lista positiva; no se presenta como aceptación funcional.
- **E21:** `/var/folders/h5/kkfjlsqs4dg371_bgbs86m080000gn/T/h1-build-diagnostic-TCHp0F/reports2/diagnostic-summary.json` y `positive-evidence.json` — compilación aislada aprobada tras transferir y verificar el motor por stdin; el primer bloqueo queda en `reports/result.json` del mismo directorio raíz. No ejecutó bases, backend runtime, HTTP ni E2E.
- **E22:** `/var/folders/h5/kkfjlsqs4dg371_bgbs86m080000gn/T/h1-c9-c10-runtime-sQ2dpV/reports/c9.json`, `c10-semantic-review.json`, `runtime-openapi.json`, `resource-ledger.json` y `positive-evidence.json` — C9 real PASS 14/14 y primer C10 FAIL sobre `eeb2a23`, con readback SQL, captura real y diferencias preservadas; no corresponde a la corrección posterior.
- **E23:** `/var/folders/h5/kkfjlsqs4dg371_bgbs86m080000gn/T/h1-c10-fix-4OBuKK/result.json`, `positive-evidence.json` y `reports3/green-focused.json`, `scoped-lint.json`, `runtime-body-preservation.json` — corrección exclusiva de cuatro archivos, RED/fallos intermedios/GREEN 12/12, lint acotado y preservación de cuerpos; no es la captura del AppModule completo.
- **E24:** `/var/folders/h5/kkfjlsqs4dg371_bgbs86m080000gn/T/h1-c10-full-swagger-jRhdBE/reports/comparison.json`, `runtime-openapi.json`, `source-audit.json`, `positive-evidence.json` y `/var/folders/h5/kkfjlsqs4dg371_bgbs86m080000gn/T/h1-c10-full-swagger-jRhdBE/parent-verification.json` — una captura real del AppModule completo: diez operaciones, cero diferencias semánticas operativas, metadata histórica diferenciada y 38 archivos de evidencia sellados. Identidad de base más overlays, vinculada después al commit por sus hashes; no se atribuye la captura al HEAD anterior sin overlays.
- **E25:** `/var/folders/h5/kkfjlsqs4dg371_bgbs86m080000gn/T/h1-c10-local-commit-57mZn2/report.json` y `staged.json` — commit exclusivo `1fa46d48e5739715c9143615954d5b16cc073748`, cuatro archivos, +130/−16, hashes acreditados y 180 archivos preservados; índice vacío, 17 renglones previos sin stage y ningún test repetido.
- **E26:** acta de auditoría incremental de esta conversación, resumida en la sección C14/C15 anterior: revisión ordinaria independiente del delta exacto y auditoría de procedencia/formato/lista positiva, sólo en lectura y sin archivo de resultado adicional. Manifiestos inspeccionados (rutas relativas a la raíz de cada ejecución): `reports/c15/positive-evidence.json` de la raíz E20 (25 archivos), `reports/positive-evidence.json` de E22 (38), `reports/positive-evidence.json` y `reports2/positive-evidence.json` de E21 (21 y 31), `positive-evidence.json` de E23 (54) y `reports/positive-evidence.json` de E24 (38). Se compone con el informe previo `reports/c15/audit-report.json` de E20, sin reescribir sus reservas históricas como si nunca hubieran existido. El PASS actual sólo cubre los inputs declarados, los blobs alcanzables compuestos y la procedencia local verificada.

La corrección de contraste, las consolidaciones documentales, U6, runner, las cuatro unidades de harness acordadas, la corrección de UI de U5, los tres P2 del harness/probe y C10 están en commits locales separados. Esta reconciliación conserva resultados por candidato y alcance: no crea aprobación nativa ni convierte los auxiliares excluidos en requisitos obligatorios. La matriz final de los 17 criterios y el dictamen de `8c9b467` quedan incorporados para auditoría externa con sus reservas explícitas. Esta edición sólo modifica el presente bloque; no ejecuta pruebas, E2E, SQL ni operaciones de revisión y no autoriza commit, push, PR o merge. Se preservan el histórico, los 17 renglones previos, el trabajo ajeno y el bloqueo de la revisión; no se declara H1 aprobado ni cerrado.

> **Contenido previo preservado:** todo lo que sigue conserva los estados, fallos y afirmaciones de sus snapshots históricos, incluidos los encabezados que entonces se denominaban “actuales”. No debe interpretarse como el estado consolidado del 2026-10-18.

---

**CONTRACT FROZEN · C01–C10 CLOSED · C11 OFFLINE OBSERVATIONS ONLY · AUTH ENDPOINTS NOT IMPLEMENTED · EXTERNAL AUDIT PENDING.** C11 parent ASSESS, functional Verify, native consent/review and local commit remain pending. This partial report does not declare H1 compliant, approved, closed or ready for final audit.

## Identidad y alcance (snapshot histórico pre-freeze C07)

Los estados pendientes y la identidad de este snapshot se conservan; el cierre C07
y la identidad C08 se registran más abajo, sin enmendar evidencia histórica.

- Baseline H0 aprobado: `2428f2b918d97c5a48dabc438b0b3bf89030c7fb` (`h0-approved`).
- Tracker local: `feat/h1-auth`; slice actual: `feat/h1-auth-07-runtime`, base/HEAD `777dbfac9df307a635e3f91fc9edac9bdb19e09f` (C06 cerrado). Estrategia elegida: feature-branch-chain; C07 prepara composición DI, con review nativa/Verify independiente/commit pendientes del padre. Prompt autorizado: `1e9cd1e44b919738da8c9d1262b436b8a354af17`. Commit de preparación contractual: `b6eed95359fa4a4ede13d62ced034508f57c1015`, tree `8267b798b01d6171b3cdcaa0f4a5052c59bfac4d`. `main` permanece sin cambios; no push, merge ni tag H1.
- Snapshot de bytes de `contracts/openapi.yaml`, SHA256: `94122791de8ce646bcbe342b6bc7d33833ce0b0e9e7121055f6601a22ba80a2f`. Es **digest contractual**, no hash de commit ni target de revisión nativa; recalcular si cambian los bytes.
- Norma OpenAPI 3.0.3, versión 0.4.0, milestone `H1-contract-freeze`, runtime-stage `h0`, status `candidate`. Nueve operaciones auth/admin más health; solo health corre hoy. [Decisión y fuentes](../decisions/H1-auth.md), [historial](../../contracts/CHANGELOG.md), [uso](../../README.md).

La unidad contractual preservada contiene OpenAPI, validador/test y cuatro ejemplos nuevos saneados (`admin-session`, `admin-user`, `admin-users`, `auth-error`), además de documentación. Esa unidad no cambió backend, Angular, Prisma, migraciones, dependencias ni configuración. C01 agregó parser independiente/tests y C02 política independiente/tests; C03 agregó solo generador/resource/notices offline y documentación; C04 prepara loader standalone, sin registro de módulos ni cambios H0. El modelo, bootstrap, login y gestión administrativa son dirección pendiente, no runtime construido.

## Evidencia disponible y límites

El explorer `murf6fch-j-wlly` completó las siete fuentes; `murf70ic-k-6xzs` verificó OWASP/NIST y metadata de dependencias, con Docker/servicios healthy **en ese momento**, no disponibilidad continua. La revisión `review-adce1fdd7f44ebac` aprobada/ack consumido cubre solo el prompt; `review-e7eb83b58607d1b3`, aprobada/ack consumido, cubre solo el snapshot de test de 37 líneas con SHA256 `9b945c224e141130f6c24a6adc65d8289c5a1bfdc32e3439006cfb4575f91688`, no norma ni runtime.

El writer original `murfr4n6-m-3ge6` dejó RED (7 pass, 2 fail); la reanudación `murfzmbe-n-u8pe` y scout `murgeyx2-o-k97c` tuvieron timeout, sin causa demostrada. Los escritos posteriores se preservaron y el verificador independiente de solo lectura `murgmnca-p-abe0` confirmó el GREEN actual siguiente, sin cambios de archivos ni reparación de configuración.

| Comando / comprobación | Resultado y alcance |
|---|---|
| `node --test scripts/h0-contract-validate.test.mjs` | PASS reportado por verificador, exit 0, 11 pass, 0 fail/skipped/cancelled; validador, no auth runtime. |
| `npm --prefix backend run contract:validate` | PASS reportado por verificador, exit 0; OAS 3.0.3 y 7 JSON externos. |
| `git diff --check` | PASS independiente sobre el commit contractual, exit 0. |
| `npm --prefix backend run contract:validate:live -- --stage=h0` | **PASS**, exit 0: subset transicional Swagger/health, PostgreSQL 200 y 503 saneado; no certifica H1. |
| `npm --prefix backend run contract:validate:live` | **PENDING / NOT APPLICABLE hasta implementación H1**: por defecto stage=h1 exige operaciones hoy ausentes; no se espera PASS del runtime H0. |
| Review nativa de unidad normalizada completa | **APPROVED**, cuatro lentes, `review-53bf61d7c6af9c27`; acuse exacto consumido del snapshot workspace. |
| Build/lint/unit/e2e H1, Prisma generate/validate y migración limpia | **PENDING / NOT APPLICABLE a esta edición documental**, ejecutar sobre implementación futura. |
| Argon carga/benchmark/concurrencia, bootstrap, login/sesión/CSRF/revocación/users con PostgreSQL real | **PENDING**, ninguna evidencia funcional H1. |
| Angular integrado, smoke H1 y navegador 360/768/1440, teclado/foco/zoom/contraste | **PENDING**, placeholders H0 no acreditan autenticación ni verificación visual. |

El verificador `murgx87h-r-mqb5` repitió los cinco checks antes del commit; `murh82fh-s-281n` los repitió sobre `b6eed95359fa4a4ede13d62ced034508f57c1015`: todos exit 0, 11/11 tests, 7 ejemplos y digest contractual idéntico. HEAD/tree sin cambios y árbol limpio inicial/final. LIVE informa cierre de sus hijos propios; sin confirmación independiente de PIDs ni cambios de Docker/entorno.

La revisión nativa aprobó el target workspace `sha256:f115791b46d8ead366abd86a499e51052a03add5539eea3e70247801773f527b`; su tree se comprobó idéntico al commit contractual antes de commitear. No se transfiere autoridad a otra identidad: ASSESS del rango commiteado informa `unknown` para su propia proyección y se aplicó su plan de Verify independiente. Advisory no bloqueante: `R3-security-scheme-drift`, `scripts/h0-contract-validate.mjs:391`; queda para seguimiento separado, sin corrección ni reapertura de esta revisión.

Edición documental sin RED conductual significativo. El RED/GREEN histórico del validador es evidencia aportada de snapshots previos/actuales, no pruebas nuevas ejecutadas por este writer ni verificación de código fuente H1.

## Slice 01 — Configuración C01 completada (evidencia histórica)

Una sola unidad compilable: [`auth.config.ts`](../../backend/src/auth/auth.config.ts), [tests](../../backend/src/auth/auth.config.spec.ts) y [tabla operativa](../decisions/H1-auth.md#configuración-independiente-preparada-integración-futura). Defaults conservados (8 h/30 min/15 min y tasas congeladas), validación estricta de orígenes/Secure/números/flags, errores redactados e inmutabilidad defensiva. Sin lecturas globales al importar/validar, DB, HTTP, módulos, dependencias o cambios de norma. Los settings **no están conectados al runtime H0**.

Evidencia observada por este writer, comandos síncronos (timeout 180 s). Snapshot inicial histórico: GREEN 335/335 focused y 344/344 unit; los resultados actuales incluyen seis regresiones de wildcard canónico. Antes del guard post-URL, `%2A`, `%2a` y asterisco fullwidth canonicalizaron a `*.example.test` y fueron aceptados en development/production: RED real, exit 1, 6 failed/335 passed de 341. Se preservan las pruebas anteriores de userinfo vacío, query/fragment vacíos, dot-path y backslash; no se reescribe el parser ni cambia el contrato.

| Comando exacto | Resultado observado |
|---|---|
| `npm --prefix backend test -- --runInBand --runTestsByPath src/auth/auth.config.spec.ts` | RED: exit 1, 321 failed/321, stub tipado sin comportamiento. GREEN histórico: exit 0, 321/321 y luego 335/335. Regresión wildcard: RED exit 1, 6 failed/335 passed; GREEN actual exit 0, 341/341, 1 suite. |
| `npm --prefix backend run build` | Repetido tras regresión: exit 0; Prisma generate existente + TypeScript. |
| `npm --prefix backend run lint` | Repetido tras regresión: exit 0; sin errores. |
| `npm --prefix backend test -- --runInBand` | Actual: exit 0; 350/350 tests, 4/4 suites (histórico inicial: 344/344). |
| `npm --prefix backend run test:e2e -- --runInBand` | Repetido tras regresión: exit 0; 5/5 tests, 1/1 suite H0, no auth funcional. |
| `npm --prefix backend run contract:validate` | Repetido tras regresión: exit 0; OpenAPI 3.0.3 y 7 ejemplos JSON externos. |
| `git diff --check` | exit 0; comprobado tras escribir el informe, sin errores de whitespace. |

Prerrequisitos previos, no pruebas nuevas de este slice: probe Argon GREEN con 26 hashes, default elegido 1, sin dependencia Argon backend; fuente offline Pwdb 1M fijada y ambos avisos MIT resueltos, asset/generador aún no implementados (detalle en decisión). No se afirma capacidad de aplicación ni completitud de blocklist.

Conteo inicial histórico: 400 líneas cambiadas (382 agregadas, 18 retiradas). Conteo final observado: 412 líneas cambiadas (394 agregadas, 18 retiradas). La regresión legítima agrega tests/guard al mismo slice coherente y supera el advisory de 400 en 12 líneas, sin minificar ni omitir pruebas. Digest contractual verificado idéntico; HEAD/tracker y main/origin sin cambios. El estado pendiente de commit/review de ese snapshot quedó supersedido por la evidencia C01 siguiente, sin trasladar autoridad del freeze. Auth funcional/bootstrap/concurrencia PostgreSQL/full H1 LIVE **NOT APPLICABLE todavía**; integración, auditoría externa y cierre H1 siguen pendientes. No servicios, migraciones, navegador ni publicación para esta unidad.

C01 fue commiteado como `7f4df80ceba00dfd495ca6cac25c6c6035168770`. Review nativa `review-3792904812c14bb0`: aprobación de cuatro lentes y acknowledgement consumido. Verify independiente: 18 comandos exit 0, 341 tests de configuración, 350 unit/4 suites, 5 mock e2e, 11 tests contractuales y 7 ejemplos. Tree verificado y commiteado idéntico: `4f1079ebaa8dd07b45dd57b7dfa4efea93c44785`. Esta evidencia es **histórica y solo C01**, no aprobación de política ni certificación H1 runtime.

## Slice 02 — Política independiente preparada; gates del padre pendientes

[`password-policy.ts`](../../backend/src/auth/password-policy.ts) y [specs](../../backend/src/auth/password-policy.spec.ts): credencial NFC privada separada del digest público, Unicode bien formado, bounds posteriores a NFC y lookup síncrono obligatorio/fail-closed. Sin registro Nest, env global, filesystem/red, módulos, cuentas, Argon ni efectos HTTP. Tests sintéticos verifican receiver, redacción, igualdad completa y source14/alias15 e input128/key129; no acreditan cobertura real del asset ni no-encogimiento Unicode general.

Evidencia observada por este writer, comandos foreground con timeout 180 s:

| Comando exacto | Resultado observado |
|---|---|
| `npm --prefix backend test -- --runInBand --runTestsByPath src/auth/password-policy.spec.ts` | RED exit 1: 52 failed/4 passed, 56 total, stub tipado ejecutable; GREEN exit 0: 56/56, 1 suite. No fallo de import/runner. |
| `npm --prefix backend run build` | exit 0; Prisma generate existente + TypeScript. |
| `npm --prefix backend run lint` | exit 0; sin errores. |
| `npm --prefix backend test -- --runInBand` | exit 0; 406/406 tests, 5/5 suites; incluye 56 de política y 341 de configuración. |
| `npm --prefix backend run test:e2e -- --runInBand` | exit 0; 5/5 tests, 1 suite mock H0, no auth real. |
| `npm --prefix backend run contract:validate` | exit 0; OpenAPI 3.0.3 y 7 ejemplos externos. |
| `node --test scripts/h0-contract-validate.test.mjs` | exit 0; 11/11, sin fallos/skips/cancelados. |
| `git diff --check` | exit 0 tras edición documental; repetido sobre el handoff final. |
| `shasum -a 256 contracts/openapi.yaml` | exit 0; `94122791de8ce646bcbe342b6bc7d33833ce0b0e9e7121055f6601a22ba80a2f`, sin cambios de norma. |

Triangulación incluida en los 56 tests: pares y surrogates aislados, controles/noncharacters, NFC antes de bounds, case/whitespace privados, claves sin límites de credencial, lookup ausente/throw/getter/no booleano/Promise. No refactor conductual posterior a GREEN; full checks verifican el mismo código. Branch `feat/h1-auth-02-policy` y HEAD C01 preservados; solo cuatro paths autorizados cambiados. Aproximadamente 301 líneas authored (incluidos archivos nuevos y retiros documentales), bajo advisory 400. Commit, review nativa y Verify independiente del **nuevo candidato** pendientes del padre. Asset real, Argon/pool, servidor, PostgreSQL, bootstrap, navegador/full H1 LIVE y auditoría siguen pendientes. Sin nuevas descargas; ambos avisos MIT y probe Argon permanecen evidencia separada.

## Slice 03 — Generador/resource offline preparados; gates pendientes

C02 quedó cerrado en `744e05eab1814ddfd2250312fc4abf91e23ff593`: review `review-60d828965e5a2a1e`, cuatro lentes aprobados y acknowledgement consumido; Verify independiente 56 política/341 configuración/406 unit en5 suites/5 mock e2e/11 tests contractuales/7 ejemplos, tree estable `3bec3ce7d6f14db8cb40ea1a1fda214e4a5e1f69`. Supersede los estados pendientes históricos arriba, **no aprueba C03**.

C03 entrega scripts Node standalone, binario de full SHA256 ordenados/únicos, manifest canónico y ambos avisos MIT completos. Sin cuentas/passwords bootstrap, loader, Argon, runtime fetch, dependencias, package/build/module/HTTP/DB/frontend ni cambios contractuales. Corpus público raw solo en cache ignorado; nunca se versiona plaintext. [Reproducción, procedencia, framing y límites](../decisions/H1-auth.md#generador-offline-independiente-slice-03).

Fuente SHA256 `e9a88f67aafe65496682dc374559ee714e978bee50314767494c3e37a18c9fc8`, 8.755.171 bytes; UTF8 fatal, 1.000.000 LF/filas, cero CR, LF terminal y sin BOM inicial. Filtro key NFC→defaultlower mínimo15, sin límite superior ni NFC posterior. Unicode17 requerido, con fundamento independiente acotado, no afirmación universal. **5.406 elegibles / 5.329 únicos / 170.528 bytes**, medidos con filtro final; igualdad numérica con conteo histórico no lo convierte en autoridad. Resource SHA `7a85af89d0f800cc94cbe81ad5a11de7590da24a5ed33c6a5bc5e7f0abea1eb0`; manifest SHA `581027ae246da0bacf0d71a65a35edad5a20a71c5fcfe2d810513b128bfdb510`.

Avisos verificados completos antes de aceptar artifacts: Pwdb 1069 bytes/SHA `4088d581cba171b1aa6f880ad3fb5327e2d6de415621cf8b80685ac506c0cae1`; SecLists 1072 bytes/SHA `3dbdc93d5f8829de0941744841730a09c106d0732e5ae0e98ca1d77be7ded66c`. Manifest registra URL/commit/copyright/licencia MIT de ambos.

| Comando exacto | Evidencia observada del writer C03 |
|---|---|
| `node --test scripts/h1-password-blocklist.test.mjs` | RED exit1, 10failed/0passed sobre stub ejecutable (no import/runner fallido); GREEN exit0, 10/10. Triangulación UTF8/framing/BOM/CR/UTF16/NFC/lower/expansión/bounds/full digests/order/unique/canonical/Unicode. |
| `node scripts/h1-password-blocklist.mjs --source odd/probes/h1-blocklist/source.txt` | exit0 dos ejecuciones; hashes binario/manifest capturados en variables shell y comparados idénticos, sin archivos temporales. |
| `npm --prefix backend run build` | exit0; Prisma generate + tsc existente, **no copia resources**. |
| `npm --prefix backend run lint` | exit0. |
| `npm --prefix backend test -- --runInBand` | exit0, 406tests/5suites. |
| `npm --prefix backend run test:e2e -- --runInBand` | exit0, 5tests/1suite mock H0. |
| `npm --prefix backend run contract:validate` | exit0, 7 ejemplos externos. |
| `node --test scripts/h0-contract-validate.test.mjs` | exit0, 11/11. |
| `git diff --check` | exit0, repetido tras documentación final. |
| `shasum -a 256 contracts/openapi.yaml` | exit0, SHA contractual intacto `94122791de8ce646bcbe342b6bc7d33833ce0b0e9e7121055f6601a22ba80a2f`. |
| `shasum -a 256 backend/resources/auth/LICENSE.pwdb.txt backend/resources/auth/LICENSE.seclists.txt backend/resources/auth/password-blocklist.bin backend/resources/auth/password-blocklist.manifest.json` | exit0, los cuatro SHA coinciden con evidencia arriba. |

Conteo authored: 373 líneas agregadas/retiradas, incluidos notices completos; binario y manifest generado excluidos. Sin refactor conductual posterior a GREEN. Solo ocho paths fuente autorizados más cache ignorado; branch/HEAD base conservados, sin stage/commit/push. Una separación cohesiva ya aplicada: loader y trust anchor/distribución runtime quedan para otra unidad. Review nativa/Verify independiente/commit de este candidato siguen **pendientes del padre**. No cobertura exhaustiva, certificación NIST, aprobación H1 ni cierre de auditoría.

## Slice 04 — Loader standalone preparado; gates del padre pendientes

C03 histórico quedó cerrado en `2bcb43b94671ac4b4f63790586ae0df2bd789a75`, tree estable `5f217cd8836e7cd5cb4b3217e7d9d51f1bc8cc1d`. Review `review-a8d94eecea756ad2`: cuatro lentes aprobados/acuse consumido. Verify independiente: 10 generador/406 unit/5 mock e2e/11 contractuales/7 ejemplos y full checks; reproducción en memoria íntegra. Supersede estados pendientes históricos C03, **no aprueba C04**. Warning no bloqueante `R3-001` en tests del generador19–21 queda como seguimiento separado; sin corrección ni reapertura aquí.

C04 entrega [loader](../../backend/src/auth/password-blocklist.ts) y [80 tests](../../backend/src/auth/password-blocklist.spec.ts), más documentación en estos dos paths. [Anclas, errores, ruta explícita y distribución pendiente](../decisions/H1-auth.md#loader-offline-independiente-slice-04). Importar no lee assets; lookup no hace I/O. Fábrica pura copia buffers, autentica manifest raw antes de parsear, exige esquema exacto y hash/count/order/unique del recurso. Carga filesystem acotada exige notices íntegros y cierra descriptors incluso ante fallos. Sin env, constructor/bypass, pins configurables ni allow-all.

Evidencia nueva observada por este writer; comandos foreground timeout180 s:

| Comando exacto | Resultado observado C04 |
|---|---|
| `npm --prefix backend test -- --runInBand --runTestsByPath src/auth/password-blocklist.spec.ts` | RED exit1, 18 failed/62 passed, stub tipado ejecutable; GREEN exit0, 80/80. Un error TS inicial de overload del mock fue corregido antes del RED, no cuenta como RED conductual. |
| `npm --prefix backend run build` | exit0, Prisma generate + tsc; no copia resources. |
| `npm --prefix backend run lint` | exit0. |
| `npm --prefix backend test -- --runInBand` | exit0, 486/486 tests, 6/6 suites. |
| `npm --prefix backend run test:e2e -- --runInBand` | exit0, 5/5 mock H0, 1 suite; no auth real. |
| `node --test scripts/h1-password-blocklist.test.mjs` | exit0, 10/10. |
| `npm --prefix backend run contract:validate` | exit0, OAS3.0.3/7 ejemplos externos. |
| `node --test scripts/h0-contract-validate.test.mjs` | exit0, 11/11. |

Triangulación: first/middle/last, no-miembro público reconfirmado por scan; pertenencia del ejemplo público débil establecida antes de rechazo `blocked`, caso sintético no-miembro validado con receiver. Copias corruptas, tipos/longitudes, manifest alterado/self-consistent nuevo hash, digest inválido, inmutabilidad y no-mutación. Order/duplicate negativos cierran en hash guard: **no aíslan independientemente la rama de orden**. Mocks filesystem cubren cuatro archivos faltantes/oversized/nonfile/truncated/grown/changed/read-error, lecturas parciales y stat/close error; restauración automática, sin mutar artifacts ni crear temporales. No refactor conductual posterior a GREEN.

| Comprobación final exacta | Resultado observado C04 |
|---|---|
| `git diff --check` | exit0; repetido tras informe final. |
| `shasum -a 256 contracts/openapi.yaml` | exit0; `94122791de8ce646bcbe342b6bc7d33833ce0b0e9e7121055f6601a22ba80a2f`, intacto. |
| `shasum -a 256 backend/resources/auth/password-blocklist.bin backend/resources/auth/password-blocklist.manifest.json backend/resources/auth/LICENSE.pwdb.txt backend/resources/auth/LICENSE.seclists.txt` | exit0; los cuatro SHA completos coinciden con las anclas C03 arriba, sin cambios. |
| `node -e "const {loadPasswordBlocklist}=require('./backend/dist/auth/password-blocklist.js');const path=require('node:path');const lookup=loadPasswordBlocklist(path.resolve('backend/resources/auth'));console.log(JSON.stringify({compiledLoad:true,synchronous:typeof lookup.hasDigest('0'.repeat(64))==='boolean'}));"` | exit0; `{"compiledLoad":true,"synchronous":true}`; carga explícita real, no build-copy claim. |

Conteo final: 395 líneas authored (389 agregadas/6 retiradas), exactamente cuatro paths autorizados, staged vacío y branch/HEAD base conservados. Assets/contrato intactos; sin corpus, env, DB, red, scripts nuevos ni cambios de módulos/dependencias/build. Review nativa, Verify independiente y commit C04 siguen pendientes del padre; no distribución runtime, Argon/dependencia, PG propio, sesiones/bootstrap/admin, frontend/navegador ni full H1 LIVE acreditados.

## Slice 05 — Argon standalone acotado; cierre registrado

C04 histórico cerrado en `e65c4d620fd332ec8ffe0d470e7a723901edc5ba`, tree `b946b83a84fbef3534cba4517acac3b83c549cf9`, review `review-2898763254cded6d` cuatro lentes aprobados/acuse consumido. Verify independiente: 80 loader/486 unit/6 suites/15 comandos y probe compilado explícito. Supersede pendientes históricos C04, **no aprueba C05**. C03 `R3-001` sigue informacional separado, sin fix/reapertura.

C05 agrega dependencia exacta `argon2@0.45.1` y [helper](../../backend/src/auth/password-hasher.ts)/[86 tests](../../backend/src/auth/password-hasher.spec.ts), sin registro ni endpoints/DB/cuentas. [PHC fijo, NFC sensible a case, snapshot, FIFO y límites](../decisions/H1-auth.md#argon-acotado-independiente-slice-05). Historia retenida del writer original, no ejecución nueva ni replay TDD: instalación normal exit0, seis paquetes agregados/806 auditados/cero vulnerabilidades reportadas. El writer terminó con assistant-error sin handoff final; causa desconocida. Warning allow-scripts de seis paquetes no cubiertos: `@parcel/watcher`, `@prisma/engines`, `@scarf/scarf`, `prisma`, `unrs-resolver`, `argon2`; registrado sin aprobar, rebuild, ignore-scripts ni cambios globales.

| Comando exacto (foreground timeout180s) | Evidencia histórica retenida C05 |
|---|---|
| `npm --prefix backend install argon2@0.45.1 --save-exact` | exit0 normal; warning arriba. |
| `npm --prefix backend test -- --runInBand --runTestsByPath src/auth/password-hasher.spec.ts` | RED conductual exit1: 83 failed/1 passed; GREEN exit0:84/84, triangulación final86/86. Stub inicial con throw provocó rechazo no manejado del harness (exit1), corregido a stub tipado resolvente antes del RED; no se cuenta como RED. |
| `npm --prefix backend run build` | exit0, repetido tras ajuste lint; Prisma generate + tsc existente. Aviso de actualización Prisma, sin actualizar. |
| `npm --prefix backend run lint` | Inicial exit1: dos no-unexpected-multiline del spec y no-control-regex; ajustes locales de layout/guard ASCII, repetido exit0. Sin reparar configuración global ni bypass. |
| `npm --prefix backend test -- --runInBand` | exit0,572/572 tests,7 suites. |
| `npm --prefix backend run test:e2e -- --runInBand` | exit0,5/5 mock H0,1 suite; no auth real. |
| `node --test scripts/h1-password-blocklist.test.mjs` | exit0,10/10. |
| `npm --prefix backend run contract:validate` | exit0,OAS3.0.3/7 ejemplos. |
| `node --test scripts/h0-contract-validate.test.mjs` | exit0,11/11. |

Tres tests nativos reales (**cinco hashes exitosos: 2+1+2**) cubren salts distintos incluso entre instancias, match/mismatch, NFC equivalente/case/whitespace, uno y128 puntos de código astrales sin truncamiento, type/version/factores/salt16/hash32. Mocks de exports reales/deferred prueban límites1–4, capacidad0/16/64, FIFO compartida/no robo de slot, mutación del caller sin efecto, inputs/PHC antes de cola, throws/rechazos y outputs inválidos de ambos métodos. No fixtures privadas en snapshots/logs; asserts sobre booleanos/metrología/errores constantes. Ajuste lint no cambia contrato; focused86 volvió a GREEN antes de full checks.

El handoff histórico contó seis hashes combinados, pero sobrestimó el conteo focused nativo: son cinco; el probe compilado añade **un hash separado**, con `compiledHash:true`, `match:true`, `mismatch:false`. Verify independiente actual `musb0v7p-1n-cnwe` **GREEN**: 86 focused, 572 unit/7 suites, 5 mock e2e H0, 10 generador, 11 contractuales, 7 ejemplos, build/lint/diff y pins íntegros de contrato/resource/manifest/ambos notices. Todas las invocaciones terminaron sin error de comando reportado; **no se expusieron códigos numéricos de salida**, por lo que los exit0 históricos de la tabla no se atribuyen a esta verificación. Branch `feat/h1-auth-05-argon`, HEAD `e65c4d620fd332ec8ffe0d470e7a723901edc5ba`, cuatro modificaciones tracked y dos archivos hasher untracked, staged vacío y SHA256 de los seis archivos estables antes/después de Verify.

Normalización documental antes del freeze nativo; cambia los bytes de ambos documentos respecto de ese snapshot verificado, no los cuatro archivos funcionales protegidos. Edición pasiva sin RED conductual significativo: readback estructural y check focused de continuidad, no replay TDD. C05 cerrado: commit `497648503b8f357c7488dac4e10082dd70420f6b`, branch `feat/h1-auth-05-argon`; review `review-cbe322421715bff4`, cuatro lentes APPROVED y acuse exacto consumido. Verify independiente final y commit comparten tree `96087c61dad61f5d9c077c0cb0d957e44e281aa0`, postcommit limpio. Normalización documental conservó los cuatro SHA funcionales; bridge independiente confirmó continuidad focused86/diff/contrato/tree. Supersede pendientes pre-freeze, sin transferencia automática workspace→rango commiteado ni H1 completo. Helper no conectado al runtime; PostgreSQL propio, sesiones/bootstrap/admin, frontend/navegador/full H1 LIVE y auditoría externa pendientes. FIFO con mocks/deferred no acredita carga nativa productiva; sin prueba de carga/peak/RSS ni permiso de elevar capacidad nativa.

## Slice 06 — Empaquetado offline completo; cierre registrado

Unidad limitada a package/build, biblioteca copier, CLI explícito, tests y estos dos documentos (seis paths). [Rutas, autenticación y límites](../decisions/H1-auth.md#empaquetado-offline-completo-slice-06). Sin lockfile/dependencias, pins/source resources, DI, env, HTTP, Prisma/config ni frontend modificados. Prerrequisitos compilados C04/C05 ya disponibles antes del RED; no build preparatorio ni datos privados. Fixtures bajo prefijo temporal propio `abar-auth-packaging-`, limpiadas únicamente por sus tests.

Historia primera escritura: RED conductual exit1,13 failed/1 passed contra no-op → GREEN14/14 (exit numérico GREEN no expuesto). Error inicial de instrumentación import no cuenta como RED. La igualdad argv/path falló ante symlink macOS; el reemplazo por `import.meta.main` funcionó en24.18.1, pero introdujo dependencia de API disponible desde24.2, incompatible con política Node24.x sin patch floor. No ejecución real de24.0/24.1.

Verify previo independiente `musgneyk-1u-jjry`: todos los comandos exit0 explícitos,572 unit/7 suites,5 mock/1 suite,7 ejemplos, pins/probes y cinco SHA fuente completos estables. Su filtro omitió agregados de tres suites Node: no se atribuyen conteos14/10/11 al independiente. Evidencia previa no certifica candidato corregido.

Corrección: CLI separado llama biblioteca incondicionalmente, rechaza argumentos y redacta fallos; core no tiene branch CLI ni I/O al importar. Regresión sobre copia temporal elimina `import.meta.main` y verifica su ausencia antes de exigir los cuatro artefactos autenticados/byte-exactos. Simula ausencia de API en24.18.1, no certifica otras patches ni reduce soporte.

| Comando exacto (foreground, timeout180s) | Evidencia nueva del writer, candidato corregido C06 |
|---|---|
| `node --test backend/scripts/copy-auth-resources.test.mjs` | RED exit1:1 failed/14 passed; old-gated CLI exit0, pero falta artefacto. GREEN exit0:15/15, sin skips/cancelados; agregados Node retenidos. |
| `node --check backend/scripts/copy-auth-resources.mjs && node --check backend/scripts/copy-auth-resources-cli.mjs && node --check backend/scripts/copy-auth-resources.test.mjs` | exit0, tres parsers. |
| `npm --prefix backend run build` | exit0; Prisma generate + tsc + nuevo CLI explícito, destino autenticado. |
| `npm --prefix backend run lint` | exit0; alcance ESLint TS existente, no lint dedicado de mjs. |
| `npm --prefix backend test -- --runInBand` | exit0,572/572 unit,7 suites; no incremento TS. |
| `npm --prefix backend run test:e2e -- --runInBand` | exit0,5/5 mock H0,1 suite; no auth/PG real. |
| `node --test scripts/h1-password-blocklist.test.mjs` | exit0,10/10. |
| `npm --prefix backend run contract:validate` | exit0,7 ejemplos externos. |
| `node --test scripts/h0-contract-validate.test.mjs` | exit0,11/11. |

Triangulación en15, conservando los14 casos anteriores: cada binario/manifest/notice faltante o corrupto falla antes de copia; bytes completos de cuatro archivos, cwd ajeno/repetición/archivo ajeno preservado; corrupción de destino inducida en fixture cierra tras copia; import sin assets/loader no lee recursos, API/CLI redactadas y flags rechazados. Sin mutación de fuente real ni candidato generado. Prueba positiva usa loader real compilado, no pins sintéticos ni certificado exclusivamente mock.

SHA256 de contrato intacto `94122791de8ce646bcbe342b6bc7d33833ce0b0e9e7121055f6601a22ba80a2f`; `shasum -a 256` sobre contrato y cuatro fuentes/cuatro archivos empaquetados terminó exit0: los cuatro pares coinciden con SHA C03 completos arriba. Binario170528 bytes, manifest y ambos MIT1069/1072 bytes íntegros. Probe real `node -e` con C04 compilado y ruta fija `backend/dist/resources/auth`: exit0, solo `{"packagedLoad":true,"synchronous":true}`. Comparación adicional byte a byte confirma cuatro archivos idénticos y avisos completos (exit0). No hash de credencial ni lectura env. `git diff --check` pasó exit0; scope final seis paths: tres tracked modificados y tres scripts nuevos, staged vacío/HEAD base conservado. Conteo authored250 líneas (46 agregadas/8 retiradas tracked +196 nuevas), bajo advisory400.

C06 cerrado en `777dbfac9df307a635e3f91fc9edac9bdb19e09f`: review `review-60c6c78737ad0617`, cuatro lentes APPROVED/acuse exacto consumido. Verify fresco independiente `mushhol4-1w-wrrm`: todos los comandos exit0 explícitos; 15 packaging, 572 unit/7 suites, 5 mock H0, 10 generador, 11 contractuales, 7 ejemplos; tres node--check, build/lint/diff y pins. Cuatro pares fuente/empaquetado byte-idénticos, MIT completos1069/1072 y loader compilado GREEN. Tree verificado/commiteado `1a976b69e5d2f39fc6482b51d9daa8270557933d`, postcommit limpio. Supersede pendientes históricos pre-freeze, sin inventar stage del writer ni transferir aprobación workspace→rango commiteado/fullruntime. C05 permanece cerrado497/four ACK/Verify96087; su aprobación tampoco aprueba C07.

## Slice 07 — Composición DI preparada; gates del padre pendientes

Exactamente cinco paths: módulo runtime, spec, AppModule y estos dos documentos. [Diseño y prerrequisito build](../decisions/H1-auth.md#composición-runtime-nest-slice-07). Una fábrica singleton por contenedor toma snapshot raw env, valida C01, carga C04 desde destino empaquetado fijo y construye un único hasher C05/FIFO compartida. Wrapper/config/orígenes inmutables; hasher no congelado. Sin I/O de recursos ni construcción al importar; ConfigModule conserva ignoreEnvFile:true. No modificaciones de main, e2e, dependencias, recursos, contrato ni HTTP.

Evidencia nueva observada por writer C07, foreground timeout180s:

| Comando exacto | Resultado observado |
|---|---|
| `npm --prefix backend run build` | exit0 antes del RED (stub compilable + packager) y después de implementación; Prisma generate + tsc + packager C06. |
| `npm --prefix backend test -- --runInBand --runTestsByPath src/auth/auth-runtime.module.spec.ts` | RED conductual exit1:24 failed/2 passed,26 total; GREEN exit0:26/26; repetido después de ajuste de layout lint,26/26. Un error inicial TS del tipo de fixture env fue corregido antes del RED:0 tests, no evidencia conductual. |
| `node --test backend/scripts/copy-auth-resources.test.mjs` | exit0,15/15; sin skips/cancelados. |
| `node --check backend/scripts/copy-auth-resources.mjs && node --check backend/scripts/copy-auth-resources-cli.mjs && node --check backend/scripts/copy-auth-resources.test.mjs` | exit0. |
| `npm --prefix backend run lint` | Inicial exit1:dos no-unexpected-multiline en spec; ajuste solo layout, repetido exit0. |
| `npm --prefix backend test -- --runInBand` | exit0,598/598 tests,8 suites (572 previos +26 C07). |
| `npm --prefix backend run test:e2e -- --runInBand` | exit0,5/5 mock H0,1 suite. |
| `node --test scripts/h1-password-blocklist.test.mjs` | exit0,10/10. |
| `npm --prefix backend run contract:validate` | exit0,7 ejemplos. |
| `node --test scripts/h0-contract-validate.test.mjs` | exit0,11/11. |

Triangulación dentro de26: import sin efectos; raw AUTH knobs y snapshot defensivo; singleton/hasher compartido, contenedores distintos e inmutabilidad; rechazo de unknownAUTH/NODE_ENV/origen producción/capacidad inválida antes de devolver aplicación. Ocho negativos source de loader mock solo aíslan frontera privada. Once casos del mismo spec ejecutan Node con JS compilado real, módulo AuthRuntimeModule únicamente, cuatro assets públicos y dependencias normales en fixture temporal propio `abar-auth-runtime-`; cwd ajeno y ruta relativa al código, sin public path override ni PG. Positivo comprueba identidad/hasher/lookup booleano; dos config inválidas y falta/corrupción de cada archivo rechazan creación con mensajes seguros. No logs de env, hashes, instancias ni causas. Cleanup solo de fixture propio.

La creación real usa `NestFactory.create(...,{logger:false,abortOnError:false})`: negativos confirman `returned:false,listened:false,rejected:true,safe:true`; positivo `returned:true,listened:false,shared:true,lookupBoolean:true`. El listen no se invoca y los negativos no pueden alcanzarlo porque la creación rechaza. El flujo main existente queda intacto. Esto es prueba genuina del artefacto **AuthRuntimeModule standalone**, no del arranque completo AppModule/DB ni endpoints H1. Build previo obligatorio para test/start/start:dev; watch no empaqueta. Node24.x sin cambio;24.0/24.1 no ejecutados.

Checks finales del writer: `git diff --check` exit0; contrato SHA94122791…ba80a2f intacto, cuatro pins fuente/empaquetado coincidentes y bytes idénticos, MIT completos1069/1072 (asserts Node y shasum/cmp/wc, exit0). Branch/HEAD base777 estables, index vacío; tres tracked modificados y dos módulos/spec nuevos untracked, exactamente cinco paths. Conteo authored287 líneas agregadas/retiradas, sin minificación ni expansión de scope.

Review nativa C07, Verify independiente y commit **PENDING** del padre. PG propio, sesiones/bootstrap/admin, Angular/navegador, carga/RSS, full H1 LIVE y auditoría siguen pendientes.

## Slice 08 — Frontera Prisma CLI preparada; gates pendientes (historical snapshot)

C07 **CLOSED**: commit `71e6abf590721466a6ea8572a948a69174964437`, tree
`9af840430c1291a22fcef538eb929ddc2bf29f94`; review `review-10051ed7f7701d1d`, cuatro
lentes APPROVED y ACK exacto BURNED. Target consumido
`sha256:840ccab527cb3750a75b4f6787d691f26c0de09c6b54bb8dca0fbaa28c013a81`, revisión
`sha256:1f64263dcc1b58b8e5fa3e2d5814a032a428e7bded6368e257378ca8b9e5dd77`.
Verify independiente ALL exit0: 26 runtime, 598 unit/ocho suites, 15 packaging,
cinco mock e2e, 10 generador, 11 contractuales/siete ejemplos, build/lint/tres parses,
diff/pins/cinco SHA estables. Once fixtures compilados de AuthRuntimeModule no
certifican arranque productivo AppModule/DB ni full H1. Los snapshots anteriores
quedan históricos, sin replay de aprobación ni autoridad transferida a C08.

C08: branch `feat/h1-auth-08-cli-guard`, base `71e6abf590721466a6ea8572a948a69174964437`.
Siete paths fuente: default config, nuevo schema config, package, test CLI y tres
documentos. [Decisión y límites](../decisions/H1-auth.md#c07-cerrado-frontera-cli-c08-preparada).
Solo la selección explícita sin datasource permite generación/validación/build;
la selección por defecto falla con mensaje fijo. No cambia schema/output/deps.

RED observado con loader instalado, sin CLI: exit1, 0 passed/1 failed; el config
anterior cargaba cuando debía denegar. GREEN loader: exit0, 3/3, incluidas variantes
sin/con URL heredada sintética no secreta. Un assert inicial exigía ausencia de
propiedad; defineConfig normaliza datasource omitido a undefined: se corrigió el
assert, no el contrato ni el config. Después del GREEN, negativas CLI reales:
exit0, 6/6 totales, generate/validate/migrate status terminan exit1 con solo el error
fijo envuelto por Prisma y sin dispatch output. HOME/XDG/TMP/Jiti/commands.json
permanecen en fixtures propios ignorados; no config global ni bypass de checkpoint.
No certificación de sandbox/red: prueba acotada al orden del CLI instalado.

ASSESS/review nativa/Verify independiente/commit C08 **PENDING**. Provisión,
guard de propiedad, runner/config confiable de migraciones y certificación PostgreSQL
real C09+ **PENDING**, sin ejecutar la autorización futura de recurso nuevo/exclusivo
`postgres:17.11-bookworm`, sin Compose/H0/bases existentes ni borrado automático.

## Slice 08 closed; Slice 09 offline contract candidate

C08 **CLOSED**: commit `80e32a754512011a4c51a42198a55bb56d34a2c4`, tree
`46cce4da053ee60c902cf0d2ac0d7611c183204b`; seven paths, 238 additions/15 deletions.
Native `review-ce3c99e320c9a121`: four APPROVED lenses, exact ACK BURNED for target
`sha256:2359dc60432ca0e101a2eaf2417d2321809e54ddc96f4b18b1ff516c91b4b989`, consumed
revision `sha256:2a056a368ad2199e53073a9eea0c42a0c5b11cb9912072f3e9f175b77180e1af`.
Independent verification: 18 functional checks, all exit 0, and exact BASE71
eight-file generated-client SHA equality, final exit 0. Preserve the late worker
baseline ordering, failed baseline fixture attempts and public-demo-URL output
deviation; no actual environment files/private credentials were read. npm update
notices do not certify network silence. Advisory R3-001 at CLI test lines 98–124
remains separate, description unavailable; no invented correction or receipt replay.
Historical pending snapshots above remain unchanged evidence, not current gates.

C09 branch `feat/h1-auth-09-owned-contract`, base C08. Four reviewable paths:
[offline core](../../backend/scripts/h1-owned-postgres.mjs),
[Node tests](../../backend/scripts/h1-owned-postgres.test.mjs) and these two documents.
[Contract, persistent-recovery decision and official constraints](../decisions/H1-auth.md#c08-closed-c09-offline-ownership-contract).
No public command, Docker/PG adapter, datasource config, real-state access,
provisioning, child migration/application effects, package/dependency changes or
C01–C08 reruns. Tests exercise private filesystem fixtures and injected evidence,
not actual Docker ownership, database freshness or full-H1 behavior.

Observed test-first evidence: nonthrowing importable stub and valid fixture shapes
preceded RED exit 1 (2 behavioral failures, 0 passed, 51 deferred/skipped). First
full run: 52 passed/1 failed; child-execution coverage exposed a root-resolution
mistake that wrote generated fixture pairs one directory above the repository,
under `/Users/agustin/Repos/personal/odd/probes/h1-owned-postgres/fixtures/`.
The writer corrected both roots and added a pre-write repository-root assertion;
out-of-scope fixtures were not inspected or deleted and require parent handling.
This is a scope deviation, not a claimed clean fixture certificate. Corrected
GREEN: 53/53, exit 0. Expanded filesystem/invalid-input coverage: 59/59, exit 0;
an intervening trailing-slash root assertion failure was setup, not behavioral RED.
Accessor triangulation RED: 1 failed/61 passed, exit 1, before rejecting state
accessors without invoking them. Uncertain-write lock-retention regression RED:
1 failed/61 passed, exit 1, before retaining the lock as an ambiguity barrier and
denying release/read/retry after a failed pair write. Final verification is reported
in the writer handoff; no future result or parent approval is predicted here.

Offline checks cover strict schemas/binding/lifecycle, private bounded descriptor
reads, malformed/unknown/oversize/UTF-8/nonfile/mode/hardlink/symlink failures,
exclusive pair writes preserving uncertain originals, stale/replaced locks,
generated IDs and exact container/image/labels/storage/mount/loopback identity,
authenticated role/DB/table inventory, final reinspection/order, rejected env/effect
hooks, fixed sensitive plan/redacted errors, and silent import/direct execution
with fixture-local HOME/XDG/TMP and no ambient private env/Node options.
Owner-mismatch, hostile directory races, crash durability, real freshness/roles,
real image/port isolation and installed Prisma execution are not certified.

### C09 CLOSED; incident24 preserved

C09 closed at `4cd1b752db62604aabe441613ef44876985e2bee`, tree
`2a5b26343507c2d3797cea5caee0095c05aa4d98`. Independent verification: 62 passing
tests, two parser checks and diff check, all exit 0. Four native reviewers APPROVED;
exact ACK consumed/BURNED; post-commit Git clean. Historical pending snapshots
above are superseded, not replayed or amended in earlier commits. Incident24's
wrong-root writes, initial failures and preserved external entries remain historical
deviations/nonblocking follow-up. C10 does not access, inventory or clean that
external namespace; it neither erases the incident nor claims hostile-race safety.

### C10 offline v2 credential/projection evolution

[Current schema/API and recovery decision](../decisions/H1-auth.md#c10-separate-roles-and-raw-password-file-projection-offline-v2).
Separate internally generated bootstrap image-init superuser and migration role
have distinct credentials. Only the nonprivileged migration credential reaches
the dedicated URL. Private retained JSON is separate from code-owned plaintext
`bootstrap-password.txt`; actual bounded fixture bytes must equal the bootstrap
password alone. JSON serialization is rejected, never relabeled as valid mount
evidence. Exact v2 pair/resource/run/projection identities and mount/volume/port
shapes deny unsupported inputs. Legacy v1 files require separately authorized
manual recovery; no conversion, overwrite, adoption or lock reclaim.

Containment checks precede fixture writes: script-relative two-parent root equals
canonical cwd, actual ancestors are directories/non-symlinks, and only fresh unique
in-repository fixture descendants are used. No real state, environment files,
Docker/PG/network/Prisma CLI, service, generated assets or package changes.

Observed behavioral RED against the importable C09 API: 62 passed / 2 failed,
exit 1; failures were v2 generation and fail-closed v1 validation, not setup/import.
GREEN after implementation and triangulation: 108 passed / 0 failed, exit 0,
no cancelled/skipped/todo. Regressions retain C09 barriers with explicit v2 version,
role and mount expectations; new cases cover actual plaintext/private files,
JSON/equal-credential rejection, cross-version/run binding, unsupported shapes,
legacy bytes/lock preservation and bootstrap-role/final-projection denial. Final
foreground regression/parser/diff results and four-file stable SHA256 evidence
are returned in the writer handoff. No C01–C08 reruns or real-PG certificate.

C10 parent ASSESS, independent Verify, native review/ACK and local work-unit commit
remain **PENDING**. Writer performs no staging, commit or review lifecycle. Source
documents and normalized fake evidence do not certify real mounts/UID permissions,
authentication/grants, image/daemon behavior, ownership or freshness. Actual
volume-creation/freshness provenance, real adapters, installed Prisma behavior and
true-service checks remain future gates. No automatic cleanup or resource adoption.
H1 authentication, sessions/admin and browser gates remain open; consumed C09
(or earlier) authority cannot be reused.

## C10 closed; C11 offline Docker observations prepared

C10 closure supersedes historical pending notes above: commit
`779db7b062b536190f1518dd3fe7d68c6abbc94f`, tree
`cb6df8038042157d57042d78a56d9a9ca683aac9`; independent 108/108 tests,
both Node parser checks and diff check exit 0. Native four reviewers APPROVED,
exact acknowledgement BURNED, post-commit clean, no push. The initial count-capture
gap and separately authorized corrective TAP run remain historical evidence,
without amendments or authority transfer. Parent full textual mirror readback
completed; remote newline byte-fidelity was not claimed.

C11 adds only the pure [parser](../../backend/scripts/h1-owned-postgres-docker-observations.mjs)
and [in-memory tests](../../backend/scripts/h1-owned-postgres-docker-observations.test.mjs).
The [exact contract and local-policy distinctions](../decisions/H1-auth.md#c10-closure-and-c11-observation-only-contract)
pin Moby v28.0.0 / Engine API v1.48. Expected ten-field comparisons confer no
authority. Exact `{ container, volume }` output preserves observed labels, literal
mount sources, configured image reference versus observed image ID, and optional
timestamp (null when absent). It is detached/deeply frozen, not a current kernel
resource, URL, command, execution plan or owned/fresh/created/reused decision.
Unknown raw keys are ignored without evaluating accessors; selected own data fields
and complete string maps are checked. Faults expose only a fixed redacted Error.
Strict local warning/mount/loopback-port/volume policies are not universal wire
requirements or real-daemon compatibility certification; hostile proxies/runtime
remain outside the threat model. Same-name volumes still provide no allocation proof.

Observed RED: importable neutral stub, 7 tests / 1 pass / 6 behavioral failures,
0 suites/cancelled/skipped/todo, exit 1. GREEN and triangulation: 96 tests / 96 pass,
0 failures/suites/cancelled/skipped/todo, exit 0. Only synthetic trusted fixtures
are serialized in tests; raw runner output is captured in memory and suppressed.
Final foreground tests, two syntax checks, diff check and four stable SHA256 hashes
are reported in the writer handoff, not replaced with invented lint evidence.

No C01–C10 suites/reviews rerun, Docker/socket/network/service contact, environment
files, fixtures on disk, external incident access, dependencies or generated output.
No kernel integration or live PostgreSQL certificate. Provenance, image/platform,
mount permissions, authentication/grants, freshness and execution remain future gates.
Parent ASSESS, functional Verify, native consent/review and local commit are
**PENDING**; no writer staging/commit/tracker closure and no consumed authority replay.
A future guarded commit requires fresh human permission for identical accepted bytes.

## Aceptación parcial y siguiente gate (snapshot histórico C07)

| Criterios del prompt H1 | Estado |
|---|---|
| 1–9: login, persistencia, Argon, CSRF, autorización, must-change, users, última activa, revocación | PENDING implementación y pruebas. |
| 10: OpenAPI compatible con runtime H1 | Norma/static preparados; runtime H1 y LIVE completo PENDING. |
| 11–13: integración Angular/API, migraciones, build/lint/tests/smoke final | PENDING. |
| 14: Review + Verify del mismo candidato final | PENDING para H1 completo; la preparación contractual tiene review del snapshot y Verify del commit de tree idéntico. |
| 15: secretos/guardas | Sin nuevas credenciales en docs; guardas del candidato final PENDING. No se leen archivos de entorno ni se elude denegación H0. |
| 16: informe | Existe este informe **parcial**, no cierre H1. |
| 17: H2 no iniciado | Preservado; no alcance comercial nuevo. |

1. Freeze contractual completado y registrado; esta actualización del informe es documental y posterior al commit verificado, no otra certificación funcional. El tamaño >400 líneas es advisory de carga: mantener unidades siguientes coherentes/acotadas, no omitir/minificar salvaguardas.
2. Backend: configuración C01, política C02 y generador/resource C03 completados; C04 loader y C05 Argon cerrados; C06 empaquetado cerrado; C07 composición runtime del recurso/helper preparada requiere review/Verify/commit del padre. Continuar con protección del nonce, modelos/migraciones y bootstrap seguro. Runbook bootstrap pendiente; manual update del ejemplo de entorno solo si necesario, sin bypass.
3. Implementar y verificar H1, incluyendo pruebas reales PostgreSQL y navegador si disponible. Antes de handoff a auditoría, Review + Verify deben cubrir el **mismo candidato final**. El padre registra el resultado, sin inventar aprobación externa.

P01–P10 y horas siguen pendientes; rollout comercial cerrado. No se inicia H2 ni se modifica el informe histórico H0.

## C12.1 — Proyección offline de imagen Docker

Se añade [`parseDockerImageResponse`](../../backend/scripts/h1-owned-postgres-docker-image-observations.mjs)
y su prueba sintética en memoria. El DTO nuevo no consulta servicios ni realiza I/O:
conserva un identificador validado, el estado/conteo de tags, únicamente hashes de
RepoDigests, cadenas de plataforma y una categoría de `Config.User`. La salida se
separa de la entrada y queda profundamente congelada; los fallos usan un mensaje
fijo sin datos de entrada.

Los límites y validaciones son política local estricta, no garantías universales del
esquema de transporte Docker: SHA-256 lowercase exacto, máximo 4096 unidades UTF-16
por texto y 128 elementos por arreglo, registros plain/null-prototype y descriptores
propios de datos para campos seleccionados. Las pruebas cubren getters seleccionados
sin invocarlos, getters desconocidos ignorados, campos heredados/undefined, límites,
casos inválidos, redacción, inmutabilidad y congelación. Fixtures completamente
sintéticos; no se consultaron daemon, API, servicios, configuración, secretos ni bases.

Estos resultados no acreditan compatibilidad real de transporte/daemon, procedencia,
propiedad, frescura, localidad, plataforma en ejecución, UID/grants de PostgreSQL,
elegibilidad ni preparación completa H1. La corrida TAP enfocada observó 19 pruebas
aprobadas, cero fallidas/canceladas/omitidas/todo y cero suites; ambos chequeos de
sintaxis MJS y `git diff --check` pasaron. La observación operativa y el provisioning
real permanecen pendientes por separado; no se modifican el parser/kernel C11 ni sus
evidencias históricas.

## C13.1 — Transporte de observación de imagen por Unix HTTP

`backend/scripts/h1-owned-postgres-docker-transport.mjs` exporta únicamente
`observeDockerImage(input)`: un GET fijo al endpoint ImageInspect `v1.48` de
`postgres:17.11-bookworm` sobre un `socketPath` Unix absoluto explícito. La entrada
usa registros plain/null-prototype y descriptores propios de datos; accesores
seleccionados, `undefined` presente, límites enteros inválidos y otros errores se
redactan como la denegación congelada. Cada operación válida crea un Agent privado
nuevo, sin keep-alive, y envía `Host: localhost`, `Accept: application/json` y
`Connection: close`; no selecciona TCP/proxy, lee env/config, reintenta ni sigue
redirecciones.

La aceptación local requiere status 200, tipo JSON acotado, encoding ausente o
identity, y framing único por Content-Length exacto o chunked. Rechaza duplicados,
framing ambiguo, headers sobre el límite, trailers no vacíos, truncamiento,
UTF-8/JSON/BOM inválidos y exceso de bytes. Reserva un único buffer binario después
de validar headers, con límite configurable solo a la baja. El JSON pasa al proyector
C12 sin modificaciones; se devuelve solo su DTO congelado y separado, nunca el body
ni campos privados. Deadline monotónico cooperativo más timer; no puede interrumpir
CPU síncrona ni un event loop detenido y no limita todos los buffers/asignaciones de
Node. Se destruyen los recursos propios y se absorben errores tardíos hasta `close`,
sin afirmar cierre OS síncrono.

**TDD/evidencia del writer:** el stub async importable devolvía la denegación fija.
La primera corrida conductual de 9 tests observó 3 aprobados/6 fallidos, exit 1;
la ausencia de transporte no podía satisfacer la observación/redacción/request
esperados. Esa corrida también contenía una expectativa inválida que clasificaba un
campo desconocido ignorado como denegación; se corrigió y no se usa como prueba
individual de ese caso. Una corrida ampliada terminó exit 137 con una excepción de
fixture `ERR_HTTP_TRAILER_INVALID` al construir trailers incompatibles con
Content-Length; no fue RED de producción. Una corrida posterior de 13 tests produjo
12 aprobados/1 fallido por el mismo tipo de construcción inválida (`writeHead` con
Content-Length y Trailer). Se sustituyeron por framing/raw HTTP Unix controlados; no
se alteró producción para satisfacer fixtures defectuosos. **GREEN final:**
`node --test --test-reporter=tap backend/scripts/h1-owned-postgres-docker-transport.test.mjs`,
Node v24.18.1, exit 0, 13 tests aprobados, 0 fallidos/cancelados/omitidos/todo,
0 suites. Cubren entradas/accesores, request exacto y sin reintento/redirect, status,
headers/encoding/framing/trailers, Content-Length/chunked/multibyte/caps,
UTF-8/BOM/JSON/proyector, truncamiento/refusal, deadlines sin respuesta y trickle,
peer-close observado antes del teardown y llamadas/conexiones independientes.

En esa GREEN se registraron 32 directorios privados nuevos y 32 sockets Unix
autopropios (`/tmp/h1-c13-*`), cada uno con identidad `dev/ino`; los 32 recibos de
cleanup marcaron `removed`, incluidos los directorios con múltiples conexiones.
Las pruebas esperaron el evento de cierre de cada peer del servidor antes del
teardown; esa corrida no atribuía en todos los casos qué lado inició el cierre. El
hook final destruye solo recursos de fixture aún propios y usa límites finitos.
PID/PPID del runner: 22830/22829. Esta evidencia refiere solo a recursos de esta
corrida; los recursos históricos no registrados permanecen desconocidos y no fueron
inventariados, adoptados ni limpiados.

La documentación preserva los bytes anteriores mediante append-only. El alcance no
integra kernel/C12, provisioning, Docker/PG, H0, Compose, configuración ni recursos
persistentes. No certifica compatibilidad universal de daemon/Node, heap total,
preempción CPU, propiedad/frescura, PostgreSQL o H1 completo. Syntax-checks, diff
check, prefijos documentales y SHA de límites protegidos se reportan en el handoff
final del writer; Verify independiente y revisión nativa permanecen pendientes del
padre. No hubo stage, commit, push ni acción nativa.

### C13.1 — Correcciones de evidencia y ciclo de fixtures

Se mantuvo la implementación de transporte sin cambios. La expectativa de control
path que primero representaba backslash-plus-`0` como si fuera NUL falló como error
de la prueba, no de producción; se reemplazó por codepoints U+0000/U+0001/U+001F/
U+007F y una ruta hija sobrelímite. Una instrumentación inicial de peer-close también
falló porque Node marca `socket.writableEnded` al cerrar el socket destruido. Se
sustituyó por evidencia directa: los casos sin respuesta/trickle observan exactamente
una llamada a `ClientRequest.destroy()` del cliente y que el fixture no había emitido
`finish` antes del cierre del peer. Ambos casos pasan dentro del límite; el resto de
los casos solo exige peer close observado antes del teardown, sin atribuir iniciador.

El helper ahora registra el hook antes de crear recursos, rastrea y drena operaciones,
usa gates controlados para cancelación pre-creación, pre-listen y post-listen, aborta
un Unix listen en vuelo, y cerca continuaciones antes de lanzar acciones tardías.
El cleanup acotado verifica identidad/entradas, no invoca sus operaciones explícitas
`unlink`/`rmdir` ante metadatos inyectados distintos ni entradas imprevistas, y solo
demuestra la retirada después de restaurar la vista de sus recursos propios. Se ejercitaron errores controlados de
setup/handler y drenaje/close del servidor. El caso in-flight listen registró
`identity-unavailable`, close observado y eliminación del directorio vacío: no se
presenta como identidad de socket capturada.

**RED de corrección:** el assert transitorio de `writableEnded === false` falló en los
casos no-response/trickle (Node observó `true` al cerrar); no fue un fallo del
transporte. **GREEN final:** `node --test --test-reporter=tap
backend/scripts/h1-owned-postgres-docker-transport.test.mjs`, Node v24.18.1, PID/PPID
36784/36783, exit 0: 21 aprobadas, 0 fallidas/canceladas/omitidas/todo, 0 suites.
Se ejecutaron 43 directorios fixture nuevos; 40 identidades socket `dev/ino` fueron
capturadas, dos directorios fueron cancelados/fallaron antes de listen y un intento
de listen se abortó antes de capturar identidad. Los 43 directorios tuvieron retirada
confirmada; cada servidor iniciado cerró, y los cierres finales no dejaron peers u
operaciones pendientes. Recursos son solo los creados por ese PID/corrida; ningún
recurso histórico fue adoptado, enumerado ni limpiado. `node --check` para ambos
MJS y `git diff --check` se reportan tras esta actualización. La revisión
independiente y gates del padre continúan pendientes; sin commit ni acción nativa.

### C13.1 — Registro histórico: rerun del writer tras acotar fixtures

La corrida enfocada que entonces se calificó final posterior a los límites de
filesystem/cleanup se conserva como evidencia histórica: mismo comando TAP, exit 0,
13/13 aprobados, cero fallidos/cancelados/omitidos/todo, cero suites; PID/PPID
24462/24461. Sus 32 recibos de directorio/socket cerraron como `removed` tras observar
peers cerrados antes del teardown. `node --check` pasó en ambos archivos nuevos y
`git diff --check` terminó sin errores. Luego fue supersedida por 21/21 del writer
(PID 36784) y la verificación independiente recibida (PID 39085), ambas anteriores a
las correcciones adicionales documentadas debajo; ninguna inspeccionó recursos
históricos desconocidos ni cambió los gates de lifecycle, revisión o commit.

### C13.1 — Continuación: límites explícitos y fence post-chmod

Se añadió cobertura positiva explícita para `timeoutMs` 1/12000 y
`maxResponseBytes` 1/262144. Cada caso alcanzó exactamente una construcción de
`http.request` a través del observer de prueba y fue interceptado antes de red; la
denegación devuelta por el sentinel solo prueba aceptación de entrada y paso al
constructor, no éxito HTTP, deadline de 1 ms ni rendimiento. Las pruebas Unix
existentes siguen cubriendo la interacción real con el fixture propio.

La regresión controlada mantiene pendiente la finalización observada del `chmod`
real en el directorio propio hasta que la prueba cancela setup. **RED de fixture:**
sin el fence, la continuación antigua despachó exactamente un `private mode check`
`lstat` después de cancelar. El directorio propio se drenó y eliminó; no hubo listen,
peer ni operación pendiente. **GREEN:** `ensureSetupOpen(state)` ahora sigue al
`await` del `chmod` y precede al nuevo `lstat`; la misma prueba observó cero despachos
tardíos y cleanup `removed`, sin API ni seam de producción.

**Verificación final de este writer:**
`node --test --test-reporter=tap backend/scripts/h1-owned-postgres-docker-transport.test.mjs`,
Node v24.18.1, PID/PPID 41815/41814, exit 0: 23 aprobadas, cero
fallidas/canceladas/omitidas/todo, cero suites. Se crearon 45 directorios fixture
nuevos: 41 identidades Unix socket `dev/ino` capturadas; tres directorios no llegaron
a listen y un listen abortado cerró antes de capturar identidad. Los 45 directorios
propios se retiraron con identidad comprobada; todos los servidores iniciados
cerraron y las recepciones terminales observaron cero peers/operaciones pendientes.
Hubo además una cancelación pre-creación sin directorio. Estas cifras cubren solo
esta corrida, no recursos históricos o externos. Se preservan los límites conocidos:
el cap del buffer no es un límite de heap total y el deadline cooperativo no preempta
CPU síncrona/event-loop detenido. Los prefijos C12 y el checkpoint canónico permanecen
byte-idénticos. La corrida independiente PID 39085 precede estas correcciones; se
requiere una nueva verificación independiente. No se declara cierre nativo ni hubo
commit.

## C14.1 — Observador standalone de versión Docker

**Resultado del writer: implementación y auto-verificación acotada; revisión independiente, decisión native/RDD, cierre de tarea y commit siguen pendientes del padre/autorización separada.** Esta unidad no altera C13 ni convierte un reporte de versión en prueba de servicio real o readiness.

Se añadieron el módulo `backend/scripts/h1-owned-postgres-docker-daemon.mjs` y su prueba. El observador hace como máximo una petición Unix fija y devuelve solo el DTO congelado/redactado descrito en [la decisión C14.1](../decisions/H1-auth.md#c141--observaci%C3%B3n-aislada-de-versi%C3%B3n-docker-por-socket-unix). La política local de campos requeridos y formatos acotados es deliberadamente más estricta que la declaración OpenAPI upstream; versiones legacy, plataformas no conocidas y rangos API contradictorios se conservan como observaciones y no se interpretan como elegibilidad.

La prueba fixture crea únicamente directorios privados nuevos `/tmp/h1-c14-*` y servidores Unix propios. La corrección del manager drena operaciones y peers aceptados, y valida antes de cualquier `server.close()` que directorio y socket conservan sus identidades `dev:ino`, tipo y permisos esperados, y que el contenido del directorio coincide exactamente. Un mismatch preserva recursos y no despacha `close`, `unlink` ni `rmdir`; las faltas sintéticas llevan recibos `SYNTHETIC` separados y solo el controlador creador, con su diario exacto, realiza recuperación separada. La ausencia del pathname después del cierre solo se correlaciona con identidad prevalidada y ese `server.close()` controlado; por sí sola no prueba identidad de borrado ni elimina la limitación TOCTOU. Cancelaciones controladas durante la finalización de `mkdtemp` capturan la identidad de ese directorio ya creado antes de la siguiente cerca de setup; una operación pendiente de `chmod` se drena y su continuación no lanza el siguiente `lstat` ni listener al cerrar. No se contactaron Docker, PostgreSQL, servicios existentes, sockets externos ni TCP; no se inspeccionaron ni limpiaron recursos históricos.

**Cronología de evidencia (no retroactiva):** el primer writer muu8br8t-q-1kas observó su RED del stub y reportó self-check 12/12/11 directorios/10 sockets; esos datos quedan como auto-reporte histórico, no como aceptación independiente. El primer verificador muu90b11-r-vmp7 se asentó `BLOCKED` antes de `node --test`: runtime deliberadamente omitido, cero fixtures creados y TAP/exit/duración independientes no disponibles (no son ceros). Detectó el orden inseguro `server.close()` antes de identidad/contenido y recibos insuficientes de finalización tardía. El siguiente writer corrigió el manager; su corrida 19/19 es evidencia histórica de writer, no de aceptación independiente. El segundo verificador muueso3q-t-l2ij pasó la auditoría fuente y ejecutó la suite nueva una vez (Node v24.18.1, reporter default: 19/19, exit 0, 212.07 ms), pero devolvió `PARTIAL`: precisó gaps C (cap explícito de un byte sin prueba de `Buffer.alloc(1)`), E (el body UTF-8 servido no era el mismo que determinó cap/Content-Length) y H (las vistas sintéticas evaluaban guards adicionales posteriores, no el mismo predicado de comparación real). No encontró defecto productivo. Se conservan literalmente el RED inicial del stub, el skip seguro inicial y el error de sintaxis de test corregido antes de una suite posterior; ninguno se reetiqueta como RED de producción.

**Auto-verificación de esta corrección acotada:** Node v24.18.1. `node --test backend/scripts/h1-owned-postgres-docker-daemon.test.mjs`: 20 aprobados, 0 fallidos/cancelados/omitidos/todo, exit 0, 237.914958 ms. El body de un byte pasó framing HTTP real, asignó exactamente un `Buffer.alloc(1)` atribuido por stack al observer y luego recibió su denegación JSON fija; el cap explícito 262144 también observó su buffer propio. La prueba UTF-8 ahora sirve el mismo body multibyte cuyo `Buffer.byteLength` coincide tanto con Content-Length como con cap, y acepta DTO válido. Las vistas controladas recorren los mismos predicados privados usados primero sobre `lstat`/`readdir` reales: device, inode, type y permissions para directorio y socket, más contenido. Nueve recibos `SYNTHETIC` preservaron sin close/rmdir del manager y luego el controlador creador recuperó usando los IDs reales journaled; no son fallas físicas de inode/contenido. Se crearon y retiraron 30 directorios nuevos; 28 sockets capturaron `dev:ino` y cierre correlacionado tras prevalidación. Dos cancelaciones anteriores al listener crearon solo directorio; una cancelación post-listen capturó tarde el ID propio. En los recibos terminales: peers/operaciones pendientes 0, 28 close de listener, 30 rmdir y ningún uso de unlink. `node --version`, ambos `node --check` y `git diff --check` terminaron correctamente. El post-close `ENOENT` sigue correlacionado con identidad prevalidada y cierre controlado: no prueba por sí solo la identidad de inode borrado ni elimina TOCTOU. No se afirma fault físico, límite global de heap, preemption, daemon real o compatibilidad. Falta una tercera auditoría independiente fresca; no se declara aprobación native/RDD, cierre ni commit.

## C15.1 — Admisión pura de compatibilidad declarada

Se añadió `admitDockerObservations(input)` en `backend/scripts/h1-owned-postgres-docker-admission.mjs`, con pruebas deterministas únicamente sobre objetos sintéticos offline. La función acepta solo reportes declarados Linux cuya arquitectura coincida exactamente con la selección explícita de política y cuyo API fijo `1.48` esté dentro del mínimo presente y el máximo informado, ambos inclusivos. La comparación `major.minor` es numérica por componentes ASCII acotados, sin coerción a números de precisión limitada.

La ausencia del mínimo se deniega por **política local conservadora**, no porque se afirme como campo upstream obligatorio. Los resultados de éxito son DTOs nuevos, desacoplados y profundamente congelados; toda denegación es idéntica y redactada. Esto es una decisión local sobre declaraciones seleccionadas, no autoridad para crear recursos ni prueba de capacidad real, identidad, frescura, procedencia, aprovisionamiento o readiness. No se invocaron observadores HTTP ni servicios.

**Evidencia de esta unidad:** con Node v24.18.1, el RED inicial fue `node --test backend/scripts/h1-owned-postgres-docker-admission.test.mjs` (exit 1; 7 fallidas/1 aprobada; 33.802958 ms de test-runner), y el caso válido mostró una discrepancia de aserción entre el DTO esperado y la denegación del stub, no un error de import/setup/sintaxis. La corrida focal posterior a implementación pasó 8/8 pruebas (0 fallidas/canceladas/omitidas/todo; reporter default, no TAP literal; 32.403166 ms de test-runner). No se ejecutaron observadores HTTP ni fixtures/servicios. La verificación independiente, disposición native/RDD y entrega local permanecen pendientes del padre; no se declara cierre ni commit.

### C15.1 — Corrección probatoria acotada (solo pruebas)

Se amplió la prueba offline en `backend/scripts/h1-owned-postgres-docker-admission.test.mjs`; el módulo de admisión y esta decisión permanecen intactos. La matriz ahora tiene **16 grupos `node:test`**. En la corrida anotada abajo: longitudes numéricas 32/33 separadas para máximo y mínimo (4 decisiones); 7 rangos con componentes enormes/ceros iniciales aceptados y 3 rechazados; 16 cadenas numéricas malformadas; ocho contextos de registro × siete formas inválidas (56 denegaciones), ocho registros de prototipo nulo válidos, 17 slots seleccionados con getters observados cero veces, y getters desconocidos en ocho registros más seis campos conocidos pero fuera de alcance, también cero invocaciones. Se comprueban además arquitecturas coincidentes de longitud 64, arquitectura coincidente de longitud 65 denegada y cada uno de los tres slots de arquitectura con longitud 65 frente a otros dos de 64; entradas válidas, denegadas y con getter ignorado conservan descriptores/valores, y las salidas no comparten objetos con la entrada.

Los valores adyacentes `9007199254740992`/`9007199254740993` se prueban como componentes mayores y como menores enormes del mismo major, siempre como cadenas y dentro del límite total. La decisión pública fija `1.48`: por ello estos extremos prueban resultados end-to-end (máximos enormes admisibles y mínimos enormes no admisibles), **no** aíslan el ordenamiento privado de componentes ni una comparación min/max independiente. Similarmente, una arquitectura de 65 frente a tres tokens de 64 necesariamente difiere; las denegaciones cubren el límite compartido, pero no pretenden aislar cuál guard causó cada una. No se añadieron exports ni seams privados.

La herencia se prueba como custom-prototype no permitido y como falta de propiedad propia; no se afirma que un registro ordinario permitido pueda heredar campos seleccionados. Las pruebas de Proxy solo ejercitan fallos sintéticos de reflexión/revocación y no afirman aislamiento de Proxy. Las nuevas pruebas pueden comenzar GREEN contra el comportamiento correcto: no se fabricó un RED nuevo ni se reejecutó el stub histórico.

**Validación de la corrección:** Node v24.18.1; `node --test backend/scripts/h1-owned-postgres-docker-admission.test.mjs`, reporter default (no TAP literal), 16 grupos/16 aprobados, cero fallidos/cancelados/omitidos/todo, cero suites, exit 0, 41.32575 ms de duración reportada por el runner. Las limitaciones de cobertura privada/ordenamiento anteriores siguen explícitas; no se detectó defecto productivo. Revisión independiente funcional, disposición native y entrega local continúan pendientes, no son fallos de estas pruebas. No se contactaron Docker/PostgreSQL/servicios ni se usaron fixtures de filesystem/red.

## C16.1 — Verificador offline del grafo de identidad OCI suministrado

**Alcance:** se añadieron `backend/scripts/h1-owned-postgres-oci-identity.mjs` y su prueba sintética en memoria. El verificador sincronizado enlaza bytes exactos de índice, manifiesto seleccionado y configuración por SHA-256/tamaño. No recupera bytes ni importa un pin documental; la política explícita del llamador es una premisa de confianza, no una firma ni autorización. Se añadieron únicamente esta sección propia a la decisión y al informe; el prefijo anterior de ambos documentos se conserva byte por byte.

**TDD observado:** primero se creó un export importable que deniega sin lanzar y se escribió una expectativa positiva de identidad válida. `node --test backend/scripts/h1-owned-postgres-oci-identity.test.mjs` observó RED de comportamiento: 16 pruebas, 4 aprobadas y 12 fallidas, cero canceladas/omitidas/todo/suites, exit 1 (reporter default, no TAP literal; 38.683458 ms). Las fallas incluyeron DTO válido esperado frente a denegación fija; no fue error de importación, sintaxis o setup. Luego se implementó el verificador. Durante triangulación, una nueva prueba de accessor mostró que los campos `os`/`architecture` de la política se leían mediante acceso ordinario: esa prueba falló y pasó tras usar descriptores propios. Esa corrección es evidencia de triangulación, no se sustituye ni exagera el RED inicial.

**Contrato cubierto:** éxito OCI y Docker schema 2 con tipos de manifiesto/configuración emparejados; selección única de plataforma contando duplicados antes de idoneidad; descriptores y vínculos de digest/tamaño; variante explícita y comparación opcional de ID solo contra configuración; etiquetas válidas/no válidas; capas permitidas, URLs y artefactos rechazados. Las pruebas sintéticas incluyen límites de bytes, arrays, descriptores, capas, profundidad, strings UTF-8, claves y tokens; claves duplicadas escapadas en subárboles ignorados; UTF-8/BOM/JSON/sustitutos inválidos; getters seleccionados no invocados, getters desconocidos ignorados, errores de reflexión, brand/prototipos/tipos de backing, no mutación y salida congelada/desacoplada. La unicidad se prueba solo sobre descriptores estructuralmente admitidos con plataforma explícita. No se afirma prueba aislada del cap total redundante ni autenticidad/sandbox de Proxy.

**Auto-verificación inicial del writer (histórica, no aceptación independiente):** Node v24.18.1. La suite focal corrió 21/21, exit 0, reporter default y 47.645167 ms antes de que el verificador independiente comunicara tres defectos reales; no sustituye la evidencia posterior ni demuestra aceptación actual. No se ejecutaron suites amplias, builds, Docker, PostgreSQL, red, servicios, fixtures físicos ni inspección de configuración privada.

**Límites:** los blobs de capa no se suministran ni se comprueban, y no se demuestra sistema de archivos, rootfs, ejecución, uso real de Docker, firma del publicador, procedencia, frescura, propiedad ni elegibilidad de un recurso. La etiqueta de repositorio no se liga criptográficamente a los bytes. La salida solo describe una cadena de identidad sintácticamente enlazada entre datos suministrados; no certifica H1 ni permiso para descargar/provisionar.

### C16.1 — Corrección secuencial tras auditoría independiente bloqueada

El verificador independiente `muulenoz-17-o3re` quedó `BLOCKED`; por tanto su corrida previa 21/21 no es aceptación de este candidato corregido. Se añadieron tres regresiones públicas separadas, cada una con control positivo y cadena OCI completamente enlazada. Contra la implementación previa, `node --test backend/scripts/h1-owned-postgres-oci-identity.test.mjs` observó **24 pruebas, 21 aprobadas y 3 fallidas, exit 1**, reporter default (no TAP literal), 47.687 ms. Las tres diferencias fueron: prototipo personalizado en plataforma del llamador aceptado; clave JSON con sustituto alto aislado aceptada; valor JSON con sustituto alto aislado aceptado. No fueron fallas de setup/importación.

La corrección mínima exige registro permitido en la función de plataforma y exige que el siguiente code unit de un sustituto alto sea realmente un sustituto bajo. La corrida focal posterior pasó **28/28**, cero fallidas/canceladas/omitidas/todo, cero suites, exit 0, reporter default, 60.078625 ms. En el mismo candidato se incorporaron pruebas de UTF-8 4096/4097 para claves y valores; fixtures válidos de 8191, 8192 y 8193 tokens; subárbol desconocido con duplicados escapados reconstruyendo todos los digests/padres; y errores de manifiesto/configuración con sus vínculos ascendentes renovados. El 8192 es alcanzable mediante un objeto desconocido vacío de dos signos: se prueba como aceptación inclusive, no se repite la afirmación errónea de que la paridad lo vuelve imposible. Los distintos tipos de backing usan bytes OCI válidos antes de probar la denegación; el `Uint8Array` ordinario con accessors sombra pasa sin ejecutar ninguno.

La prueba runner y syntax/diff finales del candidato corregido se registrarán tras ejecutarse; la aceptación independiente fresca, disposición native y entrega local siguen pendientes. No se declara task DONE ni se stagea/commitea/publica. Se mantienen los límites de las secciones anteriores: política externa suministrada no es pin aprobado, firma ni procedencia; capas solo tienen metadatos; no hay recursos/servicios reales ni afirmación de elegibilidad.

### C16.1 — Continuación secuencial de cobertura Unicode (solo test y este apéndice)

Se añadieron tres casos al final de `backend/scripts/h1-owned-postgres-oci-identity.test.mjs`: clave JSON con par escapado real (línea 498), valor JSON con par escapado real (línea 510) y límites UTF-8 escapados de clave/valor (línea 522). El texto crudo de los dos primeros contiene los escapes ASCII `\\uD83D\\uDE00`; `JSON.parse` confirma un par válido U+1F600 (dos unidades UTF-16, cuatro bytes UTF-8). El tercer caso usa `\\u00e9` repetido 2048 veces y mide las claves/valores ya decodificados: 4096 bytes se aceptan y 4097 (añadiendo una `a`) se deniegan. Cada caso reconstruye digest y tamaño de configuración, manifiesto y descriptor/pin de índice, de modo que las aserciones observan la regla objetivo con el grafo válido.

Auto-verificación del writer: Node v24.18.1; `node --test backend/scripts/h1-owned-postgres-oci-identity.test.mjs`, reporter default (no TAP literal), 31 aprobadas, 0 fallidas/canceladas/omitidas/todo, 0 suites, exit 0, 64.3585 ms. La aceptación independiente de estos bytes permanece pendiente; esta continuación no cambia producción, no añade un RED de producción y no habilita revisión/entrega. Los cuatro archivos siguen siendo el alcance global de C16.1, aunque esta continuación solo escribió el test y este apéndice.

### C17.1 — Adapter standalone de evidencia PostgreSQL (writer, no aceptación)

Se añadió `backend/scripts/h1-owned-postgres-pg-evidence.mjs` junto con pruebas memory-only. El adapter exige un par v2 provisionado y usa `validatePair` sin modificar; captura configuración de migración antes de la primera espera, limita conexión/consultas/cierre, inicia transacción read-only y consulta identidad, atributos de rol, base/grants, `public` y censos acotados de esquemas/tablas. La evidencia separa `pg-client` de `injected-client`, es allowlisted/congelada y no afirma propiedad, frescura, admission/readiness ni permiso de migración. Las consultas e inputs fallidos producen denegación genérica.

**TDD del writer:** el primer intento de runner falló en importación porque el módulo aún no existía y no cuenta como RED. Después de crear el test y export denial-stub, la corrida focal observó expectativa positiva de catálogo válida contra denegación fija: 10 pruebas, 1 aprobada y 9 fallidas, exit 1 (comportamiento RED). Tras implementación y triangulación, `node --test backend/scripts/h1-owned-postgres-pg-evidence.test.mjs` pasó 20/20, cero fallidas/canceladas/omitidas/todo, cero suites, exit 0, reporter default (no TAP literal), 3054.441333 ms, Node v24.18.1. Los escenarios ejercitan configuración explícita, lectura acotada, identidad y grants alternos, datos malformados, exceso/duplicación/límites, ausencia de base, rechazo del driver, timeout y cleanup, denegación previa a factory y ausencia de llamada de conexión real en los tests inyectados.

No se ejecutaron PG/Docker/servidores, conexiones/red/sockets, fixtures de recursos, provisioning, configuración privada ni migraciones. La disponibilidad de `pg` local y la compilación/importación no prueban una conexión real. Esta es evidencia del writer solamente; independencia de verificación y disposición native del current candidate quedan pendientes. Todo sigue UNCOMMITTED y sin staging por instrucción explícita.

### C17.1 — Corrección acotada de cuatro hallazgos independientes (writer)

El P02 anterior quedó BLOCKED por cuatro defectos: CONNECT atribuía el permiso al nombre de base como rol; pg podía usar `PGREPLICATION`/`PGSSLNEGOTIATION` y otros fallback paths públicos omitidos; errores emitidos por `end()` no afectaban el resultado; y `query` inválido impedía capturar/ejecutar un `end` callable. Se corrigieron solo esos comportamientos en el mismo adaptador y se añadieron regresiones a su suite.

**RED de corrección, contra la implementación previa:** `node --test backend/scripts/h1-owned-postgres-pg-evidence.test.mjs` reportó 22 pruebas, 19 aprobadas y 3 fallidas, exit 1, reporter default, 3060.4385 ms (Node v24.18.1). Los tres fallos focales identificaron SQL/parámetros CONNECT incorrectos, `error` emitido durante cierre aceptado y limpieza omitida con `query` no callable. Como el ambiente de runner podía hacer parecer configurados campos que faltaban, se endureció el test para comparar también las propias claves/configuración del client; la reproducción del defecto ambiental previa a corregir producción usó `node --test --test-name-pattern='observes bounded read-only catalog facts' backend/scripts/h1-owned-postgres-pg-evidence.test.mjs`: 1 prueba fallida, 0 aprobadas, exit 1, 52.575291 ms, por ausencia explícita de `binary`, `replication` y `sslnegotiation`. No se leyó ni modificó `process.env` ni se abrió conexión.

**GREEN:** la misma suite pasó 22/22, cero fallidas/canceladas/omitidas/todo, cero suites, exit 0, reporter default, 3061.945292 ms. Incluye los cuatro contratos: pares `[database, migrationRole]` y SQL parametrizado exacto; configuración truthy para replication/negociación SSL/PGBINARY sin ambient reads; denegación post-teardown si el cliente emite `error`; y llamada única de `end` capturado antes de rechazar `query` inválido. Todos los clientes son memory-only y `pg.Client.connect` permanece envenenado antes de cualquier socket.

La configuración de `binary` pasa `true` para evitar el fallback truthy de pg, pero el cliente default se fija a modo texto antes de conectar. Esta comprobación deriva de inspección del source público instalado `pg/lib/connection-parameters.js` y `pg/lib/client.js`; no es un sandbox de proceso ni prueba integración PostgreSQL. P02 debe repetirse independientemente; esta corrida del writer no es aceptación ni reabre native review. Se mantienen cuatro archivos, prefijos históricos intactos, UNCOMMITTED/UNSTAGED y sin ejecución real PG/Docker.


## GET /api/v1/auth/csrf — source implementation and local evidence

This unit adds the CSRF controller/service, AES-256-GCM nonce cipher, DI registration, Prisma session/pre-auth models and a separate SQL migration. Identifiers are stored as SHA-256 hex digests; nonce bytes are stored only as ciphertext with IV/tag and row version. Session GET returns the existing nonce and updates activity without changing its bound nonce version. Unknown/expired/revoked/inactive session context fails closed (not an anonymous fallback); restricted accounts return the contracted 403. Missing or unusable `AUTH_CSRF_ENCRYPTION_KEY`, cryptographic corruption and persistence failures use safe 503 mapping. The config/runtime DTOs never contain the key. The rate limiter is per process, windowed and bounded; IP uses the direct socket address. Anonymous success alone emits/reuses the pre-auth cookie.

**Observed local checks:** `npm --offline --prefix backend test -- --runInBand src/auth/csrf.service.spec.ts src/auth/csrf-nonce.cipher.spec.ts src/common/api-exception.filter.spec.ts src/auth/auth-runtime.module.spec.ts` passed 47/47 tests in four suites; `npm --offline --prefix backend run prisma:validate` passed; `npm --offline --prefix backend run build` passed. The initial focused run was not a valid behavior-level RED: two suites failed TypeScript compilation (service test response narrowing and Prisma byte-array typing), one cipher-suite assertion was incorrect for an empty-string case, and the runtime suite passed. Those issues were corrected before the passing run. No pre-implementation RED was captured. No HTTP server/e2e, PostgreSQL connection, migration execution, deployment key setup, or browser test was performed. The existing initial AdminUser SQL and deferred auth-persistence test remain outside this unit. This evidence does not declare H1 ready; parent review, PostgreSQL-backed validation and all later auth operations remain pending.


## 17.5e — CSRF correction GREEN (writer evidence; parent recheck pending)

The correction supersedes the earlier statement that unknown/revoked/expired/inactive session cookies must return 503: after a successful lookup, those legitimate non-authenticated states now use/create anonymous pre-auth state. Storage/key/decrypt failures stay safe 503 without fallback; restricted live sessions remain 403. Activity writes are conditional on session ID, revocation/liveness, nonce version and current active/non-restricted account state. One fresh read after a lost guard reclassifies absent/revoked/ineligible to anonymous pre-auth, restricted to 403, and still-live unresolved state to 503. Ordinary activity does not rotate the nonce version.

The bounded 10,000-key per-process limiter no longer evicts live counters: elapsed entries are purged, new IPs are denied with bounded positive integer Retry-After at capacity, and clock rollback cannot reset the window. The exception filter reads CSRF error details from non-enumerable WeakMap ownership, validates Retry-After before emission, and classifies via matched route metadata/owned error rather than raw URL case/slash. Controller Swagger includes 200 cache/cookie response headers and 403/429/503 error schemas and headers. The lost-guard test expectation was deliberately clarified: fresh revoked is anonymous with a pre-auth cookie and never the stale session nonce; fresh restricted is the exact `PASSWORD_CHANGE_REQUIRED` 403 with no cookie.

Correction RED recorded before product fixes: the exact focused Jest command observed exit 1, 18 failed/50 passed/68 total, four suites, no compile/setup failures. This does not replace the missing historical original pre-implementation RED. Intermediate correction runs included one overescaped-regex TypeScript compile failure and a subsequent two-test assertion mismatch (private Retry-After access and capacity arithmetic); both were corrected without relaxing intended behavior. GREEN: the same focused command passed 68/68, four suites. `npm --offline --prefix backend run prisma:validate` and `npm --offline --prefix backend run build` passed. Full H1, live H0, PostgreSQL migration/persistence, deployment key setup, HTTP/browser behavior and independent parent recheck remain pending. No server, database, migration, Git, or native-review operation was run.

## 17.6 — Integrated `POST /api/v1/auth/login` (writer evidence; independent verification pending)

Implemented the auth controller POST route with explicit HTTP 200 and closed Swagger input/output schemas. DI provides a `LoginService` using the existing Prisma service, CSRF cipher, runtime config and shared password hasher. The controller forwards only the configured-origin candidate, CSRF header, cookies and direct socket IP; it ignores forwarded headers and Host. Success returns exactly the sanitized `AdminSessionView`, sets no-store, rotates the session cookie, clears the pre-auth cookie in a separate Set-Cookie field, and returns a fresh CSRF header. Login errors have operation-owned codes/messages, no-store, and bounded Retry-After; the filter still preserves GET CSRF behavior and generic H0 error mappings.

Login body validation accepts only own data properties `email` and `password`; email is trimmed/lowercased and password NFC-normalized without trimming/truncation at the 1–128 code-point login bounds. Origin is exact-match configured. CSRF must be a canonical 32-byte token bound to an unexpired pre-auth context or a live unrestricted ordinary session. Unknown and inactive accounts use a static code-owned PHC with canonical Argon2id v=19/m=19456/t=2/p=1 and 16/32-byte salt/hash shape; all generic credential cases perform one verifier call and remain 401 even if the dummy stub reports a match. Dependency, corrupted metadata, key and verifier failures fail closed as 503. Per-process IP and normalized-account windows are bounded; tests fill both 10,000-key maps and prove live counters remain effective.

Success performs the conditional account-version/password/active guard, pre-auth one-time deletion or old-session revocation, and new hashed session row creation in a serializable Prisma transaction. A fresh independent CSPRNG session token and CSRF nonce are created; session identifiers are SHA-256 stored and nonce is AES-GCM encrypted with session-kind/ID/version AAD. Mock transaction tests exercised staged consumption, injected session-create rollback, sequential and concurrent replay, live-state guards, and ordinary-session rotation. This fake proves only tested source branches, not PostgreSQL isolation, real DB concurrency, native Argon timing/resource equivalence, or deployment behavior.

**Observed GREEN checks:** `npm --offline --prefix backend test -- --runInBand src/auth/login.service.spec.ts src/common/api-exception.filter.spec.ts src/auth/csrf.service.spec.ts src/auth/csrf-nonce.cipher.spec.ts src/auth/auth-runtime.module.spec.ts` passed 127/127 tests in five suites, including the existing GET CSRF suites and controller/DI/Swagger behavior. `npm --offline --prefix backend run prisma:validate` reported the existing schema valid. `npm --offline --prefix backend run build` returned after Prisma Client generation with no reported TypeScript/copy diagnostics; the tool did not surface a numeric exit code. The allowed E2E Swagger path assertion was updated but E2E was not run. No socket/server, PostgreSQL, migration, native hash generation, deployment key or real credential was used. The historical 17.6a RED (38 failures/73 passes/111 total, exit 1) is retained as separate evidence; intermediate compile/test attempts were corrected, not represented as RED. Remaining H1 gates and independent verification are pending; this does not declare H1 ready.

**Intermediate implementation attempts (preserved):** the first integrated focused run had 5 failed/106 passed/111 total (exit 1), from test-fixture mismatches: an omitted Prisma `select` expectation, incomplete restricted-session row fields, a shared-reference version-race fake, a pre-auth cookie expiring at the 900-second account-rate boundary, and mock Uint8Array/Buffer conversion. These were fixed in the fixtures. The first Swagger reflection test attempt had TypeScript narrowing diagnostics (`operation`/request-body/response unions): one suite failed to compile, four suites passed, 83 tests passed, exit 1. The assertion was kept and the Swagger object was locally typed for inspection. The next run caught the DI test using wall-clock time against fixed 2026 fixtures: 1 failed/111 passed/112 total, exit 1; a scoped `Date.now` spy corrected it. A later attempt to spy on Node's non-configurable `crypto.randomBytes` failed before that test's assertions (`Cannot redefine property`): 1 failed/127 passed/128 total, exit 1. That unsupported test seam was removed while retaining the source-side 503 catch. A later session-owner row-lock test run also exposed a restricted-session fixture missing its model `updatedAt` field (1 failed/126 passed/127 total, exit 1); adding that actual Prisma model field restored the full GREEN. Final focused Jest remained 127/127. No test assertion was relaxed.


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

The admitted production-generated-document RED had five metadata failures: required `Origin`, required `X-CSRF-Token`, separate login cookie-security alternatives, and both cookie scheme definitions. Its document identity/response-contract assertion passed. Focused RED: 5 failed/1 passed/67 skipped, 1.404 s, exit 1. Exact five-suite RED: 5 failed/152 passed/157 total; one suite failed/four passed, 3.48 s, exit 1. The earlier matcher-only setup failure (three TS2532 and three TS2339 diagnostics, zero tests, 0.867 s, exit 1) was repaired only in the spec matcher; it is not behavioral RED.

The correction is documentation-only: required request headers with frozen descriptions/shapes; login security as two separate OR requirements; and production `DocumentBuilder` registration of the two frozen cookie apiKey schemes. The real `configureApplication` is invoked on an uninitialized mock-backed Nest app and its real `SwaggerModule.createDocument` output is asserted; only public `SwaggerModule.setup` is stubbed, and `api/docs` is checked. H0 title/description/version/OpenAPI version and existing login responses/body remain intact. No root or CSRF-operation global security was introduced. Authentication, validation, cookie/runtime handling, and route behavior are unchanged.

After strengthening assertions for exact header schema/descriptions and absence of global security, focused metadata tests passed 6/6 (67 skipped, 1.257 s, exit 0). The exact five-suite run passed 157/157 in five suites, 3.499 s, exit 0, including all 151 existing tests. Prisma validation passed, exit 0 (duration unavailable); build passed, exit 0 (duration unavailable), generated Prisma Client in 19 ms, with no TypeScript/copy diagnostics. These are local self-checks, not independent acceptance, HTTP behavior, PostgreSQL isolation, or native Argon verification.

Preserve the earlier timing claims as unreconciled: docs report 151/151 at 3.401 s and focused 16/16 at 0.704 s; the writer handoff reports 3.107 s and 0.843 s (focused numeric exit unavailable). Historical run identity/cause is unknown. A separately recorded independent 151/151 run (Jest 3.282 s, wall 3.567 s, Prisma 0.468 s, build 0.871 s, RAM probe 0.257 s; all exit 0) remains its own evidence, not a reconstructed receipt or attribution to this task.

The six earlier prefixes remain unchanged: decision 74,027 bytes `cbd448c17cf2f8b41ebc07068171d68f5949bf1cc0521efb088ce8dccfd6be51`, 69,892 bytes `e6a815566a8ac455e98b1e75df8fc6b341ffd6a04ea426525d70c1b0e85f8fe3`, 66,987 bytes `570b6b95032a51982bdb009d9a2af65574e8a8c7ab700161bad5a7117fcc25fc`; report 94,890 bytes `686b90b966348f71915c4db2991e1c821eacc90f460dde601b765fb38ddfebe5`, 90,755 bytes `ea686383760445a3ad17c7a8bc53fc3abad2de41362536871e5601501a670f55`, 85,921 bytes `ac362f248b35dcd592d45c2f1510813f187d07a5c4d702f4a5692f1766e2fd9d`. Direct CSPRNG-failure test coverage remains a separate gap. Stop here for the parent’s independent current contract and functional recheck; no Git/delivery, live H0/H1, HTTP, PostgreSQL, or native Argon acceptance is claimed.

**Current-phase chronology:** the initial focused GREEN passed 6/6 (67 skipped, 1.251 s; exit not surfaced); the initial exact five-suite run passed 157/157 (3.585 s; exit not surfaced). Initial schema validation output was successful without a surfaced numeric exit. Initial build generated Prisma Client in 20 ms without a surfaced numeric exit. After strengthening header-shape/description and root-security assertions, the final focused run passed 6/6 (67 skipped, 1.257 s, exit 0) and exact five-suite run passed 157/157 (3.499 s, exit 0); validation and build reruns each exited 0, with Client generation in 19 ms. The initial TS setup failure and admitted RED remain reported above.

## 17.me — GET /api/v1/auth/me writer GREEN receipt (independent verification pending)

Implemented the bounded read-only current-session restoration unit: sanitized ordinary/restricted session DTO, existing bound CSRF nonce header, no-store 200, strict cookie handling, safe 401/503 mapping, no storage writes or idle renewal, and fail-closed current-state/clock checks. Controller, AuthModule and exception-filter integration are covered by actual generated Swagger, controller-response, module-context and filter tests. No adjacent auth endpoint was changed.

Current GREEN commands: focused session/filter Jest 59/59 (two suites, exit 0, 1.287 s); exact approved six-suite Jest 189/189 (six suites, exit 0, 3.616 s); schema-only Prisma validation exit 0 (0.484 s); offline build exit 0 (0.948 s, generated Prisma Client in 20 ms). Earlier route and behavioral RED receipts and setup/guard errors are preserved in the appended decision record; scaffold-only no-mutation passes are not treated as functional proof. Build/schema and in-memory mocks do not certify PostgreSQL, HTTP/browser, native Argon, live H0, deployment, or H1 readiness. Independent verification is pending; no Git or native review/commit action was performed.

**Final test rerun after fixture-log hardening:** focused session/filter Jest 59/59, exit 0 (1.392 s Jest; 1.731 s measured command); exact approved six-suite command 189/189, exit 0 (3.589 s Jest; 3.856 s measured command). The two test-only assertions now compare boolean state/cookie equality and do not render synthetic cookie or encrypted buffer values on failure. Production code was unchanged.

## 17.me.c — Corrective writer GREEN; independent verification pending

Fixed only the two admitted defects: reject C0 controls except HTAB and DEL before cookie parsing trims values; apply `no-store` to owned session errors even without matched-route metadata. Normal formatting, canonical tokens, ordinary/restricted restore, no-mutation behavior, H0 fallback, and login ownership are unchanged. Focused Jest passed 66/66 (two suites, exit 0; Jest 1.199 s, measured 1.471 s); the approved six-suite command passed 196/196 (exit 0; Jest 3.685 s, measured 3.961 s). Prisma validation passed (0.523 s) and build passed (0.988 s; Prisma Client generation 20 ms), both exit 0. All 31 manifest paths and 12 documentation-prefix guards passed. This remains writer self-verification, not independent acceptance or PostgreSQL/HTTP/native-Argon/H0/H1 certification. Prior corrective RED, the post-Jest timer failure, and one corrected pre-command digest-typo guard abort remain recorded in the appended decision receipt.


### Cookie-control wording clarification

The earlier phrase "C0 controls except HTAB and DEL" is ambiguous. The implementation rejects every C0 control except HTAB, and also rejects DEL, before cookie parsing can normalize the input. HTAB is the only exempted control; valid formatting remains supported. Independent verification observed 96 denied raw-input cases with zero storage reads/decrypt calls and three successful formatting controls. This is a wording clarification only, not a behavior change or a new test run.

## 17.me.d — Logout route wiring (writer verification)

The authenticated logout route now uses the real `LogoutService` provider and publishes optional-session security, no-store, conditional CSRF guidance, a matching cookie-clear header, and a bodyless 204 response.

Final offline checks: focused logout/filter tests 93/93; seven auth suites 254/254; Prisma schema validation and backend build passed. An initial Swagger metadata assertion and first full-suite manual-controller injection setup failed; both narrow source corrections were followed by passing runs.

Independent whole-change verification remains pending. These checks do not certify live PostgreSQL, HTTP/browser behavior, native Argon execution, deployment, or H1 readiness.
