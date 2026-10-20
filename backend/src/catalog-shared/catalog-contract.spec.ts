import { Controller, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateCatalogBody, CatalogEndpoint } from './catalog-contract';

const product = JSON.parse(readFileSync(resolve(__dirname, '../../../contracts/examples/h2-product-write.json'), 'utf8'));

describe('frozen H2 runtime validation', () => {
  it('preserves exact cent strings and accepts the normative product example', () => {
    const body = structuredClone(product);
    body.presentations[0].price.amountMinor = '9007199254740993';
    expect(validateCatalogBody('ProductWrite', body)).toBe(body);
    expect(body.presentations[0].price.amountMinor).toBe('9007199254740993');
  });

  it.each([
    { ...product, availableQuantity: 1 },
    { ...product, featured: 'true' },
    { ...product, categoryId: 'not-a-uuid' },
    { ...product, presentations: [{ ...product.presentations[0], lowStockThreshold: 0.5 }] },
    { ...product, presentations: [{ ...product.presentations[0], price: { amountMinor: 1, currency: 'ARS' } }] },
  ])('rejects closed-schema violations without changing the request', (body) => {
    const before = JSON.stringify(body);
    expect(() => validateCatalogBody('ProductWrite', body)).toThrow();
    expect(JSON.stringify(body)).toBe(before);
  });

  it('fails closed for an unknown schema or unregistered endpoint', () => {
    expect(() => validateCatalogBody('UnknownSchema', {})).toThrow();
    expect(() => CatalogEndpoint('/api/v1/public/checkout', 'post')).toThrow();
  });
});


@Controller('api/v1/admin/categories')
class DecoratedCatalogController {
  @Post()
  @CatalogEndpoint('/api/v1/admin/categories', 'post')
  create() { return {}; }
}

describe('runtime operation metadata', () => {
  it('documents the actual JSON body and response, not an unregistered path overlay', async () => {
    const module = await Test.createTestingModule({ controllers: [DecoratedCatalogController] }).compile();
    const app = module.createNestApplication();
    try {
      const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
      const operation = document.paths['/api/v1/admin/categories'].post!;
      const body = operation.requestBody as any;
      expect(body.content['application/json'].schema.properties.name.type).toBe('string');
      expect(operation.responses['201']).toHaveProperty('content.application/json.schema');
      expect(document.paths).not.toHaveProperty('/api/v1/public/products');
    } finally { await app.close(); }
  });
});
