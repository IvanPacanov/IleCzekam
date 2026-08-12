import { Injectable, inject, signal } from '@angular/core';

import { Place, ServingFile } from '@models/serving';
import { SearchIndexService } from './search-index.service';

export interface BenefitPlaces {
  readonly snapshotMonth: string | null;
  readonly places: readonly Place[];
}

/**
 * Placówki świadczenia w CAŁYM dostępnym zasięgu - dla widoku /szukaj.
 * Źródło: pliki wojewódzkie serving kopiowane do `public/serving/` przed buildem;
 * listę województw dla świadczenia wyznacza indeks wyszukiwarki.
 */
@Injectable({ providedIn: 'root' })
export class BenefitPlacesService {
  private readonly index = inject(SearchIndexService);
  private readonly cache = new Map<string, BenefitPlaces>();

  private readonly _state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly state = this._state.asReadonly();

  async load(benefitSlug: string): Promise<BenefitPlaces | null> {
    const cached = this.cache.get(benefitSlug);
    if (cached !== undefined) {
      this._state.set('ready');
      return cached;
    }

    this._state.set('loading');

    const provinces = [
      ...new Set(
        this.index
          .entries()
          .filter((entry) => entry.benefit_slug === benefitSlug)
          .map((entry) => entry.province)
      )
    ];

    try {
      const files = await Promise.all(
        provinces.map(async (province): Promise<ServingFile> => {
          const response = await fetch(`/serving/${benefitSlug}/wojewodztwo-${province}.json`);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return (await response.json()) as ServingFile;
        })
      );

      const result: BenefitPlaces = {
        snapshotMonth: files[0]?.snapshot_month ?? null,
        places: files.flatMap((file) => file.places)
      };

      this.cache.set(benefitSlug, result);
      this._state.set('ready');
      return result;
    } catch {
      this._state.set('error');
      return null;
    }
  }
}
