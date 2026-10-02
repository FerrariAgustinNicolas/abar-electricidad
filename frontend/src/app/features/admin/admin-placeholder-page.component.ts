import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'abar-admin-placeholder-page',
  standalone: true,
  template: `
    <h1>Administración</h1>
    <p>Base H0; no autenticación implementada.</p>
    <p>No hay operaciones administrativas ni datos privados disponibles.</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPlaceholderPageComponent {}
