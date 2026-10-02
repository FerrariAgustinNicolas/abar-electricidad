import { ValidationPipe } from '@nestjs/common';

export function createBaseValidationPipe(): ValidationPipe {
  return new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
}
