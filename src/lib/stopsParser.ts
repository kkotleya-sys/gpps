// Utility functions to fetch public transport stops from Mapbox.
// IMPORTANT:
// - Use the official Mapbox APIs (requires an access token).
// - Do NOT scrape third-party map pages.

export interface StopData {
  name: string;
  latitude: number;
  longitude: number;
}

const FALLBACK_DUSHANBE_STOPS: StopData[] = [
  { name: 'Автовокзал', latitude: 38.5598, longitude: 68.7738 },
];

const DUSHANBE_BBOX: [number, number, number, number] = [68.6738, 38.4598, 68.8738, 38.6598];

// Vite env var (set in .env): VITE_MAPBOX_TOKEN=...
function getMapboxToken(): string | null {
  const token = (import.meta as any).env?.VITE_MAPBOX_TOKEN as string | undefined;
  return token && token.trim() ? token.trim() : null;
}

export function hasMapboxToken(): boolean {
  return !!getMapboxToken();
}

function isLikelyStop(name: string, category?: string): boolean {
  const lower = `${name} ${category ?? ''}`.toLowerCase();
  return (
    lower.includes('останов') ||
    lower.includes('bus stop') ||
    lower.includes('автобус') ||
    lower.includes('станц') ||
    lower.includes('station')
  );
}

async function mapboxSearch(query: string, bbox?: [number, number, number, number]) {
  const token = getMapboxToken();
  if (!token) return [] as StopData[];

  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('limit', '10');
  url.searchParams.set('language', 'ru');
  url.searchParams.set('types', 'poi');
  if (bbox) url.searchParams.set('bbox', bbox.join(','));
  url.searchParams.set('proximity', '68.7738,38.5598');

  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const json = await res.json();
  const features = json?.features ?? [];
  return features
    .map((f: any) => ({
      name: f?.text ?? f?.place_name ?? '',
      latitude: f?.center?.[1],
      longitude: f?.center?.[0],
      category: f?.properties?.category ?? '',
    }))
    .filter((s: any) => s.name && Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
    .filter((s: any) => isLikelyStop(s.name, s.category))
    .map((s: any) => ({ name: s.name, latitude: s.latitude, longitude: s.longitude }));
}

/**
 * Search stops by text query (used in StopSelector).
 * Returns up to 10 suggestions.
 */
export async function searchStopsFromMapbox(query: string): Promise<StopData[]> {
  const token = getMapboxToken();
  if (!token) {
    const q = query.trim().toLowerCase();
    return FALLBACK_DUSHANBE_STOPS.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 10);
  }

  const results = await mapboxSearch(query, DUSHANBE_BBOX);
  if (results.length) return results.slice(0, 10);

  const fallback = await mapboxSearch(`${query} остановка`, DUSHANBE_BBOX);
  return fallback.slice(0, 10);
}

/**
 * Bulk-load (iterate) public transport stops for Dushanbe using Mapbox Geocoding API.
 * This returns raw StopData array; saving to DB should be done server-side/admin-only.
 */
export async function fetchAllDushanbeStopsFromMapbox(): Promise<StopData[]> {
  const token = getMapboxToken();
  if (!token) return FALLBACK_DUSHANBE_STOPS;

  const result: StopData[] = [];
  const seen = new Set<string>();
  const [minLng, minLat, maxLng, maxLat] = DUSHANBE_BBOX;

  const steps = 4;
  const lngStep = (maxLng - minLng) / steps;
  const latStep = (maxLat - minLat) / steps;
  const queries = ['остановка', 'bus stop'];

  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const cell: [number, number, number, number] = [
        minLng + lngStep * i,
        minLat + latStep * j,
        minLng + lngStep * (i + 1),
        minLat + latStep * (j + 1),
      ];

      for (const q of queries) {
        const chunk = await mapboxSearch(q, cell);
        chunk.forEach((s: any) => {
          const k = `${s.name}|${s.latitude.toFixed(6)}|${s.longitude.toFixed(6)}`;
          if (!seen.has(k)) {
            seen.add(k);
            result.push(s);
          }
        });
      }
    }
  }

  return result.length ? result : FALLBACK_DUSHANBE_STOPS;
}

