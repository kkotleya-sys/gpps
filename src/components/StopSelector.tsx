import { useState, useEffect, useMemo, useRef } from 'react';
import { X, MapPin, Plus } from 'lucide-react';
import { Stop } from '../types';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';

interface StopSelectorProps {
  onSelect: (stop: Stop) => void;
  onAddNew?: (name: string, lat: number, lng: number) => void;
  excludeIds?: string[];
}

declare global {
  interface Window {
    DG: any;
  }
}

export function StopSelector({ onSelect, onAddNew, excludeIds = [] }: StopSelectorProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [filteredStops, setFilteredStops] = useState<Stop[]>([]);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [selectedStopsForMap, setSelectedStopsForMap] = useState<Stop[]>([]);
  const [newStopName, setNewStopName] = useState('');
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    const fetchStops = async () => {
      const { data } = await supabase.from('stops').select('*');
      if (data) {
        setStops(data as Stop[]);
      }
    };
    fetchStops();

    const channel = supabase
      .channel('stops_selector')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stops' }, () => {
        fetchStops();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setFilteredStops([]);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = stops
      .filter((stop) => !excludeIds.includes(stop.id))
      .filter((stop) => stop.name.toLowerCase().includes(lowerQuery))
      .slice(0, 10);

    // Group by name to find duplicates
    const nameGroups = new Map<string, Stop[]>();
    filtered.forEach((stop) => {
      const name = stop.name.toLowerCase();
      if (!nameGroups.has(name)) {
        nameGroups.set(name, []);
      }
      nameGroups.get(name)!.push(stop);
    });

    // If multiple stops with same name, show them for map selection
    const hasDuplicates = Array.from(nameGroups.values()).some((group) => group.length > 1);
    
    if (hasDuplicates) {
      const duplicateName = Array.from(nameGroups.entries()).find(([_, group]) => group.length > 1)?.[0];
      if (duplicateName) {
        const duplicateStops = stops.filter(
          (s) => s.name.toLowerCase() === duplicateName && !excludeIds.includes(s.id)
        );
        setSelectedStopsForMap(duplicateStops);
        setShowMiniMap(true);
        setFilteredStops([]);
        return;
      }
    }

    setFilteredStops(filtered);
    setShowMiniMap(false);
  }, [query, stops, excludeIds]);

  // Load map for mini-map selection
  useEffect(() => {
    if (!showMiniMap || !mapContainerRef.current || mapInstanceRef.current) return;

    const script = document.createElement('script');
    script.src = 'https://maps.api.2gis.ru/2.0/loader.js?pkg=full';
    script.async = true;
    script.onload = () => {
      if (window.DG) {
        window.DG.then(() => {
          const map = window.DG.map(mapContainerRef.current!, {
            center: selectedStopsForMap.length > 0 
              ? [selectedStopsForMap[0].latitude, selectedStopsForMap[0].longitude]
              : [38.5598, 68.7738],
            zoom: 14,
          });

          mapInstanceRef.current = map;

          // Add markers for duplicate stops
          selectedStopsForMap.forEach((stop) => {
            const marker = window.DG.marker([stop.latitude, stop.longitude], {
              icon: window.DG.icon({
                iconUrl: 'data:image/svg+xml;base64,' + btoa(`
                  <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" fill="#3B82F6" stroke="white" stroke-width="2"/>
                    <circle cx="12" cy="12" r="4" fill="white"/>
                  </svg>
                `),
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              }),
            }).addTo(map);

            marker.bindPopup(stop.name);
            marker.on('click', () => {
              onSelect(stop);
              setShowMiniMap(false);
              setQuery('');
            });
            markersRef.current.set(stop.id, marker);
          });

          // Allow clicking map to add new stop
          if (onAddNew) {
            map.on('click', (e: any) => {
              if (!newStopName.trim()) return;
              const { lat, lng } = e.latlng;
              onAddNew(newStopName.trim(), lat, lng);
              setShowMiniMap(false);
              setQuery('');
              setNewStopName('');
            });
          }

          setMapLoaded(true);
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
    };
  }, [showMiniMap, selectedStopsForMap, onSelect, onAddNew, newStopName]);

  const handleSelect = (stop: Stop) => {
    onSelect(stop);
    setQuery('');
    setFilteredStops([]);
  };

  const handleAddNewClick = () => {
    if (!onAddNew || !newStopName.trim()) return;
    setShowMiniMap(true);
    setSelectedStopsForMap([]);
  };

  if (showMiniMap) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
              {selectedStopsForMap.length > 0 
                ? t('route.selectStop')
                : t('route.addNewStop')}
            </h3>
            <button
              onClick={() => {
                setShowMiniMap(false);
                setQuery('');
                setNewStopName('');
                if (mapInstanceRef.current) {
                  mapInstanceRef.current.remove();
                  mapInstanceRef.current = null;
                }
                markersRef.current.forEach((marker) => marker.remove());
                markersRef.current.clear();
                setMapLoaded(false);
              }}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          {selectedStopsForMap.length > 0 ? (
            <div className="p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {t('route.selectStop')}
              </p>
              <div className="h-96 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <div ref={mapContainerRef} className="w-full h-full" />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col p-4">
              <input
                type="text"
                value={newStopName}
                onChange={(e) => setNewStopName(e.target.value)}
                placeholder={t('route.stopNamePlaceholder')}
                className="w-full px-4 py-3 rounded-2xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-50 mb-4"
              />
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {t('route.addNewStop')}
              </p>
              <div className="flex-1 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 min-h-[400px]">
                <div ref={mapContainerRef} className="w-full h-full" />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('route.stopNamePlaceholder')}
          className="w-full px-4 py-2.5 rounded-2xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setFilteredStops([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {filteredStops.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 max-h-60 overflow-y-auto">
          {filteredStops.map((stop) => (
            <button
              key={stop.id}
              onClick={() => handleSelect(stop)}
              className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2 transition-colors"
            >
              <MapPin className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
              <span className="text-sm text-gray-900 dark:text-gray-50">{stop.name}</span>
            </button>
          ))}
        </div>
      )}

      {query.trim() && filteredStops.length === 0 && !showMiniMap && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">{t('route.noSuchStop')}</p>
          {onAddNew && (
            <div>
              <input
                type="text"
                value={newStopName}
                onChange={(e) => setNewStopName(e.target.value)}
                placeholder={t('route.stopNamePlaceholder')}
                className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-50 mb-2"
              />
              <button
                onClick={handleAddNewClick}
                disabled={!newStopName.trim()}
                className="w-full px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-xl font-semibold flex items-center justify-center space-x-2 hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>{t('route.addNewStop')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
