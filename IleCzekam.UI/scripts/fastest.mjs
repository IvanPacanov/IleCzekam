// Najkrótszy termin w mieście - JEDNO źródło tej wartości dla całego serwisu.
// Ten moduł zasila wzbogacanie indeksu wyszukiwarki (chipy miast w panelu podpowiedzi);
// runtime'owym odpowiednikiem jest src/app/core/search/fastest.ts (ta sama reguła min),
// a test src/app/core/search/fastest.spec.ts pilnuje, żeby oba liczyły identycznie.

/** Znormalizowana nazwa miejscowości - jak normalizacja wyszukiwarki. */
export function normalizeLocality(text) {
  return text
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .trim();
}

/**
 * Minimalny czas stabilny wśród placówek: `{ days, label }` albo `null`,
 * gdy żadna placówka nie ma danych. `raw_days === null` to brak danych, nigdy 0.
 */
export function fastestOfPlaces(places) {
  let best = null;
  for (const place of places) {
    const days = place.wait_stable?.raw_days ?? null;
    if (days === null) {
      continue;
    }
    if (best === null || days < best.days) {
      best = { days, label: place.wait_stable.human_label };
    }
  }
  return best;
}

/**
 * Dokłada do wpisów indeksu `fastest_days`/`fastest_label` policzone z plików
 * wojewódzkich serving. `servingByBenefit`: slug świadczenia → lista placówek.
 */
export function enrichIndex(entries, servingByBenefit) {
  return entries.map((entry) => {
    const places = (servingByBenefit[entry.benefit_slug] ?? []).filter(
      (place) => normalizeLocality(place.locality) === normalizeLocality(entry.city),
    );
    const fastest = fastestOfPlaces(places);
    return { ...entry, fastest_days: fastest?.days ?? null, fastest_label: fastest?.label ?? null };
  });
}
