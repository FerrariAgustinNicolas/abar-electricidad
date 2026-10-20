import { Controller, Get, Post, Req, Res, UseFilters } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CatalogEndpoint } from '../catalog-shared/catalog-contract';
import { CatalogExceptionFilter, catalogRequest } from '../catalog-shared/catalog-error';
import { StockService } from './stock.service';

type StockRequest = Request & { requestId?: string };
const header = (value: string | string[] | undefined): string | undefined => typeof value === 'string' ? value : undefined;

@Controller('api/v1/admin/stock')
@UseFilters(CatalogExceptionFilter)
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @CatalogEndpoint('/api/v1/admin/stock', 'get')
  async list(@Req() request: StockRequest, @Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    const result = await this.stock.list({ ...catalogRequest(request), query: request.query as Record<string, unknown> });
    response.status(200).json(result);
  }

  @Get('movements')
  @CatalogEndpoint('/api/v1/admin/stock/movements', 'get')
  async movements(@Req() request: StockRequest, @Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    const result = await this.stock.movements({ ...catalogRequest(request), query: request.query as Record<string, unknown> });
    response.status(200).json(result);
  }

  @Post('adjustments')
  @CatalogEndpoint('/api/v1/admin/stock/adjustments', 'post')
  async adjust(@Req() request: StockRequest, @Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    const result = await this.stock.adjust({
      ...catalogRequest(request), body: request.body, idempotencyKey: header(request.headers['idempotency-key']),
    });
    response.status(201).json(result);
  }

  @Post('roll-openings')
  @CatalogEndpoint('/api/v1/admin/stock/roll-openings', 'post')
  async openRolls(@Req() request: StockRequest, @Res() response: Response): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    const result = await this.stock.openRolls({
      ...catalogRequest(request), body: request.body, idempotencyKey: header(request.headers['idempotency-key']),
    });
    response.status(201).json(result);
  }
}
