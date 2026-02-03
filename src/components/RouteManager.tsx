// Updated RouteManager.tsx
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
  const [newRouteStops, setNewRouteStops] = useState<{ stop: Stop; times: string[] }[]>([]);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null); 
  const [currentTimeInput, setCurrentTimeInput] = useState('');
  const [pendingStop, setPendingStop] = useState<Stop | null>(null);
  const [pendingTimes, setPendingTimes] = useState<string[]>([]);

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
  }, [driverId]);

  const fetchRoutes = async () => {
    const { data } = await supabase
      .from('routes')
      .select('*')
      .eq('driver_id', driverId)
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
      let route: Route | null = null;

      if (editingRouteId) {
        const { data: updated, error: updErr } = await supabase
          .from('routes')
          .update({ name: newRouteName.trim() })
          .eq('id', editingRouteId)
          .select()
          .single();

        if (updErr || !updated) {
          console.error('Error updating route:', updErr);
          alert('Ошибка при обновлении маршрута');
          return;
        }

        route = updated;

        // Replace stops
        await supabase.from('route_stops').delete().eq('route_id', editingRouteId);
      } else {
        const shouldActivate = !routes.some((r) => r.is_active);
        const { data: created, error: routeError } = await supabase
          .from('routes')
          .insert({
            bus_number: busNumber,
            driver_id: driverId,
            name: newRouteName.trim(),
            is_active: shouldActivate,
          })
          .select()
          .single();

        if (routeError || !created) {
          console.error('Error creating route:', routeError);
          alert('Ошибка при создании маршрута');
          return;
        }
        route = created;

        if (shouldActivate) {
          await supabase
            .from('routes')
            .update({ is_active: false })
            .eq('driver_id', driverId)
            .neq('id', route.id);
        }
      }
      if (!route) return;

      // Add stops to route
      for (let i = 0; i < newRouteStops.length; i++) {
        const { error: stopError } = await supabase.from('route_stops').insert({
          route_id: route.id,
          stop_id: newRouteStops[i].stop.id,
          order_index: i,
          arrival_time: newRouteStops[i].times.filter(Boolean).join(', ') || null,
        });
        
        if (stopError) {
          console.error('Error adding stop to route:', stopError);
        }
      }

      setCreatingRoute(false);
      setEditingRouteId(null);
      setNewRouteName('');
      setNewRouteStops([]);
      setCurrentTimeInput('');
      setPendingStop(null);
      setPendingTimes([]);
      await fetchRoutes();
      await fetchRouteStops();
    } catch (error: any) {
      console.error('Error creating route:', error);
      alert(`Ошибка при создании маршрута: ${error.message || 'Неизвестная ошибка'}`);
    }
  };

  const handleToggleRoute = async (routeId: string, currentActive: boolean) => {
    try {
      // If turning ON a route, make sure all other routes for this driver are OFF
      if (!currentActive) {
        await supabase
          .from('routes')
          .update({ is_active: false })
          .eq('driver_id', driverId);
      }

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


const handleStartEditRoute = (route: Route) => {
  const list = getRouteStops(route.id).map((rs) => ({
    stop: rs.stop as Stop,
    times: rs.arrival_time ? rs.arrival_time.split(',').map((x) => x.trim()).filter(Boolean) : [],
  }));
  setEditingRouteId(route.id);
  setCreatingRoute(true);
  setNewRouteName(route.name);
  setNewRouteStops(list);
  setCurrentTimeInput('');
  setPendingStop(null);
  setPendingTimes([]);
};

const handleDeleteRoute = async (routeId: string) => {
  if (!confirm('Удалить маршрут?')) return;
  await supabase.from('route_stops').delete().eq('route_id', routeId);
  await supabase.from('routes').delete().eq('id', routeId);
};
  const handleAddStopToNewRoute = (stop: Stop) => {
    if (!stop || !stop.id) {
      console.error('Invalid stop:', stop);
      return;
    }
    setPendingStop(stop);
    setCurrentTimeInput('');
    setPendingTimes([]);
  };

  const handleAddPendingTime = () => {
    const v = currentTimeInput.trim();
    if (!v) return;
    setPendingTimes((prev) => [...prev, v]);
    setCurrentTimeInput('');
  };

  const handleCommitPendingStop = () => {
    if (!pendingStop) return;
    setNewRouteStops((prev) => [...prev, { stop: pendingStop, times: pendingTimes }]);
    setPendingStop(null);
    setPendingTimes([]);
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
        return null;
      }

      if (newStop) {
        await fetchStops();
        return newStop as Stop;
      }
      return null;
    } catch (error: any) {
      console.error('Error adding stop:', error);
      alert(`Ошибка при добавлении остановки: ${error.message || 'Неизвестная ошибка'}`);
      return null;
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
              {editingRouteId ? 'Название маршрута (редактирование)' : t('route.name')}
            </label>
            <input
              type="text"
              value={newRouteName}
              onChange={(e) => setNewRouteName(e.target.value)}
              placeholder={editingRouteId ? 'Название маршрута (редактирование)' : t('route.name')}
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
              {pendingStop && (
                <div className="rounded-2xl bg-gray-100 dark:bg-gray-700 p-3 space-y-2">
                  <p className="text-xs text-gray-500 dark:text-gray-300">
                    Выбрана остановка: <span className="font-semibold">{pendingStop.name}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={currentTimeInput}
                      onChange={(e) => setCurrentTimeInput(e.target.value)}
                      placeholder={t('route.stopTime') + ' (08:30)'}
                      className="flex-1 px-4 py-2.5 rounded-2xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-50"
                    />
                    <button
                      type="button"
                      onClick={handleAddPendingTime}
                      className="px-3 py-2 rounded-xl bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-50 text-xs font-semibold hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      +время
                    </button>
                  </div>
                  {pendingTimes.length > 0 && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-300">
                      Времена: {pendingTimes.join(', ')}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleCommitPendingStop}
                    className="w-full px-4 py-2 rounded-xl bg-gray-900 dark:bg-gray-700 text-white text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-600"
                  >
                    Добавить остановку
                  </button>
                </div>
              )}
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
                    {rs.times.length > 0 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{rs.times.join(', ')}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const v = prompt('Добавить время (например 08:30)');
                        if (!v) return;
                        setNewRouteStops((prev) =>
                          prev.map((p, idx) =>
                            idx === index ? { ...p, times: [...p.times, v.trim()].filter(Boolean) } : p
                          )
                        );
                      }}
                      className="ml-2 text-xs px-2 py-1 rounded-xl bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-50 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                    >
                      +время
                    </button>
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
      setEditingRouteId(null);
                setNewRouteName('');
                setNewRouteStops([]);
                setPendingStop(null);
                setPendingTimes([]);
                setCurrentTimeInput('');
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
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleStartEditRoute(route)}
                  className="px-3 py-1.5 rounded-xl bg-gray-200 dark:bg-gray-700 text-xs font-semibold text-gray-900 dark:text-gray-50 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Редактировать
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteRoute(route.id)}
                  className="px-3 py-1.5 rounded-xl bg-red-100 dark:bg-red-900 text-xs font-semibold text-red-700 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                >
                  Удалить
                </button>
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
                          <span>{rs.arrival_time.split(',').map((x) => x.trim()).filter(Boolean).join(', ')}</span>
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