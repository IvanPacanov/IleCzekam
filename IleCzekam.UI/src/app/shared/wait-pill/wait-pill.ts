import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { Wait, WaitBucket } from '@models/serving';

/** Liczba wypełnionych kresek dla każdego stopnia - trzeci, niezależny nośnik informacji. */
const FILLED_BARS: Record<WaitBucket, number> = {
  krotko: 1,
  umiarkowanie: 2,
  dlugo: 3,
  bardzo_dlugo: 4,
  brak_danych: 0,
  nie_dotyczy: 0,
};

const LABEL: Record<WaitBucket, string> = {
  krotko: 'krótko',
  umiarkowanie: 'umiarkowanie',
  dlugo: 'długo',
  bardzo_dlugo: 'bardzo długo',
  brak_danych: 'nie przekazano',
  nie_dotyczy: 'nie dotyczy',
};

/**
 * Sygnatura serwisu: pigułka czasu oczekiwania.
 *
 * Stopień jest zakodowany TRZEMA niezależnymi nośnikami - jasnością wypełnienia,
 * liczbą wypełnionych kresek i podpisem słownym. Podpis nigdy nie znika, więc komponent
 * pozostaje czytelny bez koloru, przy deuteranopii i w skali szarości.
 */
@Component({
  selector: 'app-wait-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"pill bucket-" + wait().bucket + " size-" + size()' },
  template: `
    <span class="time">{{ wait().human_label }}</span>
    <span class="label">
      <span
        class="bars"
        aria-hidden="true">
        @for (bar of bars; track bar) {
          <i [class.filled]="bar <= filledBars()"></i>
        }
      </span>
      {{ label() }}
    </span>
  `,
  styleUrl: './wait-pill.scss',
})
export class WaitPill {
  readonly wait = input.required<Wait>();
  /** `lg` - nagłówek-odpowiedź na stronie miasta; `sm` - lista placówek w kolumnie bocznej. */
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  protected readonly bars = [1, 2, 3, 4];
  protected readonly filledBars = computed(() => FILLED_BARS[this.wait().bucket]);
  protected readonly label = computed(() => LABEL[this.wait().bucket]);
}
