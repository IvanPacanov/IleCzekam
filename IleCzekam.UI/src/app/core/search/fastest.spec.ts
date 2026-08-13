import { describe, expect, it } from 'vitest';

import { enrichIndex } from '../../../../scripts/fastest.mjs';
import { place, wait } from '../../testing/serving-fixtures';
import { fastestWait } from './fastest';

/**
 * Twardy wymóg spójności: czas na chipie miasta w panelu podpowiedzi
 * (fastest_label z indeksu, liczony przez scripts/fastest.mjs) MUSI równać się
 * wartości „najkrótszy termin” w zdaniu nagłówka wyników (fastestWait).
 */
describe('najkrótszy termin w mieście - jedna reguła dla chipów i nagłówka wyników', () => {
  const gliwice = [
    place({ id: 'g1', locality: 'GLIWICE', wait_stable: wait('dlugo', 'ok. 5 miesięcy', 150) }),
    place({ id: 'g2', locality: 'GLIWICE', wait_stable: wait('krotko', 'ok. 2 tygodnie', 14) })
  ];
  const bytom = [
    place({ id: 'b1', locality: 'BYTOM', wait_stable: wait('umiarkowanie', 'ok. 6 tygodni', 42) }),
    place({ id: 'b2', locality: 'BYTOM', wait_stable: wait('brak_danych', 'brak danych', null) })
  ];

  const entry = (city: string, city_slug: string) => ({
    benefit_slug: 'kardiologia',
    benefit_label: 'Kardiologia - oddział szpitalny',
    synonyms: [],
    city,
    city_slug,
    province: '12',
    median_days: 80,
    places_total: 2
  });

  it('chip miasta i zdanie nagłówka pokazują tę samą wartość (2 miasta)', () => {
    const enriched = enrichIndex(
      [entry('GLIWICE', 'gliwice'), entry('BYTOM', 'bytom')],
      { kardiologia: [...gliwice, ...bytom] }
    );

    expect(enriched[0].fastest_label).toBe(fastestWait(gliwice)?.human_label);
    expect(enriched[1].fastest_label).toBe(fastestWait(bytom)?.human_label);
    // Kontrola wartości wprost - min, nie mediana i nie pierwszy z brzegu.
    expect(enriched[0].fastest_label).toBe('ok. 2 tygodnie');
    expect(enriched[1].fastest_label).toBe('ok. 6 tygodni');
  });

  it('miasto bez żadnych danych: chip bez czasu, nagłówek bez „najkrótszego terminu”', () => {
    const noData = [place({ id: 'n1', locality: 'ZABRZE', wait_stable: wait('brak_danych', 'brak danych', null) })];
    const enriched = enrichIndex([entry('ZABRZE', 'zabrze')], { kardiologia: noData });

    expect(enriched[0].fastest_label).toBeNull();
    expect(fastestWait(noData)).toBeNull();
  });

  it('brak danych (null) nigdy nie wygrywa z realnym czasem', () => {
    expect(fastestWait(bytom)?.raw_days).toBe(42);
  });
});
