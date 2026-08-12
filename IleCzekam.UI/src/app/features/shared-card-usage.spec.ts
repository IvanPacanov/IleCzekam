import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchIndexEntry } from '@models/serving';
import { CityPage } from './city/city-page';
import { SearchPage } from './search/search-page';
import { place, servingFile, wait } from '../testing/serving-fixtures';

/**
 * Zabezpieczenie przed ponownym rozjazdem widoków: strona miasta i /szukaj mają
 * renderować TEN SAM komponent karty (app-place-card), pigułki i paska danych.
 * Test działa przez selektory komponentów - duplikat karty by go nie przeszedł.
 */

const INDEX: SearchIndexEntry[] = [
  {
    benefit_slug: 'kardiologia',
    benefit_label: 'Kardiologia - oddział szpitalny',
    synonyms: ['kardiolog', 'serce'],
    city: 'GLIWICE',
    city_slug: 'gliwice',
    province: '12',
    median_days: 150,
    places_total: 2,
  },
];

const PLACES = [
  place(),
  place({
    id: 'p-2',
    provider: 'NZOZ KARDIO-MED',
    locality: 'ZABRZE',
    wait_stable: wait('brak_danych', 'brak danych', null),
  }),
];

function fetchMock(url: RequestInfo | URL): Promise<Response> {
  const path = String(url);
  const body = path.includes('search-index')
    ? INDEX
    : path.includes('wojewodztwo')
      ? servingFile(PLACES)
      : null;

  return Promise.resolve(
    body === null
      ? new Response('not found', { status: 404 })
      : new Response(JSON.stringify(body), { status: 200 }),
  );
}

async function settle(): Promise<void> {
  // fetch → json → set signal: dwa mikrotaskowe skoki wystarczą w jsdom.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('oba widoki używają wspólnych komponentów', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(fetchMock));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strona miasta renderuje app-place-card, app-wait-pill i app-data-notice', () => {
    TestBed.configureTestingModule({
      imports: [CityPage],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });

    const fixture = TestBed.createComponent(CityPage);
    fixture.componentRef.setInput('serving', servingFile(PLACES));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('app-place-card').length).toBeGreaterThan(0);
    expect(element.querySelector('app-place-card app-wait-pill')).not.toBeNull();
    expect(element.querySelector('app-data-notice')).not.toBeNull();
  });

  it('widok /szukaj renderuje TE SAME komponenty: app-place-card, app-wait-pill, app-data-notice', async () => {
    TestBed.configureTestingModule({
      imports: [SearchPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({ q: 'kardiolog', mode: 'all' })),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(SearchPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const cards = element.querySelectorAll('app-place-card');

    expect(cards.length).toBe(PLACES.length);
    expect(element.querySelector('app-place-card app-wait-pill')).not.toBeNull();
    expect(element.querySelector('app-data-notice')).not.toBeNull();
    // Placówka bez danych zostaje na liście - reguła walidacji nr 1.
    expect(element.textContent).toContain('To nie znaczy, że kolejka jest krótka');
  });
});
