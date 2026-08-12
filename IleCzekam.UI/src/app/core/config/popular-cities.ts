/**
 * Kolejność miast w panelu „Popularne miasta” - największe najpierw.
 * To tylko RANKING: panel pokazuje wyłącznie miasta, które realnie występują
 * w indeksie wyszukiwarki (czyli mają prerenderowane strony), i dokłada na koniec
 * te spoza listy. Slug musi odpowiadać `city_slug` z data/serving.
 */
export const POPULAR_CITY_SLUGS: readonly string[] = [
  'katowice',
  'czestochowa',
  'sosnowiec',
  'gliwice',
  'zabrze',
  'bielsko-biala',
  'bytom',
  'rybnik',
  'ruda-slaska',
  'tychy',
  'dabrowa-gornicza',
  'chorzow',
  'jaworzno',
  'jastrzebie-zdroj',
  'myslowice',
  'siemianowice-slaskie'
];

/** Maksymalna liczba miast w panelu. */
export const POPULAR_CITIES_LIMIT = 16;
