import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'abar-login-placeholder-page',
  standalone: true,
  template: `
    <h1>Acceso administrativo</h1>
    <p>Base H0; no autenticación implementada.</p>
    <p>No se solicitan credenciales ni se habilita acceso.</p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPlaceholderPageComponent {}
