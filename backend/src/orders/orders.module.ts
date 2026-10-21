import { AuthModule } from '../auth/auth.module';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({ imports: [PrismaModule, CheckoutModule, AuthModule], controllers: [OrdersController, AdminOrdersController], providers: [OrdersService, AdminOrdersService] })
export class OrdersModule {}
