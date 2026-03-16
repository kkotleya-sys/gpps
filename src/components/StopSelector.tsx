import { useState, useEffect, useMemo } from 'react';
import { X, MapPin } from 'lucide-react';
import { Stop } from '../types';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';

interface StopSelectorProps {
  onSelect: (stop: Stop) => void;
  onAddNew?: (name: string, lat: number, lng: number) => Promise<Stop | null> | Stop | null;
  excludeIds?: string[];
  allowMapPickWithoutName?: boolean;
  autoNamePrefix?: string;
}

export function StopSelector({
  onSelect,
  excludeIds = [],
}: StopSelectorProps) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState('');
  const [stops, setStops] = useState<Stop[]>([]);
  const [filteredStops, setFilteredStops] = useState<Stop[]>([]);

  const excludeIdsKey = excludeIds.join('|');
  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIdsKey]);

  const getStopName = (stop: Stop) => {
    if (language === 'tj') return stop.name_tj || stop.name_ru || stop.name;
    if (language === 'eng') return stop.name_eng || stop.name_ru || stop.name;
    return stop.name_ru || stop.name;
  };

  useEffect(() => {
    const fetchStops = async () => {
      const { data } = await supabase.from('stops').select('*');
      if (data) setStops(data as Stop[]);
    };

    fetchStops();

    const channel = supabase
      .channel('stops_selector')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stops' }, fetchStops)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      setFilteredStops([]);
      return;
    }

    const next = stops
      .filter((stop) => !excludeSet.has(stop.id))
      .filter((stop) => {
        const haystack = [stop.name, stop.name_ru, stop.name_tj, stop.name_eng].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 12);

    setFilteredStops(next);
  }, [query, stops, excludeSet]);

  return (
    <div className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('route.stopNamePlaceholder')}
          className="w-full pr-10 px-4 py-2.5 rounded-2xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-all"
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFilteredStops([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title={t('common.close')}
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
              onClick={() => {
                onSelect(stop);
                setQuery('');
                setFilteredStops([]);
              }}
              className="w-full px-4 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2 transition-colors"
            >
              <MapPin className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
              <span className="text-sm text-gray-900 dark:text-gray-50">{getStopName(stop)}</span>
            </button>
          ))}
        </div>
      )}

      {query.trim() && filteredStops.length === 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">{t('route.noSuchStop')}</p>
        </div>
      )}
    </div>
  );
}
