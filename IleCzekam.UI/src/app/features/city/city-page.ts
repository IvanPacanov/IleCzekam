import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import { cityCoords } from '@core/search/city-coords';
import { distanceKm } from '@core/search/geo';
import { Place, SearchIndexEntry, ServingFile, VALIDATION_FLAG } from '@models/serving';
import { DataNotice } from '@shared/data-notice/data-notice';
import { HeaderSearch } from '@shared/header-search/header-search';
import { PlaceCard } from '@shared/place-card/place-card';
import { SiteHeader } from '@shared/site-header/site-header';
import { WaitPill } from '@shared/wait-pill/wait-pill';
import { cityHeadline, cityLocative, cityName } from '@shared/format/city-name';
import { directionsUrl } from '@shared/format/directions';
import {
  dateLabel,
  daysApprox,
  monthAfterZa,
  monthLabel,
  monthRoman,
  peopleWaiting,
  phoneDisplay,
  phoneHref,
  placesCount,
  placesGenitive,
  plural,
  titleCasePl,
} from '@shared/format/pl-format';

interface ComparisonBar {
  readonly label: string;
  readonly days: number;
  readonly text: string;
  readonly widthPercent: number;
  readonly tone: 'city' | 'province' | 'best';
}

interface TrendBar {
  readonly month: string;
  readonly label: string;
  readonly text: string;
  readonly heightPercent: number;
  readonly bucket: string;
}

/** Kody oddziałów NFZ 01–16 (NIE TERYT) - patrz RECON.md, sekcja 1. */
const PROVINCE_NAMES: Record<string, string> = {
  '01': 'dolnośląskie', '02': 'kujawsko-pomorskie', '03': 'lubelskie', '04': 'lubuskie',
  '05': 'łódzkie', '06': 'małopolskie', '07': 'mazowieckie', '08': 'opolskie',
  '09': 'podkarpackie', '10': 'podlaskie', '11': 'pomorskie', '12': 'śląskie',
  '13': 'świętokrzyskie', '14': 'warmińsko-mazurskie', '15': 'wielkopolskie',
  '16': 'zachodniopomorskie',
};

/** Ile placówek pokazujemy przed kliknięciem „Pokaż wszystkie”. */
const COLLAPSED_PLACES = 3;

@Component({
  selector: 'app-city-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiteHeader, HeaderSearch, DataNotice, WaitPill, PlaceCard],
  templateUrl: './city-page.html',
  styleUrl: './city-page.scss',
})
export class CityPage {
  /** Wstrzykiwane przez router (withComponentInputBinding + resolve). */
  readonly serving = input.required<ServingFile>();
  /** Indeks wyszukiwarki - zasila bloki krzyżowe (resolver, w prerenderze z dysku). */
  readonly searchIndex = input<SearchIndexEntry[]>([]);

  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  protected readonly expanded = signal(false);
  protected readonly showUrgent = signal(false);
  protected readonly copied = signal(false);

  protected readonly city = computed(() => cityName(this.serving().scope.name));
  protected readonly headline = computed(() =>
    cityHeadline(this.serving().benefit.label, this.serving().scope.name),
  );
  protected readonly snapshotLabel = computed(() => monthLabel(this.serving().snapshot_month));
  /** Forma po przyimku „za”: „dane za sierpień 2026”. */
  protected readonly snapshotAfterZa = computed(() => monthAfterZa(this.serving().snapshot_month));

  /** Miasto w miejscowniku („w Gliwicach”); bez znanej formy - nazwa mianownikowa. */
  protected readonly cityIn = computed(() => {
    const locative = cityLocative(this.serving().scope.name);
    return locative === null ? `mieście ${this.city()}` : locative;
  });

  protected readonly provinceName = computed(() => PROVINCE_NAMES[this.serving().scope.province] ?? this.serving().scope.province);
  protected readonly benefitLower = computed(() => this.serving().benefit.label.toLocaleLowerCase('pl-PL'));

  protected readonly summary = computed(() => this.serving().summary);
  protected readonly lowSample = computed(() =>
    this.summary().flags.includes(VALIDATION_FLAG.lowSample),
  );

  /** Pigułka nagłówka-odpowiedzi zbudowana z mediany miasta. */
  protected readonly medianWait = computed(() => ({
    pcus_raw: null,
    raw_days: this.summary().median_days,
    human_label: this.summary().median_label,
    bucket: this.summary().median_bucket,
    as_at: null,
  }));

