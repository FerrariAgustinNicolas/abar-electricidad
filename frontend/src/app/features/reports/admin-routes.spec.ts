import { adminGuard } from '../../core/auth/auth.guard';
import { appRoutes } from '../../app.routes';

describe('admin routes', () => {
  it('keeps the admin guard and existing pages while adding dashboard and reports destinations', () => {
    const admin = appRoutes.find((route) => route.path === 'admin');
    expect(admin?.canActivate).toContain(adminGuard);
    const children = admin?.children ?? [];
    expect(children.find((route) => route.path === '')?.redirectTo).toBe('dashboard');
    expect(children.map((route) => route.path)).toEqual(expect.arrayContaining([
      'dashboard', 'reportes', 'usuarios', 'pedidos', 'productos', 'categorias', 'stock',
      'configuracion', 'metodos-pago', 'notificaciones', 'change-password',
    ]));
  });
});
