// Smoke test buildu statycznego: uruchamiany po `npm run build` (npm run check:prerender).
// Sprawdza, że statyczne strony istnieją i zawierają kluczowe treści.
// Po fazie B dojdą tu strony świadczeń (/swiadczenie/{benefit}/{miasto}/index.html).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve(import.meta.dirname, '..', 'dist', 'IleCzekam.UI', 'browser');

/** Twarde spacje w HTML-u są encodowane jako &nbsp; — normalizujemy do U+00A0. */
const read = (path) => readFileSync(path, 'utf-8').replaceAll('&nbsp;', ' ');

const checks = [{ file: 'index.html', contains: ['ileczekam.pl', 'app-root'] }];

let failed = false;

for (const { file, contains } of checks) {
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
}

process.exit(failed ? 1 : 0);
