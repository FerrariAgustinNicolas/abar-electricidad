import { Controller, Get, Header, Param, Patch, Req, UseFilters } from '@nestjs/common';
import type { Request } from 'express';
import { AdminUsersService } from '../auth/admin-users.service';
import { CatalogEndpoint } from '../catalog-shared/catalog-contract';
import { CatalogException, CatalogExceptionFilter, catalogRequest } from '../catalog-shared/catalog-error';
import { SettingsService } from './settings.service';

type BodyRequest = Request & { body: unknown };

@Controller()
@UseFilters(CatalogExceptionFilter)
export class SettingsController {
  constructor(private readonly settings: SettingsService, private readonly admins: AdminUsersService) {}

  @Get('/api/v1/admin/settings')
  @CatalogEndpoint('/api/v1/admin/settings', 'get')
  @Header('Cache-Control', 'no-store')
  async getSettings(@Req() request: Request) {
    this.requireNoQuery(request);
    const auth = await this.admins.authorizeCatalog(catalogRequest(request), false);
    return this.settings.getSettings(auth);
  }

  @Patch('/api/v1/admin/settings')
  @CatalogEndpoint('/api/v1/admin/settings', 'patch')
  @Header('Cache-Control', 'no-store')
  async patchSettings(@Req() request: BodyRequest) {
    this.requireNoQuery(request);
    const auth = await this.admins.authorizeCatalog({ ...catalogRequest(request), body: request.body }, true);
    return this.settings.patchSettings(auth, request.body);
  }

  @Get('/api/v1/admin/payment-methods/:code')
  @CatalogEndpoint('/api/v1/admin/payment-methods/{code}', 'get')
  @Header('Cache-Control', 'no-store')
  async getPaymentMethod(@Req() request: Request, @Param('code') code: string) {
    this.requireNoQuery(request);
    const auth = await this.admins.authorizeCatalog(catalogRequest(request), false);
    return this.settings.getPaymentMethod(auth, code);
  }

  @Patch('/api/v1/admin/payment-methods/:code')
  @CatalogEndpoint('/api/v1/admin/payment-methods/{code}', 'patch')
  @Header('Cache-Control', 'no-store')
  async patchPaymentMethod(@Req() request: BodyRequest, @Param('code') code: string) {
    this.requireNoQuery(request);
    const auth = await this.admins.authorizeCatalog({ ...catalogRequest(request), body: request.body }, true);
    return this.settings.patchPaymentMethod(auth, code, request.body);
  }

  @Get('/api/v1/public/contact')
  @CatalogEndpoint('/api/v1/public/contact', 'get')
  @Header('Cache-Control', 'no-store')
  async getPublicContact(@Req() request: Request) {
    this.requireNoQuery(request);
    return this.settings.getPublicContact();
  }

  private requireNoQuery(request: Request): void {
    if (Object.keys(request.query).length > 0) throw new CatalogException(400, 'VALIDATION_ERROR');
  }
}
