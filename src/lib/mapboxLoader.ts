let mapboxLoaderPromise: Promise<any> | null = null;

declare global {
  interface Window {
    mapboxgl: any;
  }
}

export function getMapboxToken(): string | null {
  const token = (import.meta as any).env?.VITE_MAPBOX_TOKEN as string | undefined;
  return token && token.trim() ? token.trim() : null;
}

export function hasMapboxToken(): boolean {
  return !!getMapboxToken();
}

export function loadMapbox(): Promise<any> {
  if (mapboxLoaderPromise) return mapboxLoaderPromise;
  mapboxLoaderPromise = new Promise((resolve, reject) => {
    const token = getMapboxToken();
    if (!token) {
      reject(new Error('VITE_MAPBOX_TOKEN is missing'));
      return;
    }
    if (window.mapboxgl) {
      window.mapboxgl.accessToken = token;
      resolve(window.mapboxgl);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
    script.async = true;
    script.onload = () => {
      if (!window.mapboxgl) {
        reject(new Error('Mapbox GL loader not available'));
        return;
      }
      window.mapboxgl.accessToken = token;
      resolve(window.mapboxgl);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return mapboxLoaderPromise;
}
