import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('operational')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Comprueba la disponibilidad de la API y PostgreSQL' })
  @ApiResponse({ status: 200, description: 'PostgreSQL respondió SELECT 1', schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] } }, required: ['status'] } })
  @ApiResponse({ status: 503, description: 'Dependencia temporalmente no disponible' })
  async getHealth(): Promise<{ status: 'ok' }> {
    await this.healthService.check();
    return { status: 'ok' };
  }
}
