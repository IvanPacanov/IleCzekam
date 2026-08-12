import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  output,
  signal
} from '@angular/core';

import { POPULAR_CITIES_LIMIT, POPULAR_CITY_SLUGS } from '@core/config/popular-cities';
import { SearchIndexService } from '@core/search/search-index.service';
import { SearchIndexEntry } from '@models/serving';
import { cityName } from '@shared/format/city-name';

interface PanelCity {
  readonly slug: string;
  readonly name: string;
  readonly entries: readonly SearchIndexEntry[];
}

/**
 * Zawartość panelu „Popularne miasta”: miasto → popularne świadczenia w nim.
 * Pokazuje WYŁĄCZNIE pary (miasto, świadczenie) obecne w indeksie wyszukiwarki,
 * czyli takie, które mają prerenderowaną stronę - zero linków do 404.
 *
 * Ładowany przez @defer w nagłówku - nie wchodzi do initial bundle.
 */
@Component({
  selector: 'app-popular-cities-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { tabindex: '-1', role: 'dialog', 'aria-label': 'Popularne miasta' },
  template: `
    @if (state() === 'error') {
      <p class="note">Nie udało się wczytać listy miast - odśwież stronę.</p>
    } @else if (cities().length === 0) {
      <p class="note">Wczytuję listę miast…</p>
    } @else {
      <div class="columns">
        <section aria-label="Miasta">
          <p class="metric-label">Miasta</p>
          <ul class="cities">
            @for (city of cities(); track city.slug) {
              <li>
                <button
                  [class.active]="city.slug === selectedSlug()"
                  [attr.aria-expanded]="city.slug === selectedSlug()"
                  (click)="select(city.slug)"
                  type="button">
                  {{ city.name }}
                </button>
              </li>
            }
          </ul>
        </section>

        @if (selected(); as city) {
          <section class="benefits" [attr.aria-label]="'Świadczenia - ' + city.name" aria-live="polite">
            <p class="metric-label">Świadczenia - {{ city.name }}</p>
            <ul>
              @for (entry of city.entries; track entry.benefit_slug) {
                <li>
                  <a [href]="'/swiadczenie/' + entry.benefit_slug + '/' + city.slug + '/'" (click)="closed.emit()">
                    {{ entry.benefit_label }}
                  </a>
                </li>
              }
            </ul>
          </section>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      background: var(--color-surface-muted);
      border: 1px solid var(--color-border);
      border-radius: 24px;
      box-shadow: var(--shadow-raised);
      padding: 18px 20px;
      outline: none;
    }

    .note {
      margin: 0;
      font-size: 16px;
      color: var(--color-text-secondary);
    }

    .metric-label {
      margin: 0 0 10px;
    }

    .columns {
      display: grid;
      grid-template-columns: auto minmax(260px, 1fr);
      gap: 22px;
    }

    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .cities {
      display: grid;
      grid-template-columns: repeat(2, minmax(140px, 1fr));
      gap: 4px;

      button {
        width: 100%;
        min-height: var(--touch-target);
        padding: 0 14px;
        border: 0;
        border-radius: var(--radius-pill);
        background: transparent;
        font-family: inherit;
        font-size: 17px;
        color: var(--color-text);
        text-align: left;
        cursor: pointer;

        &:hover {
          background: var(--color-surface);
        }

        &.active {
          background: var(--color-accent-700);
          color: var(--color-on-accent);
          font-weight: 700;
        }
      }
    }

    .benefits {
      border-left: 1px solid var(--color-border);
      padding-left: 22px;

      a {
        display: flex;
        align-items: center;
        min-height: var(--touch-target);
        padding: 0 12px;
        border-radius: 14px;
        font-size: 17px;
        color: var(--color-text);
        text-decoration: none;

        &:hover {
          background: var(--color-surface);
          color: var(--color-accent-700);
        }
      }
    }

    // Mobile: sekcje jedna pod drugą (arkusz przewijany), świadczenia bez linii podziału.
    @media (max-width: 900px) {
      :host {
        border-radius: 0;
        border: 0;
        box-shadow: none;
        padding: 14px 20px 28px;
      }

      .columns {
        grid-template-columns: 1fr;
        gap: 18px;
      }

      .cities {
        grid-template-columns: repeat(2, 1fr);
      }

      .benefits {
        border-left: 0;
        padding-left: 0;
      }
    }
  `
})
export class PopularCitiesPanel implements OnInit {
  private readonly index = inject(SearchIndexService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Zamknięcie panelu (wybrano link) - nagłówek chowa panel i oddaje fokus. */
  readonly closed = output<void>();

  protected readonly state = this.index.state;
  protected readonly selectedSlug = signal<string | null>(null);

  protected readonly cities = computed<PanelCity[]>(() => {
    const byCity = new Map<string, { name: string; entries: SearchIndexEntry[] }>();

    for (const entry of this.index.entries()) {
      const city = byCity.get(entry.city_slug) ?? { name: cityName(entry.city), entries: [] };
      city.entries.push(entry);
      byCity.set(entry.city_slug, city);
    }

    const rank = (slug: string): number => {
      const position = POPULAR_CITY_SLUGS.indexOf(slug);
      return position === -1 ? POPULAR_CITY_SLUGS.length : position;
    };

    return [...byCity.entries()]
      .map(([slug, city]) => ({
        slug,
        name: city.name,
        // Najpierw świadczenia z największą liczbą placówek - „popularne”.
        entries: [...city.entries].sort((a, b) => b.places_total - a.places_total)
      }))
      .sort(
        (a, b) =>
          rank(a.slug) - rank(b.slug) || b.entries.length - a.entries.length || a.name.localeCompare(b.name, 'pl')
      )
      .slice(0, POPULAR_CITIES_LIMIT);
  });

  protected readonly selected = computed<PanelCity | null>(() => {
    const cities = this.cities();
    return cities.find((city) => city.slug === this.selectedSlug()) ?? cities[0] ?? null;
  });

  ngOnInit(): void {
    void this.index.load();
    // Fokus wchodzi do panelu przy otwarciu - wymóg dostępności z projektu.
    queueMicrotask(() => this.host.nativeElement.focus());
  }

  protected select(slug: string): void {
    this.selectedSlug.set(slug);
  }
}
