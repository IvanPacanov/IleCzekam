/** Punkt odniesienia wyszukiwania - ustalany RAZ per wyszukiwanie. */
export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}

const EARTH_RADIUS_KM = 6371;

/** Odległość po ortodromie (haversine) w km. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Środek ciężkości punktów; `null` dla pustej listy. */
export function centroid(points: readonly GeoPoint[]): GeoPoint | null {
  if (points.length === 0) {
    return null;
  }

  return {
    latitude: points.reduce((sum, p) => sum + p.latitude, 0) / points.length,
    longitude: points.reduce((sum, p) => sum + p.longitude, 0) / points.length
  };
}

/** `12,3` km → „12 km”, poniżej 10 km z jednym miejscem po przecinku („1,2 km”). */
export function kmLabel(km: number): string {
  return km < 10 ? `${km.toFixed(1).replace('.', ',').replace(',0', '')} km` : `${Math.round(km)} km`;
}
