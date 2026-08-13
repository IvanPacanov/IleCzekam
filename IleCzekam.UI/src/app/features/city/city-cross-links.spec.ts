import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchIndexEntry } from '@models/serving';
import { place, servingFile } from '../../testing/serving-fixtures';
import { CityPage } from './city-page';

/** Strona miasta ma dawać wyjścia dalej: breadcrumb, szukajka, bloki krzyżowe. */

const INDEX: SearchIndexEntry[] = [
  {
    benefit_slug: 'ortopedia',
    benefit_label: 'Ortopeda',
    synonyms: [],
    city: 'GLIWICE',
    city_slug: 'gliwice',
    province: '12',
    median_days: 60,
    places_total: 1,
    fastest_days: 30,
    fastest_label: 'ok. 4 tygodnie'
  },
  {
    benefit_slug: 'kardiologia',
    benefit_label: 'Kardiologia - oddział szpitalny',
    synonyms: [],
    city: 'ZABRZE',
    city_slug: 'zabrze',
    province: '12',
    median_days: 70,
    places_total: 2,
    fastest_days: 75,
    fastest_label: 'ok. 2 miesiące i 2 tygodnie'
  },
  {
    benefit_slug: 'kardiologia',
    benefit_label: 'Kardiologia - oddział szpitalny',
    synonyms: [],
    city: 'CZĘSTOCHOWA',
    city_slug: 'czestochowa',
    province: '12',
    median_days: 90,
    places_total: 1,
    fastest_days: null,
    fastest_label: null
  }
];

describe('strona miasta - wyjścia nawigacyjne', () => {
  beforeEach(() => {
    // Szukajka nagłówka dociąga indeks podpowiedzi - w teście wystarczy pusta odpowiedź.
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('[]', { status: 200 }))));
    TestBed.configureTestingModule({
      imports: [CityPage],
      providers: [provideZonelessChangeDetection(), provideRouter([])]
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(CityPage);
    fixture.componentRef.setInput('serving', servingFile([place()]));
    fixture.componentRef.setInput('searchIndex', INDEX);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('breadcrumb: świadczenie → /szukaj ogólnopolsko, miasto → kotwica bloku krzyżowego', () => {
    const element = render();
    const links = [...element.querySelectorAll<HTMLAnchorElement>('.breadcrumb a')];

    expect(links[0]?.getAttribute('href')).toBe('/szukaj?q=kardiologia&mode=all');
    expect(links[1]?.getAttribute('href')).toBe('#inne-swiadczenia');
  });

  it('bloki krzyżowe: wyłącznie pary z indeksu (zero 404), czas miasta z fastest_label', () => {
    const element = render();
    const hrefs = [...element.querySelectorAll<HTMLAnchorElement>('.cross-links a')].map((a) =>
      a.getAttribute('href')
    );

    // Inne świadczenia w Gliwicach: tylko ortopedia (jest w indeksie dla gliwic).
    expect(hrefs).toContain('/swiadczenie/ortopedia/gliwice/');
    // Kardiologia w miastach obok: Zabrze i Częstochowa - bez bieżących Gliwic.
    expect(hrefs).toContain('/swiadczenie/kardiologia/zabrze/');
    expect(hrefs).toContain('/swiadczenie/kardiologia/czestochowa/');
    expect(hrefs).not.toContain('/swiadczenie/kardiologia/gliwice/');

    const zabrze = [...element.querySelectorAll<HTMLAnchorElement>('.cross-links a')].find((a) =>
      a.textContent?.includes('Zabrze')
    );
    expect(zabrze?.textContent).toContain('ok. 2 miesiące i 2 tygodnie');
  });

  it('miasta obok posortowane po odległości (Zabrze przed Częstochową)', () => {
    const element = render();
    const nearby = [...element.querySelectorAll<HTMLAnchorElement>('.cross-links section:nth-of-type(2) a')].map(
      (a) => a.textContent ?? ''
    );
    expect(nearby.findIndex((text) => text.includes('Zabrze'))).toBeLessThan(
      nearby.findIndex((text) => text.includes('Częstochowa'))
    );
  });

  it('szukajka nagłówka obecna z chipem bieżącego miasta', () => {
    const element = render();
    const header = element.querySelector('app-header-search');

    expect(header).not.toBeNull();
    expect(header?.querySelector<HTMLInputElement>('input[name="q"]')?.value).toContain('Kardiologia');
    expect(header?.textContent).toContain('Gliwice');
  });
});
