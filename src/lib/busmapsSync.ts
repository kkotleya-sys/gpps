import { Language } from '../contexts/LanguageContext';
import { supabase } from './supabase';
import { fetchNextDeparturesByStop, fetchStopsInRadius } from './busmaps';

type SyncProgress = {
  stage: string;
  completed: number;
  total: number;
};

function getErrorMessage(error: any) {
  return String(error?.message || error?.details || '');
}

function isMissingSchemaError(error: any) {
  const msg = getErrorMessage(error).toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === '42703' ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist') ||
    msg.includes('column') && msg.includes('does not exist') ||
    msg.includes('relation') && msg.includes('does not exist')
  );
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function orderStopsByRouteShape<T extends { lat: number; lon: number }>(items: T[]): T[] {
  if (items.length <= 2) return items;

  let startIndex = 0;
  let endIndex = 1;
  let maxDistance = -1;

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const distance = haversineKm(items[i].lat, items[i].lon, items[j].lat, items[j].lon);
      if (distance > maxDistance) {
        maxDistance = distance;
        startIndex = i;
        endIndex = j;
      }
    }
  }

  const remaining = items.map((item, index) => ({ item, index })).filter(({ index }) => index !== startIndex);
  const ordered: T[] = [items[startIndex]];
  let current = items[startIndex];

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    remaining.forEach((entry, index) => {
      const distance = haversineKm(current.lat, current.lon, entry.item.lat, entry.item.lon);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIdx = index;
      }
    });

    const [next] = remaining.splice(nearestIdx, 1);
    ordered.push(next.item);
    current = next.item;
  }

  const endStop = items[endIndex];
  if (ordered.length > 1) {
    const firstToEnd = haversineKm(ordered[0].lat, ordered[0].lon, endStop.lat, endStop.lon);
    const lastToEnd = haversineKm(ordered[ordered.length - 1].lat, ordered[ordered.length - 1].lon, endStop.lat, endStop.lon);
    if (firstToEnd < lastToEnd) ordered.reverse();
  }

  return ordered;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeDeleteAll(table: string) {
  const { error } = await supabase.from(table as any).delete().not('id', 'is', null);
  if (error && !isMissingSchemaError(error)) throw error;
}

