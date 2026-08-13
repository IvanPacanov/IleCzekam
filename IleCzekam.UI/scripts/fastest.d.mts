// Typy dla scripts/fastest.mjs - używane przez specy (vitest importuje .mjs wprost).
import { Place, SearchIndexEntry } from '../src/app/models/serving';

export function normalizeLocality(text: string): string;
export function fastestOfPlaces(
  places: readonly Pick<Place, 'locality' | 'wait_stable'>[],
): { days: number; label: string } | null;
export function enrichIndex(
  entries: readonly Omit<SearchIndexEntry, 'fastest_days' | 'fastest_label'>[],
  servingByBenefit: Record<string, readonly Pick<Place, 'locality' | 'wait_stable'>[]>,
): SearchIndexEntry[];
