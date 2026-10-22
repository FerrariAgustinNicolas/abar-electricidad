import { appRoutes } from './app.routes';

describe('H4 public routes', () => {
  it('exposes checkout, protected order result, and minimal lookup under the public layout', () => {
    const routes = appRoutes.find((route) => route.path === '')?.children ?? [];
    expect(routes.map((route) => route.path)).toContain('checkout');
    expect(routes.map((route) => route.path)).toContain('pedido/:id/resultado');
    expect(routes.map((route) => route.path)).toContain('consultar-pedido');
  });
});

describe('H5 admin order routes', () => {
  it('registers the paginated order list and parameterized detail behind the admin layout guard', () => {
    const admin = appRoutes.find((route) => route.path === 'admin');
    const children = admin?.children ?? [];
    expect(admin?.canActivate).toBeTruthy();
    expect(children.map((route) => route.path)).toContain('pedidos');
    expect(children.map((route) => route.path)).toContain('pedidos/:id');
  });
});

describe('H6 commercial routes', () => {
  it('registers protected settings, payment methods, and notifications under admin', () => {
    const admin = appRoutes.find((route) => route.path === 'admin');
    const children = admin?.children ?? [];
    expect(admin?.canActivate).toBeTruthy();
    expect(children.map((route) => route.path)).toEqual(expect.arrayContaining(['configuracion', 'metodos-pago', 'notificaciones']));
  });

  it('registers public contact under the public layout', () => {
    const routes = appRoutes.find((route) => route.path === '')?.children ?? [];
    expect(routes.map((route) => route.path)).toContain('contacto');
  });
});
