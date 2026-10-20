import { appRoutes } from './app.routes';

describe('H4 public routes', () => {
  it('exposes checkout, protected order result, and minimal lookup under the public layout', () => {
    const routes = appRoutes.find((route) => route.path === '')?.children ?? [];
    expect(routes.map((route) => route.path)).toContain('checkout');
    expect(routes.map((route) => route.path)).toContain('pedido/:id/resultado');
    expect(routes.map((route) => route.path)).toContain('consultar-pedido');
  });
});
