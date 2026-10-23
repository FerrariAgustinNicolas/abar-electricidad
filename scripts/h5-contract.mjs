// H5 is additive. The normative payload schemas live only in openapi.yaml.
export const H5_OPERATIONS = [
  ['/api/v1/admin/orders', 'get', 'AdminOrderList'],
  ['/api/v1/admin/orders/{id}', 'get', 'AdminOrderDetail'],
  ['/api/v1/admin/orders/{id}/payment-confirmation', 'post', 'PaymentConfirmationResponse', 'PaymentConfirmationRequest'],
  ['/api/v1/admin/orders/{id}/status', 'patch', 'OrderMutationResponse', 'OrderStatusRequest'],
  ['/api/v1/admin/orders/{id}/cancel', 'post', 'OrderMutationResponse', 'CancelOrderRequest'],
  ['/api/v1/admin/orders/{id}/notes', 'post', 'OrderNote', 'OrderNoteRequest'],
  ['/api/v1/admin/orders/{id}/history', 'get', 'OrderHistory'],
];
export function validateH5Contract(document) {
  const errors = [];
  const check = (valid, message) => { if (!valid) errors.push(message); };
  const schemas = document.components?.schemas ?? {};
  check(document.info?.version === (document.info?.['x-abar-h7-freeze'] === 'dashboard-reports-v1' ? '0.10.0' : document.info?.['x-abar-h6-freeze'] === 'notifications-settings-v1' ? '0.9.0' : '0.8.0'), 'H5 version must be 0.8.0');
  check(document.info?.['x-abar-h5-decisions']?.P01 === 'user-confirmed-academic-unpaid-only-cancellation', 'H5 requires explicit academic P01');
  for (const [route, method, output, input] of H5_OPERATIONS) {
    const operation = document.paths?.[route]?.[method];
    check(JSON.stringify(operation?.security) === '[{"AdminSessionCookie":[]}]', `${route}: H1 admin session required`);
    check(operation?.responses?.['200']?.content?.['application/json']?.schema?.$ref === `#/components/schemas/${output}`, `${route}: response differs`);
    for (const code of ['400', '401', '403', '404', '503', ...(input ? ['409'] : [])]) {
      check(operation?.responses?.[code]?.content?.['application/json']?.schema?.$ref === '#/components/schemas/ApiError', `${route}: safe ${code} required`);
      check(operation?.responses?.[code]?.headers?.['Cache-Control']?.['x-required'] === true, `${route}: no-store required`);
    }
    if (!input) continue;
    check(operation?.requestBody?.required === true && operation.requestBody.content?.['application/json']?.schema?.$ref === `#/components/schemas/${input}`, `${route}: closed request required`);
    for (const name of ['Origin', 'CsrfToken']) check(operation?.parameters?.some(p => p.$ref === `#/components/parameters/${name}`), `${route}: ${name} required`);
    check(operation?.parameters?.some(p => p.name === 'Idempotency-Key' && p.in === 'header' && p.required), `${route}: idempotency required`);
  }
  for (const name of ['AdminOrderList', 'AdminOrderDetail', 'OrderHistory', 'OrderNote', 'AllowedOrderActions', 'PaymentConfirmationRequest', 'PaymentConfirmationResponse', 'OrderStatusRequest', 'CancelOrderRequest', 'OrderNoteRequest']) check(schemas[name]?.additionalProperties === false, `${name}: closed schema required`);
  check(schemas.PaymentConfirmationRequest?.properties?.confirmedAmount?.$ref === '#/components/schemas/Money', 'Full ARS amount required');
  check(JSON.stringify(schemas.OrderStatusRequest?.properties?.status?.enum) === '["READY","DELIVERED"]', 'Generic status must not pay/cancel');
  for (const name of ['PublicOrderView', 'OrderLookupResponse']) {
    check(JSON.stringify(schemas[name]?.properties?.orderStatus?.enum) === '["RECEIVED","PREPARING","READY","DELIVERED","CANCELLED"]', `${name}: final states required`);
    check(JSON.stringify(schemas[name]?.properties?.paymentStatus?.enum) === '["PENDING","REJECTED","PAID"]', `${name}: commercial payment state required`);
    for (const key of ['customer', 'notes', 'history', 'stock', 'accessToken']) check(!schemas[name]?.properties?.[key], `${name}: private ${key} forbidden`);
  }
  return errors;
}
