# Manual del cliente — DEMO H8

Esta versión académica simula pagos: no cobra, no factura y no reserva stock. Usar únicamente datos ficticios `example.test`. [Resultados](milestones/H8-informe.md).

## Recorrido
1. Buscar en `/productos` y abrir el producto. Elegir presentación UNIT, METER o ROLL y cantidad entera; cada una tiene precio y saldo independiente. ROLL significa rollo cerrado, no metros fraccionados.
2. Agregar al `/carrito`. Solo IDs/cantidades se conservan localmente; no confiar en un precio almacenado por el navegador.
3. Solicitar presupuesto con retiro o entrega coordinada. El backend calcula precio y tarifa vigentes. Si cambian o vence el presupuesto, revisar y aceptar explícitamente uno nuevo.
4. Ir a `/checkout`, completar comprador/entrega ficticios y aceptar términos DEMO. Un doble envío no debe generar una nueva intención. No refrescar para crear otra compra cuando la respuesta sea incierta.
5. En `/pedido/:id/resultado`, observar el intento simulado PENDING/APPROVED/REJECTED; reintentar en el mismo pedido cuando esté permitido. APPROVED no confirma venta ni descuenta stock: la confirmación administrativa manual es independiente.
6. Conservar número y acceso temporal. `/consultar-pedido` devuelve estado mínimo por número/contacto coincidente, no restaura credencial ni datos privados.

## Límites y errores
No hay reserva ni vencimiento comercial automático del pedido. El vencimiento del presupuesto o credencial no cancela el pedido. No hay pagos reales, reembolsos automáticos ni cancelación de pagos confirmados.
Una recarga después de un resultado incierto conserva un marcador mínimo que bloquea otra intención silenciosa; no recupera necesariamente formulario/token. El acceso depende de memoria/sessionStorage y puede perderse entre sesiones/dispositivos. No copiar tokens a URLs, capturas o mensajes.
Sin stock, conflicto, simulación rechazada o acceso vencido: leer el mensaje y revisar estado; no manipular precios o crear claves para eludir protecciones. Contacto es DEMO; no se envía WhatsApp automático. La disponibilidad de correo local no equivale a una entrega externa.

Figura1: [pedido sintético](evidence/h8/buyer-order.jpg); Figura2: [reflow360px](evidence/h8/buyer-360.jpg), ambos del corte H7 previo al delta; ver límites y hashes del informe.

## Acceso y replay — precisión validada
En reintentos de pago se verifica primero la credencial vigente del mismo pedido. Con igual clave/cuerpo y acceso válido se devuelve la respuesta original; con acceso vencido/inválido/cruzado,403 ORDER_ACCESS_INVALID aun si existe historial; lectura de autorización no disponible,503 sin replay ni intento nuevo. Clave igual/cuerpo distinto con acceso válido,409 IDEMPOTENCY_CONFLICT. Esto no altera el replay de creación ni cancela el pedido por vencimiento técnico. Recorrido nuevo Node24 y límites: [cierre correctivo](milestones/H8-cierre-validacion.md).

Si un timeout es seguido por403/503 de autorización, eso NO prueba que el intento original haya fallado o no se haya confirmado. Conservar la intención y consultar el pedido por canales autorizados; no generar otra clave/pedido para inferir el resultado. La consulta mínima no recupera credenciales privadas. [Decisión R4](decisions/H8-replay-security.md).
