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
      <nav aria-label="Navegación principal"><a routerLink="/">Inicio</a><a routerLink="/productos">Productos</a></nav>
    </header>
    <main id="contenido" class="site-main"><router-outlet /></main>
    <footer class="site-footer">
      <p>Referencia de diseño documentada: Home CORREGIDA (17:256); sin nueva inspección de Figma.</p>
      <p>ABAR Electricidad · Catálogo y disponibilidad. Compras próximamente.</p>
    </footer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayoutComponent {}
