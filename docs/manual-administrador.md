# Manual de administrador — DEMO H8

Solo entorno académico propio, datos ficticios y sesión autorizada. [Instalación](manual-instalacion.md) · [Resultados y límites](milestones/H8-informe.md).

## Acceso y catálogo
1. Entrar por `/admin/login`; completar cambio obligatorio antes de operar. Cerrar sesión al terminar. El backend controla sesión, Origin y CSRF; el guard Angular no reemplaza autorización.
2. `/admin/usuarios`: gestionar usuarios con versión vigente; no desactivar el último administrador activo. Ante sesión expirada, volver a ingresar y revisar estado antes de reenviar.
3. `/admin/categorias` y `/admin/productos`: mantener visibilidad, descripción y presentaciones UNIT/METER/ROLL con precios independientes. Usar `/admin/productos/nuevo` o edición de producto.
4. Imágenes: PNG válido hasta5MiB,4096px por eje y ocho imágenes por producto. No usar nombres/rutas externas; el servidor valida. No ejecutar limpieza sobre archivos ajenos.
5. `/admin/stock`: ajustar con motivo y clave estable. Apertura manual convierte rollos completos en metros de manera transaccional/auditada; no abre automáticamente por demanda. No confundir demanda impaga con saldo neto ni mezclar unidades.

## Pedidos y confirmación
En `/admin/pedidos` filtrar y abrir detalle. Revisar comprador ficticio, snapshots, intento actual, importe y existencias. APPROVED del simulador NO significa PAID.
Confirmar el pago manual completo exige revisión explícita del importe, versión e intento. Esa única operación registra PAID, actor/fecha, ledger y job; descuenta una vez. Ante timeout reintentar solo la intención guardada con la misma clave/cuerpo. Si hubo conflicto o expiró sesión, consultar primero: no crear otra clave a ciegas.
Después de confirmar: PREPARING→READY→DELIVERED, sin otro descuento. Agregar notas privadas según corresponda. Cancelar solo RECEIVED impago, con motivo y auditoría; no cancelar pagados, devolver dinero o reponer stock automáticamente. No hay vencimiento comercial automático ni edición de renglones históricos.

## Configuración y notificaciones
`/admin/configuracion`: tarifa fija de entrega coordinada, modos y contacto DEMO; retiro sin cargo. `/admin/metodos-pago`: métodos ficticios, no activar una pasarela. Conflictos conservan el borrador y requieren recargar explícitamente. Los cambios afectan presupuestos futuros, no snapshots históricos.
`/admin/notificaciones`: filtros y reintento elegible del job existente. No revela destinatarios/payloads; el worker separado envía hacia Mailpit local. Reintentar no recrea pedido/pago ni modifica stock. Si se pierde ACK SMTP, puede duplicarse correo: no prometer exactamente una entrega.

## Dashboard y reportes
`/admin/dashboard` y `/admin/reportes`: seleccionar período local Buenos Aires, inicio incluido/fin exclusivo, hasta366días. Ventas desde PAID/confirmedAt; pedidos desde createdAt. CSV y API expresan ARS exactos en centavos como strings, separan tarifa y UNIT/METER/ROLL. No sumar subtotal y desgloses dos veces. El CSV neutraliza fórmulas; no es facturación ni contabilidad.

## Evidencia visual
Figura1: [cancelación impaga H8](evidence/h8/final-cancel.jpg), inspeccionada/sintética. Figura2: [reporte360px](evidence/h8/report-360.jpg), corte H7 exacto. No se incorporan capturas sin inspección/sanitización. Las capturas históricas no certifican este recorrido H8. Cobertura real de teclado, tamaños y zoom: ver informe; no se declara certificación WCAG.

## Recorrido correctivo comprobado
Node24 real: catálogo→carrito→checkout→intento APPROVED aún impago→confirmación manual→49UNIT desde50→READY→DELIVERED sin nuevo débito→reporte1pedido/15000centavos y CSV. Se recorrieron controles críticos con teclado y foco visible; no certificación integral ni zoom200%. Evidencia sintética nueva: [entrega](evidence/h8-corrective/delivered-node24.jpg), [reporte](evidence/h8-corrective/report-node24.jpg). [Cierre y límites](milestones/H8-cierre-validacion.md).

## Incertidumbre tras timeout
Un403/503 de autorización posterior a un timeout no demuestra rollback de la operación original. Reconciliar pedido, intento vigente y movimientos con acceso administrativo autorizado antes de reenviar; no crear una intención distinta a ciegas. La excepción técnica externa de R4 conserva access-first pero NO es ACK nativo. [Decisión](decisions/H8-replay-security.md).
