# Historial del contrato candidato

## 0.9.0 — H6 local DEMO freeze (2026-10-22)

- Add closed settings/payment-method administration, paginated notification reads and versioned retry (202), and minimal public contact.
- Require H1 sessions for every admin read; Origin/CSRF and CAS for writes; no-store and safe errors throughout.
- Preserve all H1–H5 payloads; extend the static route allowlist and version checks without weakening historical validation.
- Public contact is a new endpoint: existing closed public settings DTO is unchanged. Only DEMO/example.test contact examples; no production SMTP.
- Contract only: H6 runtime, migration, real PostgreSQL/Mailpit proof, and independent review/verify remain pending.

[OpenAPI](openapi.yaml) es la única norma; las entradas documentan alcance, no aprobación externa ni disponibilidad productiva. No se asignan fechas o versiones históricas sin evidencia.

## 0.5.0 — H2 catálogo/stock: implementación local, auditoría externa pendiente

- Extensión aditiva de 21 operaciones: catálogo público, administración de categorías/productos/galería, ajustes y apertura manual de rollos, más lecturas de imagen con control de visibilidad y sesión.
- Presentaciones UNIT/METER/ROLL con saldos independientes, DTO público sin cantidades exactas, precios ARS en centavos como strings; edición de catálogo sin stock libre.
- Idempotencia de movimientos, versiones esperadas, errores, filtros sobre la misma presentación, paginación y PNG local (5 MiB, 4096 px por eje, ocho imágenes) definidos antes del paralelismo.
- Tres ejemplos ficticios nuevos, incluyendo apertura 3 ROLL/20 METER → 2 ROLL/120 METER. No se implementan H3–H5 ni se modifica el protocolo H1.
- [Decisiones y límites de verificación](../docs/decisions/H2-contract.md). El validador conserva el cierre H1 y solo permite el allowlist H2 con su marcador explícito; implementación y verificación local registradas en [informe H2](../docs/milestones/H2-informe.md), con omisiones explícitas. El marcador H2 es ahora implemented-audit-pending; rutas, esquemas, seguridad, ejemplos y versión del freeze no cambian.

## Regularización post-merge H1 — 2026-10-19 (sin cambio de versión)

- H1 integrado en main `18c39e9`: health y nueve operaciones auth/admin, con frontend administrativo y tres migraciones. La implementación no implica aprobación externa ni disponibilidad productiva.
- README y decisión distinguen runtime actual de snapshots históricos; procedimiento manual de primer administrador limitado a PostgreSQL local nuevo, sin credenciales versionadas.
- Solo metadatos descriptivos de OpenAPI: integración H1 explícita. Marcadores del freeze exigidos por el validador permanecen históricos; rutas, DTOs, headers, seguridad, errores y versión 0.4.0 no cambian.
- [Resultados post-merge y deuda pendiente](../docs/milestones/H1-postmerge-validation.md). No se trasladan PASS históricos al candidato final ni se implementa H2.

## 0.4.0 — H1 contract-freeze (snapshot histórico previo a implementación)

- Nueve operaciones auth/admin, además de health; DTOs saneados, headers, cookies, Origin/CSRF, errores, paginación y concurrencia explícitos. `x-abar-runtime-stage: h0`: solo health funciona actualmente.
- Sesión y nonce aleatorios independientes; cambio obligatorio limitado a me/change-password/logout; revocación, rotación y protección de última cuenta activa según [decisión H1](../docs/decisions/H1-auth.md).
- Cuatro ejemplos nuevos sin credenciales; siete JSON externos registrados en total. Validador static estricto; LIVE por defecto H1 exige todas las operaciones. `--stage=h0` es subset transicional health, no PASS H1.
- [Informe parcial y digest de norma](../docs/milestones/H1-informe.md). Blocklist offline requiere pin/licencia/digest antes de backend; runtime, LIVE H1 y revisión de unidad completa pendientes. Sin cambios comerciales ni resolución de P01–P10.

## H0 — Base contractual anterior

Según [H0-contract](../docs/decisions/H0-contract.md) y [H0-base](../docs/decisions/H0-base.md): OpenAPI 3.0.3, única operación `GET /health`, 200 tras SELECT 1 y 503 seguro; Swagger en `/api/docs`. Ejemplos health-ok, health-unavailable y money-ars; convenciones comerciales/áreas `/api/v1` proyectadas, no endpoints implementados. Dinero en minor units como string ARS, IDs opacos, errores uniformes y salvaguardas de inventario/pago candidatas. Rollout cerrado, reglas comerciales pendientes. No se inventa número de versión previo.

## 0.6.0 — H3 cart/quote freeze

Adds public demo settings, compatible payment-method discovery, and authoritative quote creation. Closed DTOs, exact ARS minor units, bounded quantities, snapshots/expiry and sanitized conflicts are frozen before parallel implementation. H1/H2 unchanged. No order/payment/reservation; external H3 audit pending.

## 0.7.0 — H4 orders/demo freeze

Add guest-order creation, possession-header view, minimal contact lookup, idempotent demo attempts, and a versioned provisional terms read. Optional admin-only unpaid demand is additive per presentation. P02/P03 are user-confirmed for the academic version only. No commercial PAID, reservation, deduction, manual confirmation, real gateway, or H5. [Decisions](../docs/decisions/H4-orders-payments.md) separate contract freeze from runtime evidence.

Runtime H4 local: implementación y pruebas propias registradas; Verify independiente, revisión nativa del runtime y auditoría externa se distinguen del ACK contractual. Los metadatos H4 no modifican DTOs congelados.

## 0.8.0 — H5 manual confirmation freeze (runtime pending)

Seven admin order operations with H1 session/Origin/CSRF, stable scoped replay, Order.version aggregate preconditions, exact full ARS amounts, closed DTOs, allowed actions, internal notes/history and unpaid-only cancellation (P01 academic). Public read states extend additively; private data remains admin-only. Stock movement reads add payment linkage and PAYMENT_CONFIRMATION; H2 adjustment/opening writes are unchanged. [Decision](../docs/decisions/H5-manual-confirmation.md). Contract freeze is not an implemented route, PostgreSQL proof, native approval or external audit.
