/** Wspólny kontrakt parametrów `/szukaj` - używany przez stronę główną i widok wyników. */

/** Zasięg wyszukiwania: cała Polska / geolokalizacja / wskazana miejscowość. */
export type SearchMode = 'all' | 'near' | 'city';

/** Promień w km; `null` = cała Polska. */
export type RadiusKm = 25 | 50 | 100 | null;

export const RADIUS_OPTIONS: readonly { value: RadiusKm; label: string }[] = [
  { value: 25, label: '25 km' },
  { value: 50, label: '50 km' },
  { value: 100, label: '100 km' },
  { value: null, label: 'Cała Polska' }
];

export function parseMode(value: string | null): SearchMode {
  return value === 'near' || value === 'city' ? value : 'all';
}
