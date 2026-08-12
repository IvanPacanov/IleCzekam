import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { Place, WaitBucket } from '@models/serving';
import { place, wait } from '../../testing/serving-fixtures';
import { PlaceCard } from './place-card';

function render(input: Place, extra: { urgent?: boolean; distance?: string | null } = {}): HTMLElement {
  const fixture = TestBed.createComponent(PlaceCard);
  fixture.componentRef.setInput('place', input);
  fixture.componentRef.setInput('snapshotMonth', '2026-08');
  fixture.componentRef.setInput('urgent', extra.urgent ?? false);
  fixture.componentRef.setInput('distance', extra.distance ?? null);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('karta placówki (kanoniczny układ)', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [PlaceCard] }));

  // Kanoniczny układ z projektu: nazwa → adres+odległość → [pigułka][telefon] → statystyki.
  it('renderuje sekcje w kanonicznej kolejności', () => {
    const element = render(place(), { distance: '12 km od Gliwic' });
    const order = [...element.children].map((child) =>
      child.matches('.name')
        ? 'name'
        : child.matches('.address')
          ? 'address'
          : child.matches('.action-row')
            ? 'action'
            : child.matches('.stats')
              ? 'stats'
              : child.tagName.toLowerCase()
    );

    expect(order).toEqual(['name', 'address', 'action', 'stats']);
  });

  it('pigułka i telefon są WEWNĄTRZ osi akcji', () => {
    const element = render(place());
    expect(element.querySelector('.action-row app-wait-pill')).not.toBeNull();
    expect(element.querySelector('.action-row a.phone-cta')).not.toBeNull();
  });

  it('telefon jest linkiem tel: bez spacji', () => {
    const element = render(place());
    expect(element.querySelector<HTMLAnchorElement>('.phone-cta')?.getAttribute('href')).toBe('tel:+48324616100');
  });

  it.each([
    ['krotko', 'ok. 6 dni', 6],
    ['umiarkowanie', 'ok. 3 miesiące', 95],
    ['dlugo', 'ok. 5 miesięcy', 150],
    ['bardzo_dlugo', 'ok. 7 miesięcy', 210]
  ] as [WaitBucket, string, number][])('bucket %s: pigułka z etykietą i statystyki', (bucket, label, days) => {
    const element = render(place({ wait_stable: wait(bucket, label, days) }));

    expect(element.querySelector('app-wait-pill')?.className).toContain(`bucket-${bucket}`);
    expect(element.querySelector('app-wait-pill .time')?.textContent).toContain(label);
    expect(element.querySelector('.stats')?.textContent).toContain('1240 osób w kolejce');
    expect(element.querySelector('.no-data-note')).toBeNull();
  });

  it('brak danych: nota zamiast statystyk, telefon zostaje', () => {
    const element = render(place({ wait_stable: wait('brak_danych', 'brak danych', null) }));

    expect(element.querySelector('.no-data-note')?.textContent).toContain('nie przekazała danych za sierpień');
    expect(element.querySelector('.no-data-note')?.textContent).toContain('To nie znaczy, że kolejka jest krótka');
    expect(element.querySelector('.stats')).toBeNull();
    expect(element.querySelector('.phone-cta')).not.toBeNull();
  });

  it('odległość dokleja się do adresu tylko, gdy widok ją poda', () => {
    expect(render(place(), { distance: '12 km od Gliwic' }).querySelector('.address')?.textContent).toContain(
      '12 km od Gliwic'
    );
    expect(render(place()).querySelector('.address .distance')).toBeNull();
  });

  it('przypadek pilny: plakietka + kolejka pilna w statystykach', () => {
    const element = render(place({ wait_urgent: wait('umiarkowanie', 'ok. 5 tygodni', 35) }), { urgent: true });

    expect(element.querySelector('.urgent-badge')?.textContent).toContain('Przypadek pilny');
    expect(element.querySelector('app-wait-pill .time')?.textContent).toContain('ok. 5 tygodni');
    expect(element.querySelector('.stats')?.textContent).toContain('Kolejka pilna');
  });
});