export async function syncBusMapsDushanbe(options: {
  language: Language;
  replaceExisting: boolean;
  onProgress?: (progress: SyncProgress) => void;
}) {
  const { language, replaceExisting, onProgress } = options;

  const stopsRuResponse = await fetchStopsInRadius({
    lat: 38.5598,
    lon: 68.787,
    radiusMeters: 20000,
    limit: 5000,
    language: 'ru',
  });

  let stopsEnResponse: { stops: typeof stopsRuResponse.stops } | null = null;
  try {
    stopsEnResponse = await fetchStopsInRadius({
      lat: 38.5598,
      lon: 68.787,
      radiusMeters: 20000,
      limit: 5000,
      language: 'eng',
    });
  } catch {
    stopsEnResponse = null;
  }

  const { stops, host } = {
    stops: stopsRuResponse.stops.map((stop) => {
      const stopEn = stopsEnResponse?.stops.find((item) => item.id === stop.id);
      return {
        ...stop,
        name_ru: stop.name,
        name_tj: stop.name,
        name_eng: stopEn?.name || stop.name,
      };
    }),
    host: stopsRuResponse.host,
  };
  if (!stops.length) throw new Error('BusMaps не вернул остановки.');

  if (replaceExisting) {
    await safeDeleteAll('route_stops');
    await safeDeleteAll('routes');
    await safeDeleteAll('bus_stop_schedules');
    await safeDeleteAll('stops');
  }

  const stopRows = stops.map((s) => ({
    name: s.name,
    latitude: s.lat,
    longitude: s.lon,
  }));

  const insertStops = await supabase.from('stops').insert(stopRows as any);
  if (insertStops.error && insertStops.error.code !== '23505') throw insertStops.error;

  const dbStopsResult = await supabase
    .from('stops')
    .select('id,name,latitude,longitude');

  const dbStops = dbStopsResult.data as any[] | null;
  const dbStopsError = dbStopsResult.error;

  if (dbStopsError || !dbStops) throw dbStopsError || new Error('Не удалось прочитать stops');

  const stopIdByCoords = new Map<string, string>();

  (dbStops as any[]).forEach((s) => {
    const k = `${Number(s.latitude).toFixed(6)}|${Number(s.longitude).toFixed(6)}`;
    if (!stopIdByCoords.has(k)) stopIdByCoords.set(k, s.id);
  });

  const routeMap = new Map<string, { bus_number: string; route_name: string; route_external_id: string }>();
  stops.forEach((stop) => {
    stop.routes.forEach((r) => {
      if (!routeMap.has(r.routeId)) {
        routeMap.set(r.routeId, {
          route_external_id: r.routeId,
          bus_number: r.routeShortName,
          route_name: r.routeLongName || r.tripHeadsign || `Маршрут ${r.routeShortName}`,
        });
      }
    });
  });

  const firstRoutePerBus = new Map<string, string>();
  Array.from(routeMap.values()).forEach((route) => {
    if (!firstRoutePerBus.has(route.bus_number)) {
      firstRoutePerBus.set(route.bus_number, route.route_external_id);
    }
  });

  const catalogRows = Array.from(routeMap.values()).map((r) => ({
    bus_number: r.bus_number,
    route_name: r.route_name,
    route_external_id: r.route_external_id,
    source: 'busmaps',
    is_active: firstRoutePerBus.get(r.bus_number) === r.route_external_id,
  }));

  if (catalogRows.length > 0) {
    const existingRoutesRes = await supabase
      .from('routes')
      .select('id,bus_number,name,is_active');

    if (existingRoutesRes.error) throw existingRoutesRes.error;

    const existingKeys = new Set(
      (existingRoutesRes.data || []).map((route) => `${route.bus_number}::${route.name}`)
    );

    const routeRows = catalogRows
      .filter((r) => !existingKeys.has(`${r.bus_number}::${r.route_name}`))
      .map((r) => ({
        bus_number: r.bus_number,
        driver_id: null,
        name: r.route_name,
        is_active: r.is_active,
      }));

    if (routeRows.length > 0) {
      const insertRoutes = await supabase.from('routes').insert(routeRows as any);
      if (insertRoutes.error) throw insertRoutes.error;
    }

  }

  const scheduleRows: Array<{
    bus_number: string;
    stop_id: string;
    driver_id: string | null;
    order_index: number;
    arrival_time: string | null;
  }> = [];
  const scheduleRowKeys = new Set<string>();
  const arrivalByBusAndStop = new Map<string, string | null>();

  routeMap.forEach((route) => {
    const routeStops = stops
      .filter((stop) => stop.routes.some((item) => item.routeId === route.route_external_id))
      .map((stop) => {
        const key = `${stop.lat.toFixed(6)}|${stop.lon.toFixed(6)}`;
        const stopId = stopIdByCoords.get(key);
        return stopId
          ? {
              stop_id: stopId,
              lat: stop.lat,
              lon: stop.lon,
            }
          : null;
      })
      .filter((item): item is { stop_id: string; lat: number; lon: number } => !!item);

    const uniqueRouteStops = Array.from(
      new Map(routeStops.map((item) => [item.stop_id, item])).values()
    );

    orderStopsByRouteShape(uniqueRouteStops).forEach((item, index) => {
      const rowKey = `${route.bus_number}::${item.stop_id}`;
      if (scheduleRowKeys.has(rowKey)) return;

      scheduleRows.push({
        bus_number: route.bus_number,
        stop_id: item.stop_id,
        driver_id: null,
        order_index: index,
        arrival_time: null,
      });
      scheduleRowKeys.add(rowKey);
    });
  });

  const departureLookupLimit = Math.min(stops.length, 40);

  for (let i = 0; i < departureLookupLimit; i++) {
    const stop = stops[i];
    onProgress?.({ stage: 'Загрузка времен прибытия', completed: i + 1, total: departureLookupLimit });
    if (i > 0) await delay(400);

    try {
      const deps = await fetchNextDeparturesByStop(
        {
          stopId: stop.id,
          regionName: stop.regionName || stopsRuResponse.regionName,
          countryIso: stop.countryIso || null,
        },
        language,
        host
      );

      const key = `${stop.lat.toFixed(6)}|${stop.lon.toFixed(6)}`;
      const stopId = stopIdByCoords.get(key);
      if (!stopId) continue;

      deps.forEach((dep, idx) => {
        const stopKey = `${dep.busNumber}::${stopId}`;
        if (!arrivalByBusAndStop.has(stopKey)) {
          arrivalByBusAndStop.set(stopKey, dep.etaMinutes !== null ? `${dep.etaMinutes} мин` : null);
        }
        if (!scheduleRowKeys.has(stopKey)) {
          scheduleRows.push({
            bus_number: dep.busNumber,
            stop_id: stopId!,
            driver_id: null,
            order_index: idx,
            arrival_time: dep.etaMinutes !== null ? `${dep.etaMinutes} мин` : null,
          });
          scheduleRowKeys.add(stopKey);
        }
      });
    } catch {
      // ignore per-stop errors
    }
  }

  scheduleRows.forEach((row) => {
    const arrival = arrivalByBusAndStop.get(`${row.bus_number}::${row.stop_id}`);
    if (arrival !== undefined) row.arrival_time = arrival;
  });

  if (scheduleRows.length > 0) {
    await safeDeleteAll('bus_stop_schedules');
    const scheduleRes = await supabase.from('bus_stop_schedules').insert(scheduleRows as any);
    if (scheduleRes.error) throw scheduleRes.error;
  }

  const routesResult = await supabase
    .from('routes')
    .select('id,bus_number,name,is_active');
  const dbRoutes = routesResult.data as any[] | null;
  if (routesResult.error) throw routesResult.error;

  const routeIdByBusAndName = new Map<string, string>();
  const routesByBusNumber = new Map<string, Array<{ id: string; is_active?: boolean; name?: string | null }>>();
  (dbRoutes as any[] | null)?.forEach((route) => {
    routeIdByBusAndName.set(`${route.bus_number}::${route.name}`, String(route.id));
    const next = routesByBusNumber.get(String(route.bus_number)) || [];
    next.push({ id: String(route.id), is_active: Boolean(route.is_active), name: route.name || null });
    routesByBusNumber.set(String(route.bus_number), next);
  });

  const routeStopRows: Array<{
    route_id: string;
    stop_id: string;
    order_index: number;
    arrival_time: string | null;
  }> = [];

  routeMap.forEach((route) => {
    const routeId = routeIdByBusAndName.get(`${route.bus_number}::${route.route_name}`);
    if (!routeId) return;

    const routeStops = stops
      .filter((stop) => stop.routes.some((item) => item.routeId === route.route_external_id))
      .map((stop) => {
        const key = `${stop.lat.toFixed(6)}|${stop.lon.toFixed(6)}`;
        const stopId = stopIdByCoords.get(key);

        return stopId
          ? {
              stop_id: stopId,
              lat: stop.lat,
              lon: stop.lon,
              arrival_time: arrivalByBusAndStop.get(`${route.bus_number}::${stopId}`) ?? null,
            }
          : null;
      })
      .filter((item): item is { stop_id: string; lat: number; lon: number; arrival_time: string | null } => !!item);

    const uniqueRouteStops = Array.from(
      new Map(routeStops.map((item) => [item.stop_id, item])).values()
    );

    orderStopsByRouteShape(uniqueRouteStops).forEach((item, index) => {
      routeStopRows.push({
        route_id: routeId,
        stop_id: item.stop_id,
        order_index: index,
        arrival_time: item.arrival_time,
      });
    });
  });

  const existingRouteStopKeys = new Set(routeStopRows.map((row) => `${row.route_id}::${row.stop_id}`));
  const dbStopsById = new Map((dbStops as any[]).map((stop) => [String(stop.id), stop]));
  const scheduleStopsByBus = new Map<string, Array<{ stop_id: string; order_index: number; arrival_time: string | null; lat: number; lon: number }>>();

  scheduleRows.forEach((schedule) => {
    const stop = dbStopsById.get(String(schedule.stop_id));
    if (!stop) return;

    const next = scheduleStopsByBus.get(schedule.bus_number) || [];
    next.push({
      stop_id: schedule.stop_id,
      order_index: schedule.order_index,
      arrival_time: schedule.arrival_time,
      lat: Number(stop.latitude),
      lon: Number(stop.longitude),
    });
    scheduleStopsByBus.set(schedule.bus_number, next);
  });

  scheduleStopsByBus.forEach((items, busNumber) => {
    const routeCandidates = routesByBusNumber.get(busNumber) || [];
    const chosenRoute = routeCandidates.find((route) => route.is_active) || routeCandidates[0];
    if (!chosenRoute) return;

    const uniqueItems = Array.from(
      new Map(
        items
          .sort((a, b) => a.order_index - b.order_index)
          .map((item) => [item.stop_id, item])
      ).values()
    );

    orderStopsByRouteShape(uniqueItems).forEach((item, index) => {
      const key = `${chosenRoute.id}::${item.stop_id}`;
      if (existingRouteStopKeys.has(key)) return;

      routeStopRows.push({
        route_id: chosenRoute.id,
        stop_id: item.stop_id,
        order_index: index,
        arrival_time: item.arrival_time,
      });
      existingRouteStopKeys.add(key);
    });
  });

  if (routeStopRows.length > 0) {
    await safeDeleteAll('route_stops');
    const routeStopsRes = await supabase.from('route_stops').insert(routeStopRows as any);
    if (routeStopsRes.error) throw routeStopsRes.error;
  }

  onProgress?.({ stage: 'Готово', completed: 1, total: 1 });

  return {
    hostUsed: host,
    stopsImported: stops.length,
    routesImported: catalogRows.length,
    busesImported: new Set(catalogRows.map((r) => r.bus_number)).size,
    schedulesImported: scheduleRows.length,
    routeStopsImported: routeStopRows.length,
    legacyMode: true,
  };
}

