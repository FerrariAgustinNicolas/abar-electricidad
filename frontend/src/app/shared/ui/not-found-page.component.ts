import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'abar-not-found-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="not-found">
      <h1>Página no encontrada</h1>
      <p>La dirección solicitada no corresponde a una ruta de esta base H0.</p>
      <a routerLink="/">Volver al inicio</a>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPageComponent {}
