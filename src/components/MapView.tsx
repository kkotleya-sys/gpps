import { useEffect, useMemo, useRef, useState } from 'react';
import { BusStopSchedule, BusWithDriver, Route, RouteStop, Stop } from '../types';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { loadMapbox } from '../lib/mapboxLoader';
import { loadNotificationPrefs } from '../lib/notifications';
import { formatEta } from '../lib/text';
import { getMapboxRoutePolyline } from '../lib/routingMapbox';
import { fetchStopsInRadius } from '../lib/busmaps';

type StopMarker = {
  marker: any;
  busNumbers: Set<string>;
};

type LatLng = [number, number];

interface MapViewProps {
  buses: BusWithDriver[];
  userLocation: { lat: number; lng: number } | null;
  onBusClick: (bus: BusWithDriver) => void;
  isDriver?: boolean;
  driverBusNumber?: string | null;
  driverId?: string | null;
  driverRouteId?: string | null;
}

declare global {
  interface Window {
    mapboxgl: any;
  }
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

export function MapView({ buses, userLocation, onBusClick, isDriver, driverBusNumber, driverId, driverRouteId }: MapViewProps) {
  const { t, language } = useLanguage();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const busMarkers = useRef<Map<string, any>>(new Map());
  const stopMarkers = useRef<Map<string, StopMarker>>(new Map());
  const userMarker = useRef<any>(null);
  const userRouteLayerRef = useRef<{ sourceId: string; layerId: string } | null>(null);
  const busRouteLayerRef = useRef<{ sourceId: string; layerId: string } | null>(null);
  const speedHistoryRef = useRef<Map<string, number[]>>(new Map());
  const lastNotifyRef = useRef<Map<string, number>>(new Map());

  const [mapLoaded, setMapLoaded] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [schedules, setSchedules] = useState<BusStopSchedule[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [activeBusFilter, setActiveBusFilter] = useState<string | 'all'>('all');
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showRoute, setShowRoute] = useState(false);
  const [userToStopPath, setUserToStopPath] = useState<LatLng[] | null>(null);

  const getStopName = (stop: Stop) => {
    if (language === 'tj') return stop.name_tj || stop.name_ru || stop.name;
    if (language === 'eng') return stop.name_eng || stop.name_ru || stop.name;
    return stop.name_ru || stop.name;
  };

  const getAiSpeed = (busNumber: string, fallback: number) => {
    const history = speedHistoryRef.current.get(busNumber) || [];
    if (history.length >= 3) {
      const avg = history.reduce((sum, value) => sum + value, 0) / history.length;
      return Math.max(10, Math.min(50, avg));
    }
    return Math.max(fallback || 25, 10);
  };

  useEffect(() => {
    let cancelled = false;
    loadMapbox()
      .then((mapboxgl) => {
        if (cancelled || !mapContainer.current || mapInstance.current) return;

        const map = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [68.7738, 38.5598],
          zoom: 13,
          minZoom: 11,
          maxZoom: 18,
        });

        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
        map.on('load', () => {
          if (!cancelled) setMapLoaded(true);
        });

        mapInstance.current = map;
      })
      .catch((error) => console.error('Mapbox loader error:', error));

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const [stopsResp, schedulesResp, routesResp, routeStopsResp] = await Promise.all([
        supabase.from('stops').select('*'),
        supabase.from('bus_stop_schedules').select('*'),
        supabase.from('routes').select('*'),
        supabase.from('route_stops').select('*'),
      ]);

      if (stopsResp.data && stopsResp.data.length > 0) {
        setStops(stopsResp.data as Stop[]);
      } else {
        try {
          const fallback = await fetchStopsInRadius({
            lat: 38.5598,
            lon: 68.787,
            radiusMeters: 20000,
            limit: 5000,
            language,
          });

          setStops(
            fallback.stops.map((stop) => ({
              id: `busmaps_${stop.id}`,
              name: stop.name,
              name_ru: stop.name_ru || stop.name,
              name_tj: stop.name_tj || stop.name,
              name_eng: stop.name_eng || stop.name,
              latitude: stop.lat,
              longitude: stop.lon,
              created_at: '',
            }))
          );
        } catch {
          setStops([]);
        }
      }
      if (schedulesResp.data) setSchedules(schedulesResp.data as BusStopSchedule[]);
      if (routesResp.data) setRoutes(routesResp.data as Route[]);
      if (routeStopsResp.data) setRouteStops(routeStopsResp.data as RouteStop[]);
    };

    fetchData();

    const channel = supabase
      .channel('map_support_data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stops' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_stop_schedules' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'route_stops' }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [language]);

  const busesByNumber = useMemo(() => {
    const map = new Map<string, BusWithDriver[]>();
    buses.forEach((bus) => {
      const next = map.get(bus.bus_number) || [];
      next.push(bus);
      map.set(bus.bus_number, next);
    });
    return map;
  }, [buses]);

  const stopScheduleMap = useMemo(() => {
    const map = new Map<string, BusStopSchedule[]>();
    schedules.forEach((schedule) => {
      const next = map.get(schedule.stop_id) || [];
      next.push(schedule);
      map.set(schedule.stop_id, next);
    });
    return map;
  }, [schedules]);

  const activeBusRouteVariants = useMemo(() => {
    if (activeBusFilter === 'all') return [];

    return routes
      .filter((route) => route.bus_number === activeBusFilter)
      .map((route) => {
        const orderedStops = routeStops
          .filter((routeStop) => routeStop.route_id === route.id)
          .sort((a, b) => a.order_index - b.order_index)
          .map((routeStop) => stops.find((stop) => stop.id === routeStop.stop_id) || null)
          .filter((stop): stop is Stop => !!stop);

        return {
          route,
          orderedStops,
          title:
            orderedStops.length >= 2
              ? `${getStopName(orderedStops[0])} -> ${getStopName(orderedStops[orderedStops.length - 1])}`
              : route.name,
        };
      })
      .filter((item) => item.orderedStops.length > 0);
  }, [activeBusFilter, routes, routeStops, stops, language]);

  useEffect(() => {
    if (activeBusFilter === 'all') {
      setSelectedRouteId(null);
      return;
    }

    const preferredRouteId =
      activeBusFilter === driverBusNumber && driverRouteId
        ? driverRouteId
        : activeBusRouteVariants.find((item) => item.route.is_active)?.route.id ||
          activeBusRouteVariants[0]?.route.id ||
          null;

    if (selectedRouteId && activeBusRouteVariants.some((item) => item.route.id === selectedRouteId)) return;
    setSelectedRouteId(preferredRouteId);
  }, [activeBusFilter, activeBusRouteVariants, driverBusNumber, driverRouteId, selectedRouteId]);

  const effectiveRouteId =
    activeBusFilter !== 'all'
      ? activeBusFilter === driverBusNumber && driverRouteId
        ? driverRouteId
        : selectedRouteId
      : null;

  const selectedRouteStopIds = useMemo(() => {
    if (!effectiveRouteId) return new Set<string>();
    return new Set(
      routeStops
        .filter((routeStop) => routeStop.route_id === effectiveRouteId)
        .map((routeStop) => routeStop.stop_id)
    );
  }, [effectiveRouteId, routeStops]);

  const filteredRoutePath = useMemo(() => {
    if (!showRoute || activeBusFilter === 'all') return null;

    if (effectiveRouteId) {
      const orderedStops = routeStops
        .filter((routeStop) => routeStop.route_id === effectiveRouteId)
        .sort((a, b) => a.order_index - b.order_index)
        .map((routeStop) => stops.find((stop) => stop.id === routeStop.stop_id) || null)
        .filter((stop): stop is Stop => !!stop);

      const uniqueStops = Array.from(new Map(orderedStops.map((stop) => [stop.id, stop])).values());
      if (uniqueStops.length >= 2) {
        return uniqueStops.map((stop) => [stop.longitude, stop.latitude]);
      }
    }

    const orderedStops = schedules
      .filter((schedule) => schedule.bus_number === activeBusFilter)
      .sort((a, b) => a.order_index - b.order_index)
      .map((schedule) => stops.find((stop) => stop.id === schedule.stop_id) || null)
      .filter((stop): stop is Stop => !!stop);

    const uniqueStops = Array.from(
      new Map(orderedStops.map((stop) => [stop.id, stop])).values()
    );

    if (uniqueStops.length < 2) return null;
    return uniqueStops.map((stop) => [stop.longitude, stop.latitude]);
  }, [activeBusFilter, effectiveRouteId, routeStops, schedules, showRoute, stops]);

  const liveQueue = useMemo(() => {
    if (!showRoute || activeBusFilter === 'all') return [];
    const busesForNumber = buses.filter((bus) => bus.bus_number === activeBusFilter);
    if (busesForNumber.length === 0) return [];

    const candidateStops =
      selectedRouteStopIds.size > 0
        ? stops.filter((stop) => selectedRouteStopIds.has(stop.id))
        : stops.filter((stop) =>
            (stopScheduleMap.get(stop.id) || []).some((schedule) => schedule.bus_number === activeBusFilter)
          );

    return busesForNumber
      .map((bus) => {
        let nextStop: Stop | null = null;
        let distanceKm = Number.POSITIVE_INFINITY;
        candidateStops.forEach((stop) => {
          const distance = haversineKm(bus.latitude, bus.longitude, stop.latitude, stop.longitude);
          if (distance < distanceKm) {
            distanceKm = distance;
            nextStop = stop;
          }
        });

        return {
          bus,
          nextStop,
          distanceKm,
          etaMinutes: Math.round((distanceKm / getAiSpeed(bus.bus_number, bus.speed || 25)) * 60),
        };
      })
      .filter((item): item is { bus: BusWithDriver; nextStop: Stop; distanceKm: number; etaMinutes: number } => !!item.nextStop)
      .sort((a, b) => a.etaMinutes - b.etaMinutes);
  }, [showRoute, activeBusFilter, buses, stops, stopScheduleMap, selectedRouteStopIds]);

  useEffect(() => {
    if (!mapInstance.current || !mapLoaded) return;

    buses.forEach((bus) => {
      const existing = busMarkers.current.get(bus.id);
      const speed = Number.isFinite(bus.speed) ? bus.speed : 0;
      if (speed > 0) {
        const next = [...(speedHistoryRef.current.get(bus.bus_number) || []).slice(-9), speed];
        speedHistoryRef.current.set(bus.bus_number, next);
      }

      if (existing) {
        existing.setLngLat([bus.longitude, bus.latitude]);
        existing.getElement().style.display = activeBusFilter === 'all' || activeBusFilter === bus.bus_number ? '' : 'none';
        return;
      }

      const el = document.createElement('div');
      el.style.width = '32px';
      el.style.height = '32px';
      el.style.backgroundSize = '32px 32px';
      el.style.backgroundImage = `url("data:image/svg+xml;base64,${btoa(`
        <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="8" width="24" height="18" rx="3" fill="#2563eb" stroke="white" stroke-width="2"/>
          <rect x="7" y="11" width="8" height="6" rx="1" fill="white" opacity="0.9"/>
          <rect x="17" y="11" width="8" height="6" rx="1" fill="white" opacity="0.9"/>
          <circle cx="10" cy="24" r="2" fill="white"/>
          <circle cx="22" cy="24" r="2" fill="white"/>
        </svg>
      `)}")`;
      el.style.cursor = 'pointer';
      if (activeBusFilter !== 'all' && activeBusFilter !== bus.bus_number) {
        el.style.display = 'none';
      }

      const marker = new window.mapboxgl.Marker({ element: el })
        .setLngLat([bus.longitude, bus.latitude])
        .addTo(mapInstance.current);

      marker.getElement().addEventListener('click', () => onBusClick(bus));
      busMarkers.current.set(bus.id, marker);
    });

    busMarkers.current.forEach((marker, id) => {
      if (!buses.find((bus) => bus.id === id)) {
        marker.remove();
        busMarkers.current.delete(id);
      }
    });
  }, [buses, activeBusFilter, mapLoaded, onBusClick]);

  useEffect(() => {
    if (!mapInstance.current || !mapLoaded) return;

    const map = mapInstance.current;

    stops.forEach((stop) => {
      const stopSchedules = stopScheduleMap.get(stop.id) || [];
      const relevantSchedules =
        activeBusFilter === 'all'
          ? stopSchedules
          : stopSchedules.filter((schedule) => schedule.bus_number === activeBusFilter);
      const busNumbers = new Set(stopSchedules.map((item) => item.bus_number));
      const isVisible =
        activeBusFilter === 'all'
          ? true
          : showRoute && selectedRouteStopIds.size > 0
            ? selectedRouteStopIds.has(stop.id)
            : busNumbers.has(activeBusFilter);

      const arrivalLines = relevantSchedules
        .map((schedule) => {
          const liveBus = (busesByNumber.get(schedule.bus_number) || [])[0];
          if (liveBus) {
            const distance = haversineKm(stop.latitude, stop.longitude, liveBus.latitude, liveBus.longitude);
            const etaMinutes = Math.round((distance / getAiSpeed(schedule.bus_number, liveBus.speed || 25)) * 60);
            return { busNumber: schedule.bus_number, eta: formatEta(etaMinutes) };
          }
          return { busNumber: schedule.bus_number, eta: schedule.arrival_time || 'Нет данных' };
        })
        .sort((a, b) => a.busNumber.localeCompare(b.busNumber))
        .slice(0, 6);

      const html = `
        <div style="background:#0b1117;padding:10px 12px;border-radius:12px;border:1px solid #1f2937;box-shadow:0 6px 18px rgba(0,0,0,.35);min-width:190px;">
          <div style="color:#9ca3af;font-size:10px;margin-bottom:6px;">Остановка</div>
          <div style="color:#e5e7eb;font-weight:700;font-size:12px;margin-bottom:8px;">${getStopName(stop)}</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${arrivalLines.length > 0
              ? arrivalLines
                  .map(
                    (item) => `<div style="display:flex;justify-content:space-between;gap:8px;color:#21f35a;font-family:monospace;font-size:11px;"><span>№${item.busNumber}</span><span>${item.eta}</span></div>`
                  )
                  .join('')
              : '<div style="color:#9ca3af;font-size:11px;">Нет данных по прибытиям</div>'}
          </div>
        </div>
      `;

      const existing = stopMarkers.current.get(stop.id);
      if (existing) {
        existing.marker.getElement().style.display = isVisible ? '' : 'none';
        existing.marker.getPopup()?.setHTML(html);
        return;
      }

      const el = document.createElement('div');
      el.style.width = '10px';
      el.style.height = '10px';
      el.style.background = '#22c55e';
      el.style.border = '2px solid #0b1117';
      el.style.borderRadius = '999px';
      if (!isVisible) el.style.display = 'none';

      const marker = new window.mapboxgl.Marker({ element: el })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(map);

      const popup = new window.mapboxgl.Popup({ closeButton: false, closeOnClick: true }).setHTML(html);
      marker.setPopup(popup);
      stopMarkers.current.set(stop.id, { marker, busNumbers });
    });

    stopMarkers.current.forEach((entry, stopId) => {
      if (!stops.find((stop) => stop.id === stopId)) {
        entry.marker.remove();
        stopMarkers.current.delete(stopId);
      }
    });
  }, [stops, stopScheduleMap, activeBusFilter, showRoute, busesByNumber, language, mapLoaded, selectedRouteStopIds]);

  const selectedStop = useMemo(
    () => stops.find((stop) => stop.id === selectedStopId) || null,
    [selectedStopId, stops]
  );

  const driverBusProfile = useMemo(() => {
    if (!isDriver || !driverBusNumber) return null;

    return (
      buses.find((bus) => (driverId ? bus.driver_id === driverId : false) && bus.bus_number === driverBusNumber) ||
      buses.find((bus) => bus.bus_number === driverBusNumber) || {
        id: `driver-profile-${driverId || driverBusNumber}`,
        driver_id: driverId || 'self',
        bus_number: driverBusNumber,
        latitude: userLocation?.lat || 0,
        longitude: userLocation?.lng || 0,
        speed: 0,
        heading: 0,
        updated_at: new Date().toISOString(),
      }
    );
  }, [isDriver, driverBusNumber, driverId, buses, userLocation]);

  useEffect(() => {
    if (!mapInstance.current || !mapLoaded || !userLocation) return;

    if (userMarker.current) {
      userMarker.current.setLngLat([userLocation.lng, userLocation.lat]);
      return;
    }

    const el = document.createElement('div');
    el.style.width = '24px';
    el.style.height = '24px';
    el.style.backgroundSize = '24px 24px';
    el.style.backgroundImage = `url("data:image/svg+xml;base64,${btoa(`
      <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="8" fill="#ef4444" stroke="white" stroke-width="3"/>
        <circle cx="12" cy="12" r="4" fill="white"/>
      </svg>
    `)}")`;

    userMarker.current = new window.mapboxgl.Marker({ element: el })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(mapInstance.current);

    if (isDriver && driverBusProfile) {
      userMarker.current.getElement().style.cursor = 'pointer';
      userMarker.current.getElement().addEventListener('click', () => onBusClick(driverBusProfile));
    }
  }, [userLocation, mapLoaded, isDriver, driverBusProfile, onBusClick]);

  useEffect(() => {
    const prefs = loadNotificationPrefs();
    if (!prefs.enabled || !('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const now = Date.now();
    const notifyIfDue = (key: string, title: string, body: string) => {
      const last = lastNotifyRef.current.get(key) || 0;
      if (now - last < 5 * 60 * 1000) return;
      new Notification(title, { body });
      lastNotifyRef.current.set(key, now);
    };

    if (prefs.busNumbers.length > 0 && userLocation) {
      prefs.busNumbers.forEach((busNumber) => {
        const bus = buses.find((item) => item.bus_number === busNumber);
        if (!bus) return;
        const distance = haversineKm(bus.latitude, bus.longitude, userLocation.lat, userLocation.lng);
        const etaMinutes = Math.round((distance / getAiSpeed(bus.bus_number, bus.speed || 25)) * 60);
        if (etaMinutes <= 2) {
          notifyIfDue(`busnum:${busNumber}`, `Автобус №${busNumber}`, `Подъезжает к вам (${formatEta(etaMinutes)})`);
        }
      });
    }

    if (prefs.stopIds.length > 0) {
      prefs.stopIds.forEach((stopId) => {
        const stop = stops.find((item) => item.id === stopId);
        if (!stop) return;
        (stopScheduleMap.get(stopId) || []).forEach((schedule) => {
          const bus = buses.find((item) => item.bus_number === schedule.bus_number);
          if (!bus) return;
          const distance = haversineKm(bus.latitude, bus.longitude, stop.latitude, stop.longitude);
          const etaMinutes = Math.round((distance / getAiSpeed(schedule.bus_number, bus.speed || 25)) * 60);
          if (etaMinutes <= 2) {
            notifyIfDue(
              `stop:${stopId}:${schedule.bus_number}`,
              `Автобус №${schedule.bus_number}`,
              `Подъезжает к остановке ${getStopName(stop)} (${formatEta(etaMinutes)})`
            );
          }
        });
      });
    }
  }, [buses, stops, stopScheduleMap, userLocation]);

  useEffect(() => {
    if (!selectedStop || !userLocation) {
      setUserToStopPath(null);
      return;
    }

    let cancelled = false;

    const loadPath = async () => {
      const path =
        (await getMapboxRoutePolyline([
          { lat: userLocation.lat, lng: userLocation.lng },
          { lat: selectedStop.latitude, lng: selectedStop.longitude },
        ])) || [
          [userLocation.lat, userLocation.lng] as LatLng,
          [selectedStop.latitude, selectedStop.longitude] as LatLng,
        ];

      if (!cancelled) {
        setUserToStopPath(path);
      }
    };

    loadPath();
    return () => {
      cancelled = true;
    };
  }, [selectedStop, userLocation]);

  useEffect(() => {
    if (!mapInstance.current || !mapLoaded) return;

    const map = mapInstance.current;
    const sourceId = 'user-stop-route';
    const layerId = 'user-stop-route-line';

    if (!userToStopPath || userToStopPath.length < 2) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      userRouteLayerRef.current = null;
      return;
    }

    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: userToStopPath.map((point) => [point[1], point[0]]),
      },
    };

    if (map.getSource(sourceId)) {
      map.getSource(sourceId).setData(geojson);
    } else {
      map.addSource(sourceId, { type: 'geojson', data: geojson });
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#10b981', 'line-width': 4, 'line-opacity': 0.85 },
      });
    }

    userRouteLayerRef.current = { sourceId, layerId };
  }, [userToStopPath, mapLoaded]);

  useEffect(() => {
    if (!mapInstance.current || !mapLoaded) return;

    const map = mapInstance.current;
    const sourceId = 'selected-bus-route';
    const layerId = 'selected-bus-route-line';

    if (!filteredRoutePath || filteredRoutePath.length < 2) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      busRouteLayerRef.current = null;
      return;
    }

    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: filteredRoutePath,
      },
    };

    if (map.getSource(sourceId)) {
      map.getSource(sourceId).setData(geojson);
    } else {
      map.addSource(sourceId, { type: 'geojson', data: geojson });
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#2563eb',
          'line-width': 5,
          'line-opacity': 0.78,
        },
      });
    }

    busRouteLayerRef.current = { sourceId, layerId };
  }, [filteredRoutePath, mapLoaded]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="w-full h-full" />

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
            {t('map.allBuses')}
          </button>
          {Array.from(new Set(buses.map((bus) => bus.bus_number))).map((num) => (
            <button
              key={num}
              onClick={() => setActiveBusFilter(num)}
              className={`px-3 py-1.5 rounded-2xl text-[11px] whitespace-nowrap border transition-all ${
                activeBusFilter === num
                  ? 'bg-gray-900 dark:bg-gray-700 text-white border-gray-900 dark:border-gray-700 shadow-lg'
                  : 'bg-white/95 dark:bg-gray-900/95 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {t('map.busNumber')}{num}
            </button>
          ))}
          {activeBusFilter !== 'all' && (
            <button
              onClick={() => setShowRoute((value) => !value)}
              className={`px-3 py-1.5 rounded-2xl text-[11px] whitespace-nowrap border transition-all ${
                showRoute
                  ? 'bg-blue-600 dark:bg-blue-700 text-white border-blue-600 dark:border-blue-700 shadow-lg'
                  : 'bg-white/95 dark:bg-gray-900/95 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {showRoute ? t('map.hideRoute') : t('map.showRoute')}
            </button>
          )}
        </div>
      )}

      {showRoute && activeBusFilter !== 'all' && liveQueue.length > 0 && (
        <div className="absolute top-14 right-3 bg-white/95 dark:bg-gray-900/95 rounded-2xl shadow-lg p-3 text-[11px] z-10 border border-gray-200 dark:border-gray-700 max-w-[220px]">
          <p className="font-semibold text-gray-900 dark:text-gray-50 mb-2">Живая очередь</p>
          <div className="space-y-2">
            {liveQueue.map((item) => (
              <div key={item.bus.id} className="flex flex-col">
                <span className="text-gray-900 dark:text-gray-50 font-semibold">Автобус №{item.bus.bus_number}</span>
                <span className="text-gray-500 dark:text-gray-400">След. остановка: {getStopName(item.nextStop)}</span>
                <span className="text-gray-500 dark:text-gray-400">{formatEta(item.etaMinutes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showRoute && activeBusFilter !== 'all' && activeBusRouteVariants.length > 1 && (
        <div className="absolute top-14 left-3 z-10 w-[min(420px,calc(100%-24px))] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 p-3 shadow-lg">
          <p className="mb-2 text-[11px] font-semibold text-gray-900 dark:text-gray-50">Рейс автобуса</p>
          <select
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-[12px] outline-none focus:ring-1 focus:ring-primary-500"
            value={effectiveRouteId || ''}
            onChange={(event) => setSelectedRouteId(event.target.value || null)}
          >
            {activeBusRouteVariants.map((item) => (
              <option key={item.route.id} value={item.route.id}>
                {item.title} ({item.orderedStops.length} ост.)
              </option>
            ))}
          </select>
        </div>
      )}

      {stops.length > 0 && (
        <div className="absolute left-3 right-3 bottom-4 bg-white dark:bg-gray-900 rounded-3xl shadow-lg p-3 text-[11px] space-y-2 z-10 border border-gray-200 dark:border-gray-700 animate-fade-in">
          <p className="font-semibold text-gray-900 dark:text-gray-50">{t('map.distance')}</p>
          <select
            className="w-full px-3 py-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-primary-500"
            value={selectedStopId || ''}
            onChange={(event) => setSelectedStopId(event.target.value || null)}
          >
            <option value="">{t('route.selectStop')}</option>
            {stops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {getStopName(stop)}
              </option>
            ))}
          </select>

          {selectedStop && userLocation && (
            <div className="text-gray-600 dark:text-gray-300">
              {t('map.distance')}: <span className="font-semibold">{haversineKm(userLocation.lat, userLocation.lng, selectedStop.latitude, selectedStop.longitude).toFixed(2)} {t('map.km')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
