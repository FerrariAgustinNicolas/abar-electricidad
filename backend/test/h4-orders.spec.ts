import { OrdersService } from '../src/orders/orders.service';

describe('H4 order terms and no-store contract', () => {
  it('returns the exact provisional contract text and server simulation capability', () => {
    const config = { get: jest.fn().mockReturnValue(true) };
    const service = new OrdersService({} as never, {} as never, config as never);
    expect(service.terms()).toEqual({
      version: 'demo-2026-10-20-v1',
      text: 'Condiciones de demostración académica, provisionales y no validadas como términos legales de ABAR. Registrar un pedido no reserva ni garantiza existencias futuras. Los medios e intentos de pago son ficticios. Una simulación aprobada no confirma un cobro: requiere confirmación administrativa posterior fuera de H4.',
      demoMode: true,
      simulationEnabled: true,
    });
  });
});
