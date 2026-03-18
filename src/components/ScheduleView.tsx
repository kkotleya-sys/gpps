import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock4, Navigation, Search } from 'lucide-react';
import { BusStopSchedule, BusWithDriver, Route, RouteStop, Stop } from '../types';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { StopSelector } from './StopSelector';
import { fetchStopsInRadius, fetchTransitRoutes } from '../lib/busmaps';
import { formatEta } from '../lib/text';

interface ScheduleViewProps {
  buses: BusWithDriver[];
  userLocation: { lat: number; lng: number } | null;
  isDriver: boolean;
  driverBusNumber: string | null;
  driverRouteId: string | null;
  onDriverRouteChange: (routeId: string | null) => void;
}

type RouteInstruction = {
  busNumber: string;
  routeName: string;
  fromStop: Stop;
  toStop: Stop;
  departureTime: string | null;
  arrivalTime: string | null;
  headsign: string | null;
};

const GEMINI_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined;

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

function stopDisplayName(stop: Stop, language: 'ru' | 'tj' | 'eng') {
  if (language === 'tj') return stop.name_tj || stop.name_ru || stop.name;
  if (language === 'eng') return stop.name_eng || stop.name_ru || stop.name;
  return stop.name_ru || stop.name;
}

function formatClock(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

async function callGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_KEY) return null;

  const endpoints = [
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-lite:generateContent',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${endpoint}?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      });

      if (!res.ok) continue;
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return text;
    } catch {
      // ignore and try next endpoint
    }
  }

  return null;
}

function buildInstructionText(params: {
  instructions: RouteInstruction[];
  language: 'ru' | 'tj' | 'eng';
  startStop: Stop;
  endStop: Stop;
  nearestStartStop: Stop | null;
  transfers: number;
}): string {
  const { instructions, language, startStop, endStop, nearestStartStop, transfers } = params;
  if (instructions.length === 0) {
    return 'Маршрут не найден между выбранными остановками.';
  }

  const lines: string[] = [
    `Для достижения пункта назначения понадобится ${transfers} пересадок.`,
    '',
  ];

  if (nearestStartStop) {
    lines.push(`Ближайшая к вам стартовая остановка: ${stopDisplayName(nearestStartStop, language)}.`);
    lines.push('');
  }

  instructions.forEach((step, index) => {
    const timeParts = [formatClock(step.departureTime), formatClock(step.arrivalTime)].filter(Boolean);
    const timeText = timeParts.length === 2 ? ` (${timeParts[0]} - ${timeParts[1]})` : '';
    lines.push(
      `${index + 1}) Автобус №${step.busNumber} - садитесь на остановке "${stopDisplayName(step.fromStop, language)}", выходите на остановке "${stopDisplayName(step.toStop, language)}"${timeText}.`
    );
    if (step.headsign) {
      lines.push(`Направление: ${step.headsign}.`);
    }
  });

  lines.push('');
  lines.push(`Маршрут: ${stopDisplayName(startStop, language)} -> ${stopDisplayName(endStop, language)}.`);
  return lines.join('\n');
}

