import { useEffect, useMemo, useState } from 'react';
import { Clock4, Navigation, Route, Search } from 'lucide-react';
import { BusStopSchedule, BusWithDriver, Stop } from '../types';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { RouteManager } from './RouteManager';
import { StopSelector } from './StopSelector';
import { useAuth } from '../contexts/AuthContext';

interface ScheduleViewProps {
  buses: BusWithDriver[];
  userLocation: { lat: number; lng: number } | null;
  isDriver: boolean;
  driverBusNumber: string | null;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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

export function ScheduleView({
  buses,
  userLocation,
  isDriver,
  driverBusNumber,
}: ScheduleViewProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [stops, setStops] = useState<Stop[]>([]);
  const [schedules, setSchedules] = useState<BusStopSchedule[]>([]);  const [searchStop, setSearchStop] = useState('');
  const [fromStop, setFromStop] = useState('');
  const [toStop, setToStop] = useState('');
  useEffect(() => {
    const fetchData = async () => {
      const { data: stopsData } = await supabase.from('stops').select('*');
      const { data: schedulesData } = await supabase
        .from('bus_stop_schedules')
        .select('*');

      if (stopsData) setStops(stopsData as Stop[]);
      if (schedulesData) setSchedules(schedulesData as BusStopSchedule[]);
    };

    fetchData();

    const channel = supabase
      .channel('stops_and_schedules_schedule')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stops' },
        () => fetchData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bus_stop_schedules' },
        () => fetchData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const schedulesWithStops = useMemo(
    () =>
      schedules
        .map((s) => ({
          schedule: s,
          stop: stops.find((st) => st.id === s.stop_id) || null,
        }))
        .filter((x) => x.stop !== null) as {
        schedule: BusStopSchedule;
        stop: Stop;
      }[],
    [schedules, stops]
  ); 

  const allStops = useMemo(() => {
    const names = new Set(stops.map((s) => s.name.trim()));
    return Array.from(names).filter(Boolean).sort();
  }, [stops]); 

  const busesWithEta = useMemo(() => {
    if (!userLocation) return [];
    return buses.map((bus) => {
      const distance = haversineKm(
        userLocation.lat,
        userLocation.lng,
        bus.latitude,
        bus.longitude
      );
      const speed = bus.speed || 30;
      const timeMinutes = Math.round((distance / speed) * 60);
      return { bus, distance, timeMinutes };
    });
  }, [buses, userLocation]);

  // Оценка времени прибытия автобуса к конкретной остановке по позиции автобуса
  const etaByStopAndBus = useMemo(() => {
    const map = new Map<string, number>();
    schedulesWithStops.forEach(({ schedule, stop }) => {
      const bus = buses.find((b) => b.bus_number === schedule.bus_number);
      if (!bus) return;
      const distance = haversineKm(
        stop.latitude,
        stop.longitude,
        bus.latitude,
        bus.longitude
      );
      const speed = bus.speed || 30;
      const minutes = Math.round((distance / speed) * 60);
      map.set(`${schedule.bus_number}_${stop.id}`, minutes);
    });
    return map;
  }, [schedulesWithStops, buses]);

  const stopToBuses = useMemo(() => {
    const map = new Map<string, Set<string>>();
    schedulesWithStops.forEach(({ schedule, stop }) => {
      if (!map.has(stop.name)) map.set(stop.name, new Set<string>());
      map.get(stop.name)!.add(schedule.bus_number);
    });
    return map;
  }, [schedulesWithStops]);

  const searchStopResult = useMemo(() => {
    const name = searchStop.trim();
    if (!name) return null;
    const busesSet = stopToBuses.get(name);
    if (!busesSet) return { stopName: name, buses: [] as string[] };
    return { stopName: name, buses: Array.from(busesSet).sort() };
  }, [searchStop, stopToBuses]);

  const transferSuggestion = useMemo(() => {
    const from = fromStop.trim();
    const to = toStop.trim();
    if (!from || !to || from === to) return null;

    // Граф: узел = остановка, ребро = автобус, который идёт между двумя остановками
    const stopsByName = new Map<string, Stop[]>(
      stops.map((s) => [s.name, []])
    );
    stops.forEach((s) => {
      const arr = stopsByName.get(s.name) || [];
      arr.push(s);
      stopsByName.set(s.name, arr);
    });

    // Сопоставляем stopName -> список stop_id, buses проходящих через них
    const busesByStopId = new Map<string, Set<string>>();
    schedules.forEach((s) => {
      if (!busesByStopId.has(s.stop_id)) {
        busesByStopId.set(s.stop_id, new Set<string>());
      }
      busesByStopId.get(s.stop_id)!.add(s.bus_number);
    });

    // Находим все stop_id для from/to по имени
    const fromCandidates = stops
      .filter((s) => s.name.trim().toLowerCase() === from.toLowerCase())
      .map((s) => s.id);
    const toCandidates = stops
      .filter((s) => s.name.trim().toLowerCase() === to.toLowerCase())
      .map((s) => s.id);

    if (fromCandidates.length === 0 || toCandidates.length === 0) {
      return null;
    }

    // BFS по графу (узел = stop_id, состояние хранит также текущий автобус для подсчёта пересадок)
    type State = {
      stopId: string;
      bus: string | null;
    };

    const queue: State[] = fromCandidates.map((id) => ({
      stopId: id,
      bus: null,
    }));
    const visited = new Set<string>();
    const parent = new Map<string, { prev: string | null; bus: string | null }>();

    fromCandidates.forEach((id) =>
      parent.set(id, { prev: null, bus: null })
    );

    let foundTarget: string | null = null;

    const getKey = (stopId: string, bus: string | null) =>
      `${stopId}|${bus || 'none'}`;

    const visitedStates = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const stateKey = getKey(current.stopId, current.bus);
      if (visitedStates.has(stateKey)) continue;
      visitedStates.add(stateKey);

      if (toCandidates.includes(current.stopId)) {
        foundTarget = current.stopId;
        break;
      }

      const busesHere = busesByStopId.get(current.stopId);
      if (!busesHere) continue;

      busesHere.forEach((busNum) => {
        // Возможность пересесть на автобус на этой же остановке
        const sameBusStops = schedules
          .filter((s) => s.bus_number === busNum)
          .map((s) => s.stop_id);

        sameBusStops.forEach((nextStopId) => {
          const nextKey = getKey(nextStopId, busNum);
          if (visitedStates.has(nextKey)) return;
          if (!parent.has(nextStopId)) {
            parent.set(nextStopId, {
              prev: current.stopId,
              bus: busNum,
            });
          }
          queue.push({ stopId: nextStopId, bus: busNum });
        });
      });
    }

    if (!foundTarget) return null;

    // Восстановление пути
    const pathStops: { stopId: string; bus: string | null }[] = [];
    let cur: string | null = foundTarget;
    while (cur) {
      const p = parent.get(cur);
      pathStops.unshift({ stopId: cur, bus: p?.bus || null });
      cur = p?.prev || null;
    }

    // Формируем список автобусов и количество пересадок
    const busesOnPath: string[] = [];
    let lastBus: string | null = null;
    pathStops.forEach((p) => {
      if (p.bus && p.bus !== lastBus) {
        busesOnPath.push(p.bus);
        lastBus = p.bus;
      }
    });

    if (busesOnPath.length === 0) return null;

    return {
      transfers: Math.max(0, busesOnPath.length - 1),
      buses: busesOnPath,
    };
  }, [fromStop, toStop, schedules, stops]);

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 flex items-center space-x-2">
          <Clock4 className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          <span>{t('schedule.title')}</span>
        </h2>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
          {t('schedule.title')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-4">
        {isDriver && driverBusNumber && user && (
          <section className="bg-white dark:bg-gray-800 rounded-3xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 animate-fade-in">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-4">
              {t('schedule.mySchedule')} ({t('map.busNumber')}{driverBusNumber})
            </h3>
            <RouteManager busNumber={driverBusNumber} driverId={user.id} />
          </section>
        )}

        <section className="bg-white dark:bg-slate-800 rounded-3xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-2 flex items-center space-x-2">
            <Navigation className="w-4 h-4 text-gray-700 dark:text-gray-300" />
            <span>{t('schedule.nearestBuses')}</span>
          </h3>
          {!userLocation && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Включите геолокацию, чтобы увидеть расстояние и примерное время прибытия.
            </p>
          )}
          {userLocation && busesWithEta.length === 0 && (
            <div className="rounded-2xl bg-gray-100 dark:bg-gray-800 px-4 py-6 text-center">
              <Navigation className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
              Пока нет активных автобусов поблизости.
            </p>
            </div>
          )}
          {userLocation && busesWithEta.length > 0 && (
            <div className="space-y-2 max-h-56 overflow-y-auto mt-1">
              {busesWithEta
                .sort((a, b) => a.timeMinutes - b.timeMinutes)
                .map(({ bus, distance, timeMinutes }) => (
                  <div
                    key={bus.id}
                    className="flex items-center justify-between rounded-2xl bg-gray-100 dark:bg-gray-800 px-3 py-2 text-xs border border-gray-200 dark:border-gray-700"
                  >
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-50">
                        Автобус №{bus.bus_number}
                      </p>
                      <p className="text-gray-500 dark:text-gray-400">
                        {distance.toFixed(2)} км · {timeMinutes} мин
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-slate-800 rounded-3xl p-4 shadow-sm space-y-3">
          <div className="space-y-2">
            <StopSelector onSelect={(stop) => setSearchStop(stop.name)} />
            {searchStop && (
              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                Выбрано: <span className="font-semibold">{searchStop}</span>
              </p>
            )}
          </div>
          {searchStopResult && (
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs">
              {searchStopResult.buses.length === 0 ? (
                <div className="rounded-2xl bg-gray-100 dark:bg-gray-800 px-4 py-6 text-center">
                  <Search className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                  <p className="text-gray-500 dark:text-gray-400">
                    Для остановки «{searchStopResult.stopName}» пока нет сохранённых маршрутов.
                  </p>
                </div>
              ) : (
                <p className="text-slate-500 dark:text-slate-200">
                  До остановки «{searchStopResult.stopName}» подойдут автобусы:{' '}
                  <span className="font-semibold text-slate-900 dark:text-slate-50">
                    {searchStopResult.buses.join(', ')}
                  </span>
                  . Пересадки не учитываются.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-slate-800 rounded-3xl p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-1 flex items-center space-x-2">
            <Route className="w-4 h-4 text-gray-700 dark:text-gray-300" />
            <span>{t('schedule.routeWithTransfers')}</span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                {t('schedule.from')}
              </label>
              <StopSelector onSelect={(stop) => setFromStop(stop.name)} />
              {fromStop && (
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Выбрано: <span className="font-semibold">fromStop</span></p>
              )}
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                {t('schedule.to')}
              </label>
              <StopSelector onSelect={(stop) => setToStop(stop.name)} />
              {toStop && (
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Выбрано: <span className="font-semibold">toStop</span></p>
              )}
            </div>
          </div>

          {transferSuggestion && (
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs">
              {transferSuggestion.transfers === 0 ? (
                <p className="text-slate-500 dark:text-slate-200">
                  Можно доехать без пересадок на автобусе(ах){' '}
                  <span className="font-semibold text-slate-900 dark:text-slate-50">
                    {transferSuggestion.buses.join(', ')}
                  </span>
                  .
                </p>
              ) : (
                <p className="text-slate-500 dark:text-slate-200">
                  Нужна {transferSuggestion.transfers} пересадка. Сначала сядьте на{' '}
                  <span className="font-semibold">
                    {transferSuggestion.buses[0]}
                  </span>
                  , затем пересядьте на{' '}
                  <span className="font-semibold">
                    {transferSuggestion.buses[1]}
                  </span>
                  .
                </p>
              )}
            </div>
          )}

          {!transferSuggestion && fromStop && toStop && fromStop !== toStop && (
            <div className="rounded-2xl bg-gray-100 dark:bg-gray-800 px-4 py-6 text-center">
              <Route className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                По сохранённым расписаниям пока не найден простой маршрут между этими остановками.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