  protected readonly places = computed(() => {
    const places = [...this.serving().places];
    // Najpierw najkrótsze terminy; placówki bez danych na końcu, ale NA LIŚCIE.
    return places.sort((a, b) => {
      const left = this.sortKey(a);
      const right = this.sortKey(b);
      return left - right;
    });
  });

  protected readonly urgentPlaces = computed(() =>
    this.places().filter((place) => place.wait_urgent !== null && place.wait_urgent.raw_days !== null),
  );

  protected readonly visiblePlaces = computed(() =>
    this.expanded() ? this.places() : this.places().slice(0, COLLAPSED_PLACES),
  );

  protected readonly hiddenCount = computed(() =>
    Math.max(0, this.places().length - COLLAPSED_PLACES),
  );

  protected readonly placesHeading = computed(() => {
    const count = this.serving().summary.places_total;
    return `${count} ${plural(count, 'placówka', 'placówki', 'placówek')} - ${this.city()}`;
  });

  protected readonly fastestPhone = computed(() => {
    const fastest = this.summary().fastest;
    if (fastest === null) {
      return null;
    }

    const place = this.serving().places.find((candidate) => candidate.id === fastest.place_id);
    return place?.phone == null ? null : { text: phoneDisplay(place.phone), href: phoneHref(place.phone) };
  });

  protected readonly fastestPlace = computed(() => {
    const fastest = this.summary().fastest;
    return fastest === null
      ? null
      : this.serving().places.find((candidate) => candidate.id === fastest.place_id) ?? null;
  });

  /** Komplet „jak dojechać”: adres, trasa i telefon w jednym bloku nagłówka-odpowiedzi. */
  protected readonly fastestAddress = computed(() => {
    const place = this.fastestPlace();
    return place === null ? null : titleCasePl(`${place.address}, ${place.locality}`);
  });

  protected readonly fastestRoute = computed(() => {
    const place = this.fastestPlace();
    return place === null
      ? null
      : {
          href: directionsUrl(place),
          ariaLabel: `Wyznacz trasę do ${titleCasePl(place.provider)} w Mapach Google (otwiera nową kartę)`,
        };
  });

  protected readonly fastestName = computed(() => {
    const fastest = this.summary().fastest;
    return fastest === null ? '' : titleCasePl(fastest.provider);
  });

  protected readonly lowSampleText = computed(() => placesGenitive(this.summary().places_with_data));

  protected readonly fastestStats = computed(() => {
    const place = this.fastestPlace();
    const fastest = this.summary().fastest;
    if (fastest === null) {
      return '';
    }

    return place?.awaiting == null
      ? fastest.human_label
      : `${fastest.human_label} · ${peopleWaiting(place.awaiting)}`;
  });

  /** „Gdzie indziej jest szybciej” - trzy paski o wspólnej skali. */
  protected readonly comparisonBars = computed<ComparisonBar[]>(() => {
    const comparison = this.serving().comparison;
    const bars: Omit<ComparisonBar, 'widthPercent'>[] = [];

    if (comparison.scope_median_days !== null) {
      bars.push({
        label: `${this.city()} - mediana miasta`,
        days: comparison.scope_median_days,
        text: this.summary().median_label,
        tone: 'city',
      });
    }

    if (comparison.province_median_days !== null) {
      bars.push({
        label: 'Województwo - mediana',
        days: comparison.province_median_days,
        text: this.daysLabel(comparison.province_median_days),
        tone: 'province',
      });
    }

    const best = comparison.best_city_in_province;
    if (best !== null && best.slug !== this.serving().scope.slug) {
      bars.push({
        label: `Najszybciej w województwie - ${cityName(best.name)}`,
        days: best.median_days,
        text: best.median_label,
        tone: 'best',
      });
    }

    const max = Math.max(...bars.map((bar) => bar.days), 1);
    return bars.map((bar) => ({ ...bar, widthPercent: Math.max(6, (bar.days / max) * 100) }));
  });

  protected readonly trendBars = computed<TrendBar[]>(() => {
    const trend = this.serving().trend.filter((point) => point.median_days !== null);
    const max = Math.max(...trend.map((point) => point.median_days ?? 0), 1);

    return trend.map((point) => ({
      month: point.month,
      label: monthRoman(point.month),
      text: this.daysLabel(point.median_days ?? 0),
      heightPercent: Math.max(8, ((point.median_days ?? 0) / max) * 100),
      bucket: this.summary().median_bucket,
    }));
  });

