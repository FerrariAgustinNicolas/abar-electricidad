import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './layouts/admin-layout.component';
import { AuthLayoutComponent } from './layouts/auth-layout.component';
import { PublicLayoutComponent } from './layouts/public-layout.component';
import { NotFoundPageComponent } from './shared/ui/not-found-page.component';

export const appRoutes: Routes = [
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/home/home-page.component').then((module) => module.HomePageComponent) },
      { path: 'estado', loadComponent: () => import('./features/status/status-page.component').then((module) => module.StatusPageComponent) },
    ],
  },
  {
    path: 'admin/login',
    component: AuthLayoutComponent,
    loadChildren: () => import('./features/auth/auth.routes').then((module) => module.AUTH_ROUTES),
  },
  {
    path: 'admin',
    component: AdminLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/admin/admin-placeholder-page.component').then((module) => module.AdminPlaceholderPageComponent) },
    ],
  },
  { path: '**', component: NotFoundPageComponent },
];
