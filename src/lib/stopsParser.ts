// Utility functions to fetch public transport stops from 2GIS.
// IMPORTANT:
// - Use the official 2GIS APIs (requires an API key).
// - Do NOT scrape 2gis.tj pages.
// Docs: Places API /3.0/items, Regions API /2.0/region/search. 

export interface StopData {
  name: string;
  latitude: number;
  longitude: number;
}

const FALLBACK_DUSHANBE_STOPS: StopData[] = [
  { name: 'Автовокзал', latitude: 38.5598, longitude: 68.7738 },
];

// Vite env var (set in .env.local): VITE_2GIS_API_KEY=...
function get2gisKey(): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const key = (import.meta as any).env?.VITE_2GIS_API_KEY as string | undefined;
  return key && key.trim() ? key.trim() : null;
}

async function getDushanbeRegionId(key: string): Promise<string | null> {
  // Cache to avoid extra API calls
  const cached = localStorage.getItem('gpps_2gis_region_id_dushanbe');
  if (cached) return cached;

  const url = new URL('https://catalog.api.2gis.com/2.0/region/search');
  url.searchParams.set('key', key);
  url.searchParams.set('q', 'Dushanbe');
  url.searchParams.set('lang', 'ru');
  url.searchParams.set('page', '1');
  url.searchParams.set('page_size', '10');

  const res = await fetch(url.toString());
  if (!res.ok) return null;

  const json = await res.json();
  // Response shape: { result: { items: [{ id, name, ...}] } }
  const regionId = json?.result?.items?.[0]?.id ? String(json.result.items[0].id) : null;
  if (regionId) localStorage.setItem('gpps_2gis_region_id_dushanbe', regionId);
  return regionId;
}

/**
 * Search stops by text query (used in StopSelector).
 * Returns up to 10 suggestions.
 */
export async function searchStopsFrom2GIS(query: string): Promise<StopData[]> {
  const key = get2gisKey();
  if (!key) {
    // No key → fallback to local list filtering
    const q = query.trim().toLowerCase();
    return FALLBACK_DUSHANBE_STOPS.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 10);
  }

  const regionId = await getDushanbeRegionId(key);

  const url = new URL('https://catalog.api.2gis.com/3.0/items');
  url.searchParams.set('key', key);
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'station');
  url.searchParams.set('locale', 'ru_TJ');
  url.searchParams.set('page', '1');
  url.searchParams.set('page_size', '10');
  url.searchParams.set('fields', 'items.point');

  if (regionId) url.searchParams.set('region_id', regionId);
  else url.searchParams.set('q', `${query} Душанбе`);

  const res = await fetch(url.toString());
  if (!res.ok) return [];

  const json = await res.json();
  const items = json?.result?.items ?? [];

  return items
    .map((it: any) => ({
      name: it?.name ?? '',
      latitude: it?.point?.lat ?? it?.point?.latitude,
      longitude: it?.point?.lon ?? it?.point?.longitude,
    }))
    .filter((s: StopData) => s.name && Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
    .slice(0, 10);
}

/**
 * Bulk-load (paginate) ALL public transport stops for Dushanbe using 2GIS Places API.
 * This returns raw StopData array; saving to DB should be done server-side/admin-only.
 *
 * Note: Places API is paginated. 
 */
export async function fetchAllDushanbeStopsFrom2GIS(): Promise<StopData[]> {
  const key = get2gisKey();
  if (!key) return FALLBACK_DUSHANBE_STOPS;

  const regionId = await getDushanbeRegionId(key);
  if (!regionId) return FALLBACK_DUSHANBE_STOPS;

  const result: StopData[] = [];
  const pageSize = 200;
  let page = 1;

  while (true) {
    const url = new URL('https://catalog.api.2gis.com/3.0/items');
    url.searchParams.set('key', key);
    // A broad query that tends to return stop/station objects in the region.
    // If your key supports it, you may also try q='' with type=station + region_id.
    url.searchParams.set('q', 'остановка');
    url.searchParams.set('type', 'station');
    url.searchParams.set('locale', 'ru_TJ');
    url.searchParams.set('region_id', regionId);
    url.searchParams.set('page', String(page));
    url.searchParams.set('page_size', String(pageSize));
    url.searchParams.set('fields', 'items.point');

    const res = await fetch(url.toString());
    if (!res.ok) break;

    const json = await res.json();
    const items = json?.result?.items ?? [];

    const chunk: StopData[] = items
      .map((it: any) => ({
        name: it?.name ?? '',
        latitude: it?.point?.lat ?? it?.point?.latitude,
        longitude: it?.point?.lon ?? it?.point?.longitude,
      }))
      .filter((s: StopData) => s.name && Number.isFinite(s.latitude) && Number.isFinite(s.longitude));

    // Deduplicate by name+coords
    const seen = new Set(result.map((s) => `${s.name}|${s.latitude.toFixed(6)}|${s.longitude.toFixed(6)}`));
    chunk.forEach((s) => {
      const k = `${s.name}|${s.latitude.toFixed(6)}|${s.longitude.toFixed(6)}`;
      if (!seen.has(k)) {
        seen.add(k);
        result.push(s);
      }
    });

    // Stop if no more items
    if (items.length < pageSize) break;
    page += 1;

    // Safety: prevent runaway loops
    if (page > 200) break;
  }

  return result.length ? result : FALLBACK_DUSHANBE_STOPS;
}
