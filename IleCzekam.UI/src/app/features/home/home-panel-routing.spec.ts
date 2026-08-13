import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchIndexEntry } from '@models/serving';
import { HomePage } from './home-page';

/**
 * Reguła routingu: z szukajki ZAWSZE do wyników. Każdy link panelu podpowiedzi
 * prowadzi do /szukaj - zero nawigacji do stron miast (/swiadczenie/...).
 */

const INDEX: SearchIndexEntry[] = [
  {
    benefit_slug: 'kardiologia',
    benefit_label: 'Kardiologia - oddział szpitalny',
    synonyms: ['kardiolog', 'serce'],
    city: 'TYCHY',
    city_slug: 'tychy',
    province: '12',
    median_days: 30,
    places_total: 2,
    fastest_days: 6,
    fastest_label: 'ok. 6 dni'
  },
  {
    benefit_slug: 'kardiologia',
    benefit_label: 'Kardiologia - oddział szpitalny',
    synonyms: ['kardiolog', 'serce'],
    city: 'GLIWICE',
    city_slug: 'gliwice',
    province: '12',
    median_days: 90,
    places_total: 1,
    fastest_days: 98,
    fastest_label: 'ok. 3 miesiące'
  }
];

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('panel podpowiedzi - spójny cel nawigacji', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(INDEX), { status: 200 })))
    );
    TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideZonelessChangeDetection(), provideRouter([])]
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function renderPanel(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await settle();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#benefit-search');
    input?.dispatchEvent(new Event('focus'));
    input!.value = 'kardiolog';
    input!.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('każdy link panelu prowadzi do /szukaj, żaden do /swiadczenie/', async () => {
    const element = await renderPanel();
    const links = [...element.querySelectorAll<HTMLAnchorElement>('#search-results a')];

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^\/szukaj\?/);
    }
  });

  it('chip miasta niesie q + mode=city + miejscowosc; nazwa świadczenia - mode=all', async () => {
    const element = await renderPanel();

    expect(element.querySelector<HTMLAnchorElement>('a.result-benefit')?.getAttribute('href')).toBe(
      '/szukaj?q=kardiologia&mode=all'
    );
    const chip = [...element.querySelectorAll<HTMLAnchorElement>('.result-cities a')].find((a) =>
      a.textContent?.includes('Tychy')
    );
    expect(chip?.getAttribute('href')).toBe('/szukaj?q=kardiologia&mode=city&miejscowosc=Tychy');
  });

  it('czas na chipie to najkrótszy termin z indeksu (fastest_label)', async () => {
    const element = await renderPanel();
    const chip = [...element.querySelectorAll<HTMLAnchorElement>('.result-cities a')].find((a) =>
      a.textContent?.includes('Tychy')
    );
    expect(chip?.querySelector('.result-days')?.textContent).toContain('ok. 6 dni');
  });
});
