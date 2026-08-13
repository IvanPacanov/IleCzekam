import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { BenefitSuggestion, SearchIndexService } from '@core/search/search-index.service';
import { SearchMode } from '@core/search/search-params';
import { SearchIndexEntry } from '@models/serving';
import { SiteHeader } from '@shared/site-header/site-header';
import { cityName } from '@shared/format/city-name';
import { placesCount } from '@shared/format/pl-format';

interface CityLink {
  readonly label: string;
  readonly href: string;
  readonly meta: string;
}

/**
 * Widok 1 - strona startowa. Renderowana po stronie klienta (RenderMode.Client):
 * wyszukiwarka jest dynamiczna, a indeks świadczeń dociąga się z `/search-index.json`.
 */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiteHeader],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss'
})
export class HomePage implements OnInit {
  private readonly index = inject(SearchIndexService);
  private readonly router = inject(Router);

  protected readonly query = signal('');
  /** Zasięg: cała Polska / blisko mnie (geolokalizacja) / wskazana miejscowość. */
  protected readonly mode = signal<SearchMode>('all');
  protected readonly cityQuery = signal('');
  protected readonly state = this.index.state;

  protected readonly suggestions = computed<BenefitSuggestion[]>(() => this.index.benefits(this.query()));

  protected readonly cityMatches = computed<CityLink[]>(() =>
    this.index.cities(this.query()).map((entry) => ({
      label: `${entry.benefit_label} - ${cityName(entry.city)}`,
      href: this.searchHref(entry.benefit_slug, entry.city),
      meta: placesCount(entry.places_total)
    }))
  );

  /** Świadczenia dostępne w danych - kafelki „Najczęściej szukane”. */
  protected readonly popular = computed(() =>
    this.index.benefits('').map((benefit) => ({
      slug: benefit.slug,
      label: benefit.label,
      href: benefit.cities[0] === undefined ? '/' : `/swiadczenie/${benefit.slug}/${benefit.cities[0].city_slug}/`
    }))
  );

  protected readonly hasResults = computed(() => this.suggestions().length > 0 || this.cityMatches().length > 0);

  protected readonly showEmptyState = computed(
    () => this.state() === 'ready' && this.query().trim() !== '' && !this.hasResults()
  );

  ngOnInit(): void {
    void this.index.load();
  }

  protected onCityInput(value: string): void {
    this.cityQuery.set(value);
    this.mode.set('city');
  }

  /** Przejście do widoku wyników - parametry niosą zapytanie i zasięg. */
  protected submitSearch(event?: Event): void {
    event?.preventDefault();

    const mode = this.mode() === 'city' && this.cityQuery().trim() === '' ? 'all' : this.mode();
    void this.router.navigate(['/szukaj'], {
      queryParams: {
        q: this.query().trim(),
        mode,
        ...(mode === 'city' ? { miejscowosc: this.cityQuery().trim() } : {})
      }
    });
  }

  /**
   * Reguła routingu: z szukajki ZAWSZE do wyników. Każdy element panelu podpowiedzi
   * prowadzi do /szukaj - strony miast (widok 2) zostają dla Google, „Popularnych miast”,
   * mostka na wynikach i breadcrumbów.
   */
  protected searchHref(benefitSlug: string, city?: string): string {
    return city === undefined
      ? `/szukaj?q=${encodeURIComponent(benefitSlug)}&mode=all`
      : `/szukaj?q=${encodeURIComponent(benefitSlug)}&mode=city&miejscowosc=${encodeURIComponent(cityName(city))}`;
  }

  protected cityLabel(city: string): string {
    return cityName(city);
  }

  /** Czas na chipie - z tego samego źródła (fastest z indeksu), co nagłówek wyników. */
  protected chipTime(entry: SearchIndexEntry): string | null {
    return entry.fastest_label ?? (entry.median_days === null ? null : `${entry.median_days} dni`);
  }
}
