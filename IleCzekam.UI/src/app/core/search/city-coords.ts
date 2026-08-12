import { GeoPoint } from './geo';

/**
 * Współrzędne CENTRÓW miejscowości występujących w danych serving.
 *
 * ETL geokoduje na razie ~5% placówek, więc odległości liczymy z dokładnością
 * do miejscowości: placówka bez własnych współrzędnych dostaje środek miasta.
 * Przy promieniach 25-100 km błąd rzędu 1-3 km nie zmienia decyzji pacjenta.
 * Gdy ETL zacznie geokodować adresy, ten słownik zostaje jako fallback.
 */
const CITY_COORDS: Record<string, GeoPoint> = {
  'BIELSKO-BIALA': { latitude: 49.8224, longitude: 19.0584 },
  BIERUN: { latitude: 50.0897, longitude: 19.0928 },
  BLACHOWNIA: { latitude: 50.7833, longitude: 18.9667 },
  BRUDZOWICE: { latitude: 50.4256, longitude: 19.1478 },
  BYTOM: { latitude: 50.3483, longitude: 18.9157 },
  BEDZIN: { latitude: 50.3273, longitude: 19.1288 },
  CHORZOW: { latitude: 50.2974, longitude: 18.9545 },
  CIESZYN: { latitude: 49.7484, longitude: 18.6329 },
  'CZECHOWICE-DZIEDZICE': { latitude: 49.9131, longitude: 19.0064 },
  CZELADZ: { latitude: 50.3197, longitude: 19.0846 },
  'CZERWIONKA-LESZCZYNY': { latitude: 50.1555, longitude: 18.6797 },
  CZESTOCHOWA: { latitude: 50.8118, longitude: 19.1203 },
  'DABROWA GORNICZA': { latitude: 50.3216, longitude: 19.1946 },
  GLIWICE: { latitude: 50.2945, longitude: 18.6714 },
  GRZAWA: { latitude: 49.9744, longitude: 19.1231 },
  JASIENICA: { latitude: 49.8617, longitude: 18.9683 },
  'JASTRZEBIE-ZDROJ': { latitude: 49.9496, longitude: 18.5748 },
  JAWORZE: { latitude: 49.8317, longitude: 18.9683 },
  JAWORZNO: { latitude: 50.2049, longitude: 19.2739 },
  KATOWICE: { latitude: 50.2649, longitude: 19.0238 },
  KNUROW: { latitude: 50.2219, longitude: 18.6653 },
  KONIECPOL: { latitude: 50.7742, longitude: 19.6864 },
  KROCZYCE: { latitude: 50.5531, longitude: 19.5711 },
  KRUSZYNA: { latitude: 50.9722, longitude: 19.2761 },
  KLOBUCK: { latitude: 50.9036, longitude: 18.9367 },
  LUBLINIEC: { latitude: 50.6706, longitude: 18.6842 },
  LEDZINY: { latitude: 50.1428, longitude: 19.1264 },
  'MIASTECZKO SLASKIE': { latitude: 50.5017, longitude: 18.9394 },
  MIKOLOW: { latitude: 50.1708, longitude: 18.9067 },
  MILOWKA: { latitude: 49.5525, longitude: 19.0919 },
  MYSZKOW: { latitude: 50.5753, longitude: 19.3244 },
  MYSLOWICE: { latitude: 50.2081, longitude: 19.1328 },
  'PIEKARY SLASKIE': { latitude: 50.3803, longitude: 18.9583 },
  PNIOWEK: { latitude: 49.9722, longitude: 18.7256 },
  PSZCZYNA: { latitude: 49.9756, longitude: 18.9464 },
  PSZOW: { latitude: 50.0392, longitude: 18.3947 },
  RACIBORZ: { latitude: 50.0917, longitude: 18.2189 },
  RAJCZA: { latitude: 49.5083, longitude: 19.1128 },
  'RUDA SLASKA': { latitude: 50.2558, longitude: 18.8556 },
  RYBNIK: { latitude: 50.0971, longitude: 18.5419 },
  RYDULTOWY: { latitude: 50.0656, longitude: 18.4239 },
  REDZINY: { latitude: 50.8636, longitude: 19.2033 },
  'SIEMIANOWICE SLASKIE': { latitude: 50.3269, longitude: 19.0294 },
  SKOCZOW: { latitude: 49.8006, longitude: 18.7878 },
  SOSNOWIEC: { latitude: 50.2863, longitude: 19.1042 },
  SZCZEKOCINY: { latitude: 50.6272, longitude: 19.8258 },
  'TARNOWSKIE GORY': { latitude: 50.4453, longitude: 18.8617 },
  TYCHY: { latitude: 50.1372, longitude: 18.964 },
  USTRON: { latitude: 49.7194, longitude: 18.8103 },
  'WODZISLAW SLASKI': { latitude: 50.0033, longitude: 18.4622 },
  ZABRZE: { latitude: 50.3025, longitude: 18.7781 },
  ZAWIERCIE: { latitude: 50.4878, longitude: 19.4167 },
  'LAZISKA GORNE': { latitude: 50.1494, longitude: 18.8422 },
  SWIETOCHLOWICE: { latitude: 50.2917, longitude: 18.9178 },
  ZORY: { latitude: 50.045, longitude: 18.7006 },
  ZYWIEC: { latitude: 49.6853, longitude: 19.1922 },
  OPOLE: { latitude: 50.6751, longitude: 17.9213 }
};

const POLISH_TO_ASCII: Record<string, string> = {
  Ą: 'A',
  Ć: 'C',
  Ę: 'E',
  Ł: 'L',
  Ń: 'N',
  Ó: 'O',
  Ś: 'S',
  Ź: 'Z',
  Ż: 'Z'
};

/** Klucz słownika: wersaliki bez polskich znaków, pojedyncze odstępy. */
function coordsKey(name: string): string {
  return [...name.toUpperCase().trim()]
    .map((char) => POLISH_TO_ASCII[char] ?? char)
    .join('')
    .replace(/\s+/g, ' ');
}

/** Środek miejscowości albo `null`, gdy nazwy nie znamy. */
export function cityCoords(locality: string): GeoPoint | null {
  return CITY_COORDS[coordsKey(locality)] ?? null;
}
