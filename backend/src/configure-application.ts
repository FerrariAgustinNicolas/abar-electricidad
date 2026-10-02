import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { createBaseValidationPipe } from './common/base-validation.pipe';
import { RequestIdMiddleware } from './common/request-id.middleware';

export function configureApplication(app: NestExpressApplication): void {
  const requestIdMiddleware = new RequestIdMiddleware();
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
  app.useGlobalPipes(createBaseValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());

  const options = new DocumentBuilder()
    .setTitle('ABAR Backend')
    .setDescription('Endpoints operativos implementados para el entorno local H0.2.')
    .setVersion('0.1.0')
    .setOpenAPIVersion('3.0.3')
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api/docs', app, document);
}
