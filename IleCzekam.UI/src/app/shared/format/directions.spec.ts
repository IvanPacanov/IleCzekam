import { describe, expect, it } from 'vitest';

import { place } from '../../testing/serving-fixtures';
import { directionsUrl } from './directions';

describe('link „Trasa” do Map Google', () => {
  it('placówka ze współrzędnymi: cel to lat,lng', () => {
    expect(directionsUrl(place())).toBe('https://www.google.com/maps/dir/?api=1&destination=50.2945,18.6714');
  });

  it('bez współrzędnych: cel to nazwa + adres, zakodowane do URL-a', () => {
    const url = directionsUrl(place({ latitude: null, longitude: null }));

    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=' +
        encodeURIComponent('SZPITAL MIEJSKI NR 4 W GLIWICACH, UL. ZYGMUNTA STAREGO 20, GLIWICE'),
    );
    // Kontrola: przecinki i spacje nie mogą trafić do URL-a na surowo.
    expect(url).not.toContain(' ');
  });

  it('niekompletna para współrzędnych = brak współrzędnych (kontrakt dopuszcza null w jednym polu)', () => {
    expect(directionsUrl(place({ longitude: null }))).toContain(encodeURIComponent('SZPITAL MIEJSKI'));
    expect(directionsUrl(place({ latitude: null }))).toContain(encodeURIComponent('SZPITAL MIEJSKI'));
  });
});
