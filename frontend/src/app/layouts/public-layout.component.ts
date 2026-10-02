import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'abar-public-layout',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  template: `
    <a class="skip-link" href="#contenido">Saltar al contenido</a>
    <header class="site-header">
      <a class="brand" routerLink="/" aria-label="ABAR Electricidad, inicio">ABAR Electricidad</a>
      <nav aria-label="Navegación principal"><a routerLink="/">Inicio</a></nav>
    </header>
    <main id="contenido" class="site-main"><router-outlet /></main>
    <footer class="site-footer">
      <p>Base H0 · referencia documental: Home CORREGIDA (17:256); no es acceso ni reproducción directa de Figma.</p>
      <p>ABAR Electricidad · Interfaz inicial sin funciones comerciales.</p>
    </footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayoutComponent {}
