import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { HealthApiService } from '../../core/health/health-api.service';

export type HealthViewState = 'loading' | 'ok' | 'error';

@Component({
  selector: 'abar-health-status',
  standalone: true,
  template: `
    <section class="health-card" aria-labelledby="health-heading">
      <h2 id="health-heading">Estado del servicio</h2>
      @if (state() === 'loading') {
        <p role="status">Consultando el estado del servicio…</p>
      } @else if (state() === 'ok') {
        <p role="status">API y base de datos disponibles.</p>
      } @else {
        <p role="alert">No se pudo verificar el estado del servicio.</p>
        <button type="button" (click)="retry()" [disabled]="state() === 'loading'">Volver a comprobar</button>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HealthStatusComponent implements OnInit {
  readonly state = signal<HealthViewState>('loading');

  private readonly healthApi = inject(HealthApiService);

  ngOnInit(): void {
    this.retry();
  }

  retry(): void {
    this.state.set('loading');
    this.healthApi.check().subscribe({
      next: () => this.state.set('ok'),
      error: () => this.state.set('error'),
    });
  }
}
