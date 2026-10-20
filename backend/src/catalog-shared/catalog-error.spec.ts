import { Controller, Post, UseFilters, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HttpException } from '@nestjs/common';
import { CatalogException, CatalogExceptionFilter, catalogRequest } from './catalog-error';

function capture(error: unknown) {
  const response = { setHeader: jest.fn(), status: jest.fn(), json: jest.fn() };
  response.status.mockReturnValue(response);
  const host = { switchToHttp: () => ({ getRequest: () => ({ requestId: 'test-request' }), getResponse: () => response }) };
  new CatalogExceptionFilter().catch(error, host as any);
  return response;
}

describe('catalog error boundary', () => {
  it.each([
    [new CatalogException(409, 'VERSION_CONFLICT'), 409, 'VERSION_CONFLICT'],
    [Object.assign(new Error('secret file path'), { code: 'LIMIT_FILE_SIZE' }), 413, 'IMAGE_TOO_LARGE'],
    [new HttpException('secret parser details', 400), 400, 'VALIDATION_ERROR'],
    [new Error('password=secret db host private'), 503, 'SERVICE_UNAVAILABLE'],
    [new CatalogException(200, 'invalid detail'), 503, 'SERVICE_UNAVAILABLE'],
  ])('returns bounded safe errors and no-store', (error, status, code) => {
    const response = capture(error);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.status).toHaveBeenCalledWith(status);
    expect(response.json).toHaveBeenCalledWith({ code, message: expect.any(String), requestId: 'test-request' });
    expect(JSON.stringify(response.json.mock.calls)).not.toMatch(/secret|private|password|parser/);
  });

  it('accepts only single string authorization headers', () => {
    expect(catalogRequest({ headers: { cookie: ['one', 'two'], origin: 1, 'x-csrf-token': ['a', 'b'] } } as any))
      .toEqual({ cookieHeader: undefined, origin: undefined, csrfToken: undefined });
    expect(catalogRequest({ headers: { cookie: 'session', origin: 'origin', 'x-csrf-token': 'token' } } as any))
      .toEqual({ cookieHeader: 'session', origin: 'origin', csrfToken: 'token' });
  });
});


@Controller('h2-upload-probe')
@UseFilters(CatalogExceptionFilter)
class UploadProbeController {
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1 } }))
  upload(@UploadedFile() _file: unknown) { return {}; }
}

describe('Nest multipart error translation', () => {
  it('preserves the frozen IMAGE_TOO_LARGE code after Multer transformation', async () => {
    const module = await Test.createTestingModule({ controllers: [UploadProbeController] }).compile();
    const app = module.createNestApplication();
    await app.init();
    try {
      const response = await request(app.getHttpServer()).post('/h2-upload-probe')
        .attach('file', Buffer.from([1, 2]), { filename: 'test.png', contentType: 'image/png' });
      expect(response.status).toBe(413);
      expect(response.body.code).toBe('IMAGE_TOO_LARGE');
      expect(response.headers['cache-control']).toBe('no-store');
    } finally { await app.close(); }
  });
});
