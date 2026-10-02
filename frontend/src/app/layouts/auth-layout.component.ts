import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'abar-auth-layout',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <main class="auth-shell">
      <p class="notice">Base H0; no autenticación implementada.</p>
      <router-outlet />
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayoutComponent {}
