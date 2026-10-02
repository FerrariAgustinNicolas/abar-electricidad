import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApplication } from '../src/configure-application';
import { PrismaService } from '../src/prisma/prisma.service';

describe('H0 HTTP contract', () => {
  let app: INestApplication;
  let query: jest.Mock;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://abar_demo:fake-local-password@127.0.0.1:5432/abar_demo';
    query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: query })
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app as never);
    await app.init();
  });

  afterAll(async () => app?.close());

  it('serves GET /health only after a real health service query', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(query).toHaveBeenCalledTimes(1);
    expect((query.mock.calls[0][0] as TemplateStringsArray).join('')).toBe('SELECT 1');
  });

  it('documents only the implemented health endpoint with OpenAPI 3.0.3', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(response.body.openapi).toBe('3.0.3');
    expect(Object.keys(response.body.paths)).toEqual(['/health']);
  });

  it('returns a safe, uniform 503 when PostgreSQL is unavailable', async () => {
    query.mockRejectedValueOnce(new Error('password=/private/secret database=private'));
    const response = await request(app.getHttpServer()).get('/health').expect(503);
    expect(response.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Servicio temporalmente no disponible',
    });
    expect(response.body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.stringify(response.body)).not.toMatch(/password|private|secret|database/i);
  });

  it('uses the same safe error shape for unknown routes', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/not-implemented').expect(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(response.body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
