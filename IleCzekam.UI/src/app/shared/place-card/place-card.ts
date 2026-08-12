import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Place, VALIDATION_FLAG } from '@models/serving';
import { directionsUrl } from '@shared/format/directions';
import { WaitPill } from '@shared/wait-pill/wait-pill';
import {
  dateLabel,
  monthAccusative,
  peopleWaiting,
  phoneDisplay,
  phoneHref,
  titleCasePl
} from '@shared/format/pl-format';

/**
 * Karta placówki. Trzy stany z projektu:
 * pełne dane, brak danych (obrys przerywany + wyjaśnienie), przypadek pilny (plakietka).
 *
 * Placówka bez danych ZOSTAJE na liście - z telefonem i ze zdaniem, że brak sprawozdania
 * nie oznacza krótkiej kolejki. To reguła walidacji nr 1 przeniesiona na warstwę wizualną.
 */
@Component({
  selector: 'app-place-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WaitPill],
  host: {
    '[class.no-data]': 'hasNoData()',
    '[class.urgent]': 'urgent()'
  },
  templateUrl: './place-card.html',
  styleUrl: './place-card.scss'
})
export class PlaceCard {
  readonly place = input.required<Place>();
  /** Miesiąc snapshotu - używany w zdaniu o braku sprawozdania. */
  readonly snapshotMonth = input.required<string>();
  /** Karta pokazuje kolejkę pilną zamiast stabilnej. */
  readonly urgent = input(false);
  readonly pillSize = input<'sm' | 'md'>('md');
  /**
   * Gotowa etykieta odległości („12 km od Gliwic” / „1,2 km od Ciebie”).
   * Punkt odniesienia ustala widok RAZ per wyszukiwanie - karta go nie zna,
   * więc nie może wyprodukować miksu wariantów na jednej liście.
   */
  readonly distance = input<string | null>(null);

  protected readonly wait = computed(() => {
    const place = this.place();
    return this.urgent() && place.wait_urgent !== null ? place.wait_urgent : place.wait_stable;
  });

  protected readonly hasNoData = computed(() => this.wait().raw_days === null);
  protected readonly isStale = computed(() => this.place().flags.includes(VALIDATION_FLAG.stale));
  protected readonly monthName = computed(() => monthAccusative(this.snapshotMonth()));

  protected readonly title = computed(() => {
    const place = this.place();
    // `place` bywa pustą nazwą komórki albo powtórzeniem nazwy świadczenia -
    // wtedy sam świadczeniodawca niesie więcej informacji.
    return titleCasePl(
      place.place === '' || place.place === place.nfz_benefit ? place.provider : `${place.provider} - ${place.place}`
    );
  });

  protected readonly address = computed(() => titleCasePl(`${this.place().address}, ${this.place().locality}`));

  protected readonly stats = computed(() => {
    const place = this.place();
    const parts: string[] = [];

    if (place.awaiting !== null) {
      parts.push(peopleWaiting(place.awaiting));
    }

    const asAt = this.wait().as_at;
    if (asAt !== null) {
      parts.push(`dane z ${dateLabel(asAt)}`);
    }

    return parts.join(' · ');
  });

  protected readonly phoneText = computed(() => {
    const phone = this.place().phone;
    return phone === null ? null : phoneDisplay(phone);
  });

  protected readonly phoneLink = computed(() => {
    const phone = this.place().phone;
    return phone === null ? null : phoneHref(phone);
  });

  protected readonly routeLink = computed(() => directionsUrl(this.place()));

  protected readonly routeAriaLabel = computed(
    () => `Wyznacz trasę do ${this.title()} w Mapach Google (otwiera nową kartę)`,
  );
}
