import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'abar-public-layout',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  template: `
    <a class="skip-link" href="#contenido" (click)="$event.preventDefault(); content.focus()">Saltar al contenido</a>
    <header class="site-header">
      <a class="brand" routerLink="/" aria-label="ABAR Electricidad, inicio">ABAR Electricidad</a>
      <nav aria-label="Navegación principal"><a routerLink="/">Inicio</a><a routerLink="/productos">Productos</a><a routerLink="/carrito">Carrito</a></nav>
    </header>
    <main #content id="contenido" tabindex="-1" class="site-main"><router-outlet /></main>
    <footer class="site-footer">
      <p>Referencia de diseño documentada: Home CORREGIDA (17:256); sin nueva inspección de Figma.</p>
      <p>ABAR Electricidad · Catálogo y disponibilidad. Compras próximamente.</p>
    </footer>
  `,
  styles: ['.site-header nav { display: flex; flex-wrap: wrap; gap: 1rem; }'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayoutComponent {}
