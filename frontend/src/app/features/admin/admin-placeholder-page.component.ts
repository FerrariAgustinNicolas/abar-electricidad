import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminUserList, AdminUserView } from '../../core/auth/auth.models';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';

interface UserDraft { name: string; active: boolean; }

@Component({
  selector: 'abar-admin-users-page',
  standalone: true,
  template: `
    <section aria-labelledby="users-title">
      <header class="page-heading">
        <div><p class="eyebrow">Administración</p><h1 id="users-title">Usuarios administradores</h1>
          <p>Las cuentas administrativas tienen las mismas capacidades.</p></div>
        <button type="button" class="button-secondary" (click)="load()" [disabled]="loading()">Actualizar listado</button>
      </header>

      @if (error()) {
        <div class="form-error" role="alert"><p>{{ error() }}</p>
          @if (staleCsrf()) { <button type="button" class="button-secondary" (click)="refreshSession()" [disabled]="refreshing()">{{ refreshing() ? 'Actualizando sesión…' : 'Actualizar sesión para un nuevo intento' }}</button> }
          @if (loadFailed()) { <button type="button" class="button-secondary" (click)="load()">Reintentar carga</button> }
        </div>
      }

      <details class="panel create-panel" [open]="createOpen()">
        <summary (click)="createOpen.set(!createOpen())">Crear usuario administrador</summary>
        <form (submit)="$event.preventDefault(); createUser()" #createForm novalidate>
          <div class="form-grid">
            <label>Nombre<input name="newName" required maxlength="200" [value]="newName" (input)="newName = inputValue($event)" [disabled]="busy()" /></label>
            <label>Correo electrónico<input name="newEmail" type="email" required maxlength="254" autocomplete="off" [value]="newEmail" (input)="newEmail = inputValue($event)" [disabled]="busy()" /></label>
            <label>Contraseña temporal<input name="newPassword" type="password" required minlength="1" maxlength="256" autocomplete="new-password" [value]="newPassword" (input)="newPassword = inputValue($event)" [disabled]="busy()" /></label>
          </div>
          <p class="field-hint">La persona deberá cambiar esta contraseña al ingresar. Mínimo 15 caracteres.</p>
          <button type="submit" [disabled]="busy() || !createForm.checkValidity() || !newUserFieldsValid()">{{ busy() ? 'Guardando…' : 'Crear usuario' }}</button>
        </form>
      </details>

      @if (loading() && !users()) { <p role="status">Cargando usuarios…</p> }
      @if (!loading() && users()?.items?.length === 0) { <p class="empty-state">Todavía no hay usuarios para mostrar.</p> }
      @if (users()?.items?.length) {
        <div class="table-wrap">
          <table>
            <caption>Administradores registrados</caption>
            <thead><tr><th scope="col">Nombre y correo</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
            <tbody>
              @for (user of users()!.items; track user.id) {
                <tr>
                  <td><label [for]="'name-' + user.id">Nombre</label>
                    <input [id]="'name-' + user.id" [name]="'name-' + user.id" maxlength="200" [value]="draftFor(user).name" (input)="setDraftName(user, $event)" [disabled]="busy()" />
                    <span class="user-email">{{ user.email }}</span>
                    @if (user.mustChangePassword) { <span class="status-badge">Debe cambiar contraseña</span> }
                    <small>Versión {{ user.version }}</small>
                  </td>
                  <td>{{ user.active ? 'Activa' : 'Inactiva' }}</td>
                  <td class="action-cell">
                    <button type="button" (click)="saveUser(user)" [disabled]="busy() || !draftChanged(user)">Guardar cambios</button>
                    <button type="button" class="button-secondary" (click)="toggleActive(user)" [disabled]="busy()">{{ user.active ? 'Desactivar' : 'Activar' }}</button>
                    <details class="reset-panel"><summary>Restablecer contraseña</summary>
                      <form (submit)="$event.preventDefault(); resetPassword(user)" #resetForm novalidate>
                        <label [for]="'reset-password-' + user.id">Contraseña temporal</label>
                        <input [id]="'reset-password-' + user.id" [name]="'reset-password-' + user.id" type="password" required minlength="1" maxlength="256" autocomplete="new-password" [value]="resetDrafts[user.id].password" (input)="resetDrafts[user.id].password = inputValue($event)" [disabled]="busy()" />
                        <label [for]="'reset-reason-' + user.id">Motivo</label>
                        <textarea [id]="'reset-reason-' + user.id" [name]="'reset-reason-' + user.id" required maxlength="500" [value]="resetDrafts[user.id].reason" (input)="resetDrafts[user.id].reason = inputValue($event)" [disabled]="busy()"></textarea>
                        <button type="submit" [disabled]="busy() || !resetForm.checkValidity() || !resetPasswordValid(user)">Restablecer</button>
                      </form>
                    </details>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <nav class="pagination" aria-label="Paginación de usuarios">
          <button type="button" class="button-secondary" (click)="changePage(page() - 1)" [disabled]="loading() || page() <= 1">Anterior</button>
          <span>Página {{ page() }} de {{ users()!.pageInfo.totalPages || 1 }} · {{ users()!.pageInfo.totalItems }} usuarios</span>
          <button type="button" class="button-secondary" (click)="changePage(page() + 1)" [disabled]="loading() || page() >= users()!.pageInfo.totalPages">Siguiente</button>
        </nav>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPlaceholderPageComponent {
  private readonly api = inject(AuthApiService);
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  readonly users = signal<AdminUserList | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly refreshing = signal(false);
  readonly error = signal('');
  readonly staleCsrf = signal(false);
  readonly loadFailed = signal(false);
  readonly createOpen = signal(false);
  readonly page = signal(1);
  private requestedPage = 1;
  newName = '';
  newEmail = '';
  newPassword = '';
  readonly drafts: Record<string, UserDraft> = {};
  readonly resetDrafts: Record<string, { password: string; reason: string }> = {};

  constructor() { void this.load(); }

  inputValue(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement).value; }

  setDraftName(user: AdminUserView, event: Event): void { this.draftFor(user).name = this.inputValue(event); }

  draftFor(user: AdminUserView): UserDraft {
    return this.drafts[user.id] ??= { name: user.name, active: user.active };
  }

  newUserFieldsValid(): boolean {
    const nameLength = Array.from(this.newName).length;
    const passwordLength = Array.from(this.newPassword.normalize('NFC')).length;
    return nameLength >= 1 && nameLength <= 100 && this.newEmail.trim().length > 0 && passwordLength >= 15 && passwordLength <= 128;
  }

  resetPasswordValid(user: AdminUserView): boolean {
    const password = this.resetDrafts[user.id]?.password ?? '';
    const length = Array.from(password.normalize('NFC')).length;
    return length >= 15 && length <= 128;
  }

  draftChanged(user: AdminUserView): boolean {
    const draft = this.draftFor(user);
    return draft.name !== user.name || draft.active !== user.active;
  }

  async load(page = this.requestedPage): Promise<void> {
    if (this.loading()) return;
    this.requestedPage = page;
    this.loading.set(true);
    this.error.set('');
    this.loadFailed.set(false);
    try {
      const result = await firstValueFrom(this.api.listUsers(page, 20, '-createdAt'));
      this.users.set(result);
      this.page.set(result.pageInfo.page);
      this.requestedPage = result.pageInfo.page;
      for (const user of result.items) {
        this.drafts[user.id] = { name: user.name, active: user.active };
        this.resetDrafts[user.id] ??= { password: '', reason: '' };
      }
    } catch (error: unknown) {
      await this.reportError(error, true);
    } finally {
      this.loading.set(false);
    }
  }

  async createUser(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.api.createUser({ name: this.newName, email: this.newEmail.trim(), temporaryPassword: this.newPassword }, this.auth.getTokenOrThrow()));
      this.newName = ''; this.newEmail = ''; this.newPassword = '';
      this.createOpen.set(false);
      await this.load(1);
    } catch (error: unknown) { await this.reportError(error); }
    finally { this.busy.set(false); }
  }

  async saveUser(user: AdminUserView): Promise<void> {
    const draft = this.draftFor(user);
    const nameLength = Array.from(draft.name).length;
    if (this.busy() || !this.draftChanged(user)) return;
    if (nameLength < 1 || nameLength > 100) { this.error.set('El nombre debe tener entre 1 y 100 caracteres.'); return; }
    this.busy.set(true); this.error.set('');
    try {
      const patch: { name?: string; active?: boolean; expectedVersion: number } = { expectedVersion: user.version };
      if (draft.name !== user.name) patch.name = draft.name;
      if (draft.active !== user.active) patch.active = draft.active;
      await firstValueFrom(this.api.updateUser(user.id, patch, this.auth.getTokenOrThrow()));
      await this.load();
    } catch (error: unknown) { await this.reportError(error); }
    finally { this.busy.set(false); }
  }

  async toggleActive(user: AdminUserView): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      await firstValueFrom(this.api.updateUser(user.id, { active: !user.active, expectedVersion: user.version }, this.auth.getTokenOrThrow()));
      await this.load();
    } catch (error: unknown) { await this.reportError(error); }
    finally { this.busy.set(false); }
  }

  async resetPassword(user: AdminUserView): Promise<void> {
    const draft = this.resetDrafts[user.id];
    if (this.busy() || !draft) return;
    this.busy.set(true); this.error.set('');
    try {
      await firstValueFrom(this.api.resetPassword(user.id, { temporaryPassword: draft.password, reason: draft.reason }, this.auth.getTokenOrThrow()));
      draft.password = ''; draft.reason = '';
      await this.load();
    } catch (error: unknown) { await this.reportError(error); }
    finally { this.busy.set(false); }
  }

  async changePage(page: number): Promise<void> {
    const max = this.users()?.pageInfo.totalPages ?? 1;
    if (this.loading() || page < 1 || page > max || page === this.page()) return;
    await this.load(page);
  }

  async refreshSession(): Promise<void> {
    this.refreshing.set(true);
    this.error.set('');
    this.staleCsrf.set(false);
    try {
      const session = await this.auth.refreshSession();
      if (!session) { await this.router.navigate(['/admin/login'], { queryParams: { returnUrl: '/admin/usuarios' } }); return; }
      this.error.set('Sesión actualizada. Elegí nuevamente la acción que querías realizar.');
    } catch { this.error.set('No se pudo actualizar la sesión. Iniciá sesión nuevamente.'); }
    finally { this.refreshing.set(false); }
  }

  private async reportError(error: unknown, loading = false): Promise<void> {
    const status = (error as { status?: number } | null)?.status;
    const code = (error as { error?: { code?: string } } | null)?.error?.code;
    this.staleCsrf.set(status === 403 && code === 'CSRF_INVALID');
    this.loadFailed.set(loading);
    if (status === 401) {
      this.error.set('La sesión venció. Iniciá sesión nuevamente.');
      this.auth.expire();
      await this.router.navigate(['/admin/login'], { queryParams: { returnUrl: '/admin/usuarios' } });
    } else if (code === 'LAST_ACTIVE_ADMIN') this.error.set('No se puede desactivar la última cuenta administradora activa.');
    else if (code === 'VERSION_CONFLICT') this.error.set('Otro cambio actualizó este usuario. Actualizá el listado antes de volver a intentar.');
    else if (code === 'EMAIL_IN_USE') this.error.set('Ya existe una cuenta con ese correo electrónico.');
    else if (code === 'PASSWORD_POLICY') this.error.set('La contraseña temporal no cumple la política de seguridad.');
    else if (code === 'USER_NOT_FOUND') this.error.set('El usuario ya no está disponible. Actualizá el listado.');
    else if (this.staleCsrf()) this.error.set('La sesión cambió en otra pestaña. No se repitió la acción. Actualizá la sesión para un nuevo intento.');
    else if (status === 403) this.error.set('No tenés autorización para esta operación.');
    else this.error.set(loading ? 'No se pudo cargar el listado de usuarios.' : 'No se pudo completar la operación. Revisá tu conexión e intentá nuevamente.');
  }
}
