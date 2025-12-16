import { useEffect, useMemo, useRef, useState } from 'react';
import { BusStopSchedule, BusWithDriver, Stop } from '../types';
import { supabase } from '../lib/supabase';

interface MapViewProps {
  buses: BusWithDriver[];
  userLocation: { lat: number; lng: number } | null;
  onBusClick: (bus: BusWithDriver) => void;
  isDriver?: boolean;
  driverBusNumber?: string | null;
  driverId?: string | null;
}

declare global {
  interface Window {
    DG: any;
  }
}

export function MapView({
  buses,
  userLocation,
  onBusClick,
  isDriver,
  driverBusNumber,
  driverId,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markers = useRef<Map<string, any>>(new Map());
  const userMarker = useRef<any>(null);
  const stopMarkers = useRef<Map<string, any>>(new Map());
  const driverRoutePolyline = useRef<any>(null);
  const userToStopLine = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [schedules, setSchedules] = useState<BusStopSchedule[]>([]);
  const [newStopName, setNewStopName] = useState('');
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [activeBusFilter, setActiveBusFilter] = useState<string | 'all'>('all');
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://maps.api.2gis.ru/2.0/loader.js?pkg=full';
    script.async = true;
    script.onload = () => {
      if (window.DG) {
        window.DG.then(() => {
          setMapLoaded(true);
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !mapContainer.current || mapInstance.current) return;

    const map = window.DG.map(mapContainer.current, {
      center: [38.5598, 68.7738],
      zoom: 13,
      minZoom: 12,
      maxZoom: 18,
    });

    const bounds = window.DG.latLngBounds(
      [38.4598, 68.6738],
      [38.6598, 68.8738]
    );
    map.setMaxBounds(bounds);

    mapInstance.current = map;
  }, [mapLoaded]);

  // Загрузка остановок и расписаний из Supabase
  useEffect(() => {
    const fetchData = async () => {
      const { data: stopsData } = await supabase
        .from('stops')
        .select('*');

      const { data: schedulesData } = await supabase
        .from('bus_stop_schedules')
        .select('*');

      if (stopsData) setStops(stopsData as Stop[]);
      if (schedulesData) setSchedules(schedulesData as BusStopSchedule[]);
    };

    fetchData();

    const channel = supabase
      .channel('stops_and_schedules')
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

  useEffect(() => {
    if (!mapInstance.current) return;

    buses
      .filter((bus) => activeBusFilter === 'all' || bus.bus_number === activeBusFilter)
      .forEach((bus) => {
      const existingMarker = markers.current.get(bus.id);

      if (existingMarker) {
        existingMarker.setLatLng([bus.latitude, bus.longitude]);
      } else {
        const busIcon = window.DG.icon({
          iconUrl: 'data:image/svg+xml;base64,' + btoa(`
            <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="8" width="24" height="18" rx="3" fill="#3B82F6" stroke="white" stroke-width="2"/>
              <rect x="7" y="11" width="8" height="6" rx="1" fill="white" opacity="0.9"/>
              <rect x="17" y="11" width="8" height="6" rx="1" fill="white" opacity="0.9"/>
              <circle cx="10" cy="24" r="2" fill="white"/>
              <circle cx="22" cy="24" r="2" fill="white"/>
            </svg>
          `),
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = window.DG.marker([bus.latitude, bus.longitude], {
          icon: busIcon,
        }).addTo(mapInstance.current);

        marker.on('click', () => onBusClick(bus));
        markers.current.set(bus.id, marker);
      }
    });

    markers.current.forEach((marker, id) => {
      if (!buses.find((b) => b.id === id && (activeBusFilter === 'all' || b.bus_number === activeBusFilter))) {
        marker.remove();
        markers.current.delete(id);
      }
    });
  }, [buses, onBusClick, activeBusFilter]);

  useEffect(() => {
    if (!mapInstance.current || !userLocation) return;

    if (userMarker.current) {
      userMarker.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      const userIcon = window.DG.icon({
        iconUrl: 'data:image/svg+xml;base64,' + btoa(`
          <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="8" fill="#EF4444" stroke="white" stroke-width="3"/>
            <circle cx="12" cy="12" r="4" fill="white"/>
          </svg>
        `),
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      userMarker.current = window.DG.marker([userLocation.lat, userLocation.lng], {
        icon: userIcon,
      }).addTo(mapInstance.current);
    }
  }, [userLocation]);

  // Отрисовка остановок и маршрута водителя
  useEffect(() => {
    if (!mapInstance.current) return;

    // Обновляем маркеры остановок
    stops.forEach((stop) => {
      const existing = stopMarkers.current.get(stop.id);
      if (existing) {
        existing.setLatLng([stop.lat, stop.lng]);
      } else {
        const isDriverStop = schedules.some(
          (s) => s.stop_id === stop.id && s.bus_number === driverBusNumber
        );
        const icon = window.DG.icon({
          iconUrl:
            'data:image/svg+xml;base64,' +
            btoa(`
              <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="9" fill="${isDriverStop ? '#3B82F6' : '#6B7280'}" />
                <circle cx="12" cy="12" r="4" fill="white" />
              </svg>
            `),
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const marker = window.DG.marker([stop.latitude, stop.longitude], {
          icon,
        }).addTo(mapInstance.current);

        marker.bindPopup(stop.name);
        marker.on('click', () => setSelectedStopId(stop.id));
        stopMarkers.current.set(stop.id, marker);
      }
    });

    // Удаляем маркеры остановок, которые были удалены из состояния
    stopMarkers.current.forEach((marker, id) => {
      if (!stops.find((s) => s.id === id)) {
        marker.remove();
        stopMarkers.current.delete(id);
      }
    });

    // Линия маршрута водителя
    if (driverRoutePolyline.current) {
      driverRoutePolyline.current.remove();
      driverRoutePolyline.current = null;
    }

    const driverStops = stops.filter((stop) =>
      schedules.some(
        (s) => s.stop_id === stop.id && s.bus_number === driverBusNumber
      )
    );
    if (driverStops.length > 1) {
      const latlngs = driverStops
        .sort((a, b) => {
          const sa = schedules.find(
            (s) => s.stop_id === a.id && s.bus_number === driverBusNumber
          );
          const sb = schedules.find(
            (s) => s.stop_id === b.id && s.bus_number === driverBusNumber
          );
          return (sa?.order_index || 0) - (sb?.order_index || 0);
        })
        .map((s) => [s.latitude, s.longitude]);
      driverRoutePolyline.current = window.DG.polyline(latlngs, {
        color: '#2563eb',
        weight: 4,
      }).addTo(mapInstance.current);
    }
  }, [stops, schedules, driverBusNumber]);

  const selectedStop = useMemo(
    () => stops.find((s) => s.id === selectedStopId) || null,
    [selectedStopId, stops]
  );

  // Линия от пользователя до выбранной остановки
  useEffect(() => {
    if (!mapInstance.current) return;

    if (userToStopLine.current) {
      userToStopLine.current.remove();
      userToStopLine.current = null;
    }

    if (!userLocation || !selectedStop) return;

    userToStopLine.current = window.DG.polyline(
      [
        [userLocation.lat, userLocation.lng],
        [selectedStop.latitude, selectedStop.longitude],
      ],
      { color: '#10b981', dashArray: '4 4', weight: 3 }
    ).addTo(mapInstance.current);
  }, [userLocation, selectedStop]);

  const driverStops = useMemo(() => {
    if (!driverBusNumber) return [];
    const busSchedules = schedules
      .filter((s) => s.bus_number === driverBusNumber)
      .sort((a, b) => a.order_index - b.order_index);
    return busSchedules
      .map((s) => stops.find((st) => st.id === s.stop_id))
      .filter((s): s is Stop => !!s);
  }, [stops, schedules, driverBusNumber]);

  const handleCreateStopAndSchedule = async (name: string, lat: number, lng: number) => {
    if (!isDriver || !driverBusNumber || !driverId) return;

    const { data: stopData, error: stopError } = await supabase
      .from('stops')
      .insert({
        name,
        latitude: lat,
        longitude: lng,
      })
      .select('*')
      .single();

    if (stopError || !stopData) return;

    const currentMaxOrder =
      schedules
        .filter((s) => s.bus_number === driverBusNumber)
        .reduce((max, s) => (s.order_index > max ? s.order_index : max), 0) || 0;

    await supabase.from('bus_stop_schedules').insert({
      bus_number: driverBusNumber,
      stop_id: (stopData as Stop).id,
      driver_id: driverId,
      order_index: currentMaxOrder + 1,
    });
  };

  const handleAddDriverStopFromLocation = async () => {
    if (!userLocation || !newStopName.trim()) return;
    await handleCreateStopAndSchedule(newStopName.trim(), userLocation.lat, userLocation.lng);
    setNewStopName('');
  };

  const handleRemoveDriverStop = async (stopId: string) => {
    if (!driverBusNumber) return;
    const scheduleIds = schedules
      .filter((s) => s.bus_number === driverBusNumber && s.stop_id === stopId)
      .map((s) => s.id);
    if (scheduleIds.length === 0) return;

    await supabase
      .from('bus_stop_schedules')
      .delete()
      .in('id', scheduleIds);
  };

  const haversineKm = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
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
  };

  const selectedStopDistance =
    userLocation && selectedStop
      ? haversineKm(
          userLocation.lat,
          userLocation.lng,
          selectedStop.latitude,
          selectedStop.longitude
        )
      : null;

  // Обработчик кликов по карте в режиме редактирования маршрута
  useEffect(() => {
    if (!mapInstance.current || !isDriver || !driverBusNumber) return;

    const map = mapInstance.current;
    const handler = (e: any) => {
      if (!editMode) return;
      const { lat, lng } = e.latlng;
      // Простое диалоговое окно для названия остановки
      const name = window.prompt('Название новой остановки на маршруте:');
      if (!name) return;
      handleCreateStopAndSchedule(name.trim(), lat, lng);
    };

    map.on('click', handler);

    return () => {
      map.off('click', handler);
    };
  }, [editMode, isDriver, driverBusNumber, schedules]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Фильтр по номерам автобусов */}
      {buses.length > 0 && (
        <div className="absolute top-3 left-3 right-3 flex space-x-2 overflow-x-auto z-10">
          <button
            onClick={() => setActiveBusFilter('all')}
            className={`px-3 py-1.5 rounded-2xl text-[11px] whitespace-nowrap border transition-all ${
              activeBusFilter === 'all'
                ? 'bg-gray-900 dark:bg-gray-700 text-white border-gray-900 dark:border-gray-700 shadow-lg'
                : 'bg-white/95 dark:bg-gray-900/95 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Все автобусы
          </button>
          {Array.from(new Set(buses.map((b) => b.bus_number))).map((num) => (
            <button
              key={num}
              onClick={() => setActiveBusFilter(num)}
              className={`px-3 py-1.5 rounded-2xl text-[11px] whitespace-nowrap border transition-all ${
                activeBusFilter === num
                  ? 'bg-gray-900 dark:bg-gray-700 text-white border-gray-900 dark:border-gray-700 shadow-lg'
                  : 'bg-white/95 dark:bg-gray-900/95 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              №{num}
            </button>
          ))}
        </div>
      )}

      {/* Панель маршрута водителя */}
      {isDriver && driverBusNumber && (
        <div className="absolute left-3 right-3 bottom-24 sm:bottom-24 bg-white dark:bg-gray-900 rounded-3xl shadow-lg p-3 space-y-2 text-xs z-10 border border-gray-200 dark:border-gray-700 animate-fade-in">
          <div className="flex items-center justify-between mb-1">
          <p className="font-semibold text-gray-900 dark:text-gray-50">
            Маршрут автобуса №{driverBusNumber}
          </p>
            <button
              onClick={() => setEditMode((v) => !v)}
              className={`px-2 py-1 rounded-2xl text-[10px] border transition-all ${
                editMode
                  ? 'bg-gray-900 dark:bg-gray-700 text-white border-gray-900 dark:border-gray-700'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {editMode ? 'Режим: клик по карте' : 'Редактировать маршрут'}
            </button>
          </div>

          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Введите название и добавьте остановку из вашей геолокации или включите режим
            «клик по карте». На карте появится синяя линия пути от точки A до B.
          </p>

          <div className="flex items-center space-x-2">
            <input
              className="flex-1 px-3 py-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Название остановки"
              value={newStopName}
              onChange={(e) => setNewStopName(e.target.value)}
            />
            <button
              onClick={handleAddDriverStopFromLocation}
              disabled={!userLocation || !newStopName.trim()}
              className="px-3 py-1.5 rounded-2xl bg-primary-500 text-white text-[11px] font-semibold disabled:opacity-50 active:scale-95 transition"
            >
              Добавить
            </button>
          </div>

          {driverStops.length > 0 && (
            <div className="flex space-x-2 overflow-x-auto">
              {driverStops.map((stop) => (
                <button
                  key={stop.id}
                  onClick={() => setSelectedStopId(stop.id)}
                  className={`px-3 py-1.5 rounded-2xl border text-[11px] whitespace-nowrap flex items-center space-x-1 ${
                    selectedStopId === stop.id
                      ? 'bg-primary-500 text-white border-primary-500'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span>{stop.name}</span>
                  <span
                    className="ml-1 text-[10px] text-slate-400 dark:text-slate-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveDriverStop(stop.id);
                    }}
                  >
                    ×
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Панель ближайшего пути до остановки */}
      {stops.length > 0 && (
        <div className="absolute left-3 right-3 bottom-4 bg-white dark:bg-gray-900 rounded-3xl shadow-lg p-3 text-[11px] space-y-2 z-10 border border-gray-200 dark:border-gray-700 animate-fade-in">
          <p className="font-semibold text-gray-900 dark:text-gray-50">
            Ближайший путь до остановки
          </p>
          <div className="flex items-center space-x-2">
            <select
              className="flex-1 px-3 py-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-primary-500"
              value={selectedStopId || ''}
              onChange={(e) =>
                setSelectedStopId(e.target.value || null)
              }
            >
              <option value="">Выберите остановку</option>
              {stops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                </option>
              ))}
            </select>
          </div>

          {selectedStop && (
            <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
              {userLocation && selectedStopDistance !== null ? (
                <>
                  <span>
                    Расстояние ~{' '}
                    <span className="font-semibold">
                      {selectedStopDistance.toFixed(2)} км
                    </span>
                  </span>
                  <span>
                    Автобусы:{" "}
                    <span className="font-semibold">
                      {schedules
                        .filter((s) => s.stop_id === selectedStop.id)
                        .map((s) => s.bus_number)
                        .filter((v, i, arr) => arr.indexOf(v) === i)
                        .join(', ') || '—'}
                    </span>
                  </span>
                </>
              ) : (
                <span className="text-gray-500 dark:text-gray-400">
                  Включите геолокацию, чтобы увидеть расстояние.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