  protected readonly hasTrend = computed(() => this.trendBars().length >= 2);

  /** Breadcrumb „{Świadczenie}” → wyniki ogólnopolskie (reguła: z szukajki do wyników). */
  protected readonly benefitSearchHref = computed(
    () => `/szukaj?q=${encodeURIComponent(this.serving().benefit.slug)}&mode=all`
  );

  /**
   * Blok krzyżowy nr 1: inne świadczenia z prerenderowaną stroną w TYM mieście.
   * Tylko pary obecne w indeksie - zero linków do 404.
   */
  protected readonly crossBenefits = computed(() => {
    const scope = this.serving().scope;
    const current = this.serving().benefit.slug;

    return this.searchIndex()
      .filter((entry) => entry.city_slug === scope.slug && entry.benefit_slug !== current)
      .slice(0, 8)
      .map((entry) => ({
        label: entry.benefit_label,
        href: `/swiadczenie/${entry.benefit_slug}/${entry.city_slug}/`
      }));
  });

  /**
   * Blok krzyżowy nr 2: to świadczenie w najbliższych geograficznie miastach.
   * Czas przy mieście z tego samego źródła (fastest z indeksu), co chipy podpowiedzi.
   */
  protected readonly nearbyCities = computed(() => {
    const serving = this.serving();
    const here = cityCoords(serving.scope.name);

    const candidates = this.searchIndex()
      .filter((entry) => entry.benefit_slug === serving.benefit.slug && entry.city_slug !== serving.scope.slug)
      .map((entry) => ({ entry, point: cityCoords(entry.city) }))
      .filter((candidate) => candidate.point !== null);

    if (here !== null) {
      candidates.sort(
        (a, b) => distanceKm(here, a.point as NonNullable<typeof a.point>) - distanceKm(here, b.point as NonNullable<typeof b.point>)
      );
    }

    return candidates.slice(0, 6).map(({ entry }) => ({
      name: cityName(entry.city),
      href: `/swiadczenie/${entry.benefit_slug}/${entry.city_slug}/`,
      time: entry.fastest_label ?? null
    }));
  });

  protected readonly shareText = computed(() => {
    const best = this.serving().comparison.best_city_in_province;
    // Świadome ominięcie odmiany nazwy świadczenia: „na kardiologię” wymagałoby biernika,
    // którego nie da się rzetelnie wyprowadzić z dowolnej etykiety z config/benefits.yml.
    const head = `${this.serving().benefit.label} w ${this.cityIn()}: typowo ${this.summary().median_label}.`;
    const bestLocative = best === null ? null : (cityLocative(best.name) ?? cityName(best.name));
    return best === null || best.slug === this.serving().scope.slug
      ? head
      : `${head} Najszybciej w województwie - w ${bestLocative}: ${best.median_label}.`;
  });

  constructor() {
    // Tytuł i opis ustawiane w czasie prerenderu - strona ma działać jako wynik wyszukiwania.
    queueMicrotask(() => {
      const serving = this.serving();
      this.title.setTitle(`${this.headline()} - czas oczekiwania NFZ | ileczekam.pl`);
      this.meta.updateTag({
        name: 'description',
        content:
          `Czas oczekiwania - ${serving.benefit.label} w ${this.cityIn()}: ${serving.summary.median_label}. ` +
          `${placesCount(serving.summary.places_total)}, dane NFZ za ${this.snapshotAfterZa()}.`,
      });
    });
  }

  protected toggleExpanded(): void {
    this.expanded.update((value) => !value);
  }

  protected toggleUrgent(): void {
    this.showUrgent.update((value) => !value);
  }

  protected async copyShareText(): Promise<void> {
    await navigator.clipboard.writeText(`${this.shareText()} Źródło: NFZ, ileczekam.pl`);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2500);
  }

  protected dateLabel(date: string | null): string {
    return dateLabel(date);
  }

  private daysLabel(days: number): string {
    return daysApprox(days);
  }

  private sortKey(place: Place): number {
    const wait = this.showUrgent() && place.wait_urgent !== null ? place.wait_urgent : place.wait_stable;
    return wait.raw_days ?? Number.MAX_SAFE_INTEGER;
  }
}
