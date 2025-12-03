import { useEffect, useRef, useState } from 'react';
import { BusWithDriver } from '../types';

interface MapViewProps {
  buses: BusWithDriver[];
  userLocation: { lat: number; lng: number } | null;
  onBusClick: (bus: BusWithDriver) => void;
}

declare global {
  interface Window {
    DG: any;
  }
}

export function MapView({ buses, userLocation, onBusClick }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markers = useRef<Map<string, any>>(new Map());
  const userMarker = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

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

  useEffect(() => {
    if (!mapInstance.current) return;

    buses.forEach((bus) => {
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
      if (!buses.find((b) => b.id === id)) {
        marker.remove();
        markers.current.delete(id);
      }
    });
  }, [buses, onBusClick]);

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

  return (
    <div ref={mapContainer} className="w-full h-full" />
  );
}
