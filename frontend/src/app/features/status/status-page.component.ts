import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HealthStatusComponent } from '../../shared/ui/health-status.component';

@Component({
  selector: 'abar-status-page',
  standalone: true,
  imports: [HealthStatusComponent],
  template: `<h1>Estado del servicio</h1><abar-health-status />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusPageComponent {}
