# Historial del contrato candidato

[OpenAPI](openapi.yaml) es la única norma; las entradas documentan alcance, no aprobación externa ni disponibilidad productiva. No se asignan fechas o versiones históricas sin evidencia.

## 0.4.0 — H1 contract-freeze (candidato sin implementación)

- Nueve operaciones auth/admin, además de health; DTOs saneados, headers, cookies, Origin/CSRF, errores, paginación y concurrencia explícitos. `x-abar-runtime-stage: h0`: solo health funciona actualmente.
- Sesión y nonce aleatorios independientes; cambio obligatorio limitado a me/change-password/logout; revocación, rotación y protección de última cuenta activa según [decisión H1](../docs/decisions/H1-auth.md).
- Cuatro ejemplos nuevos sin credenciales; siete JSON externos registrados en total. Validador static estricto; LIVE por defecto H1 exige todas las operaciones. `--stage=h0` es subset transicional health, no PASS H1.
- [Informe parcial y digest de norma](../docs/milestones/H1-informe.md). Blocklist offline requiere pin/licencia/digest antes de backend; runtime, LIVE H1 y revisión de unidad completa pendientes. Sin cambios comerciales ni resolución de P01–P10.

## H0 — Base contractual anterior

Según [H0-contract](../docs/decisions/H0-contract.md) y [H0-base](../docs/decisions/H0-base.md): OpenAPI 3.0.3, única operación `GET /health`, 200 tras SELECT 1 y 503 seguro; Swagger en `/api/docs`. Ejemplos health-ok, health-unavailable y money-ars; convenciones comerciales/áreas `/api/v1` proyectadas, no endpoints implementados. Dinero en minor units como string ARS, IDs opacos, errores uniformes y salvaguardas de inventario/pago candidatas. Rollout cerrado, reglas comerciales pendientes. No se inventa número de versión previo.
