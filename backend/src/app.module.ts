import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthRuntimeModule } from './auth/auth-runtime.module';
import { AuthModule } from './auth/auth.module';
import { StockModule } from './stock/stock.module';
import { validateEnvironment } from './config/environment';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnvironment }),
    AuthRuntimeModule,
    AuthModule,
    PrismaModule,
    HealthModule,
    StockModule,
  ],
})
export class AppModule {}
