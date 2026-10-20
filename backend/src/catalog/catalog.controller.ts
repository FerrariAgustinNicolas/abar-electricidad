import { Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, Req, Res, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AdminUsersService } from '../auth/admin-users.service';
import { CatalogEndpoint } from '../catalog-shared/catalog-contract';
import { CatalogException, CatalogExceptionFilter, catalogRequest } from '../catalog-shared/catalog-error';
import { CatalogService } from './catalog.service';

type RequestWithBody = Request & { body: unknown };
const integerField = (value: unknown, max: number) => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new CatalogException(400, 'VALIDATION_ERROR');
  const number = Number(value); if (!Number.isSafeInteger(number) || number > max) throw new CatalogException(400, 'VALIDATION_ERROR'); return number;
};

@Controller()
@UseFilters(CatalogExceptionFilter)
export class CatalogController {
  constructor(private readonly catalog: CatalogService, private readonly admins: AdminUsersService) {}

  @Get('/api/v1/public/home')
  @CatalogEndpoint('/api/v1/public/home', 'get')
  home() { return this.catalog.home(); }

  @Get('/api/v1/public/categories')
  @CatalogEndpoint('/api/v1/public/categories', 'get')
  categories() { return this.catalog.publicCategories(); }

  @Get('/api/v1/public/products')
  @CatalogEndpoint('/api/v1/public/products', 'get')
  products(@Query() query: Record<string, unknown>) { return this.catalog.publicProducts(query); }

  @Get('/api/v1/public/products/:slug')
  @CatalogEndpoint('/api/v1/public/products/{slug}', 'get')
  product(@Param('slug') slug: string) { return this.catalog.publicProduct(slug); }

  @Get('/api/v1/public/products/:slug/images/:imageId')
  @CatalogEndpoint('/api/v1/public/products/{slug}/images/{imageId}', 'get')
  async publicImage(@Param('slug') slug: string, @Param('imageId') imageId: string, @Res() response: Response) {
    const image = await this.catalog.readImage(slug, imageId, false);
    response.setHeader('Content-Type', image.contentType); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Cache-Control', 'public, max-age=3600, immutable');
    response.status(200).send(image.bytes);
  }

  @Get('/api/v1/admin/categories')
  @CatalogEndpoint('/api/v1/admin/categories', 'get')
  @Header('Cache-Control', 'no-store')
  async adminCategories(@Req() request: Request, @Query() query: Record<string, unknown>) {
    const auth = await this.admins.authorizeCatalog(catalogRequest(request), false);
    return this.catalog.adminCategories(auth, query);
  }

  @Post('/api/v1/admin/categories')
  @CatalogEndpoint('/api/v1/admin/categories', 'post')
  async createCategory(@Req() request: RequestWithBody, @Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const auth = await this.admins.authorizeCatalog({ ...catalogRequest(request), body: request.body }, true);
    response.status(201).json(await this.catalog.createCategory(auth, request.body));
  }

  @Patch('/api/v1/admin/categories/order')
  @CatalogEndpoint('/api/v1/admin/categories/order', 'patch')
  @Header('Cache-Control', 'no-store')
  async reorderCategories(@Req() request: RequestWithBody) {
    const auth = await this.admins.authorizeCatalog({ ...catalogRequest(request), body: request.body }, true);
    return this.catalog.reorderCategories(auth, request.body);
  }

  @Patch('/api/v1/admin/categories/:id')
  @CatalogEndpoint('/api/v1/admin/categories/{id}', 'patch')
  @Header('Cache-Control', 'no-store')
  async patchCategory(@Req() request: RequestWithBody, @Param('id') id: string) {
    const auth = await this.admins.authorizeCatalog({ ...catalogRequest(request), id, body: request.body }, true);
    return this.catalog.patchCategory(auth, id, request.body);
  }

  @Get('/api/v1/admin/products')
  @CatalogEndpoint('/api/v1/admin/products', 'get')
  @Header('Cache-Control', 'no-store')
  async adminProducts(@Req() request: Request, @Query() query: Record<string, unknown>) {
    const auth = await this.admins.authorizeCatalog(catalogRequest(request), false);
    return this.catalog.adminProducts(auth, query);
  }

