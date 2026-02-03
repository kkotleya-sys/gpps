import { useEffect, useMemo, useRef, useState } from 'react';
import { BusWithDriver, Stop, Route, RouteStop } from '../types';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { getMapboxRoutePolyline } from '../lib/routingMapbox';
import { loadMapbox } from '../lib/mapboxLoader';
import { loadNotificationPrefs } from '../lib/notifications';

type LatLng = [number, number];

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
    mapboxgl: any;
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
  const { t } = useLanguage();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markers = useRef<Map<string, any>>(new Map());
  const userMarker = useRef<any>(null);
  const routeLayers = useRef<Map<string, { sourceId: string; layerId: string }>>(new Map());
  const routeStopMarkers = useRef<Map<string, any>>(new Map());
  const stopHoverMarkers = useRef<Map<string, any>>(new Map());
  const userRouteLayerRef = useRef<{ sourceId: string; layerId: string } | null>(null);
  const speedHistoryRef = useRef<Map<string, number[]>>(new Map());
  const lastNotifyRef = useRef<Map<string, number>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [routePaths, setRoutePaths] = useState<Map<string, LatLng[]>>(new Map());
  const routePathCache = useRef<Map<string, { hash: string; path: LatLng[] }>>(new Map());
  const [userToStopPath, setUserToStopPath] = useState<LatLng[] | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [activeBusFilter, setActiveBusFilter] = useState<string | 'all'>('all');
  const [showRoute, setShowRoute] = useState(false);

  const buildLedHtml = (stopName: string, rows: { bus: string; time: string }[]) => `
    <div style="background:#0b1117;padding:8px 10px;border-radius:10px;border:1px solid #1f2937;box-shadow:0 6px 18px rgba(0,0,0,.35);min-width:160px;">
      <div style="color:#9ca3af;font-size:10px;margin-bottom:6px;">Остановка</div>
      <div style="color:#e5e7eb;font-weight:600;font-size:12px;margin-bottom:6px;">${stopName}</div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${rows
          .map(
            (a) =>
              `<div style="display:flex;justify-content:space-between;gap:8px;color:#21f35a;font-family:monospace;font-size:11px;">
                 <span>№${a.bus}</span><span>${a.time}</span>
               </div>`
          )
          .join('')}
      </div>
    </div>
  `;

  const getAiSpeed = (busNumber: string, fallback: number) => {
    const history = speedHistoryRef.current.get(busNumber) || [];
    if (history.length >= 3) {
      const avg = history.reduce((sum, v) => sum + v, 0) / history.length;
      return Math.max(10, Math.min(50, avg));
    }
    return fallback || 25;
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
          minZoom: 12,
          maxZoom: 18,
        });

        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

        const bounds = new mapboxgl.LngLatBounds(
          [68.6738, 38.4598],
          [68.8738, 38.6598]
        );
        map.setMaxBounds(bounds);

        map.on('load', () => {
          if (cancelled) return;
          setMapLoaded(true);
        });

        mapInstance.current = map;
      })
      .catch((err) => {
        console.error('Mapbox loader error:', err);
      });

    return () => {
      cancelled = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedStopId || !userLocation) {
      setUserToStopPath(null);
      return;
    }
    const stop = stops.find((s) => s.id === selectedStopId);
    if (!stop) {
      setUserToStopPath(null);
      return;
    }

    let cancelled = false;
    const loadPath = async () => {
      const path =
        (await getMapboxRoutePolyline([
          { lat: userLocation.lat, lng: userLocation.lng },
          { lat: stop.latitude, lng: stop.longitude },
        ])) || [
          [userLocation.lat, userLocation.lng] as LatLng,
          [stop.latitude, stop.longitude] as LatLng,
        ];

      if (!cancelled) setUserToStopPath(path);
    };

    loadPath();
    return () => {
      cancelled = true;
    };
  }, [selectedStopId, userLocation, stops]);

  // Build route paths with Mapbox routing when needed
  useEffect(() => {
    if (!showRoute) return;

    let cancelled = false;
    const loadRoutes = async () => {
      const filteredRoutes = routes.filter(
        (route) => activeBusFilter === 'all' || route.bus_number === activeBusFilter
      );

      const nextPaths = new Map(routePaths);

      for (const route of filteredRoutes) {
        const stopsForRoute = routeStops
          .filter((rs) => rs.route_id === route.id)
          .sort((a, b) => a.order_index - b.order_index)
          .map((rs) => stops.find((s) => s.id === rs.stop_id))
          .filter((s): s is Stop => !!s);

        if (stopsForRoute.length < 2) continue;

        const hash = stopsForRoute
          .map((s) => `${s.id}:${s.latitude.toFixed(5)}:${s.longitude.toFixed(5)}`)
          .join('|');
        const cached = routePathCache.current.get(route.id);
        if (cached && cached.hash === hash) {
          nextPaths.set(route.id, cached.path);
          continue;
        }

        const path =
          (await getMapboxRoutePolyline(
            stopsForRoute.map((s) => ({ lat: s.latitude, lng: s.longitude }))
          )) || stopsForRoute.map((s) => [s.latitude, s.longitude] as LatLng);

        routePathCache.current.set(route.id, { hash, path });
        nextPaths.set(route.id, path);
      }

      if (!cancelled) setRoutePaths(nextPaths);
    };

    loadRoutes();
    return () => {
      cancelled = true;
    };
  }, [showRoute, routes, routeStops, stops, activeBusFilter]);

  // Load routes and route stops
  useEffect(() => {
    const fetchData = async () => {
      const { data: routesData } = await supabase
        .from('routes')
        .select('*')
        .eq('is_active', true);

      const { data: routeStopsData } = await supabase
        .from('route_stops')
        .select('*');

      const { data: stopsData } = await supabase.from('stops').select('*');

      if (routesData) setRoutes(routesData as Route[]);
      if (routeStopsData) setRouteStops(routeStopsData as RouteStop[]);
      if (stopsData) setStops(stopsData as Stop[]);
    };

    fetchData();

    const routesChannel = supabase
      .channel('routes_map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, () => {
        fetchData();
      })
      .subscribe();

    const routeStopsChannel = supabase
      .channel('route_stops_map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'route_stops' }, () => {
        fetchData();
      })
      .subscribe();

    const stopsChannel = supabase
      .channel('stops_map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stops' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(routesChannel);
      supabase.removeChannel(routeStopsChannel);
      supabase.removeChannel(stopsChannel);
    };
  }, []);

  // Update bus markers
  useEffect(() => {
    if (!mapInstance.current || !mapLoaded) return;

    const filteredBuses = buses.filter(
      (bus) => activeBusFilter === 'all' || bus.bus_number === activeBusFilter
    );

    filteredBuses.forEach((bus) => {
      const list = speedHistoryRef.current.get(bus.bus_number) || [];
      const speed = Number.isFinite(bus.speed) ? bus.speed : 0;
      if (speed > 0) {
        const next = [...list.slice(-9), speed];
        speedHistoryRef.current.set(bus.bus_number, next);
      }
    });

    filteredBuses.forEach((bus) => {
      const existingMarker = markers.current.get(bus.id);

      if (existingMarker) {
        existingMarker.setLngLat([bus.longitude, bus.latitude]);
      } else {
        const el = document.createElement('div');
        el.style.width = '32px';
        el.style.height = '32px';
        el.style.backgroundSize = '32px 32px';
        el.style.backgroundImage = `url("data:image/svg+xml;base64,${btoa(`
          <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="8" width="24" height="18" rx="3" fill="#3B82F6" stroke="white" stroke-width="2"/>
            <rect x="7" y="11" width="8" height="6" rx="1" fill="white" opacity="0.9"/>
            <rect x="17" y="11" width="8" height="6" rx="1" fill="white" opacity="0.9"/>
            <circle cx="10" cy="24" r="2" fill="white"/>
            <circle cx="22" cy="24" r="2" fill="white"/>
          </svg>
        `)}")`;
        el.style.cursor = 'pointer';

        const marker = new window.mapboxgl.Marker({ element: el })
          .setLngLat([bus.longitude, bus.latitude])
          .addTo(mapInstance.current);

        marker.getElement().addEventListener('click', () => onBusClick(bus));
        markers.current.set(bus.id, marker);
      }
    });

    markers.current.forEach((marker, id) => {
      if (!filteredBuses.find((b) => b.id === id)) {
        marker.remove();
        markers.current.delete(id);
      }
    });
  }, [buses, onBusClick, activeBusFilter, mapLoaded]);

  // Update user marker
  useEffect(() => {
    if (!mapInstance.current || !mapLoaded || !userLocation) return;

    if (userMarker.current) {
      userMarker.current.setLngLat([userLocation.lng, userLocation.lat]);
    } else {
      const el = document.createElement('div');
      el.style.width = '24px';
      el.style.height = '24px';
      el.style.backgroundSize = '24px 24px';
      el.style.backgroundImage = `url("data:image/svg+xml;base64,${btoa(`
        <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="8" fill="#EF4444" stroke="white" stroke-width="3"/>
          <circle cx="12" cy="12" r="4" fill="white"/>
        </svg>
      `)}")`;

      userMarker.current = new window.mapboxgl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(mapInstance.current);
    }
  }, [userLocation, mapLoaded]);

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

    const lineCoords = userToStopPath.map((p) => [p[1], p[0]]);
    const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: lineCoords } };

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

  // Draw active routes
  useEffect(() => {
    if (!mapInstance.current || !mapLoaded || !showRoute) {
      routeLayers.current.forEach(({ layerId, sourceId }) => {
        if (!mapInstance.current) return;
        if (mapInstance.current.getLayer(layerId)) mapInstance.current.removeLayer(layerId);
        if (mapInstance.current.getSource(sourceId)) mapInstance.current.removeSource(sourceId);
      });
      routeLayers.current.clear();
      routeStopMarkers.current.forEach((marker) => marker.remove());
      routeStopMarkers.current.clear();
      return;
    }

    const filteredRoutes = routes.filter(
      (route) => activeBusFilter === 'all' || route.bus_number === activeBusFilter
    );

    filteredRoutes.forEach((route) => {
      const stopsForRoute = routeStops
        .filter((rs) => rs.route_id === route.id)
        .sort((a, b) => a.order_index - b.order_index)
        .map((rs) => stops.find((s) => s.id === rs.stop_id))
        .filter((s): s is Stop => !!s);

      if (stopsForRoute.length < 2) return;

      const latlngs = routePaths.get(route.id) || stopsForRoute.map((s) => [s.latitude, s.longitude]);
      const lineCoords = latlngs.map((p) => [p[1], p[0]]);
      const sourceId = `route-source-${route.id}`;
      const layerId = `route-layer-${route.id}`;

      const geojson = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: lineCoords },
      };

      if (mapInstance.current.getSource(sourceId)) {
        mapInstance.current.getSource(sourceId).setData(geojson);
      } else {
        mapInstance.current.addSource(sourceId, { type: 'geojson', data: geojson });
        mapInstance.current.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#2563eb', 'line-width': 4 },
        });
      }

      routeLayers.current.set(route.id, { sourceId, layerId });

      stopsForRoute.forEach((stop) => {
        const routeStop = routeStops.find(
          (rs) => rs.route_id === route.id && rs.stop_id === stop.id
        );
        const markerKey = `${route.id}_${stop.id}`;

        if (routeStopMarkers.current.has(markerKey)) return;

        const el = document.createElement('div');
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.backgroundSize = '20px 20px';
        el.style.backgroundImage = `url("data:image/svg+xml;base64,${btoa(`
          <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" fill="#2563eb" />
            <circle cx="12" cy="12" r="4" fill="white" />
          </svg>
        `)}")`;

        const marker = new window.mapboxgl.Marker({ element: el })
          .setLngLat([stop.longitude, stop.latitude])
          .addTo(mapInstance.current);

        routeStopMarkers.current.set(markerKey, marker);
      });
    });

    routeLayers.current.forEach(({ sourceId, layerId }, routeId) => {
      if (!filteredRoutes.find((r) => r.id === routeId)) {
        if (mapInstance.current.getLayer(layerId)) mapInstance.current.removeLayer(layerId);
        if (mapInstance.current.getSource(sourceId)) mapInstance.current.removeSource(sourceId);
        routeLayers.current.delete(routeId);
      }
    });

    routeStopMarkers.current.forEach((marker, key) => {
      const [routeId] = key.split('_');
      if (!filteredRoutes.find((r) => r.id === routeId)) {
        marker.remove();
        routeStopMarkers.current.delete(key);
      }
    });
  }, [routes, routeStops, stops, showRoute, activeBusFilter, routePaths, mapLoaded]);

  useEffect(() => {
    if (!mapInstance.current || !mapLoaded) return;
    const map = mapInstance.current;

    stopHoverMarkers.current.forEach((marker) => marker.remove());
    stopHoverMarkers.current.clear();

    const activeRoutes = routes.filter(
      (route) =>
        route.is_active && (activeBusFilter === 'all' || route.bus_number === activeBusFilter)
    );
    if (activeRoutes.length === 0) return;

    const routeById = new Map(activeRoutes.map((r) => [r.id, r]));
    const arrivalsByStop = new Map<string, { stop: Stop; arrivals: { bus: string; time: string }[] }>();

    routeStops.forEach((rs) => {
      const route = routeById.get(rs.route_id);
      if (!route) return;
      const stop = stops.find((s) => s.id === rs.stop_id);
      if (!stop) return;
      const busNum = route.bus_number;

      let timeText = rs.arrival_time || '';
      if (!timeText) {
        const bus = buses.find((b) => b.bus_number === busNum);
        if (bus) {
          const dist = haversineKm(bus.latitude, bus.longitude, stop.latitude, stop.longitude);
          const speed = getAiSpeed(bus.bus_number, bus.speed || 25);
          const eta = Math.round((dist / speed) * 60);
          timeText = `≈ ${eta} мин`;
        } else {
          timeText = '—';
        }
      }

      const entry = arrivalsByStop.get(stop.id) || { stop, arrivals: [] };
      entry.arrivals.push({ bus: busNum, time: timeText });
      arrivalsByStop.set(stop.id, entry);
    });

    arrivalsByStop.forEach(({ stop, arrivals }) => {
      const sorted = arrivals.slice(0, 3);
      const html = `
        <div style="background:#0b1117;padding:8px 10px;border-radius:10px;border:1px solid #1f2937;box-shadow:0 6px 18px rgba(0,0,0,.35);min-width:160px;">
          <div style="color:#9ca3af;font-size:10px;margin-bottom:6px;">Остановка</div>
          <div style="color:#e5e7eb;font-weight:600;font-size:12px;margin-bottom:6px;">${stop.name}</div>
          <div style="display:flex;flex-direction:column;gap:4px;">
            ${sorted
              .map(
                (a) =>
                  `<div style="display:flex;justify-content:space-between;gap:8px;color:#21f35a;font-family:monospace;font-size:11px;">
                     <span>№${a.bus}</span><span>${a.time}</span>
                   </div>`
              )
              .join('')}
          </div>
        </div>
      `;

      const el = document.createElement('div');
      el.style.width = '10px';
      el.style.height = '10px';
      el.style.background = '#22c55e';
      el.style.border = '2px solid #0b1117';
      el.style.borderRadius = '999px';

      const marker = new window.mapboxgl.Marker({ element: el })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(map);

      const popup = new window.mapboxgl.Popup({ closeButton: false, closeOnClick: false })
        .setHTML(html);
      marker.setPopup(popup);
      marker.getElement().addEventListener('mouseenter', () => marker.togglePopup());
      marker.getElement().addEventListener('mouseleave', () => marker.togglePopup());

      stopHoverMarkers.current.set(stop.id, marker);
    });
  }, [routes, routeStops, stops, buses, activeBusFilter, mapLoaded]);

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

    if (prefs.busIds.length > 0 && userLocation) {
      prefs.busIds.forEach((id) => {
        const bus = buses.find((b) => b.id === id);
        if (!bus) return;
        const dist = haversineKm(bus.latitude, bus.longitude, userLocation.lat, userLocation.lng);
        const speed = getAiSpeed(bus.bus_number, bus.speed || 25);
        const eta = Math.round((dist / speed) * 60);
        if (eta > 2) return;
        notifyIfDue(
          `bus:${id}`,
          `Автобус №${bus.bus_number}`,
          `Подъезжает к вам (≈ ${eta} мин)`
        );
      });
    }

    if (prefs.busNumbers.length > 0 && userLocation) {
      prefs.busNumbers.forEach((num) => {
        const bus = buses.find((b) => b.bus_number === num);
        if (!bus) return;
        const dist = haversineKm(bus.latitude, bus.longitude, userLocation.lat, userLocation.lng);
        const speed = getAiSpeed(bus.bus_number, bus.speed || 25);
        const eta = Math.round((dist / speed) * 60);
        if (eta > 2) return;
        notifyIfDue(
          `busnum:${num}`,
          `Автобус №${num}`,
          `Подъезжает к вам (≈ ${eta} мин)`
        );
      });
    }

    if (prefs.stopIds.length > 0) {
      prefs.stopIds.forEach((stopId) => {
        const stop = stops.find((s) => s.id === stopId);
        if (!stop) return;
        const busesPassing = routes
          .filter((r) => r.is_active)
          .filter((r) => routeStops.some((rs) => rs.route_id === r.id && rs.stop_id === stopId))
          .map((r) => r.bus_number);

        busesPassing.forEach((busNum) => {
          const bus = buses.find((b) => b.bus_number === busNum);
          if (!bus) return;
          const dist = haversineKm(bus.latitude, bus.longitude, stop.latitude, stop.longitude);
          const speed = getAiSpeed(busNum, bus.speed || 25);
          const eta = Math.round((dist / speed) * 60);
          if (eta <= 2) {
            notifyIfDue(
              `stop:${stopId}:${busNum}`,
              `Автобус №${busNum}`,
              `Подъезжает к остановке ${stop.name} (≈ ${eta} мин)`
            );
          }
        });
      });
    }
  }, [buses, routes, routeStops, stops, userLocation]);

  const selectedStop = useMemo(
    () => stops.find((s) => s.id === selectedStopId) || null,
    [selectedStopId, stops]
  );

  const liveQueue = useMemo(() => {
    if (!showRoute || activeBusFilter === 'all') return [];
    const activeRoute = routes.find(
      (r) => r.is_active && r.bus_number === activeBusFilter
    );
    if (!activeRoute) return [];

    const stopsForRoute = routeStops
      .filter((rs) => rs.route_id === activeRoute.id)
      .sort((a, b) => a.order_index - b.order_index)
      .map((rs) => stops.find((s) => s.id === rs.stop_id))
      .filter((s): s is Stop => !!s);

    if (stopsForRoute.length === 0) return [];

    return buses
      .filter((b) => b.bus_number === activeBusFilter)
      .map((bus) => {
        let bestIndex = 0;
        let bestDist = Number.POSITIVE_INFINITY;
        stopsForRoute.forEach((stop, idx) => {
          const dist = haversineKm(
            bus.latitude,
            bus.longitude,
            stop.latitude,
            stop.longitude
          );
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = idx;
          }
        });
        const nextStop = stopsForRoute[bestIndex];
        const speed = getAiSpeed(bus.bus_number, bus.speed || 25);
        const etaMinutes = Math.round((bestDist / speed) * 60);
        return {
          bus,
          nextStop,
          etaMinutes,
          stopIndex: bestIndex,
          distanceKm: bestDist,
        };
      })
      .sort((a, b) => {
        if (a.stopIndex !== b.stopIndex) return a.stopIndex - b.stopIndex;
        return a.distanceKm - b.distanceKm;
      });
  }, [showRoute, activeBusFilter, routes, routeStops, stops, buses]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Bus filter and route toggle */}
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
              {t('map.busNumber')}{num}
            </button>
          ))}
          {activeBusFilter !== 'all' && (
            <button
              onClick={() => setShowRoute(!showRoute)}
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
          <p className="font-semibold text-gray-900 dark:text-gray-50 mb-2">
            Живая очередь
          </p>
          <div className="space-y-2">
            {liveQueue.map((item) => (
              <div key={item.bus.id} className="flex flex-col">
                <span className="text-gray-900 dark:text-gray-50 font-semibold">
                  Автобус №{item.bus.bus_number}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  След. остановка: {item.nextStop.name}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  ≈ {item.etaMinutes} мин
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nearest stop panel */}
      {stops.length > 0 && (
        <div className="absolute left-3 right-3 bottom-4 bg-white dark:bg-gray-900 rounded-3xl shadow-lg p-3 text-[11px] space-y-2 z-10 border border-gray-200 dark:border-gray-700 animate-fade-in">
          <p className="font-semibold text-gray-900 dark:text-gray-50">
            {t('map.distance')}
          </p>
          <div className="flex items-center space-x-2">
            <select
              className="flex-1 px-3 py-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-[11px] outline-none focus:ring-1 focus:ring-primary-500"
              value={selectedStopId || ''}
              onChange={(e) => setSelectedStopId(e.target.value || null)}
            >
              <option value="">{t('route.selectStop')}</option>
              {stops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                </option>
              ))}
            </select>
          </div>

          {selectedStop && userLocation && (
            <div className="text-gray-600 dark:text-gray-300">
              {(() => {
                const R = 6371;
                const dLat = ((selectedStop.latitude - userLocation.lat) * Math.PI) / 180;
                const dLon = ((selectedStop.longitude - userLocation.lng) * Math.PI) / 180;
                const a =
                  Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos((userLocation.lat * Math.PI) / 180) *
                    Math.cos((selectedStop.latitude * Math.PI) / 180) *
                    Math.sin(dLon / 2) *
                    Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const distance = R * c;
                return (
                  <span>
                    {t('map.distance')}: <span className="font-semibold">{distance.toFixed(2)} {t('map.km')}</span>
                  </span>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
