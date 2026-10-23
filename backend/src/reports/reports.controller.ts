import { Controller, Get, Header, Req, Res, UseFilters } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminUsersService } from '../auth/admin-users.service';
import { CatalogEndpoint } from '../catalog-shared/catalog-contract';
import { CatalogExceptionFilter, catalogRequest } from '../catalog-shared/catalog-error';
import { csvReport, ReportsService } from './reports.service';
@Controller()
@UseFilters(CatalogExceptionFilter)
export class ReportsController {
  constructor(private readonly reports:ReportsService,private readonly admins:AdminUsersService){}
  @Get('/api/v1/admin/dashboard') @CatalogEndpoint('/api/v1/admin/dashboard','get') @Header('Cache-Control','no-store')
  async dashboard(@Req() req:Request){const auth=await this.admins.authorizeCatalog(catalogRequest(req),false);return this.reports.getReport(auth,req.query);}
  @Get('/api/v1/admin/reports/sales') @CatalogEndpoint('/api/v1/admin/reports/sales','get') @Header('Cache-Control','no-store')
  async sales(@Req() req:Request){const auth=await this.admins.authorizeCatalog(catalogRequest(req),false);return this.reports.getReport(auth,req.query);}
  @Get('/api/v1/admin/reports/sales/export') @CatalogEndpoint('/api/v1/admin/reports/sales/export','get') @Header('Cache-Control','no-store') @Header('Content-Disposition','attachment; filename="abar-demo-sales.csv"') @Header('X-Content-Type-Options','nosniff') @Header('Content-Type','text/csv; charset=utf-8')
  async export(@Req() req:Request,@Res() res:Response){const auth=await this.admins.authorizeCatalog(catalogRequest(req),false);return res.send(csvReport(await this.reports.getReport(auth,req.query)));}
}
