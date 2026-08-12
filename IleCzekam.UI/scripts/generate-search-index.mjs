// Kopiuje indeks wyszukiwarki z wyjścia ETL do public/, żeby strona startowa (CSR)
// mogła go pobrać jednym requestem. Uruchamiane przed `npm start` i `npm run build`.
// Dodatkowo kopiuje pliki WOJEWÓDZKIE serving do public/serving/ - widok /szukaj (CSR)
// pobiera z nich pełną listę placówek świadczenia z współrzędnymi.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

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

const benefitsDir = resolve(servingDir, 'swiadczenia');
const servingTarget = resolve(targetDir, 'serving');

// Katalog budowany od zera - po zniknięciu świadczenia z ETL stary plik ma nie zostać.
rmSync(servingTarget, { recursive: true, force: true });

if (existsSync(benefitsDir)) {
  let copied = 0;
  for (const entry of readdirSync(benefitsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const files = readdirSync(join(benefitsDir, entry.name)).filter(
      (file) => file.startsWith('wojewodztwo-') && file.endsWith('.json'),
    );

    for (const file of files) {
      mkdirSync(join(servingTarget, entry.name), { recursive: true });
      copyFileSync(join(benefitsDir, entry.name, file), join(servingTarget, entry.name, file));
      copied += 1;
    }
  }
  console.log(`[serving] ${copied} plików wojewódzkich -> public/serving/`);
} else {
  console.warn(`[serving] brak ${benefitsDir} - /szukaj nie będzie mieć danych.`);
}
