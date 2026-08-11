/**
 * Nazwy miast z API NFZ przychodzą WERSALIKAMI („DĄBROWA GÓRNICZA”), a projekt wymaga
 * miejscownika w nagłówku („Kardiolog w Gliwicach”).
 *
 * Odmiana polskich nazw miejscowości nie da się sprowadzić do reguł bez wyjątków
 * (Bytom → Bytomiu, ale Sosnowiec → Sosnowcu; „Dąbrowa Górnicza” wymaga uzgodnienia
 * przymiotnika). Dlatego: słownik dla nazw, które faktycznie mamy w danych, wąska reguła
 * dla bezpiecznego wzorca -ice/-yce, i `null` zamiast zgadywania. Nagłówek z błędnie
 * odmienioną nazwą miasta jest bardziej rażący niż nagłówek bez miejscownika.
 */
const LOCATIVE: Record<string, string> = {
  BIELSKOBIALA: 'Bielsku-Białej',
  BYTOM: 'Bytomiu',
  CHORZOW: 'Chorzowie',
  CIESZYN: 'Cieszynie',
  CZESTOCHOWA: 'Częstochowie',
  DABROWAGORNICZA: 'Dąbrowie Górniczej',
  GLIWICE: 'Gliwicach',
  JASTRZEBIEZDROJ: 'Jastrzębiu-Zdroju',
  JAWORZNO: 'Jaworznie',
  KATOWICE: 'Katowicach',
  MYSZKOW: 'Myszkowie',
  RACIBORZ: 'Raciborzu',
  RYBNIK: 'Rybniku',
  SIEMIANOWICESLASKIE: 'Siemianowicach Śląskich',
  SOSNOWIEC: 'Sosnowcu',
  TYCHY: 'Tychach',
  USTRON: 'Ustroniu',
  ZABRZE: 'Zabrzu',
  ZYWIEC: 'Żywcu',
  RUDASLASKA: 'Rudzie Śląskiej',
  MYSLOWICE: 'Mysłowicach',
  TARNOWSKIEGORY: 'Tarnowskich Górach',
  ZORY: 'Żorach',
  PIEKARYSLASKIE: 'Piekarach Śląskich',
  SWIETOCHLOWICE: 'Świętochłowicach',
  KNUROW: 'Knurowie',
  WODZISLAWSLASKI: 'Wodzisławiu Śląskim',
  BEDZIN: 'Będzinie',
  CZELADZ: 'Czeladzi',
  OPOLE: 'Opolu',
};

const POLISH_TO_ASCII: Record<string, string> = {
  Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z',
};

function dictionaryKey(name: string): string {
  return [...name.toUpperCase()]
    .map((char) => POLISH_TO_ASCII[char] ?? char)
    .join('')
    .replace(/[^A-Z]/g, '');
}

/** `DĄBROWA GÓRNICZA` → `Dąbrowa Górnicza`. */
export function cityName(name: string): string {
  return name
    .toLocaleLowerCase('pl-PL')
    .replace(/(^|[\s\-/])([\p{L}])/gu, (_, separator: string, letter: string) =>
      separator + letter.toLocaleUpperCase('pl-PL'),
    );
}

/** `GLIWICE` → `Gliwicach`. Zwraca `null`, gdy nie znamy poprawnej formy. */
export function cityLocative(name: string): string | null {
  const known = LOCATIVE[dictionaryKey(name)];
  if (known !== undefined) {
    return known;
  }

  // Bezpieczna reguła: nazwy mnogie na -ice/-yce mają miejscownik na -icach/-ycach
  // bez wyjątków (Gliwice, Katowice, Kielce nie wchodzą - kończą się na -lce).
  const title = cityName(name);
  return /(?:ice|yce)$/u.test(title) ? `${title.slice(0, -1)}ach` : null;
}

/**
 * Nagłówek strony miasta. Bez znanego miejscownika schodzimy na formę z dwukropkiem,
 * zamiast produkować niepoprawną polszczyznę.
 */
export function cityHeadline(benefitLabel: string, city: string): string {
  const locative = cityLocative(city);
  return locative === null ? `${benefitLabel}: ${cityName(city)}` : `${benefitLabel} w ${locative}`;
}
