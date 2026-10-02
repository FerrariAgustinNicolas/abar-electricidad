import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';

describe('GET /health behavior', () => {
  it('returns ok only after issuing PostgreSQL SELECT 1', async () => {
    const query = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const service = new HealthService({ $queryRaw: query } as never);
    const controller = new HealthController(service);

    await expect(controller.getHealth()).resolves.toEqual({ status: 'ok' });
    expect(query).toHaveBeenCalledTimes(1);
    expect((query.mock.calls[0][0] as TemplateStringsArray).join('')).toBe('SELECT 1');
  });

  it('does not report ok when PostgreSQL is unavailable', async () => {
    const query = jest.fn().mockRejectedValue(new Error('database password and path must not escape'));
    const service = new HealthService({ $queryRaw: query } as never);

    await expect(service.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
