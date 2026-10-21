import { AdminOrdersController } from './orders/admin-orders.controller';
import { AdminOrdersService } from './orders/admin-orders.service';
import { CheckoutController } from './checkout/checkout.controller';
import { CheckoutService } from './checkout/checkout.service';
import { PublicCheckoutRateLimiter } from './checkout/public-checkout-rate-limiter';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { parse } from 'yaml';
import { configureApplication } from './configure-application';
import { AuthController } from './auth/auth.controller';
import { AdminUsersController } from './auth/admin-users.controller';
import { CsrfService } from './auth/csrf.service';
import { LoginService } from './auth/login.service';
import { SessionService } from './auth/session.service';
import { LogoutService } from './auth/logout.service';
import { ChangePasswordService } from './auth/change-password.service';
import { AdminUsersService } from './auth/admin-users.service';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { StockController } from './stock/stock.controller';
import { StockService } from './stock/stock.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';

type JsonObject = Record<string, unknown>;
type InterfaceDocument = {
  paths: Record<string, JsonObject>;
  components: { securitySchemes: unknown };
  openapi: string;
  info: JsonObject;
};
const contract = parse(readFileSync(resolve(__dirname, '../../contracts/openapi.yaml'), 'utf8')) as InterfaceDocument;

// Compare interface semantics, not generated names, prose or array ordering.
function semantics(value: unknown, document: InterfaceDocument): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => semantics(item, document))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value === null || typeof value !== 'object') return value;
  const object = value as JsonObject;
  if (typeof object.$ref === 'string') {
    if (!object.$ref.startsWith('#/')) throw new Error('Only local OpenAPI references are supported');
    const referenced = object.$ref.slice(2).split('/').reduce<unknown>((node, key) => {
      if (node === null || typeof node !== 'object') throw new Error('Unresolved OpenAPI reference');
      return (node as JsonObject)[key.replace(/~1/g, '/').replace(/~0/g, '~')];
    }, document);
    if (referenced === undefined) throw new Error('Unresolved OpenAPI reference');
    return semantics(referenced, document);
  }
  return Object.fromEntries(Object.keys(object).sort()
    .filter((key) => !['description', 'summary', 'example', 'examples', 'operationId', 'tags'].includes(key))
    .filter((key) => key !== 'parameters' || !Array.isArray(object[key]) || object[key].length > 0)
    .map((key) => [key, semantics(object[key], document)]));
}

describe('production Swagger projection of the frozen H1-H5 interface', () => {
  let app: NestExpressApplication;
  let document: InterfaceDocument;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController, AdminUsersController, HealthController, CatalogController, StockController, CheckoutController, OrdersController, AdminOrdersController],
      providers: [CsrfService, LoginService, SessionService, LogoutService,
        ChangePasswordService, AdminUsersService, HealthService, CatalogService, StockService, CheckoutService, OrdersService, AdminOrdersService, PublicCheckoutRateLimiter]
        .map((provide) => ({ provide, useValue: {} })),
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    await app.init();
    const response = await request(app.getHttpServer()).get('/api/docs-json');
    expect(response.status).toBe(200);
    document = response.body as InterfaceDocument;
  });

  afterAll(async () => { if (app) await app.close(); });

  it('keeps exactly the implemented H1-H5 routes and all three security schemes', () => {
    expect(Object.keys(document.paths).sort()).toEqual(Object.keys(contract.paths).sort());
    expect(semantics(document.components.securitySchemes, document))
      .toEqual(semantics(contract.components.securitySchemes, contract));
    expect(document.openapi).toBe(contract.openapi);
  });

  for (const [path, item] of Object.entries(contract.paths)) {
    for (const method of ['get', 'post', 'patch', 'delete']) {
      if (!item[method]) continue;
      it(`matches ${method.toUpperCase()} ${path} schemas, headers, errors and security`, () => {
        expect(semantics(document.paths[path][method], document))
          .toEqual(semantics(item[method], contract));
      });
    }
  }

  it('uses current metadata without presenting the historical H0 projection as runtime state', () => {
    expect(document.info.title).toBe(contract.info.title);
    expect(document.info.version).toBe(contract.info.version);
    expect(document.info.description).toContain('H1');
    expect(document.info.description).not.toMatch(/Only GET \/health currently runs|H0\.2/);
    expect(document.info['x-abar-runtime-stage']).not.toBe('h0');
    expect(document.info['x-abar-projected-areas']).toBeUndefined();
  });
});
