// H6 is additive; payloads remain defined exclusively in the normative OpenAPI.
export const H6_OPERATIONS = [
  ['/api/v1/admin/settings', 'get', 'H6SettingsView'],
  ['/api/v1/admin/settings', 'patch', 'H6SettingsView', 'H6SettingsWrite'],
  ['/api/v1/admin/payment-methods/{code}', 'get', 'H6PaymentMethodView'],
  ['/api/v1/admin/payment-methods/{code}', 'patch', 'H6PaymentMethodView', 'H6PaymentMethodWrite'],
  ['/api/v1/admin/notifications', 'get', 'H6NotificationList'],
  ['/api/v1/admin/notifications/{id}/retry', 'post', 'H6NotificationView', 'H6NotificationRetry'],
  ['/api/v1/public/contact', 'get', 'H6PublicContact'],
];
export function validateH6Contract(document) {
  const errors = [];
  const check = (ok, message) => { if (!ok) errors.push(message); };
  check(document.info?.version === '0.9.0', 'H6 version must be 0.9.0');
  check(document.info?.['x-abar-h6-freeze'] === 'notifications-settings-v1', 'H6 freeze marker required');
  for (const [route, verb, output, input] of H6_OPERATIONS) {
    const op = document.paths?.[route]?.[verb];
    const admin = route.includes('/admin/');
    check(JSON.stringify(op?.security) === JSON.stringify(admin ? [{AdminSessionCookie:[]}] : []), `${route}: session security differs`);
    const status = verb === 'post' ? '202' : '200';
    check(op?.responses?.[status]?.content?.['application/json']?.schema?.$ref === `#/components/schemas/${output}`, `${route}: response differs`);
    for (const code of [status, '400', '503', ...(admin ? ['401', '403'] : []), ...(input ? ['409'] : [])]) {
      check(op?.responses?.[code]?.headers?.['Cache-Control']?.['x-required'] === true, `${route}: no-store ${code} required`);
      if (code !== status) check(op?.responses?.[code]?.content?.['application/json']?.schema?.$ref === '#/components/schemas/ApiError', `${route}: safe error required`);
    }
    if (input) {
      check(op?.requestBody?.required && op.requestBody.content?.['application/json']?.schema?.$ref === `#/components/schemas/${input}`, `${route}: request differs`);
      check(['Origin','CsrfToken'].every(name => op?.parameters?.some(p => p.$ref === `#/components/parameters/${name}`)), `${route}: Origin/CSRF required`);
    }
  }
  const schemas = document.components?.schemas ?? {};
  for (const name of ['H6Contact', 'H6PublicContact', 'H6SettingsView', 'H6SettingsWrite', 'H6PaymentMethodView', 'H6PaymentMethodWrite', 'H6NotificationView', 'H6NotificationList', 'H6NotificationRetry']) check(schemas[name]?.additionalProperties === false, `${name}: closed schema required`);
  for (const field of ['payload','leaseToken','leaseUntil','accessToken','customerAddress','notes']) check(!schemas.H6NotificationView?.properties?.[field], `H6 notification private field forbidden: ${field}`);
  check(schemas.H6SettingsWrite?.properties?.feeMinor?.type === 'string', 'H6 fee must be minor-unit string');
  check(schemas.H6NotificationRetry?.required?.join(',') === 'expectedVersion', 'H6 retry requires version');
  return errors;
}
