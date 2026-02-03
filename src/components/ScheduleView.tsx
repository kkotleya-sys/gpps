import { useEffect, useMemo, useState } from 'react';
import { Clock4, Navigation, Search } from 'lucide-react';
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
  const [schedules, setSchedules] = useState<BusStopSchedule[]>([]);
  const [nearestStopQuery, setNearestStopQuery] = useState('');
  const [nearestStopId, setNearestStopId] = useState<string | null>(null);

  const handleCreateStop = async (name: string, lat: number, lng: number) => {
    try {
      const finalName = name.trim() || `Custom stop ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const { data, error } = await supabase
        .from('stops')
        .insert({ name: finalName, latitude: lat, longitude: lng })
        .select()
        .single();
      if (error || !data) {
        console.error('Error creating stop:', error);
        alert('Ошибка при добавлении остановки');
        return null;
      }
      return data as Stop;
    } catch (error) {
      console.error('Error creating stop:', error);
        alert('Ошибка при добавлении остановки');
      return null;
    }
  };
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

  const nearestStopResult = useMemo(() => {
    const name = nearestStopQuery.trim();
    if (!name || !nearestStopId) return null;
    const stopIds = [nearestStopId];
    if (stopIds.length === 0) return { stopName: name, buses: [] as { bus: string; eta: number | null }[] };

    const busMap = new Map<string, number | null>();
    schedulesWithStops.forEach(({ schedule }) => {
      if (!stopIds.includes(schedule.stop_id)) return;
      const key = `${schedule.bus_number}_${schedule.stop_id}`;
      const eta = etaByStopAndBus.get(key) ?? null;
      if (!busMap.has(schedule.bus_number)) {
        busMap.set(schedule.bus_number, eta);
      } else {
        const current = busMap.get(schedule.bus_number);
        if (current === null || (eta !== null && eta < current)) {
          busMap.set(schedule.bus_number, eta);
        }
      }
    });

    const buses = Array.from(busMap.entries())
      .map(([bus, eta]) => ({ bus, eta }))
      .sort((a, b) => {
        if (a.eta === null && b.eta === null) return a.bus.localeCompare(b.bus);
        if (a.eta === null) return 1;
        if (b.eta === null) return -1;
        return a.eta - b.eta;
      });

    return { stopName: name, buses };
  }, [nearestStopQuery, nearestStopId, schedulesWithStops, etaByStopAndBus]);


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

          <div className="mt-3 space-y-2">
            <label className="block text-[10px] text-gray-500 dark:text-gray-400">
              Автобусы к остановке
            </label>
            <StopSelector
              onSelect={(stop) => {
                setNearestStopQuery(stop.name);
                setNearestStopId(stop.id);
              }}
              onAddNew={handleCreateStop}
              allowMapPickWithoutName
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
                      Для остановки «{nearestStopResult.stopName}» пока нет маршрутов.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {nearestStopResult.buses.map((b) => (
                      <div key={b.bus} className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 dark:text-slate-50">
                          Автобус №{b.bus}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {b.eta === null ? '—' : `≈ ${b.eta} мин`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>


      </div>
    </div>
  );
}


