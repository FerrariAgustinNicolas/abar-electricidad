// H7 is additive. OpenAPI remains the only normative DTO source.
export const H7_OPERATIONS = [
  ['/api/v1/admin/dashboard', 'get'],
  ['/api/v1/admin/reports/sales', 'get'],
  ['/api/v1/admin/reports/sales/export', 'get'],
];
export function validateH7Contract(document) {
  const errors = [];
  const check = (ok, message) => { if (!ok) errors.push(message); };
  check(document.info?.version === '0.10.0' && document.info?.['x-abar-h7-freeze'] === 'dashboard-reports-v1', 'H7 freeze/version required');
  const schemas = document.components?.schemas ?? {};
  for (const [name,schema] of Object.entries(schemas)) if (name.startsWith('H7') && schema.type === 'object') check(schema.additionalProperties === false, name + ': closed DTO required');
  check(schemas.H7SalesTotals?.properties?.confirmedTotal?.$ref === '#/components/schemas/Money', 'H7 exact money required');
  for (const [route, method] of H7_OPERATIONS) {
    const op = document.paths?.[route]?.[method];
    check(JSON.stringify(op?.security) === JSON.stringify([{AdminSessionCookie:[]}]), route + ': H1 session required');
    check(op?.parameters?.map(p => p.name).join(',') === 'from,to,methodCode,orderStatus,paymentStatus', route + ': closed filters required');
    check(op?.parameters?.filter(p => p.required).map(p => p.name).join(',') === 'from,to', route + ': both date bounds required');
    check(Object.keys(op?.responses ?? {}).sort().join(',') === '200,400,401,403,503', route + ': exact responses required');
    for (const code of ['200','400','401','403','503']) {
      const cache = op?.responses?.[code]?.headers?.['Cache-Control'];
      check(cache?.['x-required'] === true && cache.schema?.type === 'string' && JSON.stringify(cache.schema.enum) === JSON.stringify(['no-store']), route + ': no-store required');
      if (code !== '200') check(op?.responses?.[code]?.content?.['application/json']?.schema?.$ref === '#/components/schemas/ApiError', route + ': safe error required');
    }
    if (route.endsWith('/export')) for (const [name, value] of Object.entries({
      'Content-Disposition': 'attachment; filename="abar-demo-sales.csv"',
      'X-Content-Type-Options': 'nosniff', 'Content-Type': 'text/csv; charset=utf-8',
    })) {
      const header = op?.responses?.['200']?.headers?.[name];
      check(header?.['x-required'] === true && header.schema?.type === 'string' && JSON.stringify(header.schema.enum) === JSON.stringify([value]), route + ': exact CSV header required: ' + name);
    }
    check(op?.responses?.['200']?.content?.[route.endsWith('/export') ? 'text/csv' : 'application/json']?.schema?.[route.endsWith('/export') ? 'type' : '$ref'] === (route.endsWith('/export') ? 'string' : '#/components/schemas/H7SalesReport'), route + ': response required');
  }
  return errors;
}
