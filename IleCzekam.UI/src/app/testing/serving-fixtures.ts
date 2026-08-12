import { Place, ServingFile, Wait, WaitBucket } from '@models/serving';

/** Fixtures do testów - minimalne, ale zgodne z kształtem plików serving z ETL. */

export function wait(bucket: WaitBucket, label: string, days: number | null): Wait {
  return { pcus_raw: null, raw_days: days, human_label: label, bucket, as_at: '2026-08-01' };
}

export function place(overrides: Partial<Place> = {}): Place {
  return {
    id: 'p-1',
    provider: 'SZPITAL MIEJSKI NR 4 W GLIWICACH',
    place: 'PORADNIA KARDIOLOGICZNA',
    address: 'UL. ZYGMUNTA STAREGO 20',
    locality: 'GLIWICE',
    teryt: '2466',
    phone: '+48 32 461 61 00',
    latitude: 50.2945,
    longitude: 18.6714,
    for_children: false,
    nfz_benefit: 'ODDZIAŁ KARDIOLOGICZNY',
    wait_stable: wait('dlugo', 'ok. 7 miesięcy', 210),
    wait_urgent: null,
    awaiting: 1240,
    average_period_days: null,
    stats_month: '2026-07',
    flags: [],
    ...overrides
  };
}

export function servingFile(places: readonly Place[]): ServingFile {
  return {
    benefit: {
      slug: 'kardiologia',
      label: 'Kardiologia - oddział szpitalny',
      nfz_benefits: ['ODDZIAŁ KARDIOLOGICZNY']
    },
    scope: { type: 'miasto', name: 'GLIWICE', slug: 'gliwice', teryt: '2466', province: '12' },
    snapshot_month: '2026-08',
    generated_at: '2026-08-12T00:00:00Z',
    source: { name: 'NFZ', url: 'https://api.nfz.gov.pl/' },
    summary: {
      median_days: 150,
      median_label: 'ok. 5 miesięcy',
      median_bucket: 'dlugo',
      fastest:
        places[0] === undefined
          ? null
          : {
              place_id: places[0].id,
              provider: places[0].provider,
              locality: places[0].locality,
              raw_days: places[0].wait_stable.raw_days ?? 0,
              human_label: places[0].wait_stable.human_label
            },
      places_total: places.length,
      places_with_data: places.filter((p) => p.wait_stable.raw_days !== null).length,
      places_without_data: places.filter((p) => p.wait_stable.raw_days === null).length,
      flags: []
    },
    comparison: {
      scope_median_days: 150,
      province_median_days: 140,
      best_city_in_province: null
    },
    trend: [{ month: '2026-08', median_days: 150, places_with_data: places.length }],
    places
  };
}
