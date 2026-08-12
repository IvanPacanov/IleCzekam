import { ChangeDetectionStrategy, Component, ElementRef, signal, viewChild } from '@angular/core';

import { PopularCitiesPanel } from './popular-cities-panel';

/**
 * Wspólny nagłówek WSZYSTKICH widoków. Środek (<ng-content>) jest slotem -
 * widok wyników wstawia tam pole wyszukiwania.
 *
 * Panel „Popularne miasta” to wyspa @defer (on interaction z przyciskiem):
 * jego kod nie wchodzi do initial bundle prerenderowanych stron.
 */
@Component({
  selector: 'app-site-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PopularCitiesPanel],
  host: { '(keydown.escape)': 'closeCities()' },
  template: `
    <header class="site-header">
      <a class="logo" href="/">
        ilecze
        <span class="logo-accent">kam</span>
        .pl
      </a>

      <div class="slot"><ng-content /></div>

      <nav aria-label="Nawigacja główna">
        <div class="cities-wrap">
          <button
            class="cities-button"
            #citiesButton
            [attr.aria-expanded]="citiesOpen()"
            (click)="toggleCities()"
            type="button"
            aria-haspopup="dialog">
            Popularne miasta
          </button>

          @defer (on interaction(citiesButton)) {
            @if (citiesOpen()) {
              <div class="backdrop" (click)="closeCities()" aria-hidden="true"></div>
              <div class="panel-anchor">
                <app-popular-cities-panel (closed)="closeCities()" />
              </div>
            }
          }
        </div>
        <a href="/o-danych">O danych</a>
      </nav>
    </header>
  `,
  styles: `
    .site-header {
      display: flex;
      align-items: center;
      gap: 28px;
      padding: 18px 48px;
      max-width: 1280px;
      margin: 0 auto;
    }

    .logo {
      font-family: var(--font-display);
      font-size: 22px;
      color: var(--color-text);
      text-decoration: none;
      white-space: nowrap;
    }

    .logo-accent {
      color: var(--color-accent-700);
    }

    .slot {
      flex: 1;
      min-width: 0;
    }

    nav {
      display: flex;
      align-items: center;
      gap: 24px;
    }

    nav a,
    .cities-button {
      // Cel dotykowy min. 48px - elementy nagłówka też są klikane kciukiem.
      display: inline-flex;
      align-items: center;
      min-height: var(--touch-target);
      font-family: inherit;
      font-size: 17px;
      color: var(--color-text);
      text-decoration: none;
      white-space: nowrap;

      &:hover {
        color: var(--color-accent-700);
        text-decoration: underline;
      }
    }

    .cities-button {
      border: 0;
      background: transparent;
      padding: 0;
      cursor: pointer;

      &[aria-expanded='true'] {
        color: var(--color-accent-700);
        font-weight: 700;
      }
    }

    .cities-wrap {
      position: relative;
    }

    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 40;
      background: transparent;
    }

    .panel-anchor {
      position: absolute;
      top: calc(100% + 10px);
      right: 0;
      z-index: 50;
      width: min(640px, calc(100vw - 40px));
    }

    // Mobile: pełnoekranowy arkusz zamiast dymka.
    @media (max-width: 900px) {
      .site-header {
        padding: 14px 20px 6px;
        gap: 16px;
        flex-wrap: wrap;
      }

      .slot {
        order: 3;
        flex-basis: 100%;
      }

      nav {
        gap: 14px;
      }

      .panel-anchor {
        position: fixed;
        inset: 0;
        top: 68px;
        width: auto;
        overflow-y: auto;
      }

      .backdrop {
        background: rgba(32, 30, 29, 0.4);
      }
    }

    // Wąskie ekrany (390): nagłówek NIE MOŻE wymusić poziomego scrolla.
    @media (max-width: 480px) {
      .site-header {
        gap: 10px;
      }

      .logo {
        font-size: 19px;
      }

      nav {
        gap: 10px;
        min-width: 0;
      }

      nav a,
      .cities-button {
        font-size: 15px;
      }
    }
  `
})
export class SiteHeader {
  protected readonly citiesOpen = signal(false);

  private readonly citiesButton = viewChild.required<ElementRef<HTMLButtonElement>>('citiesButton');

  protected toggleCities(): void {
    this.citiesOpen.update((open) => !open);
  }

  protected closeCities(): void {
    if (this.citiesOpen()) {
      this.citiesOpen.set(false);
      // Fokus wraca na przycisk po zamknięciu - wymóg dostępności.
      this.citiesButton().nativeElement.focus();
    }
  }
}