export function ScheduleView({ buses, userLocation, isDriver, driverBusNumber, driverRouteId, onDriverRouteChange }: ScheduleViewProps) {
  const { t, language } = useLanguage();
  const [stops, setStops] = useState<Stop[]>([]);
  const [schedules, setSchedules] = useState<BusStopSchedule[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);

  const [nearestStopQuery, setNearestStopQuery] = useState('');
  const [nearestStopId, setNearestStopId] = useState<string | null>(null);

  const [startStop, setStartStop] = useState<Stop | null>(null);
  const [endStop, setEndStop] = useState<Stop | null>(null);

  const [routeResult, setRouteResult] = useState<string | null>(null);
  const [transferStopIds, setTransferStopIds] = useState<string[]>([]);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const notifiedTransferRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      const [stopsResp, schedulesResp] = await Promise.all([
        supabase.from('stops').select('*'),
        supabase.from('bus_stop_schedules').select('*'),
      ]);
      const [routesResp, routeStopsResp] = await Promise.all([
        supabase.from('routes').select('*'),
        supabase.from('route_stops').select('*'),
      ]);

      const stopRows =
        stopsResp.data && stopsResp.data.length > 0
          ? (stopsResp.data as Stop[])
          : (
              await fetchStopsInRadius({
                lat: 38.5598,
                lon: 68.787,
                radiusMeters: 20000,
                limit: 5000,
                language,
              }).catch(() => ({ stops: [] }))
            ).stops.map((stop) => ({
              id: `busmaps_${stop.id}`,
              name: stop.name,
              name_ru: stop.name_ru || stop.name,
              name_tj: stop.name_tj || stop.name,
              name_eng: stop.name_eng || stop.name,
              latitude: stop.lat,
              longitude: stop.lon,
              created_at: '',
            }));

      if (stopRows.length > 0) {
        const sortedStops = [...stopRows].sort((a, b) =>
          (a.name_ru || a.name || '').localeCompare(b.name_ru || b.name || '', language === 'ru' ? 'ru' : undefined)
        );
        setStops(sortedStops);
      }
      if (schedulesResp.data) setSchedules(schedulesResp.data as BusStopSchedule[]);
      if (routesResp.data) setRoutes(routesResp.data as Route[]);
      if (routeStopsResp.data) setRouteStops(routeStopsResp.data as RouteStop[]);
    };

    fetchData();

    const channel = supabase
      .channel('schedule_data_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stops' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_stop_schedules' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'route_stops' }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [language]);

  const stopsMap = useMemo(() => new Map(stops.map((s) => [s.id, s])), [stops]);

  const busesWithEta = useMemo(() => {
    if (!userLocation) return [];

    return buses
      .map((bus) => {
        const distance = haversineKm(userLocation.lat, userLocation.lng, bus.latitude, bus.longitude);
        const speed = Math.max(bus.speed || 25, 10);
        const timeMinutes = Math.round((distance / speed) * 60);
        return { bus, distance, timeMinutes };
      })
      .sort((a, b) => a.timeMinutes - b.timeMinutes);
  }, [buses, userLocation]);

  const schedulesWithStops = useMemo(
    () =>
      schedules
        .map((schedule) => ({
          schedule,
          stop: stopsMap.get(schedule.stop_id) || null,
        }))
        .filter((item): item is { schedule: BusStopSchedule; stop: Stop } => !!item.stop),
    [schedules, stopsMap]
  );

  const etaByStopAndBus = useMemo(() => {
    const map = new Map<string, number>();

    schedulesWithStops.forEach(({ schedule, stop }) => {
      const bus = buses.find((item) => item.bus_number === schedule.bus_number);
      if (!bus) return;
      const distance = haversineKm(stop.latitude, stop.longitude, bus.latitude, bus.longitude);
      const speed = Math.max(bus.speed || 25, 10);
      map.set(`${schedule.bus_number}_${stop.id}`, Math.round((distance / speed) * 60));
    });

    return map;
  }, [schedulesWithStops, buses]);

  const nearestStopResult = useMemo(() => {
    if (!nearestStopId || !nearestStopQuery.trim()) return null;

    const busMap = new Map<string, number | null>();
    schedulesWithStops.forEach(({ schedule }) => {
      if (schedule.stop_id !== nearestStopId) return;
      const eta = etaByStopAndBus.get(`${schedule.bus_number}_${schedule.stop_id}`) ?? null;
      const existing = busMap.get(schedule.bus_number);
      if (existing === undefined || existing === null || (eta !== null && eta < existing)) {
        busMap.set(schedule.bus_number, eta);
      }
    });

    return {
      stopName: nearestStopQuery,
      buses: Array.from(busMap.entries())
        .map(([bus, eta]) => ({ bus, eta }))
        .sort((a, b) => {
          if (a.eta === null && b.eta === null) return a.bus.localeCompare(b.bus);
          if (a.eta === null) return 1;
          if (b.eta === null) return -1;
          return a.eta - b.eta;
        }),
    };
  }, [nearestStopId, nearestStopQuery, schedulesWithStops, etaByStopAndBus]);

  const driverRoutes = useMemo(
    () => routes.filter((route) => route.bus_number === driverBusNumber),
    [routes, driverBusNumber]
  );

  const selectedDriverRoute =
    driverRoutes.find((route) => route.id === driverRouteId) ||
    driverRoutes.find((route) => route.is_active) ||
    driverRoutes[0] ||
    null;

  useEffect(() => {
    if (!driverBusNumber || !selectedDriverRoute) return;
    if (driverRouteId === selectedDriverRoute.id) return;
    onDriverRouteChange(selectedDriverRoute.id);
  }, [driverBusNumber, driverRouteId, onDriverRouteChange, selectedDriverRoute]);

  const driverRouteVariants = useMemo(
    () =>
      driverRoutes.map((route) => {
        const orderedStops = routeStops
          .filter((routeStop) => routeStop.route_id === route.id)
          .sort((a, b) => a.order_index - b.order_index)
          .map((routeStop) => ({
            routeStop,
            stop: stopsMap.get(routeStop.stop_id) || null,
          }))
          .filter((item): item is { routeStop: RouteStop; stop: Stop } => !!item.stop);

        return {
          route,
          orderedStops,
          title:
            orderedStops.length >= 2
              ? `${stopDisplayName(orderedStops[0].stop, language)} -> ${stopDisplayName(orderedStops[orderedStops.length - 1].stop, language)}`
              : route.name,
        };
      }),
    [driverRoutes, routeStops, stopsMap, language]
  );

  const driverRouteStops = useMemo(() => {
    const match = driverRouteVariants.find((item) => item.route.id === selectedDriverRoute?.id);
    return match?.orderedStops || [];
  }, [driverRouteVariants, selectedDriverRoute]);

  const handleCalculateRoute = async () => {
    if (!startStop || !endStop) {
      setRouteError('Выберите начальную и конечную остановки.');
      return;
    }

    setCalculatingRoute(true);
    setRouteError(null);
    setRouteResult(null);

    try {
      const plannedRoutes = await fetchTransitRoutes({
        origin: { lat: startStop.latitude, lon: startStop.longitude },
        destination: { lat: endStop.latitude, lon: endStop.longitude },
        language,
        maxRoutes: 3,
        transfers: 3,
      });

      const bestRoute = plannedRoutes[0];
      if (!bestRoute) {
        setTransferStopIds([]);
        setRouteResult('Маршрут не найден.');
        return;
      }

      const instructions: RouteInstruction[] = bestRoute.sections
        .filter((section) => section.type === 'transit' && section.busNumber)
        .map((section) => ({
          busNumber: section.busNumber || '',
          routeName: section.busNumber || '',
          fromStop:
            (section.fromStopId ? stopsMap.get(section.fromStopId) : undefined) || {
              id: section.fromStopId || `from_${section.fromStopName}`,
              name: section.fromStopName,
              name_ru: section.fromStopName,
              name_tj: section.fromStopName,
              name_eng: section.fromStopName,
              latitude: section.fromLat || 0,
              longitude: section.fromLon || 0,
              created_at: '',
            },
          toStop:
            (section.toStopId ? stopsMap.get(section.toStopId) : undefined) || {
              id: section.toStopId || `to_${section.toStopName}`,
              name: section.toStopName,
              name_ru: section.toStopName,
              name_tj: section.toStopName,
              name_eng: section.toStopName,
              latitude: section.toLat || 0,
              longitude: section.toLon || 0,
              created_at: '',
            },
          departureTime: section.departureTime,
          arrivalTime: section.arrivalTime,
          headsign: section.headsign,
        }));

      const nearestStartStop = userLocation
        ? stops
            .slice()
            .sort(
              (a, b) =>
                haversineKm(userLocation.lat, userLocation.lng, a.latitude, a.longitude) -
                haversineKm(userLocation.lat, userLocation.lng, b.latitude, b.longitude)
            )[0] || null
        : null;

      const transferStops = instructions.slice(0, -1).map((step) => step.toStop.id);
      setTransferStopIds(transferStops);
      notifiedTransferRef.current.clear();

      const baseText = buildInstructionText({
        instructions,
        language,
        startStop,
        endStop,
        nearestStartStop,
        transfers: bestRoute.transfers,
      });

      const aiPrompt = `Улучши формулировку маршрута для пассажира, не меняя факты и шаги.\n\n${baseText}`;
      const aiText = await callGemini(aiPrompt);

      setRouteResult(aiText || baseText);
    } catch (error: any) {
      setRouteError(error?.message || 'Ошибка расчета маршрута.');
    } finally {
      setCalculatingRoute(false);
    }
  };

  useEffect(() => {
    if (!userLocation || transferStopIds.length === 0) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    transferStopIds.forEach((stopId, idx) => {
      const stop = stopsMap.get(stopId);
      if (!stop) return;

      const distance = haversineKm(userLocation.lat, userLocation.lng, stop.latitude, stop.longitude);
      if (distance > 0.25) return;

      const key = `${stopId}_${idx}`;
      if (notifiedTransferRef.current.has(key)) return;

      new Notification('Время пересадки', {
        body: `Вы приближаетесь к остановке "${stopDisplayName(stop, language)}". Подготовьтесь к пересадке.`,
      });

      notifiedTransferRef.current.add(key);
    });
  }, [transferStopIds, userLocation, stopsMap, language]);

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 flex items-center space-x-2">
          <Clock4 className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          <span>{t('schedule.title')}</span>
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-4">
        {isDriver && driverBusNumber && (
          <section className="bg-white dark:bg-gray-800 rounded-3xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 animate-fade-in">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-2">
              {t('schedule.mySchedule')} ({t('map.busNumber')}{driverBusNumber})
            </h3>
            {driverRouteVariants.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Для вашего автобуса пока нет загруженных рейсов.
              </p>
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Рейсы</p>
                  {driverRouteVariants.map((item) => (
                    <button
                      key={item.route.id}
                      onClick={() => onDriverRouteChange(item.route.id)}
                      className={`w-full rounded-2xl border px-3 py-2 text-left ${
                        selectedDriverRoute?.id === item.route.id
                          ? 'border-gray-900 dark:border-gray-200 bg-gray-100 dark:bg-gray-700'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                      }`}
                    >
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-50">{item.title}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{item.orderedStops.length} остановок</p>
                    </button>
                  ))}
                </div>

                {selectedDriverRoute && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Выбранный рейс</p>
                    {driverRouteStops.map(({ routeStop, stop }, index) => (
                      <div
                        key={`${selectedDriverRoute.id}_${routeStop.stop_id}_${routeStop.order_index}`}
                        className="flex items-center justify-between rounded-2xl bg-gray-100 dark:bg-gray-700 px-3 py-2 text-xs"
                      >
                        <p className="font-semibold text-slate-900 dark:text-slate-50">
                          {index + 1}. {stopDisplayName(stop, language)}
                        </p>
                        <span className="text-gray-500 dark:text-gray-300">
                          {routeStop.arrival_time || '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <section className="bg-white dark:bg-slate-800 rounded-3xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-2 flex items-center space-x-2">
            <Navigation className="w-4 h-4 text-gray-700 dark:text-gray-300" />
            <span>{t('schedule.nearestBuses')}</span>
          </h3>

          {!userLocation && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Включите геолокацию, чтобы увидеть ближайшие автобусы и ETA.
            </p>
          )}

          {userLocation && busesWithEta.length === 0 && (
            <div className="rounded-2xl bg-gray-100 dark:bg-gray-800 px-4 py-6 text-center">
              <Navigation className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400">Пока нет активных автобусов рядом.</p>
            </div>
          )}

          {userLocation && busesWithEta.length > 0 && (
            <div className="space-y-2 max-h-56 overflow-y-auto mt-1">
              {busesWithEta.map(({ bus, distance, timeMinutes }) => (
                <div
                  key={bus.id}
                  className="flex items-center justify-between rounded-2xl bg-gray-100 dark:bg-gray-800 px-3 py-2 text-xs border border-gray-200 dark:border-gray-700"
                >
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-50">Автобус №{bus.bus_number}</p>
                    <p className="text-gray-500 dark:text-gray-400">
                      {distance.toFixed(2)} км - {formatEta(timeMinutes)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-2">
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Автобусы у остановки</label>
            <StopSelector
              onSelect={(stop) => {
                setNearestStopQuery(stopDisplayName(stop, language));
                setNearestStopId(stop.id);
              }}
            />
            {nearestStopQuery && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                Выбрано: <span className="font-semibold">{nearestStopQuery}</span>
              </p>
            )}

            {nearestStopResult && (
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs">
                {nearestStopResult.buses.length === 0 ? (
                  <div className="rounded-2xl bg-gray-100 dark:bg-gray-800 px-4 py-6 text-center">
                    <Search className="w-6 h-6 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                    <p className="text-gray-500 dark:text-gray-400">
                      Для остановки "{nearestStopResult.stopName}" пока нет маршрутов.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {nearestStopResult.buses.map((entry) => (
                      <div key={entry.bus} className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 dark:text-slate-50">Автобус №{entry.bus}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {entry.eta === null ? '-' : formatEta(entry.eta)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="bg-white dark:bg-slate-800 rounded-3xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-2 flex items-center space-x-2">
            <Navigation className="w-4 h-4 text-gray-700 dark:text-gray-300" />
            <span>Найти маршрут между остановками</span>
          </h3>

          <div className="space-y-2">
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Остановка A</label>
            <StopSelector onSelect={setStartStop} />
            {startStop && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                Выбрано: <span className="font-semibold">{stopDisplayName(startStop, language)}</span>
              </p>
            )}
          </div>

          <div className="space-y-2 mt-2">
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">Остановка B</label>
            <StopSelector onSelect={setEndStop} />
            {endStop && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                Выбрано: <span className="font-semibold">{stopDisplayName(endStop, language)}</span>
              </p>
            )}
          </div>

          <button
            onClick={handleCalculateRoute}
            disabled={calculatingRoute || !startStop || !endStop}
            className="w-full mt-4 px-4 py-2.5 bg-gray-900 dark:bg-gray-700 text-white rounded-xl font-semibold hover:bg-gray-800 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            {calculatingRoute ? 'Расчет...' : 'Рассчитать лучший маршрут'}
          </button>

          {routeError && (
            <div className="mt-3 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-3 py-2 text-xs">
              {routeError}
            </div>
          )}

          {routeResult && (
            <div className="mt-3 rounded-2xl bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs whitespace-pre-wrap">
              {routeResult}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
