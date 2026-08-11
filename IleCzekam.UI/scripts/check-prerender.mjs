// Smoke test prerenderu: uruchamiany po `npm run build` (npm run check:prerender).
// Sprawdza, że statyczne strony istnieją i niosą realne dane z ETL - nie sam szkielet.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve(import.meta.dirname, '..', 'dist', 'IleCzekam.UI', 'browser');

/**
 * Czyta wyrenderowaną TREŚĆ strony. Skrypty są wycinane celowo: strona niesie też
 * payload TransferState z surowymi danymi z NFZ (wersaliki, oryginalne pola), a testujemy
 * to, co widzi pacjent, nie to, co wisi w JSON-ie.
 */
const read = (path) =>
  readFileSync(path, 'utf-8')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replaceAll('&nbsp;', ' ');

const checks = [
  {
    file: 'index.html',
    contains: ['ileczekam.pl', 'app-root'],
  },
  {
    file: 'o-danych/index.html',
    contains: ['Skąd bierzemy te liczby', 'prognozowany czas oczekiwania', 'api.nfz.gov.pl'],
  },
  {
    // Miasto z jedną placówką - zastrzeżenie o małej próbie musi być widoczne.
    file: 'swiadczenie/kardiologia/gliwice/index.html',
    contains: [
      'w Gliwicach',
      'Szpital Miejski w Gliwicach',
      '32 461 32 01',
      'Mediana policzona z 1 placówki',
      'api.nfz.gov.pl',
      'Dane NFZ za sierpień 2026',
    ],
    absent: ['SZPITAL MIEJSKI', 'sierpniu 2026'],
  },
  {
    // Tychy mają placówkę BEZ danych - musi zostać na liście, z telefonem i ostrzeżeniem.
    file: 'swiadczenie/kardiologia/tychy/index.html',
    contains: [
      'brak danych',
      'nie przekazano',
      'To nie znaczy, że kolejka jest krótka',
      'American Heart of Poland',
    ],
    absent: ['0 dni'],
  },
];

let failed = false;

for (const { file, contains, absent = [] } of checks) {
  const path = resolve(distDir, file);
  let html;
  try {
    html = read(path);
  } catch {
    console.error(`FAIL ${file}: plik nie istnieje (czy build przeszedł?)`);
    failed = true;
    continue;
  }

  for (const needle of contains) {
    if (html.includes(needle)) {
      console.log(`OK   ${file}: zawiera ${JSON.stringify(needle)}`);
    } else {
      console.error(`FAIL ${file}: brak ${JSON.stringify(needle)}`);
      failed = true;
    }
  }

  for (const needle of absent) {
    if (html.includes(needle)) {
      console.error(`FAIL ${file}: NIE powinno zawierać ${JSON.stringify(needle)}`);
      failed = true;
    } else {
      console.log(`OK   ${file}: nie zawiera ${JSON.stringify(needle)}`);
    }
  }
}

process.exit(failed ? 1 : 0);
