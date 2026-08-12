import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';

import { BenefitPlaces, BenefitPlacesService } from '@core/search/benefit-places.service';
import { cityCoords } from '@core/search/city-coords';
import { GeoPoint, centroid, distanceKm, kmLabel } from '@core/search/geo';
import { SearchIndexService } from '@core/search/search-index.service';
import { RADIUS_OPTIONS, RadiusKm, parseMode } from '@core/search/search-params';
import { Place } from '@models/serving';
import { DataNotice } from '@shared/data-notice/data-notice';
import { cityFrom, cityLocative, cityName, cityNear } from '@shared/format/city-name';
import { placesCount } from '@shared/format/pl-format';
import { PlaceCard } from '@shared/place-card/place-card';
import { SiteHeader } from '@shared/site-header/site-header';
import { TravelHint, TravelHintData } from './travel-hint';

/** Punkt odniesienia wyszukiwania - jeden na całą listę, nigdy miks wariantów. */
interface Reference {
  readonly point: GeoPoint;
  /** `user` → „od Ciebie”; `city` → „od {miasta}”. */
  readonly kind: 'user' | 'city';
  /** Surowa nazwa miejscowości z danych (dla odmiany). */
  readonly rawName: string | null;
}

interface ResultRow {
  readonly place: Place;
  readonly km: number | null;
  readonly distanceLabel: string | null;
}

function normalizeName(text: string): string {
  return text.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
}

/**
 * Widok wyników `/szukaj`. Renderowany po stronie klienta; placówki pochodzą
 * z plików wojewódzkich serving (public/serving/), a lista używa TYCH SAMYCH
 * komponentów karty/pigułki/paska co strona miasta.
 */
