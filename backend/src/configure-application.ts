import { createCheckoutJsonRouter } from './checkout/checkout-json.middleware';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { createBaseValidationPipe } from './common/base-validation.pipe';
import { createChangePasswordJsonRouter } from './common/change-password-json.middleware';
import { RequestIdMiddleware } from './common/request-id.middleware';

export function configureApplication(app: NestExpressApplication): void {
  const requestIdMiddleware = new RequestIdMiddleware();
  app.use(requestIdMiddleware.use.bind(requestIdMiddleware));
  app.use(createCheckoutJsonRouter());
  app.use(createChangePasswordJsonRouter());
  app.useGlobalPipes(createBaseValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());

  const options = new DocumentBuilder()
    .setTitle('ABAR Electricidad API — transversal candidate')
    .setDescription('H1 authentication, H2 catalog/stock and H3 demo quote endpoints for local verification. The frozen contract remains a candidate; no external approval or production readiness is implied.')
    .setVersion('0.6.0')
    .setOpenAPIVersion('3.0.3')
    .addCookieAuth('abar_auth_context', { type: 'apiKey', in: 'cookie' }, 'AuthPreauthCookie')
    .addCookieAuth('abar_admin_session', { type: 'apiKey', in: 'cookie' }, 'AdminSessionCookie')
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('api/docs', app, document);
}
