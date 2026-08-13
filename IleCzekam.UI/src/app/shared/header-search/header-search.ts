import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';

import { SearchIndexService } from '@core/search/search-index.service';
import { SearchMode } from '@core/search/search-params';

/**
 * Szukajka nagłówka - JEDEN komponent dla widoku wyników i stron miast (zero duplikatów).
 *
 * Formularz to natywny GET na /szukaj: na prerenderowanej stronie miasta działa
 * ZANIM (i bez) JS - dlatego nie jest wyspą @defer. Po hydratacji submit przechwytuje
 * router i nawigacja jest SPA. Podpowiedzi świadczeń dociągają się z indeksu po stronie
 * przeglądarki.
 */
@Component({
  selector: 'app-header-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="wrap"
      [class.open]="open()">
      @if (collapsible()) {
        <!-- Mobile na stronie miasta: lupa zamiast pola - szukajka nie zjada pierwszego ekranu. -->
        <button
          class="reveal"
          [attr.aria-expanded]="open()"
          (click)="open.set(!open())"
          type="button"
          aria-label="Pokaż wyszukiwarkę">
          <span aria-hidden="true">⌕</span>
        </button>
      }

      <form
        class="form"
        action="/szukaj"
        method="get"
        (submit)="submit($event, searchInput.value)">
        <label
          class="visually-hidden"
          for="header-search-input">
          Czego szukasz?
        </label>
        <div class="field">
          <span
            class="icon"
            aria-hidden="true">
            ⌕
          </span>
          <input
            id="header-search-input"
            #searchInput
            name="q"
            [value]="query()"
            type="search"
            autocomplete="off"
            list="benefit-options"
            placeholder="np. kardiolog, rezonans kolana" />
        </div>
        <input
          name="mode"
          [value]="effectiveMode()"
          type="hidden" />
        @if (city(); as chip) {
          <input
            name="miejscowosc"
            [value]="chip"
            type="hidden" />
        }
        <datalist id="benefit-options">
          @for (option of benefitOptions(); track option.value) {
            <option
              [value]="option.value"
              [attr.label]="option.label"></option>
          }
        </datalist>
      </form>

      @if (city(); as chip) {
        <a
          class="city-chip"
          [href]="clearHref()"
          (click)="clearCity($event)">
          {{ chip }}
          <span aria-hidden="true">×</span>
          <span class="visually-hidden">- usuń filtr miejscowości</span>
        </a>
      }
    </div>
  `,
  styles: `
    .wrap {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }

    .form {
      flex: 1;
      min-width: 0;
      display: flex;
    }

    .field {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 52px;
      background: #fff;
      border: 2px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      padding: 0 18px;
    }

    .icon {
      font-size: 20px;
      color: var(--color-accent-700);
    }

    .field input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: 0;
      background: transparent;
      font-family: inherit;
      font-size: 18px;
      color: var(--color-text);
      min-height: var(--touch-target);

      &::placeholder {
        color: var(--color-text-muted);
      }
    }

    .city-chip {
      flex: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 52px;
      padding: 0 18px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      background: var(--color-surface-muted);
      font-family: inherit;
      font-size: 17px;
      font-weight: 600;
      color: var(--color-text);
      text-decoration: none;
      cursor: pointer;

      &:hover {
        border-color: var(--color-border-strong);
      }
    }

    .reveal {
      display: none;
    }

    @media (max-width: 900px) {
      .city-chip {
        min-height: var(--touch-target);
        padding: 0 14px;
      }

      // Wariant zwijany (strona miasta): do rozwinięcia widać tylko lupę -
      // szukajka nie spycha hero z odpowiedzią poza pierwszy ekran.
      :host(.collapsible) .reveal {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--touch-target);
        min-height: var(--touch-target);
        border: 2px solid var(--color-border-strong);
        border-radius: var(--radius-pill);
        background: transparent;
        font-size: 22px;
        color: var(--color-text);
        cursor: pointer;
      }

      :host(.collapsible) .wrap:not(.open) .form,
      :host(.collapsible) .wrap:not(.open) .city-chip {
        display: none;
      }
    }
  `,
  host: { '[class.collapsible]': 'collapsible()' }
})
export class HeaderSearch implements OnInit {
  private readonly router = inject(Router);
  private readonly index = inject(SearchIndexService);

  /** Wstępna zawartość pola - fraza z URL-a albo etykieta świadczenia strony miasta. */
  readonly query = input('');
  /** Miejscowość chipa; `null` = bez chipa. */
  readonly city = input<string | null>(null);
  /** Tryb wyszukiwania zachowywany przy submit (widok wyników przekazuje bieżący). */
  readonly mode = input<SearchMode | null>(null);
  /** Mobile: lupa rozwijająca pole zamiast stale widocznej szukajki. */
  readonly collapsible = input(false);

  protected readonly open = signal(false);

  protected readonly effectiveMode = computed<SearchMode>(() =>
    this.city() !== null ? 'city' : (this.mode() ?? 'all')
  );

  /** Chip „×”: te same wyniki bez filtra miejscowości - działa też jako zwykły link. */
  protected readonly clearHref = computed(
    () => `/szukaj?q=${encodeURIComponent(this.query())}&mode=all`
  );

  protected readonly benefitOptions = computed(() => {
    const options: { value: string; label: string | null }[] = [];
    for (const group of this.index.benefits('')) {
      options.push({ value: group.label, label: null });
      for (const synonym of group.synonyms) {
        options.push({ value: synonym, label: group.label });
      }
    }
    return options;
  });

  ngOnInit(): void {
    // Indeks podpowiedzi tylko w przeglądarce - prerender renderuje formularz statycznie.
    if (typeof window !== 'undefined') {
      void this.index.load();
    }
  }

  protected submit(event: Event, value: string): void {
    event.preventDefault();
    const city = this.city();
    void this.router.navigate(['/szukaj'], {
      queryParams: {
        q: value.trim(),
        mode: this.effectiveMode(),
        ...(city === null ? {} : { miejscowosc: city })
      }
    });
  }

  protected clearCity(event: Event): void {
    event.preventDefault();
    void this.router.navigateByUrl(this.clearHref());
  }
}
