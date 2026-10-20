import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'abar-auth-layout',
  standalone: true,
  imports: [RouterOutlet],
  template: '<main class="auth-shell"><router-outlet /></main>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthLayoutComponent {}
