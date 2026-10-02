# ABAR Electricidad — Encargo al orquestador: H0

**Versión:** 1.0 · 2 de octubre de 2026.  
**Referencia:** `docs/plan.md`, plan integral ABAR v0.1.  
**Único hito autorizado:** H0 — Base contractual y técnica.  
**Salida:** `docs/milestones/H0-informe.md`.

## 1. Contexto y autorización

El usuario dio su conformidad para comenzar a partir del plan integral v0.1 de su Práctica Supervisada. Esta ejecución habilita SOLO H0. El plan conserva la etiqueta histórica «propuesta para revisión»: este encargo posterior permite comenzar H0, sin borrar el documento ni dar por resueltos los pendientes comerciales de la sección 17. Registrá el inicio y su alcance; no atribuyas nuevas aprobaciones al cliente, tutor o facultad.

Leé completo `docs/plan.md`, especialmente secciones 3, 4, 5, 7, 9, 12, 13/H0, 14, 17 y 18. Este prompt acota la ejecución, no reemplaza el plan. Conservá el orquestador, workers, reviewers y verify YA configurados. Elegí la cantidad de agentes según capacidades reales y dependencias. No reemplaces esa arquitectura ni inventes delegaciones inexistentes.

Fuentes originales y Figma: consultalos cuando estén disponibles. No afirmes haber inspeccionado fuentes que no abriste. El acceso a Figma desde otro entorno no garantiza acceso en esta sesión. Si falta acceso, avanzá con el inventario y tokens documentados en el plan, distinguiendo referencia previa de verificación visual nueva y registrando la limitación.

## 2. Objetivo y estado inicial

Dejar una base local reproducible, contrato transversal válido y mapa de UI/rutas para encargar H1 sin contradicciones. NO iniciar H1 automáticamente.

No se inspeccionó desde este chat el repositorio de implementación. Antes de escribir:

- Verificá carpeta, raíz efectiva de Git, rama, commit, cambios preparados/no preparados y archivos nuevos. No supongas repositorio vacío. Si pertenece a un repositorio padre ajeno, pedí confirmar el destino antes de crear un repositorio anidado.
- Inventariá aplicaciones, manifiestos, lockfiles, README, contratos, migraciones e instrucciones de agentes existentes. Preservá trabajo previo.
- Registrá versiones disponibles de Node.js, gestor de paquetes, Git, Docker/Compose, agente y Gentle-AI. Comprobá compatibilidad de Angular, NestJS, Prisma y PostgreSQL con documentación oficial de las versiones elegidas. No actualices versiones mayores por novedad ni reinstales herramientas globales.
- Si falta un servicio del host, instalación global o permiso, explicá la acción puntual. No evadas controles ni finjas una dependencia funcionando.
- Registrá horas consumidas solo con información aportada o evidencia. Si faltan, dejá pendiente; no inventes 200 horas restantes ni bloquees el arranque por eso.

Detenete ante destino ambiguo, conflicto real, acción destructiva o decisión global pendiente; no vuelvas a preguntar reglas ya confirmadas.

## 3. Alcance H0.1–H0.4

**H0.1 — Inventario y versiones:** estado inicial, versiones compatibles fijadas, lockfiles y estrategia simple de ramas. Un repositorio con frontend y backend; sin gestor de monorepo adicional.

**H0.2 — Entorno local:** inicializar o adaptar Angular y NestJS, configurar Prisma y servicios auxiliares. Ambas aplicaciones arrancan; PostgreSQL/Mailpit operan localmente. README reproducible.

**H0.3 — Contrato transversal:** documentar convenciones compartidas, decisiones, OpenAPI válido y ejemplos coherentes. Un responsable del contrato. El candidato se entrega a auditoría antes de H1; no implementar los 51 endpoints ni declarar cerradas reglas comerciales pendientes.

**H0.4 — Mapa de UI:** rutas, layouts, tokens, estados faltantes y criterios responsive. Referencia del plan: Home CORREGIDA. No rediseñar el sistema ni desarrollar pantallas comerciales completas.

## 4. Trabajo Frontend

Dentro de `frontend/`:

- Angular mínimo que compile/arranque, organizado por funcionalidades, core, shared/ui y layouts del plan.
- Routing base y esqueletos de layouts público, autenticación y administración. Sin login funcional, CRUD, catálogo, carrito o checkout. No crear operaciones administrativas desprotegidas ni bypass de autenticación.
- Tokens CSS/SCSS del plan/Figma; configuración sin secretos; HttpClient y proxy local, con comprobación mínima de comunicación real con la API. No añadir NgRx ni un framework visual propio.
- Lint y pruebas mínimas reales; al menos una comprobación de arranque/renderizado. No tests nominalmente verdes sin verificar comportamiento.

Completar `docs/figma-map.md`: nodos de la sección 5, pantallas/estados faltantes y criterios en 360, 768 y 1440 píxeles. Diferenciar evidencia directa, referencia del plan y propuesta de implementación.

