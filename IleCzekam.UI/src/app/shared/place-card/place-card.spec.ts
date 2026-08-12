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

  // Kanoniczny układ (it. 3): nazwa → adres+odległość → pigułka → [telefon][trasa] → statystyki.
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

    expect(order).toEqual(['name', 'address', 'app-wait-pill', 'action', 'stats']);
  });

  it('telefon i trasa są WEWNĄTRZ osi akcji, pigułka na własnej linii przed nią', () => {
    const element = render(place());
    expect(element.querySelector('.action-row app-wait-pill')).toBeNull();
    expect(element.querySelector('.action-row a.phone-cta')).not.toBeNull();
    expect(element.querySelector('.action-row a.route-cta')).not.toBeNull();
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

  it('„Trasa” to zwykły link do Map Google w nowej karcie, obok telefonu', () => {
    const element = render(place());
    const route = element.querySelector<HTMLAnchorElement>('.action-row a.route-cta');

    expect(route?.getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=50.2945,18.6714');
    expect(route?.getAttribute('target')).toBe('_blank');
    expect(route?.getAttribute('rel')).toBe('noopener');
    expect(route?.getAttribute('aria-label')).toBe(
      'Wyznacz trasę do Szpital Miejski nr 4 w Gliwicach - Poradnia Kardiologiczna w Mapach Google (otwiera nową kartę)'
    );
  });

  it('bez współrzędnych w danych „Trasa” celuje w nazwę + adres', () => {
    const element = render(place({ latitude: null, longitude: null }));

    expect(element.querySelector<HTMLAnchorElement>('.route-cta')?.getAttribute('href')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=' +
        encodeURIComponent('SZPITAL MIEJSKI NR 4 W GLIWICACH, UL. ZYGMUNTA STAREGO 20, GLIWICE')
    );
  });

  it('brak danych o kolejce nie odbiera nawigacji - „Trasa” zostaje', () => {
    const element = render(place({ wait_stable: wait('brak_danych', 'brak danych', null) }));
    expect(element.querySelector('.route-cta')).not.toBeNull();
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
