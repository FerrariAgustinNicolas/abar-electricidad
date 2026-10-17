import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthSessionService } from '../../core/auth/auth-session.service';

@Component({
  selector: 'abar-change-password-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="auth-card" aria-labelledby="change-title">
      <p class="eyebrow">Seguridad de la cuenta</p>
      <h1 id="change-title">{{ mandatory() ? 'Actualizá tu contraseña' : 'Cambiar contraseña' }}</h1>
      @if (mandatory()) { <p>Para continuar, elegí una contraseña nueva para tu cuenta.</p> }
      @if (reauthenticationRequired()) {
        <p class="form-success" role="status">{{ notice() }}</p>
        <a class="button-secondary" routerLink="/admin/login">Iniciar sesión</a>
      } @else {
      <form (submit)="$event.preventDefault(); submit()" #passwordForm novalidate>
        <label for="current-password">Contraseña actual</label>
        <input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required maxlength="256"
          [value]="currentPassword" (input)="currentPassword = inputValue($event)" [disabled]="busy()" />
        <label for="new-password">Nueva contraseña</label>
        <input id="new-password" name="newPassword" type="password" autocomplete="new-password" required minlength="1" maxlength="256"
          [value]="newPassword" (input)="newPassword = inputValue($event)" [disabled]="busy()" aria-describedby="password-guidance" />
        <p id="password-guidance" class="field-hint">Usá entre 15 y 128 caracteres. Se respetan mayúsculas y espacios.</p>
        <label for="confirm-password">Repetí la nueva contraseña</label>
        <input id="confirm-password" name="confirmation" type="password" autocomplete="new-password" required minlength="1" maxlength="256"
          [value]="confirmation" (input)="confirmation = inputValue($event)" [disabled]="busy()" />
        @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
        @if (staleCsrf()) { <button type="button" class="button-secondary" (click)="refreshSession()" [disabled]="refreshing()">{{ refreshing() ? 'Actualizando sesión…' : 'Actualizar sesión para un nuevo intento' }}</button> }
        @if (notice()) { <p class="form-success" role="status">{{ notice() }}</p> }
        <button type="submit" [disabled]="busy() || !passwordForm.checkValidity() || !passwordsValid() || newPassword !== confirmation">
          {{ busy() ? 'Guardando…' : 'Actualizar contraseña' }}
        </button>
      </form>
      }
      <button type="button" class="button-secondary" (click)="logout()" [disabled]="busy()">Cerrar sesión</button>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordPageComponent {
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  readonly mandatory = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly staleCsrf = signal(false);
  readonly refreshing = signal(false);
  readonly reauthenticationRequired = signal(false);
  currentPassword = '';
  newPassword = '';
  confirmation = '';

  constructor() { this.mandatory.set(this.auth.session()?.admin.mustChangePassword ?? false); }

  inputValue(event: Event): string { return (event.target as HTMLInputElement).value; }

  passwordsValid(): boolean {
    const currentLength = Array.from(this.currentPassword.normalize('NFC')).length;
    const newLength = Array.from(this.newPassword.normalize('NFC')).length;
    return currentLength >= 1 && currentLength <= 128 && newLength >= 15 && newLength <= 128;
  }

  async submit(): Promise<void> {
    if (this.busy() || this.reauthenticationRequired() || !this.passwordsValid() || this.newPassword !== this.confirmation) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.staleCsrf.set(false);
    try {
      const result = await this.auth.changePassword(this.currentPassword, this.newPassword);
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmation = '';
      this.mandatory.set(false);
      if (result === 'reauthenticate') {
        this.reauthenticationRequired.set(true);
        this.notice.set('La contraseña se actualizó. Inicia sesión con la nueva contraseña para continuar.');
        return;
      }
      this.notice.set('La contraseña se actualizó correctamente.');
      await this.router.navigateByUrl('/admin/usuarios');
    } catch (error: unknown) {
      const code = (error as { error?: { code?: string } } | null)?.error?.code;
      this.staleCsrf.set(code === 'CSRF_INVALID');
      this.error.set(passwordMessage(error));
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmation = '';
    } finally {
      this.busy.set(false);
    }
  }

  async refreshSession(): Promise<void> {
    this.refreshing.set(true);
    this.error.set('');
    this.staleCsrf.set(false);
    try {
      const session = await this.auth.refreshSession();
      if (!session) { await this.router.navigateByUrl('/admin/login'); return; }
      this.mandatory.set(session.admin.mustChangePassword);
      this.notice.set('Sesión actualizada. Ingresá nuevamente tus contraseñas para volver a intentar.');
    } catch { this.error.set('No se pudo actualizar la sesión. Iniciá sesión nuevamente.'); }
    finally { this.refreshing.set(false); }
  }

  async logout(): Promise<void> {
    try { await this.auth.logout(); } catch { this.error.set('No se pudo cerrar la sesión. Volvé a intentarlo.'); }
  }
}

function passwordMessage(error: unknown): string {
  const code = (error as { error?: { code?: string }; status?: number } | null)?.error?.code;
  if (code === 'PASSWORD_POLICY') return 'La contraseña no cumple la política de seguridad.';
  if (code === 'INVALID_CREDENTIALS' || (error as { status?: number } | null)?.status === 401) return 'La contraseña actual no es correcta o la sesión venció.';
  if (code === 'CSRF_INVALID') return 'La sesión se actualizó en otra pestaña. Actualizá la sesión e intentá nuevamente.';
  return 'No se pudo cambiar la contraseña. Revisá tu conexión e intentá nuevamente.';
}
