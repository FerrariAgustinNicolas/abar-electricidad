// An explicit additive allowlist, not permission to implement future milestones.
export const H2_OPERATIONS = [
  ['/api/v1/public/home', 'get', '200', 'CatalogHome'],
  ['/api/v1/public/categories', 'get', '200', 'PublicCategoryList'],
  ['/api/v1/public/products', 'get', '200', 'ProductList'],
  ['/api/v1/public/products/{slug}', 'get', '200', 'ProductDetail'],
  ['/api/v1/public/products/{slug}/images/{imageId}', 'get', '200', null],
  ['/api/v1/admin/categories', 'get', '200', 'CategoryList'],
  ['/api/v1/admin/categories', 'post', '201', 'Category', 'CategoryWrite'],
  ['/api/v1/admin/categories/{id}', 'patch', '200', 'Category', 'CategoryPatch'],
  ['/api/v1/admin/categories/order', 'patch', '200', 'CategoryList', 'CategoryOrderRequest'],
  ['/api/v1/admin/products', 'get', '200', 'AdminProductList'],
  ['/api/v1/admin/products', 'post', '201', 'AdminProduct', 'ProductWrite'],
  ['/api/v1/admin/products/{id}', 'get', '200', 'AdminProduct'],
  ['/api/v1/admin/products/{id}', 'patch', '200', 'AdminProduct', 'ProductPatch'],
  ['/api/v1/admin/products/{id}/images', 'post', '201', 'AdminProduct', 'ImageUpload'],
  ['/api/v1/admin/products/{id}/images/{imageId}', 'get', '200', null],
  ['/api/v1/admin/products/{id}/images/{imageId}', 'patch', '200', 'AdminProduct', 'ImagePatch'],
  ['/api/v1/admin/products/{id}/images/{imageId}', 'delete', '200', 'AdminProduct'],
  ['/api/v1/admin/stock', 'get', '200', 'StockList'],
  ['/api/v1/admin/stock/movements', 'get', '200', 'StockOperationList'],
  ['/api/v1/admin/stock/adjustments', 'post', '201', 'StockOperationView', 'StockAdjustmentRequest'],
  ['/api/v1/admin/stock/roll-openings', 'post', '201', 'StockOperationView', 'RollOpeningRequest'],
];

const reference = (name) => `#/components/schemas/${name}`;
const schemaFor = (response) => response?.content?.['application/json']?.schema?.$ref;

export function validateH2Contract(document) {
  const errors = [];
  const check = (ok, message) => { if (!ok) errors.push(message); };
  check(document.info?.['x-abar-h2-freeze'] === 'catalog-stock-v1', 'H2 freeze marker is required');
  for (const [route, method, status, output, input] of H2_OPERATIONS) {
    const operation = document.paths?.[route]?.[method];
    check(!!operation, `Missing H2 operation ${method} ${route}`);
    if (!operation) continue;
    check(operation.responses?.[status], `${method} ${route}: success status differs`);
    if (output) check(schemaFor(operation.responses?.[status]) === reference(output), `${method} ${route}: response DTO differs`);
    if (input) {
      const media = input === 'ImageUpload' ? 'multipart/form-data' : 'application/json';
      check(operation.requestBody?.required === true && operation.requestBody.content?.[media]?.schema?.$ref === reference(input), `${method} ${route}: required request DTO differs`);
    }
    const admin = route.startsWith('/api/v1/admin/');
    check(JSON.stringify(operation.security) === JSON.stringify(admin ? [{ AdminSessionCookie: [] }] : []), `${method} ${route}: security differs`);
    for (const code of admin ? ['400', '401', '403', '503'] : ['400', '503']) {
      check(operation.responses?.[code], `${method} ${route}: missing ${code}`);
    }
    if (admin && method !== 'get') {
      for (const name of ['Origin', 'CsrfToken']) check(operation.parameters?.some((p) => p.$ref === `#/components/parameters/${name}`), `${method} ${route}: missing ${name}`);
      check(operation.responses?.['409'], `${method} ${route}: missing conflict response`);
    }
    if (route.endsWith('/adjustments') || route.endsWith('/roll-openings')) {
      check(operation.parameters?.some((p) => p.name === 'Idempotency-Key' && p.in === 'header' && p.required === true), `${route}: required idempotency missing`);
    }
  }
  const schemas = document.components?.schemas;
  for (const [name, fields] of [
    ['PublicPresentation', ['id', 'unit', 'rollLengthMeters', 'price', 'availability', 'sellable']],
    ['StockAdjustmentRequest', ['presentationId', 'delta', 'reason', 'expectedVersion']],
    ['RollOpeningRequest', ['productId', 'rollQuantity', 'reason', 'expectedVersions']],
  ]) {
    const schema = schemas?.[name];
    check(schema?.additionalProperties === false && JSON.stringify(Object.keys(schema.properties ?? {}).sort()) === JSON.stringify(fields.sort()), `${name}: closed fields differ`);
  }
  check(schemas?.ImageUpload?.properties?.file?.format === 'binary', 'Image upload must contain a binary file');
  return errors;
}
