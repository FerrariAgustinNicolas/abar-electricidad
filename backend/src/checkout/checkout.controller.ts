import { Controller, Get, Header, HttpCode, Post, Req, UseFilters } from '@nestjs/common';
import type { Request } from 'express';
import { CatalogEndpoint } from '../catalog-shared/catalog-contract';
import { CatalogException } from '../catalog-shared/catalog-error';
import { CheckoutExceptionFilter } from './checkout-error';
import { CheckoutService } from './checkout.service';
import { PublicCheckoutRateLimiter } from './public-checkout-rate-limiter';

@Controller()
@UseFilters(CheckoutExceptionFilter)
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService, private readonly limiter: PublicCheckoutRateLimiter) {}

  @Get('/api/v1/public/settings')
  @CatalogEndpoint('/api/v1/public/settings', 'get')
  @Header('Cache-Control', 'no-store')
  settings(@Req() request: Request) {
    this.limit(request);
    if (Object.keys(request.query).length > 0) throw new CatalogException(400, 'VALIDATION_ERROR');
    return this.checkout.getPublicSettings();
  }

  @Get('/api/v1/public/payment-methods')
  @CatalogEndpoint('/api/v1/public/payment-methods', 'get')
  @Header('Cache-Control', 'no-store')
  paymentMethods(@Req() request: Request) {
    this.limit(request);
    const keys = Object.keys(request.query);
    if (keys.length !== 1 || keys[0] !== 'deliveryMode') throw new CatalogException(400, 'VALIDATION_ERROR');
    return this.checkout.getPublicPaymentMethods(request.query.deliveryMode);
  }

  @Post('/api/v1/public/checkout/quotes')
  @CatalogEndpoint('/api/v1/public/checkout/quotes', 'post')
  @Header('Cache-Control', 'no-store')
  @HttpCode(201)
  quote(@Req() request: Request) {
    this.limit(request);
    if (Object.keys(request.query).length > 0) throw new CatalogException(400, 'VALIDATION_ERROR');
    return this.checkout.createQuote(request.body);
  }

  private limit(request: Request): void {
    this.limiter.consume(request.socket.remoteAddress);
  }
}
