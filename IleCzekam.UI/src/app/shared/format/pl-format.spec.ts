import { describe, expect, it } from 'vitest';

import { cityHeadline, cityLocative, cityName } from './city-name';
import {
  dateLabel,
  monthAfterZa,
  monthLabel,
  monthRoman,
  peopleWaiting,
  phoneDisplay,
  phoneHref,
  placesGenitive,
  plural,
  titleCasePl,
} from './pl-format';

describe('odmiana liczebników', () => {
  it.each([
    [1, 'miesiąc'],
    [2, 'miesiące'],
    [4, 'miesiące'],
    [5, 'miesięcy'],
    [12, 'miesięcy'],
    [13, 'miesięcy'],
    [14, 'miesięcy'],
    [22, 'miesiące'],
    [25, 'miesięcy'],
  ])('%i → %s', (count, expected) => {
    expect(plural(count, 'miesiąc', 'miesiące', 'miesięcy')).toBe(expected);
  });

  it('liczba oczekujących', () => {
    expect(peopleWaiting(1)).toBe('1 osoba w kolejce');
    expect(peopleWaiting(3)).toBe('3 osoby w kolejce');
    expect(peopleWaiting(50)).toBe('50 osób w kolejce');
  });

  it('dopełniacz po liczbie placówek', () => {
    expect(placesGenitive(1)).toBe('1 placówki');
    expect(placesGenitive(5)).toBe('5 placówek');
  });
});

describe('daty i miesiące', () => {
  it('miesiąc po przyimku „za” jest w bierniku', () => {
    // „za sierpniu 2026” było błędem - miejscownik nie pasuje do tego przyimka.
    expect(monthAfterZa('2026-08')).toBe('sierpień 2026');
  });

  it('miesiąc w mianowniku', () => {
    expect(monthLabel('2026-08')).toBe('sierpień 2026');
  });

  it('oś trendu po rzymsku', () => {
    expect(monthRoman('2026-08')).toBe('VIII');
  });

  it('data placówki', () => {
    expect(dateLabel('2026-08-07')).toBe('7.08.2026');
    expect(dateLabel(null)).toBe('');
  });
});

describe('telefon', () => {
  it('wyświetla numer bez prefiksu kraju, ale dzwoni na pełny', () => {
    expect(phoneDisplay('+48 32 461 32 01')).toBe('32 461 32 01');
    expect(phoneHref('+48 32 461 32 01')).toBe('tel:+48324613201');
  });
});

describe('wersaliki z NFZ', () => {
  it('sprowadza nazwę placówki do zapisu zdaniowego', () => {
    expect(titleCasePl('SZPITAL MIEJSKI W GLIWICACH')).toBe('Szpital Miejski w Gliwicach');
  });

  it('zachowuje cudzysłów, ale podnosi pierwszą literę', () => {
    expect(titleCasePl('"SZPITAL MIEJSKI W TYCHACH"')).toBe('"Szpital Miejski w Tychach"');
  });

  it('nie podnosi angielskich wyrazów funkcyjnych', () => {
    expect(titleCasePl('AMERICAN HEART OF POLAND')).toBe('American Heart of Poland');
  });

  it('radzi sobie z adresem i myślnikiem', () => {
    expect(titleCasePl('TADEUSZA KOŚCIUSZKI 29, GLIWICE')).toBe('Tadeusza Kościuszki 29, Gliwice');
    expect(titleCasePl('BIELSKO-BIAŁA')).toBe('Bielsko-Biała');
  });
});

describe('nazwy miast', () => {
  it('sprowadza wersaliki do zapisu zdaniowego', () => {
    expect(cityName('DĄBROWA GÓRNICZA')).toBe('Dąbrowa Górnicza');
    expect(cityName('JASTRZĘBIE-ZDRÓJ')).toBe('Jastrzębie-Zdrój');
  });

  it.each([
    ['GLIWICE', 'Gliwicach'],
    ['KATOWICE', 'Katowicach'],
    ['TYCHY', 'Tychach'],
    ['BYTOM', 'Bytomiu'],
    ['SOSNOWIEC', 'Sosnowcu'],
    ['ZABRZE', 'Zabrzu'],
    ['DĄBROWA GÓRNICZA', 'Dąbrowie Górniczej'],
    ['BIELSKO-BIAŁA', 'Bielsku-Białej'],
    ['JASTRZĘBIE-ZDRÓJ', 'Jastrzębiu-Zdroju'],
  ])('miejscownik %s → %s', (name, expected) => {
    expect(cityLocative(name)).toBe(expected);
  });

  it('reguła -ice działa dla miast spoza słownika', () => {
    expect(cityLocative('KOZIE GŁOWICE')).toBe('Kozie Głowicach');
  });

  it('dla nieznanej nazwy zwraca null zamiast zgadywać', () => {
    expect(cityLocative('KRZYWOGONIEC')).toBeNull();
  });

  it('nagłówek schodzi na formę z dwukropkiem, gdy nie znamy odmiany', () => {
    expect(cityHeadline('Kardiologia', 'GLIWICE')).toBe('Kardiologia w Gliwicach');
    expect(cityHeadline('Kardiologia', 'KRZYWOGONIEC')).toBe('Kardiologia: Krzywogoniec');
  });
});
