import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './layouts/admin-layout.component';
import { AuthLayoutComponent } from './layouts/auth-layout.component';
import { PublicLayoutComponent } from './layouts/public-layout.component';
import { NotFoundPageComponent } from './shared/ui/not-found-page.component';
import { adminGuard } from './core/auth/auth.guard';
import { ChangePasswordPageComponent } from './features/auth/change-password-page.component';

export const appRoutes: Routes = [
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/home/home-page.component').then((module) => module.HomePageComponent) },
      { path: 'productos', loadComponent: () => import('./features/catalog/catalog-page.component').then((module) => module.CatalogPageComponent) },
      { path: 'productos/:slug', loadComponent: () => import('./features/catalog/product-detail-page.component').then((module) => module.ProductDetailPageComponent) },
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
    canActivate: [adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'usuarios' },
      { path: 'usuarios', loadComponent: () => import('./features/admin/admin-placeholder-page.component').then((module) => module.AdminPlaceholderPageComponent) },
      { path: 'change-password', component: ChangePasswordPageComponent },
    ],
  },
  { path: '**', component: NotFoundPageComponent },
];
