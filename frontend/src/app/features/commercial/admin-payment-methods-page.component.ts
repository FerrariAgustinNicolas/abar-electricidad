import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { CommercialApiService } from '../../core/commercial/commercial-api.service';
import {
  DeliveryMode,
  PaymentMethodCode,
  PaymentMethodView,
} from '../../core/commercial/commercial.models';

const CODES: PaymentMethodCode[] = [
  'DEMO_PAY_ON_PICKUP',
  'DEMO_TRANSFER',
  'DEMO_SIMULATION',
];

@Component({
  selector: 'abar-admin-payment-methods-page',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <p class="eyebrow">Administración · DEMO</p>
      <h1>Métodos de pago</h1>
      <p>Son métodos de demostración; no se procesan pagos reales ni se guardan datos bancarios.</p>
      @if (loading()) {
        <p role="status">Cargando métodos…</p>
      }
      @if (error()) {
        <p role="alert" class="alert">{{ error() }}</p>
      }
      <nav aria-label="Métodos de pago">
        @for (code of codes; track code) {
          <button type="button" [disabled]="saving()" (click)="select(code)">{{ labels[code] }}</button>
        }
      </nav>
      @if (method()) {
        <form (ngSubmit)="save()" #form="ngForm">
          <h2>{{ method()!.label }}</h2>
          <p>Versión {{ method()!.version }} · DEMO</p>
          <label><input name="enabled" type="checkbox" [disabled]="saving() || loading()" [(ngModel)]="enabled">
            Habilitado para nuevas compras</label>
          <label>Instrucciones ficticias
            <textarea name="instructions" required minlength="1" maxlength="500"
              [disabled]="saving() || loading()" [(ngModel)]="instructions"></textarea>
          </label>
          <fieldset [disabled]="saving() || loading()">
            <legend>Modalidades permitidas</legend>
            <label><input type="checkbox" [checked]="modes.includes('PICKUP')"
              (change)="toggle('PICKUP', $event)"> Retiro</label>
            <label><input type="checkbox" [checked]="modes.includes('COORDINATED')"
              (change)="toggle('COORDINATED', $event)"> Entrega coordinada</label>
          </fieldset>
          <button type="submit" [disabled]="saving() || loading() || form.invalid || !modes.length">
            {{ saving() ? 'Guardando…' : 'Guardar método' }}
          </button>
        </form>
      }
    </section>
  `,
  styles: [`
    .page { max-width: 52rem; margin: auto; padding: 1rem; }
    .page form { display: grid; gap: 1rem; margin-top: 1.5rem; }
    .page label { display: flex; gap: .5rem; align-items: center; }
    .page textarea { min-height: 6rem; padding: .6rem; font: inherit; }
    .page fieldset { display: grid; gap: .6rem; }
    .alert { padding: 1rem; color: #8a2d19; }
    .eyebrow { font-weight: 700; }
  `],
})
export class AdminPaymentMethodsPageComponent {
  private readonly api = inject(CommercialApiService);
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly codes = CODES;
  readonly labels: Record<PaymentMethodCode, string> = {
    DEMO_PAY_ON_PICKUP: 'Pago al retirar (DEMO)',
    DEMO_TRANSFER: 'Transferencia ficticia (DEMO)',
    DEMO_SIMULATION: 'Simulación (DEMO)',
  };
  readonly method = signal<PaymentMethodView | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  enabled = false;
  instructions = '';
  modes: DeliveryMode[] = [];

  constructor() {
    void this.select(CODES[0]);
  }

  private selectionGeneration = 0;

  async select(code: PaymentMethodCode): Promise<void> {
    if (this.saving()) return;
    const generation = ++this.selectionGeneration;
    this.loading.set(true);
    this.error.set('');
    try {
      const row = await firstValueFrom(this.api.getPaymentMethod(code));
      if (generation !== this.selectionGeneration) return;
      this.method.set(row);
      this.enabled = row.enabled;
      this.instructions = row.instructions;
      this.modes = [...row.deliveryModes];
    } catch (error: unknown) {
      if (generation === this.selectionGeneration) await this.handle(error, 'No se pudo cargar el método.');
    } finally {
      if (generation === this.selectionGeneration) this.loading.set(false);
    }
  }

  toggle(mode: DeliveryMode, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.modes = checked
      ? [...new Set([...this.modes, mode])]
      : this.modes.filter((value) => value !== mode);
  }

  async save(): Promise<void> {
    const current = this.method();
    if (!current || !this.modes.length || this.saving() || this.loading()) return;

    this.saving.set(true);
    this.error.set('');
    try {
      const row = await firstValueFrom(this.api.updatePaymentMethod(current.code, {
        expectedVersion: current.version,
        enabled: this.enabled,
        instructions: this.instructions,
        deliveryModes: [...this.modes],
      }));
      this.method.set(row);
      this.enabled = row.enabled;
      this.instructions = row.instructions;
      this.modes = [...row.deliveryModes];
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.error.set('No se guardó: la versión o la combinación de compra cambió. Vuelva a cargar el método antes de reintentar.');
      } else {
        await this.handle(error, 'No se pudo guardar el método.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  private async handle(error: unknown, fallback: string): Promise<void> {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.auth.expire();
      await this.router.navigate(['/admin/login'], {
        queryParams: { returnUrl: '/admin/metodos-pago' },
      });
    } else {
      this.error.set(error instanceof HttpErrorResponse && error.status === 403
        ? 'La sesión no permite modificar métodos de pago.'
        : fallback);
    }
  }
}
