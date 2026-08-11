// Przy RenderMode.Client dla trasy '' Angular zapisuje tylko index.csr.html.
// Statyczny hosting oczekuje index.html pod '/' — kopiujemy po buildzie.
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const browserDir = resolve(import.meta.dirname, '..', 'dist', 'IleCzekam.UI', 'browser');
const csr = resolve(browserDir, 'index.csr.html');
const index = resolve(browserDir, 'index.html');

if (existsSync(csr) && !existsSync(index)) {
  copyFileSync(csr, index);
  console.log('[finalize-static] index.csr.html -> index.html');
}
