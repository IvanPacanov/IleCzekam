import { inject, makeStateKey, TransferState } from '@angular/core';
import { ResolveFn } from '@angular/router';

import { SearchIndexEntry } from '@models/serving';
import { SEARCH_INDEX_LOADER } from './serving-loader';

const KEY = makeStateKey<SearchIndexEntry[]>('search-index');

/**
 * Indeks wyszukiwarki dla strony miasta (bloki krzyżowe). W prerenderze czytany
 * z dysku i utrwalany w TransferState - linki krzyżowe trafiają do statycznego HTML.
 * Nawigacja czysto kliencka (bez TransferState) dociąga go fetchem.
 */
export const searchIndexResolver: ResolveFn<SearchIndexEntry[] | Promise<SearchIndexEntry[]>> = () => {
  const transferState = inject(TransferState);

  if (transferState.hasKey(KEY)) {
    return transferState.get(KEY, []);
  }

  const loader = inject(SEARCH_INDEX_LOADER, { optional: true });
  if (loader !== null) {
    const entries = loader();
    transferState.set(KEY, entries);
    return entries;
  }

  return fetch('/search-index.json')
    .then((response) => (response.ok ? (response.json() as Promise<SearchIndexEntry[]>) : []))
    .catch(() => []);
};
