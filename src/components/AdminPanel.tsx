import { useState, useEffect, useRef } from 'react';
import { X, Users, Search, Edit2, Trash2, DownloadCloud } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Profile, UserRole } from '../types';
import { fetchAllDushanbeStopsFromMapbox, hasMapboxToken } from '../lib/stopsParser';
import { loadMapbox } from '../lib/mapboxLoader';

interface AdminPanelProps {
  onClose: () => void;
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>(UserRole.USER);
  const [importingStops, setImportingStops] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importedStops, setImportedStops] = useState(0);
  const [skippedStops, setSkippedStops] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [showAddStopModal, setShowAddStopModal] = useState(false);
  const [newStopName, setNewStopName] = useState('');
  const [newStopLat, setNewStopLat] = useState<number | null>(null);
  const [newStopLng, setNewStopLng] = useState<number | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    if (!showAddStopModal || !mapContainerRef.current) return;
    let cancelled = false;

    loadMapbox()
      .then((mapboxgl) => {
        if (cancelled || mapInstanceRef.current || !mapContainerRef.current) return;
        const map = new mapboxgl.Map({
          container: mapContainerRef.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [68.7738, 38.5598],
          zoom: 13,
        });
        mapInstanceRef.current = map;

        const clickHandler = (e: any) => {
          const { lng, lat } = e.lngLat;
          setNewStopLat(lat);
          setNewStopLng(lng);

          if (markerRef.current) {
            markerRef.current.setLngLat([lng, lat]);
          } else {
            markerRef.current = new mapboxgl.Marker()
              .setLngLat([lng, lat])
              .addTo(map);
          }
        };
        map.on('click', clickHandler);
        (map as any)._adminClickHandler = clickHandler;
      })
      .catch((e) => {
        console.error('Mapbox loader error:', e);
      });

    return () => {
      cancelled = true;
    };
  }, [showAddStopModal]);

  useEffect(() => {
    if (showAddStopModal) return;
    if (mapInstanceRef.current) {
      const map = mapInstanceRef.current;
      if ((map as any)._adminClickHandler) {
        map.off('click', (map as any)._adminClickHandler);
      }
      map.remove();
      mapInstanceRef.current = null;
    }
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (mapContainerRef.current) {
      mapContainerRef.current.innerHTML = '';
    }
  }, [showAddStopModal]);

  const fetchProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setProfiles(data);
    }
    setLoading(false);
  };

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (!error) {
      setProfiles(profiles.map(p => p.id === userId ? { ...p, role: newRole } : p));
      setEditingId(null);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return;

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (!error) {
      setProfiles(profiles.filter(p => p.id !== userId));
    }
  };

  const handleImportStops = async () => {
    if (!hasMapboxToken()) {
      alert('Добавьте VITE_MAPBOX_TOKEN в переменные окружения.');
      return;
    }
    setImportingStops(true);
    setImportProgress(0);
    setImportedStops(0);
    setSkippedStops(0);
    setImportError(null);

    try {
      const stopsFromMapbox = await fetchAllDushanbeStopsFromMapbox();
      if (stopsFromMapbox.length <= 1 && stopsFromMapbox[0]?.name?.includes('Автовокзал')) {
        throw new Error('Mapbox API вернуло слишком мало данных. Проверьте токен и лимиты.');
      }
      const { data: existingStops } = await supabase
        .from('stops')
        .select('name, latitude, longitude');

      const existingKey = new Set(
        (existingStops || []).map((s) => `${s.name}|${s.latitude.toFixed(6)}|${s.longitude.toFixed(6)}`)
      );

      const toInsert = stopsFromMapbox.filter((s) => {
        const key = `${s.name}|${s.latitude.toFixed(6)}|${s.longitude.toFixed(6)}`;
        if (existingKey.has(key)) return false;
        existingKey.add(key);
        return true;
      });

      const batchSize = 200;
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += batchSize) {
        const batch = toInsert.slice(i, i + batchSize).map((s) => ({
          name: s.name,
          latitude: s.latitude,
          longitude: s.longitude,
        }));
        const { error } = await supabase.from('stops').insert(batch);
        if (error) {
          console.error('Import error:', error);
          throw error;
        }
        inserted += batch.length;
        setImportedStops(inserted);
        setImportProgress(Math.round((inserted / toInsert.length) * 100));
      }

      setSkippedStops(stopsFromMapbox.length - toInsert.length);
    } catch (error: any) {
      console.error('Import stops failed:', error);
      setImportError(error?.message || 'Ошибка импорта');
    } finally {
      setImportingStops(false);
    }
  };

  const handleSaveManualStop = async () => {
    if (!newStopName.trim() || newStopLat === null || newStopLng === null) {
      alert('Введите название и выберите точку на карте.');
      return;
    }
    const { error } = await supabase.from('stops').insert({
      name: newStopName.trim(),
      latitude: newStopLat,
      longitude: newStopLng,
    });
    if (error) {
      console.error('Manual stop insert error:', error);
      alert('Ошибка при добавлении остановки');
      return;
    }
    setNewStopName('');
    setNewStopLat(null);
    setNewStopLng(null);
    setShowAddStopModal(false);
  };

  const getRoleName = (role: UserRole) => {
    switch (role) {
      case UserRole.GUEST:
        return 'Гость';
      case UserRole.USER:
        return 'Пользователь';
      case UserRole.DRIVER:
        return 'Водитель';
      case UserRole.ADMIN:
        return 'Администратор';
      default:
        return 'Пользователь';
    }
  };

  const getRoleColor = (role: UserRole) => {
    switch (role) {
      case UserRole.GUEST:
        return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
      case UserRole.USER:
        return 'bg-gray-300 text-gray-800 dark:bg-gray-600 dark:text-gray-200';
      case UserRole.DRIVER:
        return 'bg-gray-400 text-gray-900 dark:bg-gray-500 dark:text-gray-100';
      case UserRole.ADMIN:
        return 'bg-gray-800 text-white dark:bg-gray-900 dark:text-gray-100';
      default:
        return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const filteredProfiles = profiles.filter(p =>
    p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.last_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700 animate-scale-in">
        <div className="bg-gray-900 dark:bg-gray-800 p-6 flex items-center justify-between text-white border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gray-800 dark:bg-gray-700 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Админ панель</h2>
              <p className="text-gray-400 text-sm">Управление пользователями</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-800 dark:hover:bg-gray-700 rounded-xl"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-4 flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
            <input
              type="text"
              placeholder="Поиск пользователей..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 border border-gray-300 dark:border-gray-600 rounded-2xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all"
            />
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                Импорт остановок из Mapbox
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Загрузит остановки Душанбе и добавит в Supabase (без дублей).
              </p>
              {(importedStops > 0 || skippedStops > 0) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Добавлено: {importedStops}, пропущено: {skippedStops}
                </p>
              )}
              {importError && (
                <p className="text-xs text-red-500 mt-1">{importError}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {importingStops && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {importProgress}%
                </span>
              )}
              <button
                onClick={handleImportStops}
                disabled={importingStops}
                className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-gray-800 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                <DownloadCloud className="w-4 h-4" />
                {importingStops ? 'Импорт...' : 'Импортировать'}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                Добавить остановку вручную
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Нажмите на карту, задайте имя и сохраните.
              </p>
            </div>
            <button
              onClick={() => setShowAddStopModal(true)}
              className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-600"
            >
              Открыть карту
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-gray-900 dark:border-gray-100 mx-auto"></div>
              <p className="text-gray-600 dark:text-gray-400 mt-4">Загрузка...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 hover:shadow-lg transition-all animate-fade-in"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 flex items-center space-x-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 dark:from-gray-600 dark:to-gray-800 flex items-center justify-center text-white text-lg font-bold overflow-hidden border-2 border-gray-200 dark:border-gray-700">
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt="Avatar"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase() || 'U'
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-50">
                            {profile.first_name} {profile.last_name}
                          </h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getRoleColor(profile.role)}`}>
                            {getRoleName(profile.role)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{profile.email}</p>
                        {profile.bus_number && (
                          <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                            Автобус №{profile.bus_number}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {editingId === profile.id ? (
                        <div className="flex items-center space-x-2">
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(Number(e.target.value) as UserRole)}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-gray-500 outline-none"
                          >
                            <option value={UserRole.USER}>Пользователь</option>
                            <option value={UserRole.DRIVER}>Водитель</option>
                            <option value={UserRole.ADMIN}>Администратор</option>
                          </select>
                          <button
                            onClick={() => updateUserRole(profile.id, editRole)}
                            className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-xl hover:bg-gray-800 dark:hover:bg-gray-600 transition-all text-sm font-medium active:scale-95"
                          >
                            Сохранить
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-4 py-2 bg-gray-500 dark:bg-gray-600 text-white rounded-xl hover:bg-gray-600 dark:hover:bg-gray-500 transition-all text-sm font-medium active:scale-95"
                          >
                            Отмена
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(profile.id);
                              setEditRole(profile.role);
                            }}
                            className="p-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-all active:scale-95"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => deleteUser(profile.id)}
                            className="p-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all active:scale-95"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && filteredProfiles.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Пользователи не найдены</p>
            </div>
          )}
        </div>

        <div className="bg-gray-100 dark:bg-gray-800 p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
            <span>Всего пользователей: {profiles.length}</span>
            <button
              onClick={fetchProfiles}
              className="text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 font-medium transition-colors"
            >
              Обновить
            </button>
          </div>
        </div>
      </div>

      {showAddStopModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                Добавить остановку
              </h3>
              <button
                onClick={() => setShowAddStopModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <input
                type="text"
                value={newStopName}
                onChange={(e) => setNewStopName(e.target.value)}
                placeholder="Название остановки"
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-50"
              />
              <div className="h-96 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <div ref={mapContainerRef} className="w-full h-full" />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowAddStopModal(false)}
                  className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-50 font-semibold"
                >
                  Отмена
                </button>
                <button
                  onClick={handleSaveManualStop}
                  className="px-4 py-2 rounded-xl bg-gray-900 dark:bg-gray-700 text-white font-semibold"
                >
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
