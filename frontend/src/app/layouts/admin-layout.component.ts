import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthSessionService } from '../core/auth/auth-session.service';

@Component({
  selector: 'abar-admin-layout',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  template: `
    <a class="skip-link" href="#admin-content" (click)="$event.preventDefault(); content.focus()">Saltar al contenido</a>
    <header class="admin-header">
      <a routerLink="/admin/usuarios" class="admin-brand">ABAR Electricidad · Administración</a>
      <div class="admin-account">
        <span>{{ accountName() }}</span>
        <button type="button" class="button-light" (click)="logout()">Cerrar sesión</button>
      </div>
    </header>
    <div class="admin-shell">
      <nav class="admin-nav" aria-label="Navegación administrativa">
        <a routerLink="/admin/usuarios" routerLinkActive="active" ariaCurrentWhenActive="page">Usuarios administradores</a>
        <a routerLink="/admin/productos">Productos</a>
        <a routerLink="/admin/categorias">Categorías</a>
        <a routerLink="/admin/stock">Stock y movimientos</a>
        <a routerLink="/admin/change-password" routerLinkActive="active" ariaCurrentWhenActive="page">Cambiar contraseña</a>
      </nav>
      <main #content id="admin-content" tabindex="-1" class="admin-content"><router-outlet /></main>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayoutComponent {
  readonly auth = inject(AuthSessionService);
  accountName(): string { return this.auth.session()?.admin.name ?? ''; }

  async logout(): Promise<void> {
    try { await this.auth.logout(); } catch { /* Local credentials are cleared even when the server cannot be reached. */ }
  }
}
