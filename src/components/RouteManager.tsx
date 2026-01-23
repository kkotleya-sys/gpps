import { useState, useEffect, useMemo } from 'react';
import { Plus, X, Clock, Power } from 'lucide-react';
import { Route, RouteStop, Stop } from '../types';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { StopSelector } from './StopSelector';

interface RouteManagerProps {
  busNumber: string;
  driverId: string;
}

export function RouteManager({ busNumber, driverId }: RouteManagerProps) {
  const { t } = useLanguage();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [creatingRoute, setCreatingRoute] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [newRouteStops, setNewRouteStops] = useState<{ stop: Stop; time: string }[]>([]);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [currentStopInput, setCurrentStopInput] = useState('');
  const [currentTimeInput, setCurrentTimeInput] = useState('');

  useEffect(() => {
    fetchRoutes();
    fetchRouteStops();
    fetchStops();

    const routesChannel = supabase
      .channel('routes_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routes' }, () => {
        fetchRoutes();
      })
      .subscribe();

    const routeStopsChannel = supabase
      .channel('route_stops_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'route_stops' }, () => {
        fetchRouteStops();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(routesChannel);
      supabase.removeChannel(routeStopsChannel);
    };
  }, [busNumber]);

  const fetchRoutes = async () => {
    const { data } = await supabase
      .from('routes')
      .select('*')
      .eq('bus_number', busNumber)
      .order('created_at', { ascending: false });
    if (data) setRoutes(data as Route[]);
  };

  const fetchRouteStops = async () => {
    const { data } = await supabase.from('route_stops').select('*');
    if (data) setRouteStops(data as RouteStop[]);
  };

  const fetchStops = async () => {
    const { data } = await supabase.from('stops').select('*');
    if (data) setStops(data as Stop[]);
  };

  const handleCreateRoute = async () => {
    if (!newRouteName.trim() || newRouteStops.length === 0) return;

    try {
      const { data: route, error: routeError } = await supabase
        .from('routes')
        .insert({
          bus_number: busNumber,
          driver_id: driverId,
          name: newRouteName.trim(),
          is_active: false,
        })
        .select()
        .single();

      if (routeError || !route) {
        console.error('Error creating route:', routeError);
        alert('Ошибка при создании маршрута');
        return;
      }

      // Add stops to route
      for (let i = 0; i < newRouteStops.length; i++) {
        const { error: stopError } = await supabase.from('route_stops').insert({
          route_id: route.id,
          stop_id: newRouteStops[i].stop.id,
          order_index: i,
          arrival_time: newRouteStops[i].time.trim() || null,
        });
        
        if (stopError) {
          console.error('Error adding stop to route:', stopError);
        }
      }

      setCreatingRoute(false);
      setNewRouteName('');
      setNewRouteStops([]);
      setCurrentStopInput('');
      setCurrentTimeInput('');
      await fetchRoutes();
      await fetchRouteStops();
    } catch (error: any) {
      console.error('Error creating route:', error);
      alert(`Ошибка при создании маршрута: ${error.message || 'Неизвестная ошибка'}`);
    }
  };

  const handleToggleRoute = async (routeId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('routes')
        .update({ is_active: !currentActive })
        .eq('id', routeId);
      
      if (error) {
        console.error('Error toggling route:', error);
        alert('Ошибка при переключении маршрута');
      } else {
        await fetchRoutes();
      }
    } catch (error) {
      console.error('Error toggling route:', error);
      alert('Ошибка при переключении маршрута');
    }
  };

  const handleAddStopToNewRoute = (stop: Stop) => {
    if (!stop || !stop.id) {
      console.error('Invalid stop:', stop);
      return;
    }
    setNewRouteStops([...newRouteStops, { stop, time: currentTimeInput.trim() }]);
    setCurrentStopInput('');
    setCurrentTimeInput('');
  };

  const handleRemoveStopFromNewRoute = (index: number) => {
    setNewRouteStops(newRouteStops.filter((_, i) => i !== index));
  };

  const handleAddNewStop = async (name: string, lat: number, lng: number) => {
    try {
      const { data: newStop, error } = await supabase
        .from('stops')
        .insert({ name, latitude: lat, longitude: lng })
        .select()
        .single();
      
      if (error) {
        console.error('Error adding stop:', error);
        alert(`Ошибка при добавлении остановки: ${error.message}`);
        return;
      }
      
      if (newStop) {
        handleAddStopToNewRoute(newStop as Stop);
        await fetchStops(); // Refresh stops list
      }
    } catch (error: any) {
      console.error('Error adding stop:', error);
      alert(`Ошибка при добавлении остановки: ${error.message || 'Неизвестная ошибка'}`);
    }
  };

  const getRouteStops = (routeId: string) => {
    return routeStops
      .filter((rs) => rs.route_id === routeId)
      .sort((a, b) => a.order_index - b.order_index)
      .map((rs) => {
        const stop = stops.find((s) => s.id === rs.stop_id);
        return { ...rs, stop };
      })
      .filter((rs) => rs.stop);
  };

  return (
    <div className="space-y-4">
      {!creatingRoute ? (
        <button
          onClick={() => setCreatingRoute(true)}
          className="w-full px-4 py-3 bg-gray-900 dark:bg-gray-700 text-white rounded-2xl font-semibold flex items-center justify-center space-x-2 hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>{t('route.create')}</span>
        </button>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-50 mb-2">
              {t('route.name')}
            </label>
            <input
              type="text"
              value={newRouteName}
              onChange={(e) => setNewRouteName(e.target.value)}
              placeholder={t('route.name')}
              className="w-full px-4 py-2.5 rounded-2xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-50"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-50 mb-2">
              {t('route.addStop')}
            </label>
            <div className="space-y-2">
              <StopSelector
                onSelect={handleAddStopToNewRoute}
                onAddNew={handleAddNewStop}
                excludeIds={newRouteStops.map((rs) => rs.stop.id)}
              />
              <input
                type="text"
                value={currentTimeInput}
                onChange={(e) => setCurrentTimeInput(e.target.value)}
                placeholder={t('route.stopTime') + ' (08:30)'}
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-50"
              />
            </div>
          </div>

          {newRouteStops.length > 0 && (
            <div className="space-y-2">
              {newRouteStops.map((rs, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                      {index + 1}.
                    </span>
                    <span className="text-sm text-gray-900 dark:text-gray-50">{rs.stop.name}</span>
                    {rs.time && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{rs.time}</span>
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveStopFromNewRoute(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex space-x-2">
            <button
              onClick={handleCreateRoute}
              disabled={!newRouteName.trim() || newRouteStops.length === 0}
              className="flex-1 px-4 py-2.5 bg-gray-900 dark:bg-gray-700 text-white rounded-xl font-semibold hover:bg-gray-800 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              {t('route.save')}
            </button>
            <button
              onClick={() => {
                setCreatingRoute(false);
                setNewRouteName('');
                setNewRouteStops([]);
              }}
              className="px-4 py-2.5 bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-50 rounded-xl font-semibold hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {routes.map((route) => {
        const routeStopsList = getRouteStops(route.id);
        return (
          <div
            key={route.id}
            className="bg-white dark:bg-gray-800 rounded-3xl p-4 shadow-sm border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleToggleRoute(route.id, route.is_active)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    route.is_active
                      ? 'bg-green-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                  } relative`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                      route.is_active ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                  {route.name}
                </h3>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  route.is_active
                    ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {route.is_active ? t('route.active') : t('route.inactive')}
                </span>
              </div>
            </div>

            {routeStopsList.length > 0 ? (
              <div className="space-y-2">
                {routeStopsList.map((rs, index) => (
                  <div
                    key={rs.id}
                    className="flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                        {index + 1}.
                      </span>
                      <span className="text-sm text-gray-900 dark:text-gray-50">
                        {rs.stop?.name}
                      </span>
                      {rs.arrival_time && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{rs.arrival_time}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                {t('route.noStops')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