## 5. Trabajo Backend y entorno

- NestJS mínimo, estructura modular, configuración validada y Prisma para PostgreSQL.
- Verificar conectividad REAL del backend a PostgreSQL. No adelantar el schema completo de H2 ni crear tablas/migraciones/seeds de relleno. Una migración mínima solo si H0 la necesita, con justificación y prueba.
- Endpoint operativo `GET /health` y documentación local `/api/docs` según el plan. Fijar su respuesta antes de consumirla desde Angular; no duplicar accidentalmente el prefijo ni exponer detalles sensibles.
- Base de validación y errores uniformes con requestId, sin trazas internas públicas.
- `compose.yaml` con PostgreSQL y Mailpit, versiones fijadas, puertos ligados a loopback y volúmenes preservados. No usar `latest` como garantía de reproducibilidad ni borrar volúmenes para arreglar errores.
- Ejemplos saneados de variables de entorno. No leer/imprimir secretos, incorporarlos al frontend, Git o informes ni evadir restricciones nativas sobre archivos sensibles.
- Verificar recepción de un email ficticio en Mailpit. Sin envío externo ni eventos/despachador comercial de H6.

La autenticación funcional corresponde a H1: H0 documenta el mecanismo de sesión y prepara la base, sin presentarlo como acceso seguro terminado.

## 6. Contrato

Mantener las convenciones de las secciones 7 y 9:

- API comercial `/api/v1`, áreas pública/auth/admin; endpoints operativos diferenciados.
- JSON en inglés, interfaz en español; IDs opacos; fechas RFC 3339 UTC.
- `Money { amountMinor: string, currency: 'ARS' }`; cantidades enteras; `UNIT`, `METER`, `ROLL`.
- Paginación desde 1, tamaño por defecto 20 y máximo 100, `items` y `pageInfo`; ordenamientos permitidos explícitos.
- Errores `code, message, fieldErrors?, requestId` con estados HTTP y ejemplos coherentes.
- Sesión administrativa revocable del servidor, cookie protegida y CSRF según plan; no sustituir por JWT/localStorage. Documentar excepción local HTTP.
- Estados de pedido/pago/intento y modalidad de entrega separados.
- `Idempotency-Key` en operaciones críticas y `expectedVersion` en ediciones; documentar semántica sin implementar todavía operaciones comerciales.

Formalizar `contracts/openapi.yaml`, ejemplos y decisiones. Verificar compatibilidad de OpenAPI 3.0.3 propuesto con herramientas elegidas; cualquier cambio relevante vuelve a revisión con motivo/impacto.

Validar documento y ejemplos. Diferenciar lo proyectado de lo implementado: comparar Swagger solo para las operaciones reales de H0. Mantener abiertos los contratos afectados por pendientes de la sección 17. Fijar contrato de `/health` antes de paralelizar su consumo.

## 7. Reglas a preservar, no implementar en H0

Compra invitada; autenticación administrativa funcional en H1 antes de funciones de gestión. Venta por unidad/metro/rollo con incrementos de 1; atributos descriptivos sin motor de variantes. Rollo vendido entero y cerrado; saldos separados y apertura manual explícita según plan. No reconstruir rollos con metros ni abrir automáticamente durante checkout.

Pedido impago NO reserva ni descuenta; mostrar demanda impaga por separado. SOLO confirmar MANUALMENTE el pago descuenta disponibilidad una vez, en una operación atómica. Crear pedido, devolver resultado simulado aprobado o entregar no descuenta. Simulación es parte de la entrega final, no cobro real ni integración productiva.

Stock propio del e-commerce incluido; sincronización con mostrador fuera de PS. Entrega coordinada con importe fijo configurable inicialmente cero y snapshot en pedido. Emails comprador/administrador verificados localmente; WhatsApp manual.

Preservar pendientes P01–P10 cuando no haya resolución. No atribuir reglas nuevas al negocio sobre cancelaciones pagadas, reintegros, expiración, datos obligatorios o entrega.

## 8. Ownership y dependencias

Frontend: `frontend/**` y documentación UI asignada. Backend: `backend/**`. Integración: `contracts/**`, archivos raíz, decisiones y coordinación de informes. Asigná superficies de edición concretas mediante el mecanismo real del orquestador; evitá dos escritores sobre el mismo archivo.

H0.1 precede a cambios estructurales. Después pueden avanzar en paralelo las bases Angular/NestJS y el mapa UI. El contrato debe estar fijado antes de integrar consumo de API. No crees múltiples contratos, enums o representaciones monetarias independientes.

## 9. Git y restricciones

Trabajar en rama de H0, por ejemplo `chore/h0-base`, revisando antes el estado. No cambiar la rama de otro worker. Worktrees separados si el entorno/repositorio lo permiten. Si aún no existe Git, comprobar el destino y ausencia de repositorio padre ajeno antes de inicializar localmente.

