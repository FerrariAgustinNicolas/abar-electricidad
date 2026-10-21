import { Controller, Get, HttpCode, Param, Patch, Post, Req, Header, UseFilters } from '@nestjs/common';
import type { Request } from 'express';
import { CatalogEndpoint } from '../catalog-shared/catalog-contract';
import { CatalogExceptionFilter, catalogRequest } from '../catalog-shared/catalog-error';
import { AdminOrdersService } from './admin-orders.service';

@Controller('api/v1/admin/orders')
@UseFilters(CatalogExceptionFilter)
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}
  @Get()
  @CatalogEndpoint('/api/v1/admin/orders', 'get')
  @Header('Cache-Control', 'no-store')
  list(@Req() r: Request) { return this.orders.list({ ...catalogRequest(r), query: r.query }); }
  @Get(':id')
  @CatalogEndpoint('/api/v1/admin/orders/{id}', 'get')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id') id: string, @Req() r: Request) { return this.orders.detail(id, { ...catalogRequest(r), query: r.query }); }
  @Get(':id/history')
  @CatalogEndpoint('/api/v1/admin/orders/{id}/history', 'get')
  @Header('Cache-Control', 'no-store')
  history(@Param('id') id: string, @Req() r: Request) { return this.orders.history(id, { ...catalogRequest(r), query: r.query }); }
  @Post(':id/payment-confirmation')
  @HttpCode(200)
  @CatalogEndpoint('/api/v1/admin/orders/{id}/payment-confirmation', 'post')
  @Header('Cache-Control', 'no-store')
  confirm(@Param('id') id: string, @Req() r: Request) { return this.mutate(id, 'PAYMENT_CONFIRMATION', r); }
  @Patch(':id/status')
  @CatalogEndpoint('/api/v1/admin/orders/{id}/status', 'patch')
  @Header('Cache-Control', 'no-store')
  status(@Param('id') id: string, @Req() r: Request) { return this.mutate(id, 'ORDER_STATUS', r); }
  @Post(':id/cancel')
  @HttpCode(200)
  @CatalogEndpoint('/api/v1/admin/orders/{id}/cancel', 'post')
  @Header('Cache-Control', 'no-store')
  cancel(@Param('id') id: string, @Req() r: Request) { return this.mutate(id, 'ORDER_CANCEL', r); }
  @Post(':id/notes')
  @HttpCode(200)
  @CatalogEndpoint('/api/v1/admin/orders/{id}/notes', 'post')
  @Header('Cache-Control', 'no-store')
  note(@Param('id') id: string, @Req() r: Request) { return this.mutate(id, 'ORDER_NOTE', r); }
  private mutate(id: string, kind: 'PAYMENT_CONFIRMATION' | 'ORDER_STATUS' | 'ORDER_CANCEL' | 'ORDER_NOTE', r: Request) {
    return this.orders.mutate(id, kind, { ...catalogRequest(r), body: r.body, query: r.query,
      idempotencyKey: typeof r.headers['idempotency-key'] === 'string' ? r.headers['idempotency-key'] : undefined });
  }
}
