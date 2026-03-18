import { Language } from '../contexts/LanguageContext';
import { BusWithDriver } from '../types';
import { repairUtf8Text } from './text';

const BUSMAPS_BASE_URL = (import.meta as any).env?.VITE_BUSMAPS_BASE_URL || 'https://capi.busmaps.com:8443';
const BUSMAPS_PROXY_BASE = (import.meta as any).env?.VITE_BUSMAPS_PROXY_BASE || '/api/busmaps';
const BUSMAPS_HOST = (import.meta as any).env?.VITE_BUSMAPS_HOST || 'wikiroutes.info';
const BUSMAPS_API_KEY = (import.meta as any).env?.VITE_BUSMAPS_API_KEY as string | undefined;
const USE_PROXY = Boolean((import.meta as any).env?.DEV);
const WIKIROUTES_PROXY_BASE = (import.meta as any).env?.VITE_WIKIROUTES_PROXY_BASE || '/api/wikiroutes';

export interface BusMapsRouteRef {
  routeId: string;
  routeShortName: string;
  routeLongName: string | null;
  tripHeadsign: string | null;
  routeType: string | null;
}

export interface BusMapsStop {
  id: string;
  name: string;
  name_ru?: string;
  name_tj?: string;
  name_eng?: string;
  lat: number;
  lon: number;
  countryIso?: string | null;
  regionName?: string | null;
  routes: BusMapsRouteRef[];
}

export interface BusMapsDeparture {
  routeId: string | null;
  routeName: string;
  busNumber: string;
  etaMinutes: number | null;
}

export interface BusMapsCatalogRoute {
  id: string;
  bus_number: string;
  route_name: string | null;
  route_external_id: string | null;
}

export interface BusMapsRouteVariant {
  route_id: string;
  bus_number: string;
  route_name: string | null;
  trip_headsign: string | null;
}

export interface WikiroutesRouteDetails {
  routeId: string;
  fare: string | null;
  cardFare: string | null;
  operator: string | null;
  updatedAt: string | null;
}

export interface BusMapsTransitSection {
  type: 'pedestrian' | 'transit';
  fromStopId: string | null;
  fromStopName: string;
  fromLat: number | null;
  fromLon: number | null;
  toStopId: string | null;
  toStopName: string;
  toLat: number | null;
  toLon: number | null;
  departureTime: string | null;
  arrivalTime: string | null;
  busNumber: string | null;
  routeId: string | null;
  headsign: string | null;
  mode: string | null;
}

export interface BusMapsPlannedRoute {
  id: string;
  durationSeconds: number;
  transfers: number;
  sections: BusMapsTransitSection[];
}

function isBusTransportType(value: string | null | undefined): boolean {
  if (!value) return false;

  const normalized = value.trim().toLowerCase();
  const numeric = Number(normalized);

  if (Number.isFinite(numeric)) {
    if (numeric === 3) return true;
    if (numeric >= 700 && numeric < 800) return true;
    return false;
  }

  const denyTokens = [
    'tram',
    'трам',
    'trolley',
    'трол',
    'train',
    'rail',
    'metro',
    'subway',
    'электр',
    'marshrut',
    'маршрут',
    'minibus',
    'shuttle',
    'shared_taxi',
    'taxi',
  ];

  if (denyTokens.some((token) => normalized.includes(token))) return false;

  return normalized.includes('bus') || normalized.includes('автобус');
}

function toApiLang(language: Language): string {
  if (language === 'eng') return 'en';
  if (language === 'tj') return 'ru';
  return 'ru';
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function authHeaders(host?: string): Record<string, string> {
  if (USE_PROXY) return {};

  if (!BUSMAPS_API_KEY) throw new Error('Missing VITE_BUSMAPS_API_KEY');

  const key = BUSMAPS_API_KEY.startsWith('Bearer ')
    ? BUSMAPS_API_KEY
    : `Bearer ${BUSMAPS_API_KEY}`;

  return {
    'capi-key': key,
    'capi-host': host || BUSMAPS_HOST,
  };
}

async function requestJson(path: string, query: Record<string, string | number | undefined> = {}, host?: string) {
  const attempts = [0, 1500, 4000];

  for (let attempt = 0; attempt < attempts.length; attempt++) {
    if (attempts[attempt] > 0) {
      await delay(attempts[attempt]);
    }

    const base = USE_PROXY ? BUSMAPS_PROXY_BASE : BUSMAPS_BASE_URL;
    const url = USE_PROXY
      ? new URL(`${base}${path}`, window.location.origin)
      : new URL(`${base}${path}`);

    Object.entries(query).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      url.searchParams.set(k, String(v));
    });

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: authHeaders(host),
    });

    if (res.ok) {
      return res.json();
    }

    const body = await res.text();
    if (res.status === 429 && attempt < attempts.length - 1) {
      continue;
    }

    throw new Error(`BusMaps ${res.status}: ${body || 'request failed'}`);
  }

  throw new Error('BusMaps request failed after retries');
}

