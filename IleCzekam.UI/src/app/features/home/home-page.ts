import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';

import { BenefitSuggestion, SearchIndexService } from '@core/search/search-index.service';
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
  styleUrl: './home-page.scss',
})
export class HomePage implements OnInit {
  private readonly index = inject(SearchIndexService);

  protected readonly query = signal('');
  protected readonly state = this.index.state;

  protected readonly suggestions = computed<BenefitSuggestion[]>(() =>
    this.index.benefits(this.query()),
  );

  protected readonly cityMatches = computed<CityLink[]>(() =>
    this.index.cities(this.query()).map((entry) => ({
      label: `${entry.benefit_label} - ${cityName(entry.city)}`,
      href: `/swiadczenie/${entry.benefit_slug}/${entry.city_slug}/`,
      meta: placesCount(entry.places_total),
    })),
  );

  /** Świadczenia dostępne w danych - kafelki „Najczęściej szukane”. */
  protected readonly popular = computed(() =>
    this.index.benefits('').map((benefit) => ({
      slug: benefit.slug,
      label: benefit.label,
      href: benefit.cities[0] === undefined
        ? '/'
        : `/swiadczenie/${benefit.slug}/${benefit.cities[0].city_slug}/`,
    })),
  );

  protected readonly hasResults = computed(
    () => this.suggestions().length > 0 || this.cityMatches().length > 0,
  );

  protected readonly showEmptyState = computed(
    () => this.state() === 'ready' && this.query().trim() !== '' && !this.hasResults(),
  );

  ngOnInit(): void {
    void this.index.load();
  }

  protected cityHref(benefitSlug: string, citySlug: string): string {
    return `/swiadczenie/${benefitSlug}/${citySlug}/`;
  }

  protected cityLabel(city: string): string {
    return cityName(city);
  }
}
