import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Wait, WaitBucket } from '@models/serving';
import { WaitPill } from './wait-pill';

function render(wait: Wait): HTMLElement {
  const fixture = TestBed.createComponent(WaitPill);
  fixture.componentRef.setInput('wait', wait);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function wait(bucket: WaitBucket, label: string, days: number | null): Wait {
  return { pcus_raw: null, raw_days: days, human_label: label, bucket, as_at: null };
}

describe('pigułka czasu', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [WaitPill] }));

  // Trzeci nośnik informacji obok koloru i podpisu - musi rosnąć monotonicznie.
  it.each([
    ['krotko' as const, 1],
    ['umiarkowanie' as const, 2],
    ['dlugo' as const, 3],
    ['bardzo_dlugo' as const, 4],
    ['brak_danych' as const, 0],
    ['nie_dotyczy' as const, 0],
  ])('%s ma %i wypełnionych kresek', (bucket, expected) => {
    const element = render(wait(bucket, 'etykieta', 10));
    expect(element.querySelectorAll('.bars i.filled')).toHaveLength(expected);
    expect(element.querySelectorAll('.bars i')).toHaveLength(4);
  });

  it('podpis słowny nigdy nie znika', () => {
    for (const bucket of ['krotko', 'umiarkowanie', 'dlugo', 'bardzo_dlugo', 'brak_danych', 'nie_dotyczy'] as const) {
      const element = render(wait(bucket, 'etykieta', null));
      expect(element.querySelector('.label')?.textContent?.trim()).not.toBe('');
    }
  });

  it('brak danych pokazuje etykietę z ETL, nigdy zera', () => {
    const element = render(wait('brak_danych', 'brak danych', null));

    expect(element.querySelector('.time')?.textContent).toContain('brak danych');
    expect(element.textContent).not.toContain('0 dni');
    expect(element.querySelector('.label')?.textContent).toContain('nie przekazano');
  });

  it('„nie dotyczy” jest odrębnym stanem, nie brakiem danych', () => {
    const element = render(wait('nie_dotyczy', 'nie dotyczy', null));

    expect(element.className).toContain('bucket-nie_dotyczy');
    expect(element.querySelector('.label')?.textContent).toContain('nie dotyczy');
  });

  it('klasa kubełka trafia na hosta - po niej stylujemy wypełnienie', () => {
    expect(render(wait('dlugo', 'ok. 4 miesiące', 120)).className).toContain('bucket-dlugo');
  });
});
