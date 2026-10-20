import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CATALOG_IMAGE_STORAGE, FileCatalogImageStorage } from './image-storage';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CatalogController],
  providers: [CatalogService, { provide: CATALOG_IMAGE_STORAGE, useFactory: () => new FileCatalogImageStorage() }],
  exports: [CatalogService],
})
export class CatalogModule {}
