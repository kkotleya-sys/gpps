import { useState, useEffect } from 'react';

interface GeolocationState {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  error: string | null;
  loading: boolean;
}

export function useGeolocation(enabled: boolean = true) {
  const [state, setState] = useState<GeolocationState>({
    latitude: 38.5598,
    longitude: 68.7738,
    speed: null,
    heading: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    if (!enabled) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        error: 'Геолокация не поддерживается',
        loading: false,
      }));
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          speed: position.coords.speed ? position.coords.speed * 3.6 : null,
          heading: position.coords.heading,
          error: null,
          loading: false,
        });
      },
      (error) => {
        setState(prev => ({
          ...prev,
          error: error.message,
          loading: false,
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled]);

  return state;
}
