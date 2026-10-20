import { Controller, Get, Header, HttpCode, Param, Post, Req, UseFilters } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';
import type { Request } from 'express';
import { CatalogEndpoint } from '../catalog-shared/catalog-contract';
import { CatalogException } from '../catalog-shared/catalog-error';
import { CheckoutExceptionFilter } from '../checkout/checkout-error';
import { PublicCheckoutRateLimiter } from '../checkout/public-checkout-rate-limiter';
import { OrdersService } from './orders.service';

@Controller()
@UseFilters(CheckoutExceptionFilter)
export class OrdersController {
  constructor(private readonly orders: OrdersService, private readonly limiter: PublicCheckoutRateLimiter) {}

  @Get('/api/v1/public/checkout/terms')
  @CatalogEndpoint('/api/v1/public/checkout/terms', 'get')
  @Header('Cache-Control', 'no-store')
  terms(@Req() request: Request) { this.limit(request); this.rejectQuery(request); return this.orders.terms(); }

  @Post('/api/v1/public/orders')
  @CatalogEndpoint('/api/v1/public/orders', 'post')
  @Header('Cache-Control', 'no-store')
  @HttpCode(201)
  create(@Req() request: Request & { requestId?: string }) {
    this.limit(request); this.rejectQuery(request); return this.orders.create(request.body, this.header(request, 'idempotency-key'));
  }

  @Post('/api/v1/public/orders/lookup')
  @CatalogEndpoint('/api/v1/public/orders/lookup', 'post')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  lookup(@Req() request: Request) { this.limit(request); this.rejectQuery(request); return this.orders.lookup(request.body); }

  @Get('/api/v1/public/orders/:id')
  @ApiSecurity('OrderAccessToken')
  @CatalogEndpoint('/api/v1/public/orders/{id}', 'get')
  @Header('Cache-Control', 'no-store')
  get(@Param('id') id: string, @Req() request: Request) {
    this.limit(request); return this.orders.get(id, this.header(request, 'x-order-access-token'));
  }

  @Post('/api/v1/public/orders/:id/payment-attempts')
  @ApiSecurity('OrderAccessToken')
  @CatalogEndpoint('/api/v1/public/orders/{id}/payment-attempts', 'post')
  @Header('Cache-Control', 'no-store')
  @HttpCode(201)
  attempt(@Param('id') id: string, @Req() request: Request) {
    this.limit(request); this.rejectQuery(request); return this.orders.createAttempt(id,
      this.header(request, 'x-order-access-token'), this.header(request, 'idempotency-key'), request.body);
  }

  private limit(request: Request) { this.limiter.consume(request.socket.remoteAddress); }
  private rejectQuery(request: Request) { if (Object.keys(request.query).length > 0) throw new CatalogException(400, 'VALIDATION_ERROR'); }
  private header(request: Request, name: string): string | undefined {
    const value = request.headers[name];
    return typeof value === 'string' ? value : undefined;
  }
}
