import { useEffect, useMemo, useRef, useState } from 'react';
import { BusWithDriver, Stop, Route, RouteStop } from '../types';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';

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
  const { t } = useLanguage();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markers = useRef<Map<string, any>>(new Map());
  const userMarker = useRef<any>(null);
  const routePolylines = useRef<Map<string, any>>(new Map());
  const routeStopMarkers = useRef<Map<string, any>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [activeBusFilter, setActiveBusFilter] = useState<string | 'all'>('all');
  const [showRoute, setShowRoute] = useState(false);

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
    if (!mapInstance.current) return;

    const filteredBuses = buses.filter(
      (bus) => activeBusFilter === 'all' || bus.bus_number === activeBusFilter
    );

    filteredBuses.forEach((bus) => {
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
      if (!filteredBuses.find((b) => b.id === id)) {
        marker.remove();
        markers.current.delete(id);
      }
    });
  }, [buses, onBusClick, activeBusFilter]);

  // Update user marker
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

  // Draw active routes
  useEffect(() => {
    if (!mapInstance.current || !showRoute) {
      // Remove all route polylines and markers
      routePolylines.current.forEach((polyline) => polyline.remove());
      routePolylines.current.clear();
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

      // Remove existing polyline for this route
      const existingPolyline = routePolylines.current.get(route.id);
      if (existingPolyline) {
        existingPolyline.remove();
      }

      // Create polyline
      const latlngs = stopsForRoute.map((s) => [s.latitude, s.longitude]);
      const polyline = window.DG.polyline(latlngs, {
        color: '#2563eb',
        weight: 4,
      }).addTo(mapInstance.current);

      routePolylines.current.set(route.id, polyline);

      // Add stop markers with time
      stopsForRoute.forEach((stop, index) => {
        const routeStop = routeStops.find(
          (rs) => rs.route_id === route.id && rs.stop_id === stop.id
        );
        const markerKey = `${route.id}_${stop.id}`;

        if (routeStopMarkers.current.has(markerKey)) return;

        const stopIcon = window.DG.icon({
          iconUrl: 'data:image/svg+xml;base64,' + btoa(`
            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="9" fill="#2563eb" />
              <circle cx="12" cy="12" r="4" fill="white" />
            </svg>
          `),
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const marker = window.DG.marker([stop.latitude, stop.longitude], {
          icon: stopIcon,
        }).addTo(mapInstance.current);

        const popupContent = routeStop?.arrival_time
          ? `${stop.name}<br><small>${routeStop.arrival_time}</small>`
          : stop.name;
        marker.bindPopup(popupContent);
        routeStopMarkers.current.set(markerKey, marker);
      });
    });

    // Clean up routes that are no longer active
    routePolylines.current.forEach((polyline, routeId) => {
      if (!filteredRoutes.find((r) => r.id === routeId)) {
        polyline.remove();
        routePolylines.current.delete(routeId);
      }
    });

    routeStopMarkers.current.forEach((marker, key) => {
      const [routeId] = key.split('_');
      if (!filteredRoutes.find((r) => r.id === routeId)) {
        marker.remove();
        routeStopMarkers.current.delete(key);
      }
    });
  }, [routes, routeStops, stops, showRoute, activeBusFilter]);

  const selectedStop = useMemo(
    () => stops.find((s) => s.id === selectedStopId) || null,
    [selectedStopId, stops]
  );

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
