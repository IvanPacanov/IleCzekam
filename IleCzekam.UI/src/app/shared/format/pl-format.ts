const MONTHS_NOMINATIVE = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
];

const MONTHS_LOCATIVE = [
  'styczniu', 'lutym', 'marcu', 'kwietniu', 'maju', 'czerwcu',
  'lipcu', 'sierpniu', 'wrześniu', 'październiku', 'listopadzie', 'grudniu',
];

const MONTHS_ACCUSATIVE = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
];

const MONTHS_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function monthIndex(month: string): number | null {
  const parts = month.split('-');
  const index = Number(parts[1]) - 1;
  return Number.isInteger(index) && index >= 0 && index < 12 ? index : null;
}

/** `2026-08` → `sierpień 2026`. */
export function monthLabel(month: string | null): string {
  const index = month === null ? null : monthIndex(month);
  return index === null || month === null ? '' : `${MONTHS_NOMINATIVE[index]} ${month.slice(0, 4)}`;
}

/** `2026-08` → `sierpniu 2026` (miejscownik: „dane za …”). */
export function monthLocative(month: string | null): string {
  const index = month === null ? null : monthIndex(month);
  return index === null || month === null ? '' : `${MONTHS_LOCATIVE[index]} ${month.slice(0, 4)}`;
}

/** `2026-08` → `sierpień` (biernik: „dane za …”). */
export function monthAccusative(month: string | null): string {
  const index = month === null ? null : monthIndex(month);
  return index === null ? '' : MONTHS_ACCUSATIVE[index];
}

/** `2026-08` → `sierpień 2026` - forma po przyimku „za” (biernik). */
export function monthAfterZa(month: string | null): string {
  const index = month === null ? null : monthIndex(month);
  return index === null || month === null ? '' : `${MONTHS_ACCUSATIVE[index]} ${month.slice(0, 4)}`;
}

/** `2026-08` → `VIII` - oś trendu, tak jak w projekcie. */
export function monthRoman(month: string): string {
  const index = monthIndex(month);
  return index === null ? month : MONTHS_ROMAN[index];
}

/** `2026-08-07` → `7.08.2026`. */
export function dateLabel(date: string | null): string {
  if (date === null) {
    return '';
  }

  const [year, month, day] = date.split('-');
  return day === undefined ? date : `${Number(day)}.${month}.${year}`;
}

/**
 * `+48 32 461 32 01` → `32 461 32 01`. Prefiks kraju zabiera miejsce i nic nie wnosi
 * pacjentowi, który i tak dzwoni z Polski; `tel:` zachowuje pełny numer.
 */
export function phoneDisplay(phone: string): string {
  return phone.replace(/^\+48\s*/, '').trim();
}

export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/\s+/g, '')}`;
}

/** Polska liczba mnoga: 1 / 2–4 / 5+ z wyjątkiem nastek (12–14). */
export function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) {
    return one;
  }

  const lastTwo = count % 100;
  const last = count % 10;
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
}

/**
 * Etykieta dla wyliczonych dni oczekiwania - te same progi zaokrągleń, co w ETL:
 * < 30 dni → dni, 30–84 → tygodnie, ≥ 85 → miesiące.
 */
export function daysApprox(days: number): string {
  if (days === 0) {
    return 'bez oczekiwania';
  }

  if (days < 30) {
    return `ok. ${days} ${plural(days, 'dzień', 'dni', 'dni')}`;
  }

  if (days < 85) {
    const weeks = Math.round(days / 7);
    return `ok. ${weeks} ${plural(weeks, 'tydzień', 'tygodnie', 'tygodni')}`;
  }

  const months = Math.round(days / 30);
  return `ok. ${months} ${plural(months, 'miesiąc', 'miesiące', 'miesięcy')}`;
}

export function peopleWaiting(count: number): string {
  return `${count} ${plural(count, 'osoba', 'osoby', 'osób')} w kolejce`;
}

export function placesCount(count: number): string {
  return `${count} ${plural(count, 'placówka', 'placówki', 'placówek')}`;
}

/** Dopełniacz po liczbie: „z 1 placówki”, „z 5 placówek”. */
export function placesGenitive(count: number): string {
  return `${count} ${count === 1 ? 'placówki' : 'placówek'}`;
}

// Wyrazy, które w nazwach własnych zostają małą literą (poza pierwszą pozycją).
const LOWERCASE_WORDS = new Set([
  'w', 'we', 'i', 'z', 'ze', 'na', 'do', 'dla', 'od', 'po', 'przy', 'oraz', 'im', 'nr',
  'sp', 'o', 'a', 'sa', 'ul', 'al', 'pl',
  // nazwy własne bywają angielskie („American Heart of Poland”)
  'of', 'the', 'and',
]);

/**
 * NFZ zwraca nazwy placówek i adresy WERSALIKAMI. Krzyk w interfejsie jest gorzej czytelny
 * i niezgodny z projektem, więc sprowadzamy je do zapisu zdaniowego.
 */
export function titleCasePl(text: string): string {
  const words = text.toLocaleLowerCase('pl-PL').split(/(\s+|-|\/)/u);
  let isFirstWord = true;

  return words
    .map((word) => {
      if (/^(\s+|-|\/)$/u.test(word) || word === '') {
        return word;
      }

      // Nazwy bywają w cudzysłowie („\"SZPITAL MIEJSKI…\"”) - wielką literą ma zostać
      // pierwsza LITERA, nie pierwszy znak.
      const bare = word.replace(/[^\p{L}]/gu, '');
      const keepLower = !isFirstWord && LOWERCASE_WORDS.has(bare);
      isFirstWord = false;

      if (keepLower) {
        return word;
      }

      const firstLetter = word.search(/\p{L}/u);
      return firstLetter < 0
        ? word
        : word.slice(0, firstLetter) +
            word.charAt(firstLetter).toLocaleUpperCase('pl-PL') +
            word.slice(firstLetter + 1);
    })
    .join('');
}
