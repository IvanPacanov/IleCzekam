import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { monthAfterZa } from '@shared/format/pl-format';

/**
 * Pasek „Dane NFZ aktualizowane raz w miesiącu…” - JEDEN komponent dla strony miasta
 * i widoku wyników, żeby treść i wygląd nie mogły się rozjechać.
 */
@Component({
  selector: 'app-data-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="data-notice">
      <span aria-hidden="true">ⓘ</span>
      @if (monthText() !== '') {
        Dane NFZ za {{ monthText() }}, aktualizowane raz w miesiącu. Przed wizytą potwierdź termin telefonicznie w
        placówce.
      } @else {
        Dane NFZ aktualizowane raz w miesiącu. Przed wizytą potwierdź termin telefonicznie w placówce.
      }
    </p>
  `,
  styles: `
    .data-notice {
      display: flex;
      gap: 12px;
      align-items: center;
      margin: 0;
      padding: 10px 48px;
      background: var(--color-surface-sunken);
      font-size: 16px;
      color: var(--color-text-secondary);
    }

    @media (max-width: 900px) {
      .data-notice {
        padding-left: 20px;
        padding-right: 20px;
      }
    }
  `
})
export class DataNotice {
  /** Miesiąc snapshotu (`2026-08`); bez niego pasek mówi ogólnie o cyklu miesięcznym. */
  readonly month = input<string | null>(null);

  protected readonly monthText = computed(() => monthAfterZa(this.month()));
}
