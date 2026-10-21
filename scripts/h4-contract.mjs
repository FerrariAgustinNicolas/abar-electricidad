export const H4_OPERATIONS = [
  ['/api/v1/public/checkout/terms', 'get', 'H4Terms'],
  ['/api/v1/public/orders', 'post', 'CreateOrderResponse'],
  ['/api/v1/public/orders/lookup', 'post', 'OrderLookupResponse'],
  ['/api/v1/public/orders/{id}', 'get', 'PublicOrderView'],
  ['/api/v1/public/orders/{id}/payment-attempts', 'post', 'AttemptResponse'],
];
export function validateH4Contract(document) {
  const errors = [];
  const check = (valid, message) => { if (!valid) errors.push(message); };
  check(document.info?.version === (document.info?.['x-abar-h5-freeze'] === 'manual-confirmation-v1' ? '0.8.0' : '0.7.0'), 'H4 version must be 0.7.0');
  for (const [route, method, output] of H4_OPERATIONS) {
    const op = document.paths?.[route]?.[method];
    const status = method === 'post' && !route.endsWith('/lookup') ? '201' : '200';
    check(op?.responses?.[status]?.content?.['application/json']?.schema?.$ref === `#/components/schemas/${output}`, `${route}: H4 response differs`);
    const protectedOrder = route.includes('{id}');
    check(JSON.stringify(op?.security) === JSON.stringify(protectedOrder ? [{OrderAccessToken:[]}] : []), `${route}: H4 security differs`);
    if (method === 'post' && !route.endsWith('/lookup')) check(op?.parameters?.some(p => p.name === 'Idempotency-Key' && p.in === 'header' && p.required), `${route}: required idempotency missing`);
    for (const code of ['429','503']) check(op?.responses?.[code], `${route}: missing ${code}`);
  }
  check(document.components?.securitySchemes?.OrderAccessToken?.in === 'header', 'Order token must use header');
  for (const name of ['CreateOrderRequest','PublicOrderView','CreateOrderResponse','OrderLookupRequest','OrderLookupResponse']) check(document.components?.schemas?.[name]?.additionalProperties === false, `${name}: closed schema required`);
  return errors;
}