No hacer `reset --hard`, `clean -fd`, borrado de trabajo ajeno, reescritura de historial, force-push, eliminación de volúmenes o reseteo de bases. No hacer push, merge a main, tags ni publicación remota en este encargo. Los commits locales permitidos por el flujo solo incluirán cambios revisados de H0, nunca cambios ajenos.

No reemplazar AGENTS.md ni configuraciones existentes/globales de Pi, Gentle-AI u otros agentes. No instalar otro orquestador, cambiar modelos globales ni versionar sesiones, credenciales o configuración personal de herramientas.

No implementar H1–H8, pasarela real, WhatsApp automático, inventario de mostrador, cloud o despliegue. No adelantar modelos/funcionalidades para «aprovechar» la sesión. No suprimir tests ni debilitar aserciones para aparentar éxito.

Ante cambio relevante de arquitectura, seguridad, dominio o contrato, registrar motivo, alternativas e impacto y pausar el frente afectado. Podés continuar tareas independientes seguras. No introducir incompatibilidades silenciosas.

## 10. Criterios de aceptación

1. Inventario y versiones registrados, sin perder cambios previos.
2. Ambas aplicaciones compilan/arrancan con instrucciones reproducibles.
3. PostgreSQL y Mailpit disponibles localmente; conectividad real del backend; sin exposición de red por defecto.
4. `/health` y comunicación Frontend ↔ Backend verificadas según contrato.
5. OpenAPI transversal válido y ejemplos coherentes; sin afirmar endpoints comerciales implementados.
6. Mapa UI, Home, brechas y criterios responsive documentados; limitaciones de acceso visual identificadas.
7. Lint y pruebas mínimas reales ejecutadas en ambos frentes.
8. Configuración sin secretos en Git, navegador o evidencia.
9. Review y verify reales sobre el estado de código entregado.
10. Informe final guardado y ejecución detenida antes de H1.

No declarar H0 cerrado por cuenta propia. Indicar cumplimiento, parcialidad o bloqueo por criterio; la auditoría formal se hace en este chat.

## 11. Review

Revisar límites H0/H1, preservación del trabajo previo, versiones, reproducibilidad, ownership, secretos/puertos, contrato y ejemplos. Revisar que no aparezcan reservas implícitas ni confirmación automática de pago, ni preguntas pendientes convertidas en hechos.

Los esqueletos administrativos no deben exponer operaciones/datos sensibles. README y scripts deben coincidir con archivos reales. Las evidencias deben pertenecer al mismo estado entregado, no a otro commit anterior.

## 12. Verify

Registrar comandos exactos, resultado, código de salida y evidencia para:

- Instalación reproducible desde lockfiles; build, lint y tests frontend/backend.
- Validación Compose, servicios y bindings locales.
- Conectividad backend/Prisma/PostgreSQL y validación/generación Prisma aplicable a su versión.
- `/health`, documentación y comunicación local mediante proxy.
- OpenAPI y ejemplos.
- Renderizado del esqueleto en navegador y comprobaciones responsive disponibles. Si no hay herramienta, marcar «pendiente de verificación visual»; compilar no certifica la UI.
- Recepción de email ficticio en Mailpit, sin salida externa.
- Archivos modificados, ausencia de secretos e instrucciones del README.

Migraciones/seeds: ejecutar los que correspondan realmente a H0. Si todavía no se necesitan, registrar «NO APLICA EN H0» y motivo, no inventar ejecución. Usar PASS, FAIL, BLOCKED y NOT APPLICABLE para verificaciones. Un PASS de build no implica integración o UI verificada.

## 13. Informe final

Guardar `docs/milestones/H0-informe.md` y responder con resumen. Incluir:

- H0.1–H0.4: realizado/no realizado y evidencia.
- Estado inicial/final, rama, commit base y candidato si existe, cambios sin commit o posteriores. Sin candidato, identificar con precisión el estado verificado; no inventar hash.
- Agentes realmente utilizados, responsabilidades, resultados y capacidades no disponibles.
- Archivos relevantes y mapa del repositorio.
- Versiones, fuentes de compatibilidad, decisiones tomadas y propuestas pendientes.
- Contrato transversal, alcance implementado y cambios con impacto en ambos frentes.
- Tabla de comandos/verificaciones/evidencias, incluyendo fallos y bloqueos.
- Matriz de aceptación CUMPLE/PARCIAL/NO CUMPLE con justificación.
- Instrucciones para que el usuario ejecute/pruebe frontend, backend, PostgreSQL y Mailpit.
- Pendientes, deuda, riesgos y requisitos de H1, SIN ejecutarlo.

## 14. Regla de detención

Realizar las correcciones pertinentes dentro de H0 y volver a verificar lo afectado. Entregar informe y detenerse. No encadenar hitos. La autorización de H1 se emite únicamente después de la auditoría de H0 en este chat.
