/**
 * Route planning for a day of field visits (08 P3): nearest-neighbour ordering from where the officer
 * is, with straight-line distances. Good enough to order 3–10 shops; turn-by-turn is the phone's Maps.
 */
export type LatLng = { lat: number; lng: number };

/** ESWASA head office, Mbabane — start point when the device has no fix. */
export const ESWASA_HQ: LatLng = { lat: -26.3167, lng: 31.1333 };

export function km(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function planRoute<T extends { gps: LatLng }>(start: LatLng, stops: T[]): { order: (T & { leg_km: number })[]; total_km: number } {
  const left = [...stops];
  const order: (T & { leg_km: number })[] = [];
  let here = start;
  let total = 0;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (km(here, left[i].gps) < km(here, left[best].gps)) best = i;
    const next = left.splice(best, 1)[0];
    const leg = km(here, next.gps);
    total += leg;
    order.push({ ...next, leg_km: Math.round(leg * 10) / 10 });
    here = next.gps;
  }
  return { order, total_km: Math.round(total * 10) / 10 };
}

/** Google Maps directions link with the stops as waypoints (opens the phone's Maps app). */
export function mapsLink(start: LatLng, stops: LatLng[]): string {
  if (!stops.length) return "https://www.google.com/maps";
  const p = (x: LatLng) => `${x.lat},${x.lng}`;
  const dest = stops[stops.length - 1];
  const via = stops.slice(0, -1).map(p).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${p(start)}&destination=${p(dest)}${via ? `&waypoints=${encodeURIComponent(via)}` : ""}&travelmode=driving`;
}
