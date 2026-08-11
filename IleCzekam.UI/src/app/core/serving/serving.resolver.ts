import { inject, makeStateKey, TransferState } from '@angular/core';
import { ActivatedRouteSnapshot, ResolveFn, Router } from '@angular/router';

import { ServingFile } from '@models/serving';
import { SERVING_LOADER } from './serving-loader';

/**
 * Wczytuje plik serving w czasie prerenderu i przekazuje go do przeglądarki przez
 * TransferState — po stronie klienta nie ma już żadnego wejścia na dysk ani do sieci.
 */
export const servingResolver: ResolveFn<ServingFile | null> = (route: ActivatedRouteSnapshot) => {
  const benefit = route.paramMap.get('benefit') ?? '';
  const city = route.paramMap.get('city') ?? '';
  const key = makeStateKey<ServingFile | null>(`serving:${benefit}:${city}`);
  const transferState = inject(TransferState);

  if (transferState.hasKey(key)) {
    return transferState.get(key, null);
  }

  const loader = inject(SERVING_LOADER, { optional: true });
  const data = loader?.load(benefit, city) ?? null;

  if (data === null) {
    // Trasa wygenerowana z katalogu serving, ale plik zniknął — lepiej wrócić na stronę
    // główną niż wyrenderować pustą stronę udającą, że placówek nie ma.
    inject(Router).navigate(['/']);
    return null;
  }

  transferState.set(key, data);
  return data;
};
