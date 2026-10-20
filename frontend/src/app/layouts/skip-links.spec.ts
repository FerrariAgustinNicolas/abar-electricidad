import { Component, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthSessionService } from '../core/auth/auth-session.service';
import { AdminLayoutComponent } from './admin-layout.component';
import { PublicLayoutComponent } from './public-layout.component';

@Component({ standalone: true, template: '<h1>Fixture destination</h1>' })
class DestinationComponent {}

describe('Layout skip links', () => {
  afterEach(() => TestBed.resetTestingModule());

  it.each([
    { layout: PublicLayoutComponent, url: '/productos?unit=ROLL', id: 'contenido' },
    { layout: AdminLayoutComponent, url: '/admin/stock?unit=ROLL', id: 'admin-content' },
  ])('focuses $id without leaving $url or losing its filters', async ({ layout, url, id }) => {
    TestBed.configureTestingModule({
      imports: [layout],
      providers: [
        provideRouter([
          { path: 'productos', component: DestinationComponent },
          { path: 'admin/stock', component: DestinationComponent },
        ]),
        { provide: AuthSessionService, useValue: { session: () => null, logout: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(layout as Type<unknown>);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    await fixture.whenStable();
    const link = fixture.nativeElement.querySelector('.skip-link') as HTMLAnchorElement;
    const content = fixture.nativeElement.querySelector('#' + id) as HTMLElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });

    link.dispatchEvent(click);
    fixture.detectChanges();

    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(content);
    expect(router.url).toBe(url);
  });
});
