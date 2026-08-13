import { InjectionToken } from '@angular/core';

import { SearchIndexEntry, ServingFile } from '@models/serving';

/**
 * Źródło plików `data/serving/`. Implementacja czytająca z dysku żyje wyłącznie
 * w bundlu serwerowym (prerender) — przeglądarka dostaje gotowe dane przez TransferState
 * i nie wykonuje żadnych requestów o dane świadczenia.
 */
export interface ServingLoader {
  load(benefitSlug: string, scopeSlug: string): ServingFile | null;
}

export const SERVING_LOADER = new InjectionToken<ServingLoader>('SERVING_LOADER');

/**
 * Wzbogacony indeks wyszukiwarki (public/search-index.json) w czasie prerenderu -
 * strona miasta buduje z niego bloki krzyżowe w statycznym HTML.
 */
export const SEARCH_INDEX_LOADER = new InjectionToken<() => SearchIndexEntry[]>('SEARCH_INDEX_LOADER');
