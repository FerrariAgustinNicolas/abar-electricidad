# H1 — Informe parcial de preparación del contrato

**CONTRACT UNIT PREPARED · IMPLEMENTATION NOT STARTED · EXTERNAL AUDIT PENDING.** La documentación está preparada; la unidad completa aún requiere LIVE transicional H0 y revisión nativa. Esto **no declara H1 CUMPLE**, aprobado, cerrado ni listo para auditoría final.

## Identidad y alcance

- Baseline H0 aprobado: `2428f2b918d97c5a48dabc438b0b3bf89030c7fb` (`h0-approved`).
- Rama local: `feat/h1-auth`; HEAD del prompt autorizado por el usuario: `1e9cd1e44b919738da8c9d1262b436b8a354af17`. No es commit candidato del freeze: los cambios actuales aún no tienen commit. `main` permanece sin cambios; no push, merge ni tag H1.
- Snapshot de bytes de `contracts/openapi.yaml`, SHA256: `94122791de8ce646bcbe342b6bc7d33833ce0b0e9e7121055f6601a22ba80a2f`. Es **digest contractual**, no hash de commit ni target de revisión nativa; recalcular si cambian los bytes.
- Norma OpenAPI 3.0.3, versión 0.4.0, milestone `H1-contract-freeze`, runtime-stage `h0`, status `candidate`. Nueve operaciones auth/admin más health; solo health corre hoy. [Decisión y fuentes](../decisions/H1-auth.md), [historial](../../contracts/CHANGELOG.md), [uso](../../README.md).

La unidad preservada contiene OpenAPI, validador/test y cuatro ejemplos nuevos saneados (`admin-session`, `admin-user`, `admin-users`, `auth-error`), además de esta documentación. No se cambian backend, Angular, Prisma, migraciones, dependencias ni configuración. El modelo, bootstrap, login y gestión administrativa son dirección pendiente, no runtime construido.

## Evidencia disponible y límites

El explorer `murf6fch-j-wlly` completó las siete fuentes; `murf70ic-k-6xzs` verificó OWASP/NIST y metadata de dependencias, con Docker/servicios healthy **en ese momento**, no disponibilidad continua. La revisión `review-adce1fdd7f44ebac` aprobada/ack consumido cubre solo el prompt; `review-e7eb83b58607d1b3`, aprobada/ack consumido, cubre solo el snapshot de test de 37 líneas con SHA256 `9b945c224e141130f6c24a6adc65d8289c5a1bfdc32e3439006cfb4575f91688`, no norma ni runtime.

El writer original `murfr4n6-m-3ge6` dejó RED (7 pass, 2 fail); la reanudación `murfzmbe-n-u8pe` y scout `murgeyx2-o-k97c` tuvieron timeout, sin causa demostrada. Los escritos posteriores se preservaron y el verificador independiente de solo lectura `murgmnca-p-abe0` confirmó el GREEN actual siguiente, sin cambios de archivos ni reparación de configuración.

| Comando / comprobación | Resultado y alcance |
|---|---|
| `node --test scripts/h0-contract-validate.test.mjs` | PASS reportado por verificador, exit 0, 11 pass, 0 fail/skipped/cancelled; validador, no auth runtime. |
| `npm --prefix backend run contract:validate` | PASS reportado por verificador, exit 0; OAS 3.0.3 y 7 JSON externos. |
| `git diff --check` | PASS del verificador antes de documentación; la comprobación documental se informa en el handoff. |
| `npm --prefix backend run contract:validate:live -- --stage=h0` | **PENDING**, subset transicional Swagger/health 200/503; no certifica H1. |
| `npm --prefix backend run contract:validate:live` | **PENDING / NOT APPLICABLE hasta implementación H1**: por defecto stage=h1 exige operaciones hoy ausentes; no se espera PASS del runtime H0. |
| Review nativa de unidad normalizada completa | **PENDING**, la registra el padre; reviews previas no la sustituyen. |
| Build/lint/unit/e2e H1, Prisma generate/validate y migración limpia | **PENDING / NOT APPLICABLE a esta edición documental**, ejecutar sobre implementación futura. |
| Argon carga/benchmark/concurrencia, bootstrap, login/sesión/CSRF/revocación/users con PostgreSQL real | **PENDING**, ninguna evidencia funcional H1. |
| Angular integrado, smoke H1 y navegador 360/768/1440, teclado/foco/zoom/contraste | **PENDING**, placeholders H0 no acreditan autenticación ni verificación visual. |

Edición documental sin RED conductual significativo. El RED/GREEN histórico del validador es evidencia aportada de snapshots previos/actuales, no pruebas nuevas ejecutadas por este writer ni verificación de código fuente H1.

## Aceptación parcial y siguiente gate

| Criterios del prompt H1 | Estado |
|---|---|
| 1–9: login, persistencia, Argon, CSRF, autorización, must-change, users, última activa, revocación | PENDING implementación y pruebas. |
| 10: OpenAPI compatible con runtime H1 | Norma/static preparados; runtime H1 y LIVE completo PENDING. |
| 11–13: integración Angular/API, migraciones, build/lint/tests/smoke final | PENDING. |
| 14: Review + Verify del mismo candidato final | PENDING; no candidato completo ni recibo de aprobación de unidad. |
| 15: secretos/guardas | Sin nuevas credenciales en docs; guardas del candidato final PENDING. No se leen archivos de entorno ni se elude denegación H0. |
| 16: informe | Existe este informe **parcial**, no cierre H1. |
| 17: H2 no iniciado | Preservado; no alcance comercial nuevo. |

1. Padre: completar LIVE explícito H0 y review de unidad completa; registrar resultados reales y solo después resolver freeze/candidato, sin anticipar hashes. El tamaño >400 líneas es advisory de carga: revisar slices coherentes acotadas, no omitir/minificar salvaguardas.
2. Backend: resolver pin/commit/licencia/digest de blocklist offline, bounds y variables validadas, protección del nonce, Argon/concurrencia, modelos/migraciones y bootstrap seguro. Runbook bootstrap pendiente; manual update del ejemplo de entorno solo si necesario, sin bypass.
3. Implementar y verificar H1, incluyendo pruebas reales PostgreSQL y navegador si disponible. Antes de handoff a auditoría, Review + Verify deben cubrir el **mismo candidato final**. El padre registra el resultado, sin inventar aprobación externa.

P01–P10 y horas siguen pendientes; rollout comercial cerrado. No se inicia H2 ni se modifica el informe histórico H0.