function pickFirstString(obj: any, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'string' && value.trim()) return repairUtf8Text(value.trim());
  }
  return undefined;
}

function pickFirstNumber(obj: any, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

function normalizeRouteRef(raw: any): BusMapsRouteRef | null {
  const routeId = String(pickFirstString(raw, ['routeId', 'id']) || '');
  const routeShortName = pickFirstString(raw, ['routeShortName', 'shortName', 'routeNumber']) || '';
  if (!routeId || !routeShortName) return null;

  const routeType = pickFirstString(raw, ['routeType', 'type']) || null;
  if (!isBusTransportType(routeType)) return null;

  return {
    routeId,
    routeShortName,
    routeLongName: pickFirstString(raw, ['routeLongName', 'longName', 'name']) || null,
    tripHeadsign: pickFirstString(raw, ['tripHeadsign', 'headsign']) || null,
    routeType,
  };
}

function normalizeStop(raw: any, regionName?: string | null): BusMapsStop | null {
  const id = String(pickFirstString(raw, ['stopId', 'id', 'stop_id']) || '');
  const name = pickFirstString(raw, ['stopName', 'name', 'title']) || 'Unknown stop';

  const lat = pickFirstNumber(raw, ['stopLat', 'lat', 'latitude', 'y']);
  const lon = pickFirstNumber(raw, ['stopLon', 'lon', 'lng', 'longitude', 'x']);

  if (!id || lat === undefined || lon === undefined) return null;

  const routes = (Array.isArray(raw?.routes) ? raw.routes : [])
    .map(normalizeRouteRef)
    .filter((x: BusMapsRouteRef | null): x is BusMapsRouteRef => !!x);

  return {
    id,
    name,
    name_ru: name,
    name_tj: name,
    name_eng: name,
    lat,
    lon,
    countryIso: pickFirstString(raw, ['countryIso', 'countryISO']) || null,
    regionName: regionName || null,
    routes,
  };
}

function normalizeVehicle(raw: any): BusWithDriver | null {
  const transportType =
    pickFirstString(raw, ['routeType', 'type', 'vehicleType', 'transportType', 'mode']) || null;
  if (transportType && !isBusTransportType(transportType)) return null;

  const busNumber = pickFirstString(raw, ['routeShortName', 'routeNumber', 'busNumber', 'number']) || '';
  const lat = pickFirstNumber(raw, ['lat', 'latitude', 'y']);
  const lon = pickFirstNumber(raw, ['lon', 'lng', 'longitude', 'x']);
  if (!busNumber || lat === undefined || lon === undefined) return null;

  const id = String(
    pickFirstString(raw, ['vehicleId', 'id', 'tripId']) || `busmaps_${busNumber}_${lat.toFixed(5)}_${lon.toFixed(5)}`
  );

  return {
    id,
    driver_id: 'busmaps',
    bus_number: busNumber,
    latitude: lat,
    longitude: lon,
    speed: pickFirstNumber(raw, ['speed', 'speedKmh']) ?? 0,
    heading: pickFirstNumber(raw, ['heading', 'bearing']) ?? 0,
    updated_at: new Date().toISOString(),
  };
}

function normalizeDeparture(raw: any): BusMapsDeparture | null {
  const busNumber = pickFirstString(raw, ['routeShortName', 'routeNumber', 'busNumber', 'number']) || '';
  if (!busNumber) return null;

  return {
    routeId: pickFirstString(raw, ['routeId', 'route_id', 'id']) || null,
    routeName:
      pickFirstString(raw, ['routeLongName', 'routeName', 'longName', 'name', 'tripHeadsign']) ||
      busNumber,
    busNumber,
    etaMinutes: pickFirstNumber(raw, ['etaMinutes', 'eta', 'minutes', 'inMinutes', 'arrivalInMinutes']) ?? null,
  };
}

function extractArray(payload: any, candidates: string[]): any[] {
  for (const key of candidates) {
    const value = payload?.[key];
    if (Array.isArray(value)) return value;
  }
  if (Array.isArray(payload)) return payload;
  return [];
}

export async function fetchStopsInRadius(params: {
  lat: number;
  lon: number;
  radiusMeters?: number;
  limit?: number;
  language?: Language;
}): Promise<{ stops: BusMapsStop[]; regionName: string | null; host: string }> {
  const payload = await requestJson('/stopsInRadius', {
    location: `${params.lat},${params.lon}`,
    radius: params.radiusMeters ?? 15000,
    limit: params.limit ?? 3000,
    lang: toApiLang(params.language || 'ru'),
  });

  const regionName = pickFirstString(payload, ['regionName']) || null;
  const stops = extractArray(payload, ['stops', 'items', 'data'])
    .map((raw) => normalizeStop(raw, regionName))
    .filter((s: BusMapsStop | null): s is BusMapsStop => !!s);

  return { stops, regionName, host: BUSMAPS_HOST };
}

export async function fetchNextDeparturesByStop(
  stop: { stopId: string; regionName: string | null; countryIso?: string | null },
  language: Language,
  host: string
): Promise<BusMapsDeparture[]> {
  const query: Record<string, string> = {
    stopId: stop.stopId,
    lang: toApiLang(language),
    results: '40',
  };

  if (stop.regionName) query.regionName = stop.regionName;
  if (host === 'busmaps.com' && stop.countryIso) query.countryIso = stop.countryIso;

  const payload = await requestJson('/nextDepartures', query, host);

  const container = extractArray(payload, ['stops', 'items', 'data']);
  const rawDepartures: any[] = [];

  if (container.length > 0 && Array.isArray(container[0]?.departures)) {
    container.forEach((item) => {
      if (Array.isArray(item?.departures)) rawDepartures.push(...item.departures);
    });
  } else {
    rawDepartures.push(...extractArray(payload, ['departures']));
  }

  return rawDepartures
    .map(normalizeDeparture)
    .filter((d: BusMapsDeparture | null): d is BusMapsDeparture => !!d);
}

export async function fetchDushanbeLiveBuses(language: Language): Promise<BusWithDriver[]> {
  const payload = await requestJson('/rawVehiclePositions', {
    boundingBox: '38.45,68.65,38.66,68.90',
    lang: toApiLang(language),
  });

  return extractArray(payload, ['vehicles', 'items', 'data'])
    .map(normalizeVehicle)
    .filter((v: BusWithDriver | null): v is BusWithDriver => !!v);
}

export async function fetchDushanbeRouteCatalog(language: Language): Promise<BusMapsCatalogRoute[]> {
  const { stops } = await fetchStopsInRadius({
    lat: 38.5598,
    lon: 68.787,
    radiusMeters: 20000,
    limit: 5000,
    language,
  });

  const uniqueRoutes = new Map<string, BusMapsCatalogRoute>();

  stops.forEach((stop) => {
    stop.routes.forEach((route) => {
      if (!route.routeShortName) return;
      if (!uniqueRoutes.has(route.routeShortName)) {
        uniqueRoutes.set(route.routeShortName, {
          id: route.routeId || route.routeShortName,
          bus_number: route.routeShortName,
          route_name: route.routeLongName || route.tripHeadsign || null,
          route_external_id: route.routeId || null,
        });
      }
    });
  });

  return Array.from(uniqueRoutes.values()).sort((a, b) => a.bus_number.localeCompare(b.bus_number, 'ru'));
}

export async function fetchBusRouteVariants(busNumber: string, language: Language): Promise<BusMapsRouteVariant[]> {
  const { stops } = await fetchStopsInRadius({
    lat: 38.5598,
    lon: 68.787,
    radiusMeters: 20000,
    limit: 5000,
    language,
  });

  const uniqueRoutes = new Map<string, BusMapsRouteVariant>();

  stops.forEach((stop) => {
    stop.routes.forEach((route) => {
      if (route.routeShortName !== busNumber) return;
      const routeName = route.tripHeadsign || route.routeLongName || null;
      const variantKey = `${route.routeId}::${(routeName || route.routeShortName).toLowerCase()}`;
      if (!uniqueRoutes.has(variantKey)) {
        uniqueRoutes.set(variantKey, {
          route_id: route.routeId,
          bus_number: route.routeShortName,
          route_name: routeName,
          trip_headsign: route.tripHeadsign || null,
        });
      }
    });
  });

  return Array.from(uniqueRoutes.values());
}

function routePageUrl(routeId: string) {
  const path = `/en/dushanbe?routes=${encodeURIComponent(routeId)}`;
  if (USE_PROXY) {
    return `${WIKIROUTES_PROXY_BASE}${path}`;
  }
  return `https://wikiroutes.info${path}`;
}

function extractValueAfterLabel(doc: Document, label: string): string | null {
  const text = doc.body?.textContent || '';
  const normalized = text.replace(/\u00a0/g, ' ');
  const marker = `${label}:`;
  const index = normalized.indexOf(marker);
  if (index === -1) return null;

  const tail = normalized.slice(index + marker.length).trim();
  const firstLine = tail.split('\n').map((line) => line.trim()).find(Boolean);
  return firstLine || null;
}

export async function fetchWikiroutesRouteDetails(routeId: string): Promise<WikiroutesRouteDetails> {
  const response = await fetch(routePageUrl(routeId));
  if (!response.ok) {
    throw new Error(`WikiRoutes ${response.status}`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const bodyText = doc.body?.textContent?.replace(/\u00a0/g, ' ') || '';

  const fare = extractValueAfterLabel(doc, 'Fare');
  const operator = extractValueAfterLabel(doc, 'Operator');
  const updatedAt = extractValueAfterLabel(doc, 'Last updated');
  const cardFareMatch = bodyText.match(/City Card\s*[-–]\s*([^.]+)/i);

  return {
    routeId,
    fare,
    cardFare: cardFareMatch?.[1]?.trim() || null,
    operator,
    updatedAt,
  };
}

function normalizePlannedSection(raw: any): BusMapsTransitSection | null {
  const type = raw?.type === 'transit' ? 'transit' : raw?.type === 'pedestrian' ? 'pedestrian' : null;
  if (!type) return null;

  return {
    type,
    fromStopId: pickFirstString(raw?.departure?.place, ['id']) || null,
    fromStopName: pickFirstString(raw?.departure?.place, ['name']) || 'Точка отправления',
    fromLat: pickFirstNumber(raw?.departure?.place?.location, ['lat']) ?? null,
    fromLon: pickFirstNumber(raw?.departure?.place?.location, ['lng', 'lon']) ?? null,
    toStopId: pickFirstString(raw?.arrival?.place, ['id']) || null,
    toStopName: pickFirstString(raw?.arrival?.place, ['name']) || 'Точка прибытия',
    toLat: pickFirstNumber(raw?.arrival?.place?.location, ['lat']) ?? null,
    toLon: pickFirstNumber(raw?.arrival?.place?.location, ['lng', 'lon']) ?? null,
    departureTime: pickFirstString(raw?.departure, ['time']) || null,
    arrivalTime: pickFirstString(raw?.arrival, ['time']) || null,
    busNumber: pickFirstString(raw?.transport, ['shortName', 'name']) || null,
    routeId: pickFirstString(raw?.transport, ['id']) || null,
    headsign: pickFirstString(raw?.transport, ['headsign']) || null,
    mode: pickFirstString(raw?.transport, ['mode']) || null,
  };
}

export async function fetchTransitRoutes(params: {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  language: Language;
  maxRoutes?: number;
  transfers?: number;
}): Promise<BusMapsPlannedRoute[]> {
  const payload = await requestJson('/routes', {
    origin: `${params.origin.lat},${params.origin.lon}`,
    destination: `${params.destination.lat},${params.destination.lon}`,
    transfers: params.transfers ?? 3,
    maxRoutes: params.maxRoutes ?? 3,
    transport: 'bus,tram,subway,train',
    lang: toApiLang(params.language),
  });

  return extractArray(payload, ['routes'])
    .map((route) => ({
      id: String(pickFirstString(route, ['id']) || crypto.randomUUID()),
      durationSeconds: pickFirstNumber(route, ['duration']) ?? 0,
      transfers: pickFirstNumber(route, ['transfers']) ?? 0,
      sections: extractArray(route, ['sections'])
        .map(normalizePlannedSection)
        .filter((section: BusMapsTransitSection | null): section is BusMapsTransitSection => !!section),
    }))
    .filter((route) => route.sections.length > 0);
}
