/**
 * Kształt plików z `data/serving/` produkowanych przez ETL
 * (Etl/IleCzekam.Etl/Transform/ServingModels.cs). Frontend czyta je w czasie builda.
 */

export type WaitBucket =
  | 'krotko'
  | 'umiarkowanie'
  | 'dlugo'
  | 'bardzo_dlugo'
  | 'brak_danych'
  | 'nie_dotyczy';

export interface Wait {
  /** Oryginalny tekst PCUŚ z API NFZ, np. „3 mies. 2 tyg.”. */
  readonly pcus_raw: string | null;
  /** Nasze przeliczenie na dni; `null` = brak danych, NIGDY 0. */
  readonly raw_days: number | null;
  readonly human_label: string;
  readonly bucket: WaitBucket;
  readonly as_at: string | null;
}

export interface Place {
  readonly id: string;
  readonly provider: string;
  readonly place: string;
  readonly address: string;
  readonly locality: string;
  readonly teryt: string;
  readonly phone: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly for_children: boolean;
  readonly nfz_benefit: string;
  readonly wait_stable: Wait;
  readonly wait_urgent: Wait | null;
  readonly awaiting: number | null;
  readonly average_period_days: number | null;
  readonly stats_month: string | null;
  readonly flags: readonly string[];
}

export interface Fastest {
  readonly place_id: string;
  readonly provider: string;
  readonly locality: string;
  readonly raw_days: number;
  readonly human_label: string;
}

export interface Summary {
  readonly median_days: number | null;
  readonly median_label: string;
  readonly median_bucket: WaitBucket;
  readonly fastest: Fastest | null;
  readonly places_total: number;
  readonly places_with_data: number;
  readonly places_without_data: number;
  readonly flags: readonly string[];
}

export interface BestCity {
  readonly name: string;
  readonly slug: string;
  readonly median_days: number;
  readonly median_label: string;
  readonly low_sample: boolean;
}

export interface Comparison {
  readonly scope_median_days: number | null;
  readonly province_median_days: number | null;
  readonly best_city_in_province: BestCity | null;
}

export interface TrendPoint {
  readonly month: string;
  readonly median_days: number | null;
  readonly places_with_data: number;
}

export interface Scope {
  readonly type: 'miasto' | 'wojewodztwo';
  readonly name: string;
  readonly slug: string;
  readonly teryt: string | null;
  readonly province: string;
}

export interface Benefit {
  readonly slug: string;
  readonly label: string;
  readonly nfz_benefits: readonly string[];
}

export interface Source {
  readonly name: string;
  readonly url: string;
}

/** Jeden plik serving = jedna strona (świadczenie × miasto albo × województwo). */
export interface ServingFile {
  readonly benefit: Benefit;
  readonly scope: Scope;
  readonly snapshot_month: string;
  readonly generated_at: string;
  readonly source: Source;
  readonly summary: Summary;
  readonly comparison: Comparison;
  readonly trend: readonly TrendPoint[];
  readonly places: readonly Place[];
}

export interface SearchIndexEntry {
  readonly benefit_slug: string;
  readonly benefit_label: string;
  readonly synonyms: readonly string[];
  readonly city: string;
  readonly city_slug: string;
  readonly province: string;
  readonly median_days: number | null;
  readonly places_total: number;
  /**
   * Najkrótszy termin w mieście - dokładane przez scripts/generate-search-index.mjs
   * (nie przez ETL), tą samą regułą min co nagłówek wyników (@core/search/fastest).
   */
  readonly fastest_days?: number | null;
  readonly fastest_label?: string | null;
}

export const VALIDATION_FLAG = {
  noData: 'no_data',
  notApplicable: 'not_applicable',
  suspicious: 'suspicious_value',
  stale: 'stale_data',
  lowSample: 'low_sample',
} as const;
