type LatLng = [number, number];

interface RoutePoint {
  lat: number;
  lng: number;
}

function getMapboxToken(): string | null {
  const token = (import.meta as any).env?.VITE_MAPBOX_TOKEN as string | undefined;
  return token && token.trim() ? token.trim() : null;
}

function downsamplePoints(points: RoutePoint[], maxPoints: number): RoutePoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled: RoutePoint[] = [];
  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i]);
  }
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

export async function getMapboxRoutePolyline(points: RoutePoint[]): Promise<LatLng[] | null> {
  const token = getMapboxToken();
  if (!token || points.length < 2) return null;

  const usable = downsamplePoints(points, 25);
  const coords = usable.map((p) => `${p.lng},${p.lat}`).join(';');

  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('steps', 'false');
  url.searchParams.set('language', 'ru');

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const json = await res.json();
    const coordsList = json?.routes?.[0]?.geometry?.coordinates ?? [];
    if (!Array.isArray(coordsList) || coordsList.length === 0) return null;
    return coordsList
      .map((p: number[]) => (p.length >= 2 ? [p[1], p[0]] : null))
      .filter(Boolean) as LatLng[];
  } catch {
    return null;
  }
}
