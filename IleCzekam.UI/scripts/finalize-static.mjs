// Przy RenderMode.Client Angular zapisuje tylko index.csr.html. Statyczny hosting
// oczekuje index.html pod '/' oraz /szukaj/index.html dla trasy klienckiej -
// kopiujemy po buildzie.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const browserDir = resolve(import.meta.dirname, '..', 'dist', 'IleCzekam.UI', 'browser');
const csr = resolve(browserDir, 'index.csr.html');

const targets = [
  resolve(browserDir, 'index.html'),
  resolve(browserDir, 'szukaj', 'index.html'),
];

if (existsSync(csr)) {
  for (const target of targets) {
    if (!existsSync(target)) {
      mkdirSync(resolve(target, '..'), { recursive: true });
      copyFileSync(csr, target);
      console.log(`[finalize-static] index.csr.html -> ${target.replace(browserDir, '')}`);
    }
  }
}
