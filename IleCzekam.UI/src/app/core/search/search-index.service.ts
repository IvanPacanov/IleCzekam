import { Injectable, signal } from '@angular/core';

import { SearchIndexEntry } from '@models/serving';

/** Znormalizowany tekst do dopasowania: bez polskich znaków i wielkości liter. */
function normalize(text: string): string {
  return text
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');
}

export interface BenefitSuggestion {
  readonly slug: string;
  readonly label: string;
  readonly synonyms: readonly string[];
  readonly cities: readonly SearchIndexEntry[];
}

/**
 * Wyszukiwarka świadczeń zasilana indeksem z ETL (`serving/search-index/index.json`),
 * kopiowanym do `public/` przed buildem. Pacjent wpisuje swoimi słowami - dlatego
 * dopasowujemy też po synonimach, a nie tylko po nazwie NFZ.
 */
@Injectable({ providedIn: 'root' })
export class SearchIndexService {
  private readonly _entries = signal<SearchIndexEntry[]>([]);
  private readonly _state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');

  readonly entries = this._entries.asReadonly();
  readonly state = this._state.asReadonly();

  async load(): Promise<void> {
    if (this._state() !== 'idle') {
      return;
    }

    this._state.set('loading');

    try {
      const response = await fetch('/search-index.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this._entries.set((await response.json()) as SearchIndexEntry[]);
      this._state.set('ready');
    } catch {
      this._state.set('error');
    }
  }

  /** Świadczenia zgrupowane z miastami, w kolejności trafności. */
  benefits(query: string): BenefitSuggestion[] {
    const entries = this._entries();
    const needle = normalize(query.trim());

    const bySlug = new Map<string, BenefitSuggestion & { cities: SearchIndexEntry[] }>();

    for (const entry of entries) {
      let group = bySlug.get(entry.benefit_slug);
      if (group === undefined) {
        group = {
          slug: entry.benefit_slug,
          label: entry.benefit_label,
          synonyms: entry.synonyms,
          cities: [],
        };
        bySlug.set(entry.benefit_slug, group);
      }

      group.cities.push(entry);
    }

    const groups = [...bySlug.values()].map((group) => ({
      ...group,
      cities: [...group.cities].sort((a, b) => (a.median_days ?? Infinity) - (b.median_days ?? Infinity)),
    }));

    if (needle === '') {
      return groups;
    }

    return groups.filter(
      (group) =>
        normalize(group.label).includes(needle) ||
        group.slug.includes(needle) ||
        group.synonyms.some((synonym) => normalize(synonym).includes(needle)),
    );
  }

  /** Miasta pasujące do zapytania - druga sekcja podpowiedzi. */
  cities(query: string): SearchIndexEntry[] {
    const needle = normalize(query.trim());
    if (needle === '') {
      return [];
    }

    return this._entries().filter((entry) => normalize(entry.city).includes(needle));
  }
}
