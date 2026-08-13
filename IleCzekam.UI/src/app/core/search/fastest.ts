import { Place, Wait } from '@models/serving';

/**
 * Najkrótszy termin wśród placówek - JEDNA reguła dla nagłówka wyników wyszukiwania
 * i (przez scripts/fastest.mjs, lustrzana implementacja) dla chipów miast w panelu
 * podpowiedzi. Test fastest.spec.ts pilnuje, żeby obie liczyły identycznie.
 *
 * `urgent` przełącza na kolejkę pilną tam, gdzie placówka ją prowadzi -
 * dokładnie tak, jak działa przełącznik na widoku wyników.
 */
export function fastestWait(places: readonly Place[], urgent = false): Wait | null {
  let best: Wait | null = null;

  for (const place of places) {
    const wait = urgent && place.wait_urgent !== null ? place.wait_urgent : place.wait_stable;
    if (wait.raw_days === null) {
      continue;
    }
    if (best === null || best.raw_days === null || wait.raw_days < best.raw_days) {
      best = wait;
    }
  }

  return best;
}