@Component({
  selector: 'app-search-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiteHeader, DataNotice, PlaceCard, TravelHint],
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss'
})
export class SearchPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly index = inject(SearchIndexService);
  private readonly placesService = inject(BenefitPlacesService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  private readonly params = toSignal(this.route.queryParamMap, { initialValue: null });

  protected readonly q = computed(() => this.params()?.get('q')?.trim() ?? '');
  protected readonly mode = computed(() => parseMode(this.params()?.get('mode') ?? null));
  protected readonly cityParam = computed(() => this.params()?.get('miejscowosc')?.trim() ?? '');

  protected readonly indexState = this.index.state;
  protected readonly dataState = this.placesService.state;

  /** Pierwsze pasujące świadczenie - tak samo dopasowywane jak podpowiedzi na stronie głównej. */
  protected readonly benefit = computed(() => this.index.benefits(this.q())[0] ?? null);

  protected readonly data = signal<BenefitPlaces | null>(null);
  protected readonly snapshotMonth = computed(() => this.data()?.snapshotMonth ?? null);

  /** Filtry - kolejność w panelu: Przypadek → Promień → Sortowanie. */
  protected readonly urgent = signal(false);
  protected readonly radius = signal<RadiusKm>(25);
  protected readonly sort = signal<'fastest' | 'nearest'>('fastest');
  protected readonly radiusOptions = RADIUS_OPTIONS;

  private readonly userPoint = signal<GeoPoint | null>(null);
  protected readonly geoDenied = signal(false);
  private geoRequested = false;

  /** Miejscowość z parametru dopasowana do placówek w danych. */
  private readonly cityPlaces = computed(() => {
    const needle = normalizeName(this.cityParam());
    if (this.mode() !== 'city' || needle === '') {
      return [];
    }

    return (this.data()?.places ?? []).filter((place) => normalizeName(place.locality) === needle);
  });

  protected readonly cityNotFound = computed(
    () =>
      this.mode() === 'city' &&
      this.data() !== null &&
      this.cityPlaces().length === 0 &&
      cityCoords(this.cityParam()) === null
  );

  protected readonly reference = computed<Reference | null>(() => {
    if (this.mode() === 'near') {
      const point = this.userPoint();
      return point === null ? null : { point, kind: 'user', rawName: null };
    }

    if (this.mode() !== 'city' || this.cityParam() === '') {
      return null;
    }

    // Najpierw słownik centrów miast; placówki z geokodami tylko jako rezerwa
    // (ETL geokoduje na razie pojedyncze adresy).
    const matched = this.cityPlaces();
    const point =
      cityCoords(this.cityParam()) ??
      centroid(
        matched
          .filter((place) => place.latitude !== null && place.longitude !== null)
          .map((place) => ({
            latitude: place.latitude as number,
            longitude: place.longitude as number
          }))
      );
    return point === null ? null : { point, kind: 'city', rawName: matched[0]?.locality ?? this.cityParam() };
  });

  /** Promień ma sens tylko przy punkcie odniesienia. */
  protected readonly effectiveRadius = computed<RadiusKm>(() => (this.reference() === null ? null : this.radius()));

  private readonly allRows = computed<ResultRow[]>(() => {
    const reference = this.reference();

    return (this.data()?.places ?? []).map((place) => {
      // Placówka bez własnego geokodu dziedziczy środek swojej miejscowości.
      const point: GeoPoint | null =
        place.latitude !== null && place.longitude !== null
          ? { latitude: place.latitude, longitude: place.longitude }
          : cityCoords(place.locality);

      if (reference === null || point === null) {
        return { place, km: null, distanceLabel: null };
      }

      const km = distanceKm(reference.point, point);
      // Placówka w mieście odniesienia: „12 km od Gliwic” brzmiałoby absurdalnie,
      // a adres i tak kończy się nazwą miejscowości.
      if (reference.kind === 'city' && km < 1) {
        return { place, km, distanceLabel: null };
      }

      const from = reference.kind === 'user' ? 'od Ciebie' : cityFrom(reference.rawName ?? '');
      return { place, km, distanceLabel: `${kmLabel(km)} ${from}` };
    });
  });

  protected readonly rows = computed<ResultRow[]>(() => {
    const radius = this.effectiveRadius();
    const urgent = this.urgent();

    const filtered = this.allRows().filter((row) => {
      if (radius !== null && (row.km === null || row.km > radius)) {
        return false;
      }
      return !urgent || row.place.wait_urgent !== null;
    });

    const sort = this.reference() !== null && this.sort() === 'nearest' ? 'nearest' : 'fastest';
    return filtered.sort((a, b) =>
      sort === 'nearest' ? (a.km ?? Infinity) - (b.km ?? Infinity) : this.waitDays(a.place) - this.waitDays(b.place)
    );
  });

  protected readonly urgentAvailable = computed(() => this.allRows().some((row) => row.place.wait_urgent !== null));

  /** „Gotów wyjechać?” - tylko gdy poza promieniem jest o ≥ 30 dni krócej. */
  protected readonly travelHint = computed<TravelHintData | null>(() => {
    const radius = this.effectiveRadius();
    if (radius === null) {
      return null;
    }

    const days = (row: ResultRow): number | null => {
      const wait = this.urgent() && row.place.wait_urgent !== null ? row.place.wait_urgent : row.place.wait_stable;
      return wait.raw_days;
    };

    let bestInside: number | null = null;
    let bestOutside: { days: number; label: string } | null = null;

    for (const row of this.allRows()) {
      const value = days(row);
      if (value === null) {
        continue;
      }

      const inside = row.km !== null && row.km <= radius;
      if (inside) {
        bestInside = bestInside === null ? value : Math.min(bestInside, value);
      } else if (bestOutside === null || value < bestOutside.days) {
        const wait = this.urgent() && row.place.wait_urgent !== null ? row.place.wait_urgent : row.place.wait_stable;
        bestOutside = { days: value, label: wait.human_label };
      }
    }

    if (bestOutside === null) {
      return null;
    }

    const diff = (bestInside ?? Infinity) - bestOutside.days;
    return diff >= 30 && Number.isFinite(diff)
      ? { radiusKm: radius, bestOutsideLabel: bestOutside.label, diffDays: diff }
      : null;
  });

  protected readonly heading = computed(() => {
    const benefit = this.benefit();
    if (benefit === null) {
      return 'Szukaj';
    }

    const reference = this.reference();
    if (reference?.kind === 'city' && reference.rawName !== null) {
      return `${benefit.label} ${cityNear(reference.rawName)}`;
    }
    return reference?.kind === 'user' ? `${benefit.label} blisko Ciebie` : `${benefit.label} - cała Polska`;
  });

  protected readonly subline = computed(() => {
    const rows = this.rows();
    const radius = this.effectiveRadius();
    const scope = radius === null ? 'w całej Polsce' : `w promieniu ${radius} km`;

    const fastest = rows
      .filter((row) => this.waitDays(row.place) !== Number.MAX_SAFE_INTEGER)
      .reduce<ResultRow | null>(
        (best, row) => (best === null || this.waitDays(row.place) < this.waitDays(best.place) ? row : best),
        null
      );

    if (fastest === null) {
      return `${placesCount(rows.length)} ${scope}`;
    }

    const wait =
      this.urgent() && fastest.place.wait_urgent !== null ? fastest.place.wait_urgent : fastest.place.wait_stable;
    const where = cityLocative(fastest.place.locality) ?? cityName(fastest.place.locality);
    return `${placesCount(rows.length)} ${scope} · najkrótszy termin: ${wait.human_label} w ${where}`;
  });

  protected readonly chipCity = computed(() => {
    const raw = this.reference()?.rawName;
    return this.mode() === 'city' && raw != null ? cityName(raw) : null;
  });

  constructor() {
    // Dane świadczenia dociągane, gdy znamy dopasowanie z indeksu.
    effect(() => {
      const benefit = this.benefit();
      if (benefit !== null) {
        void this.placesService.load(benefit.slug).then((data) => this.data.set(data));
      }
    });

    // Geolokalizacja - raz, tylko w trybie „blisko mnie”.
    effect(() => {
      if (this.mode() !== 'near' || this.geoRequested || typeof navigator === 'undefined') {
        return;
      }

      this.geoRequested = true;
      if (!('geolocation' in navigator)) {
        this.geoDenied.set(true);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) =>
          this.userPoint.set({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          }),
        () => this.geoDenied.set(true)
      );
    });

    effect(() => {
      this.title.setTitle(`${this.heading()} | ileczekam.pl`);
      this.meta.updateTag({ name: 'robots', content: 'noindex' });
    });
  }

  ngOnInit(): void {
    void this.index.load();
  }

  protected resubmit(event: Event, value: string): void {
    event.preventDefault();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: value.trim() },
      queryParamsHandling: 'merge'
    });
  }

  protected clearCity(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { mode: 'all', miejscowosc: null },
      queryParamsHandling: 'merge'
    });
  }

  protected showAllPoland(): void {
    this.radius.set(null);
  }

  protected setRadius(value: RadiusKm): void {
    this.radius.set(value);
  }

  private waitDays(place: Place): number {
    const wait = this.urgent() && place.wait_urgent !== null ? place.wait_urgent : place.wait_stable;
    return wait.raw_days ?? Number.MAX_SAFE_INTEGER;
  }
}
