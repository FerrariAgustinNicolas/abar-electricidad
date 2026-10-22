import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { CommercialApiService } from '../../core/commercial/commercial-api.service';
import {
  CommercialContact,
  DeliveryMode,
  SettingsView,
} from '../../core/commercial/commercial.models';

@Component({
  selector: 'abar-admin-settings-page',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <p class="eyebrow">Administración · DEMO</p>
      <h1>Configuración comercial</h1>
      <p>Los cambios afectan nuevas cotizaciones. Los pedidos existentes conservan sus importes.</p>

      @if (loading()) {
        <p role="status">Cargando configuración…</p>
      }
      @if (error()) {
        <p class="alert" role="alert">{{ error() }}</p>
      }
      @if (conflict()) {
        <section class="conflict" role="alert">
          <h2>La configuración cambió en otra sesión</h2>
          <p>El borrador se conservó. Recargue solo si desea reemplazarlo por la versión actual del servidor.</p>
          <button type="button" (click)="reload()">Descartar borrador y recargar</button>
        </section>
      }
      @if (settings()) {
        <form (ngSubmit)="save()" #form="ngForm">
          <p>Versión del servidor: {{ settings()!.version }}</p>
          <label>
            Tarifa fija de entrega coordinada (ARS, unidades menores)
            <input name="feeMinor" required pattern="^(0|[1-9][0-9]{0,18})$" [(ngModel)]="feeMinor"
              inputmode="numeric" aria-describedby="fee-help">
          </label>
          <small id="fee-help">Ingrese centavos como texto entero; no se redondean valores.</small>
          <fieldset>
            <legend>Modalidades habilitadas</legend>
            <label><input type="checkbox" [checked]="hasMode('PICKUP')"
              (change)="toggleMode('PICKUP', $event)"> Retiro en el local</label>
            <label><input type="checkbox" [checked]="hasMode('COORDINATED')"
              (change)="toggleMode('COORDINATED', $event)"> Entrega coordinada</label>
          </fieldset>
          <fieldset>
            <legend>Contacto comercial DEMO</legend>
            <label>Nombre visible
              <input name="displayName" required maxlength="100" [(ngModel)]="contact.displayName">
            </label>
            <label>Email ficticio
              <input name="email" required type="email" pattern="^[A-Za-z0-9._%+-]+@example\\.test$"
                [(ngModel)]="contact.email">
            </label>
            <label>Teléfono
              <input name="phone" maxlength="32" [(ngModel)]="contact.phone">
            </label>
            <label>WhatsApp internacional
              <input name="whatsapp" pattern="^(|\\+[1-9][0-9]{7,14})$" [(ngModel)]="contact.whatsapp">
            </label>
            <label>Horarios DEMO
              <textarea name="hours" maxlength="300" [(ngModel)]="contact.hours"></textarea>
            </label>
            <label>Dirección DEMO
              <textarea name="address" maxlength="300" [(ngModel)]="contact.address"></textarea>
            </label>
          </fieldset>
          <button type="submit" [disabled]="saving() || form.invalid || modes.length === 0 || !feeValid()">
            {{ saving() ? 'Guardando…' : 'Guardar configuración' }}
          </button>
        </form>
      }
      <p><a routerLink="/admin/metodos-pago">Administrar métodos de pago DEMO</a></p>
    </section>
  `,
  styles: [`
    .page { max-width: 56rem; margin: auto; padding: 1rem; }
    .page form { display: grid; gap: 1rem; }
    .page label { display: grid; gap: .35rem; }
    .page input:not([type=checkbox]), .page textarea {
      width: 100%; min-height: 2.75rem; padding: .55rem;
      border: 1px solid var(--color-border, #aab2bc); border-radius: .35rem; font: inherit;
    }
    .page fieldset { display: grid; gap: .7rem; border: 1px solid var(--color-border, #aab2bc); padding: 1rem; }
    .page fieldset label { display: flex; align-items: center; gap: .5rem; }
    .alert, .conflict { padding: 1rem; border: 1px solid #a53b2d; background: #fff4f1; }
    .eyebrow { font-weight: 700; }
  `],
})
export class AdminSettingsPageComponent {
  private readonly api = inject(CommercialApiService);
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly settings = signal<SettingsView | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly conflict = signal(false);

  feeMinor = '';
  modes: DeliveryMode[] = [];
  contact: CommercialContact = {
    displayName: '', email: '', phone: '', whatsapp: '', hours: '', address: '',
  };

  constructor() {
    void this.load();
  }

  hasMode(mode: DeliveryMode): boolean {
    return this.modes.includes(mode);
  }

  feeValid(): boolean {
    return /^(0|[1-9][0-9]{0,18})$/.test(this.feeMinor)
      && (this.feeMinor.length < 19 || this.feeMinor <= '9223372036854775807');
  }

  toggleMode(mode: DeliveryMode, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.modes = checked
      ? [...new Set([...this.modes, mode])]
      : this.modes.filter((value) => value !== mode);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const row = await firstValueFrom(this.api.getSettings());
      this.settings.set(row);
      this.copy(row);
      this.conflict.set(false);
    } catch (error: unknown) {
      await this.handle(error, 'No se pudo cargar la configuración.');
    } finally {
      this.loading.set(false);
    }
  }

  async reload(): Promise<void> {
    await this.load();
  }

  async save(): Promise<void> {
    const current = this.settings();
    if (!current || !this.modes.length || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const updated = await firstValueFrom(this.api.updateSettings({
        expectedVersion: current.version,
        feeMinor: this.feeMinor,
        enabledDeliveryModes: [...this.modes],
        contact: { ...this.contact },
      }));
      this.settings.set(updated);
      this.copy(updated);
      this.conflict.set(false);
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.conflict.set(true);
        this.error.set('No se guardaron los cambios: la versión quedó desactualizada. Tu borrador sigue disponible.');
      } else {
        await this.handle(error, 'No se pudo guardar la configuración.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  private copy(row: SettingsView): void {
    this.feeMinor = row.feeMinor;
    this.modes = [...row.enabledDeliveryModes];
    this.contact = { ...row.contact };
  }

  private async handle(error: unknown, fallback: string): Promise<void> {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.auth.expire();
      await this.router.navigate(['/admin/login'], {
        queryParams: { returnUrl: '/admin/configuracion' },
      });
    } else {
      this.error.set(error instanceof HttpErrorResponse && error.status === 403
        ? 'La sesión no permite modificar esta configuración.'
        : fallback);
    }
  }
}
