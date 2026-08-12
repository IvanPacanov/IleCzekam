import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { daysApprox } from '@shared/format/pl-format';

export interface TravelHintData {
  readonly radiusKm: number;
  readonly bestOutsideLabel: string;
  readonly diffDays: number;
}

/**
 * Boks „Gotów wyjechać?” - treść WYLICZANA z bieżącego wyszukiwania,
 * pokazywany tylko gdy poza promieniem jest o ≥ 30 dni krócej.
 */
@Component({
  selector: 'app-travel-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="hint" aria-label="Krótsze terminy dalej">
      <p class="title">Gotów wyjechać?</p>
      <p class="body">
        Poza promieniem {{ data().radiusKm }} km najkrótszy termin to {{ data().bestOutsideLabel }} - o
        {{ diffLabel() }} krócej.
      </p>
      <button class="ghost" (click)="showAll.emit()" type="button">Pokaż całą Polskę</button>
    </aside>
  `,
  styles: `
    .hint {
      background: var(--color-surface-highlight);
      border: 1px solid var(--wait-dlugo-bg);
      border-radius: var(--radius-card-sm);
      padding: 18px 20px;
    }

    .title {
      font-size: 17px;
      font-weight: 700;
      margin: 0 0 6px;
    }

    .body {
      font-size: 16px;
      color: var(--color-text-secondary);
      margin: 0 0 12px;
    }

    .ghost {
      display: inline-flex;
      align-items: center;
      min-height: var(--touch-target);
      padding: 0 20px;
      border: 2px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      background: transparent;
      font-family: inherit;
      font-size: 16px;
      font-weight: 700;
      color: var(--color-text);
      cursor: pointer;

      &:hover {
        background: var(--color-surface);
      }
    }
  `
})
export class TravelHint {
  readonly data = input.required<TravelHintData>();
  readonly showAll = output<void>();

  protected diffLabel(): string {
    // „o ok. 3 miesiące krócej” - bez prefiksu „ok.” brzmiałoby zbyt kategorycznie.
    return daysApprox(this.data().diffDays);
  }
}
