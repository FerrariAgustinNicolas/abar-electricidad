import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'abar-admin-layout',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <header class="admin-header"><p>Administración · base H0</p></header>
    <main class="admin-shell">
      <aside aria-label="Navegación administrativa"><p>Área administrativa sin operaciones habilitadas.</p></aside>
      <section><router-outlet /></section>
    </main>
    <p class="notice">Base H0; no autenticación implementada. No se muestran datos privados.</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayoutComponent {}
