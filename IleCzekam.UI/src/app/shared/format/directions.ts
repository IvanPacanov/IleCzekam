import { Place } from '@models/serving';

/** Pola placówki potrzebne do wyznaczenia trasy - reszta karty nas tu nie obchodzi. */
export type DirectionsTarget = Pick<Place, 'provider' | 'address' | 'locality' | 'latitude' | 'longitude'>;

/**
 * Link „Trasa” do Map Google (bez osadzania mapy i bez klucza API - czysty URL).
 * Współrzędne z ETL są dokładniejsze niż geokodowanie adresu, więc mają pierwszeństwo;
 * przy ich braku Google dostaje nazwę z adresem i geokoduje samo.
 */
export function directionsUrl(target: DirectionsTarget): string {
  const destination =
    target.latitude !== null && target.longitude !== null
      ? `${target.latitude},${target.longitude}`
      : encodeURIComponent(`${target.provider}, ${target.address}, ${target.locality}`);

  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}
