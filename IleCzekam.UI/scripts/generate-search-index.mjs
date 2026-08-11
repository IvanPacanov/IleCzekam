// Kopiuje indeks wyszukiwarki z wyjścia ETL do public/, żeby strona startowa (CSR)
// mogła go pobrać jednym requestem. Uruchamiane przed `npm start` i `npm run build`.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const servingDir = process.env.SERVING_DIR ?? resolve(import.meta.dirname, '..', '..', 'data', 'serving');
const source = resolve(servingDir, 'search-index', 'index.json');
const targetDir = resolve(import.meta.dirname, '..', 'public');
const target = resolve(targetDir, 'search-index.json');

mkdirSync(targetDir, { recursive: true });

if (existsSync(source)) {
  copyFileSync(source, target);
  console.log(`[search-index] ${source} -> public/search-index.json`);
} else {
  // Pusty indeks zamiast 404 - strona startowa pokaże wtedy stan „brak wyników”,
  // a nie błąd ładowania.
  writeFileSync(target, '[]\n', 'utf-8');
  console.warn(`[search-index] brak ${source} - uruchom \`make transform\`. Zapisano pusty indeks.`);
}
