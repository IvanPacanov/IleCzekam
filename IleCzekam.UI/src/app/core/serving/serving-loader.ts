import { InjectionToken } from '@angular/core';

import { ServingFile } from '@models/serving';

/**
 * Źródło plików `data/serving/`. Implementacja czytająca z dysku żyje wyłącznie
 * w bundlu serwerowym (prerender) — przeglądarka dostaje gotowe dane przez TransferState
 * i nie wykonuje żadnych requestów o dane świadczenia.
 */
export interface ServingLoader {
  load(benefitSlug: string, scopeSlug: string): ServingFile | null;
}

export const SERVING_LOADER = new InjectionToken<ServingLoader>('SERVING_LOADER');
