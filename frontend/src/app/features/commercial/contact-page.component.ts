import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CommercialApiService } from '../../core/commercial/commercial-api.service';
import { PublicContact } from '../../core/commercial/commercial.models';

@Component({
  selector: 'abar-contact-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <p class="eyebrow">Información de demostración</p>
      <h1>Contacto</h1>
      @if (loading()) {
        <p role="status">Cargando información…</p>
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      @if (contact(); as data) {
        <p class="demo">Datos ficticios de demostración; no representan información comercial confirmada.</p>
        <h2>{{ data.contact.displayName }}</h2>
        <dl>
          <dt>Email DEMO</dt>
          <dd><a [href]="'mailto:' + data.contact.email">{{ data.contact.email }}</a></dd>
          <dt>Teléfono DEMO</dt>
          <dd>{{ data.contact.phone || 'No configurado' }}</dd>
          <dt>Horarios DEMO</dt>
          <dd>{{ data.contact.hours || 'No configurados' }}</dd>
          <dt>Dirección DEMO</dt>
          <dd>{{ data.contact.address || 'No configurada' }}</dd>
        </dl>
        @if (whatsappUrl(data.contact.whatsapp); as url) {
          <a class="button" [href]="url" target="_blank" rel="noopener noreferrer">
            Abrir WhatsApp manualmente
          </a>
        }
      }
    </section>
  `,
  styles: [`
    .page { max-width: 48rem; margin: auto; padding: 1rem; }
    .demo { padding: 1rem; background: #fff4d8; border: 1px solid #b08027; }
    .page dt { font-weight: 700; margin-top: 1rem; }
    .page dd { margin: .25rem 0; }
    .eyebrow { font-weight: 700; }
  `],
})
export class ContactPageComponent {
  private readonly api = inject(CommercialApiService);

  readonly contact = signal<PublicContact | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.contact.set(await firstValueFrom(this.api.getPublicContact()));
    } catch (error: unknown) {
      this.error.set(error instanceof HttpErrorResponse && error.status === 503
        ? 'La información de contacto no está disponible por el momento.'
        : 'No se pudo cargar la información de contacto.');
    } finally {
      this.loading.set(false);
    }
  }

  whatsappUrl(value: string): string | null {
    return /^\+[1-9][0-9]{7,14}$/.test(value)
      ? `https://wa.me/${value.slice(1)}`
      : null;
  }
}
