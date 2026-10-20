import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { PublicCheckoutRateLimiter } from './public-checkout-rate-limiter';

@Module({
  imports: [PrismaModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, { provide: PublicCheckoutRateLimiter, useFactory: () => new PublicCheckoutRateLimiter() }],
})
export class CheckoutModule {}