  @Get('/api/v1/admin/products/:id')
  @CatalogEndpoint('/api/v1/admin/products/{id}', 'get')
  @Header('Cache-Control', 'no-store')
  async adminProduct(@Req() request: Request, @Param('id') id: string) {
    const auth = await this.admins.authorizeCatalog({ ...catalogRequest(request), id }, false);
    return this.catalog.adminProduct(auth, id);
  }

  @Post('/api/v1/admin/products')
  @CatalogEndpoint('/api/v1/admin/products', 'post')
  async createProduct(@Req() request: RequestWithBody, @Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const auth = await this.admins.authorizeCatalog({ ...catalogRequest(request), body: request.body }, true);
    response.status(201).json(await this.catalog.createProduct(auth, request.body));
  }

  @Patch('/api/v1/admin/products/:id')
  @CatalogEndpoint('/api/v1/admin/products/{id}', 'patch')
  @Header('Cache-Control', 'no-store')
  async patchProduct(@Req() request: RequestWithBody, @Param('id') id: string) {
    const auth = await this.admins.authorizeCatalog({ ...catalogRequest(request), id, body: request.body }, true);
    return this.catalog.patchProduct(auth, id, request.body);
  }

  @Post('/api/v1/admin/products/:id/images')
  @CatalogEndpoint('/api/v1/admin/products/{id}/images', 'post')
  @Header('Cache-Control', 'no-store')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async uploadImage(@Req() request: RequestWithBody, @Param('id') id: string, @UploadedFile() file: { buffer: Buffer } | undefined) {
    const auth = await this.admins.authorizeCatalog({ ...catalogRequest(request), id, body: request.body }, true);
    if (!file || !request.body || typeof request.body !== 'object') throw new CatalogException(400, 'VALIDATION_ERROR');
    const body = request.body as Record<string, unknown>;
    const allowed = new Set(['alt', 'order', 'isPrimary', 'expectedVersion']);
    if (Object.keys(body).some((key) => !allowed.has(key))) throw new CatalogException(400, 'VALIDATION_ERROR');
    if (typeof body.alt !== 'string' || [...body.alt].length < 1 || [...body.alt].length > 200 || !['true', 'false'].includes(String(body.isPrimary))) throw new CatalogException(400, 'VALIDATION_ERROR');
    const fields = { alt: body.alt, order: integerField(body.order, 7), isPrimary: body.isPrimary === 'true', expectedVersion: integerField(body.expectedVersion, 2147483647) };
    if (fields.expectedVersion < 1) throw new CatalogException(400, 'VALIDATION_ERROR');
    return this.catalog.uploadImage(auth, id, fields, file.buffer);
  }

  @Get('/api/v1/admin/products/:id/images/:imageId')
  @CatalogEndpoint('/api/v1/admin/products/{id}/images/{imageId}', 'get')
  @Header('Cache-Control', 'no-store')
  async adminImage(@Req() request: Request, @Param('id') id: string, @Param('imageId') imageId: string, @Res() response: Response) {
    const auth = await this.admins.authorizeCatalog({ ...catalogRequest(request), id }, false);
    const image = await this.catalog.readImage(id, imageId, true, auth);
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('Content-Type', image.contentType); response.setHeader('X-Content-Type-Options', 'nosniff');
    response.status(200).send(image.bytes);
  }

  @Patch('/api/v1/admin/products/:id/images/:imageId')
  @CatalogEndpoint('/api/v1/admin/products/{id}/images/{imageId}', 'patch')
  @Header('Cache-Control', 'no-store')
  async patchImage(@Req() request: RequestWithBody, @Param('id') id: string, @Param('imageId') imageId: string) {
    const auth = await this.admins.authorizeCatalog({ ...catalogRequest(request), id, body: request.body }, true);
    return this.catalog.patchImage(auth, id, imageId, request.body);
  }

  @Delete('/api/v1/admin/products/:id/images/:imageId')
  @CatalogEndpoint('/api/v1/admin/products/{id}/images/{imageId}', 'delete')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async deleteImage(@Req() request: Request, @Param('id') id: string, @Param('imageId') imageId: string, @Query('expectedVersion') version: string) {
    const auth = await this.admins.authorizeCatalog({ ...catalogRequest(request), id, query: { expectedVersion: version } }, true);
    return this.catalog.deleteImage(auth, id, imageId, integerField(version, 2147483647));
  }
}
