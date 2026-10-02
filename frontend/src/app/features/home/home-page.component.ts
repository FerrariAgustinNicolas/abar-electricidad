import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HealthStatusComponent } from '../../shared/ui/health-status.component';

@Component({
  selector: 'abar-home-page',
  standalone: true,
  imports: [HealthStatusComponent],
  template: `
    <section class="hero" aria-labelledby="home-heading">
      <p class="eyebrow">Base visual H0</p>
      <h1 id="home-heading">ABAR Electricidad</h1>
      <p>Esqueleto público inicial. El catálogo y las compras todavía no están implementados.</p>
    </section>
    <abar-health-status />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent {}
