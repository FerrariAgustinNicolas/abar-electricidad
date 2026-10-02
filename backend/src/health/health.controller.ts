import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

const HEALTH_OK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: { status: { type: 'string', enum: ['ok'] } },
};

const FIELD_ERROR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['field', 'code', 'message'],
  properties: {
    field: { type: 'string', minLength: 1 },
    code: { type: 'string', minLength: 1 },
    message: { type: 'string', minLength: 1 },
  },
};

const HEALTH_ERROR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'message', 'requestId'],
  properties: {
    code: { type: 'string', minLength: 1 },
    message: { type: 'string', minLength: 1 },
    fieldErrors: { type: 'array', items: FIELD_ERROR_SCHEMA },
    requestId: { type: 'string', format: 'uuid' },
  },
};

@ApiTags('operational')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Comprueba la disponibilidad de la API y PostgreSQL' })
  @ApiResponse({ status: 200, description: 'PostgreSQL respondió SELECT 1', schema: HEALTH_OK_SCHEMA })
  @ApiResponse({ status: 503, description: 'Dependencia temporalmente no disponible', schema: HEALTH_ERROR_SCHEMA })
  async getHealth(): Promise<{ status: 'ok' }> {
    await this.healthService.check();
    return { status: 'ok' };
  }
}
