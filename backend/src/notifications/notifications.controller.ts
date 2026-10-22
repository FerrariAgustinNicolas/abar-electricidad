import { Controller, Get, Header, HttpCode, Param, Post, Req, UseFilters } from '@nestjs/common';
import type { Request } from 'express';
import { CatalogEndpoint } from '../catalog-shared/catalog-contract';
import { CatalogExceptionFilter, catalogRequest } from '../catalog-shared/catalog-error';
import { NotificationsService } from './notifications.service';

@Controller()
@UseFilters(CatalogExceptionFilter)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('/api/v1/admin/notifications')
  @CatalogEndpoint('/api/v1/admin/notifications', 'get')
  @Header('Cache-Control', 'no-store')
  list(@Req() request: Request) {
    return this.notifications.list({ ...catalogRequest(request), query: request.query as Record<string, unknown> });
  }

  @Post('/api/v1/admin/notifications/:id/retry')
  @HttpCode(202)
  @CatalogEndpoint('/api/v1/admin/notifications/{id}/retry', 'post')
  @Header('Cache-Control', 'no-store')
  retry(@Param('id') id: string, @Req() request: Request) {
    return this.notifications.retry(id, { ...catalogRequest(request), body: request.body });
  }
}
