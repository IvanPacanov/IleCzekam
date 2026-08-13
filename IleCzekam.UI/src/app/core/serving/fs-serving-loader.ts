import { Injectable } from '@angular/core';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { SearchIndexEntry, ServingFile } from '@models/serving';
import { ServingLoader } from './serving-loader';

/**
 * Czyta wyjście ETL z dysku. Używane WYŁĄCZNIE w czasie builda/prerenderu —
 * ten plik nie może trafić do bundla przeglądarki (importuje node:fs).
 *
 * Ścieżkę można nadpisać zmienną SERVING_DIR; domyślnie `data/serving` w repo.
 */
const servingDir = (): string =>
  process.env['SERVING_DIR'] ?? resolve(process.cwd(), '..', 'data', 'serving');

const benefitsDir = (): string => join(servingDir(), 'swiadczenia');

@Injectable()
export class FsServingLoader implements ServingLoader {
  load(benefitSlug: string, scopeSlug: string): ServingFile | null {
    const path = join(benefitsDir(), benefitSlug, `${scopeSlug}.json`);
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf-8')) as ServingFile) : null;
  }
}

/** Wszystkie pary (świadczenie, miasto) do prerenderu. Pomija pliki wojewódzkie. */
export function listCityRoutes(): { benefit: string; city: string }[] {
  const root = benefitsDir();

  if (!existsSync(root)) {
    console.warn(`[serving] brak katalogu ${root} — uruchom \`make transform\`. Prerenderuję bez stron miast.`);
    return [];
  }

  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((benefit) =>
      readdirSync(join(root, benefit.name))
        .filter((file) => file.endsWith('.json') && !file.startsWith('wojewodztwo-'))
        .map((file) => ({ benefit: benefit.name, city: file.replace(/\.json$/, '') })),
    );
}

/**
 * Wzbogacony indeks z public/ (pisze go scripts/generate-search-index.mjs w prebuild) -
 * ma fastest_days/fastest_label, których surowy indeks ETL nie zna. Fallback: surowy indeks.
 */
export function loadSearchIndex(): SearchIndexEntry[] {
  const enriched = resolve(process.cwd(), 'public', 'search-index.json');
  const raw = join(servingDir(), 'search-index', 'index.json');
  const path = existsSync(enriched) ? enriched : raw;
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf-8')) as SearchIndexEntry[]) : [];
}
