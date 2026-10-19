import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthSessionService } from './auth-session.service';

export const adminGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthSessionService);
  const router = inject(Router);
  await auth.restore();
  return auth.protectedRoute(state.url) || router.createUrlTree(['/admin/login']);
};
