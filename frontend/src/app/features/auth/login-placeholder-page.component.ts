import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthSessionService, safeReturnUrl } from '../../core/auth/auth-session.service';

@Component({
  selector: 'abar-login-page',
  standalone: true,
  template: `
    <section class="auth-card" aria-labelledby="login-title">
      <p class="eyebrow">Administración</p>
      <h1 id="login-title">Iniciar sesión</h1>
      <p>Ingresá con tu cuenta administrativa.</p>
      <form (submit)="$event.preventDefault(); submit()" #loginForm novalidate>
        <label for="email">Correo electrónico</label>
        <input id="email" name="email" type="email" autocomplete="username" required maxlength="254"
          [value]="email" (input)="email = inputValue($event)" [disabled]="busy()" />

        <label for="password">Contraseña</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required minlength="1" maxlength="256"
          [value]="password" (input)="password = inputValue($event)" [disabled]="busy()" />

        @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
        <button type="submit" [disabled]="busy() || !loginForm.checkValidity() || passwordTooLong()">{{ busy() ? 'Ingresando…' : 'Ingresar' }}</button>
      </form>
      <a class="back-link" href="/">Volver al sitio</a>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPlaceholderPageComponent {
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  email = '';
  password = '';
  readonly busy = signal(false);
  readonly error = signal('');

  inputValue(event: Event): string { return (event.target as HTMLInputElement).value; }
  passwordTooLong(): boolean { return Array.from(this.password.normalize('NFC')).length > 128; }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const session = await this.auth.login(this.email.trim(), this.password);
      this.password = '';
      const returnUrl = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
      await this.router.navigateByUrl(session.admin.mustChangePassword ? '/admin/change-password' : returnUrl);
    } catch (error: unknown) {
      this.error.set(loginMessage(error));
      this.password = '';
    } finally {
      this.busy.set(false);
    }
  }
}

function loginMessage(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401) return 'No pudimos validar el correo o la contraseña.';
  if (status === 429) return 'Se alcanzó el límite de intentos. Esperá un momento y probá nuevamente.';
  if (status === 403) return 'La solicitud venció. Volvé a intentar ingresar.';
  return 'No se pudo iniciar sesión. Revisá tu conexión e intentá nuevamente.';
}
