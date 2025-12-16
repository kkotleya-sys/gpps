import { useState, useEffect } from 'react';
import { MapPin, LogIn, Map, Clock4, Settings as SettingsIcon } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { useGeolocation } from './hooks/useGeolocation';
import { supabase } from './lib/supabase';
import { MapView } from './components/MapView';
import { Auth } from './components/Auth';
import { Settings } from './components/Settings';
import { AdminPanel } from './components/AdminPanel';
import { BusInfo } from './components/BusInfo';
import { BusWithDriver, UserRole } from './types';
import { ScheduleView } from './components/ScheduleView';

type MainTab = 'map' | 'schedule' | 'settings';

function App() {
  const { user, profile, loading: authLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [buses, setBuses] = useState<BusWithDriver[]>([]);
  const [selectedBus, setSelectedBus] = useState<BusWithDriver | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>('map');

  const isDriver = profile?.role === UserRole.DRIVER;
  const location = useGeolocation(!!user || guestMode);

  useEffect(() => {
    if (!user && !guestMode && !authLoading) {
      setShowAuth(true);
    }
  }, [user, guestMode, authLoading]);

  useEffect(() => {
    if (!user && !guestMode) return;

    const subscription = supabase
      .channel('bus_locations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_locations' }, () => {
        fetchBuses();
      })
      .subscribe();

    fetchBuses();
    const interval = setInterval(fetchBuses, 5000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, [user, guestMode]);

  useEffect(() => {
    if (!isDriver || !profile?.bus_number || !user) return;

    const updateLocation = async () => {
      if (location.latitude && location.longitude && !location.loading) {
        const { data: existing } = await supabase
          .from('bus_locations')
          .select('id')
          .eq('driver_id', user.id)
          .maybeSingle();

        const locationData = {
          driver_id: user.id,
          bus_number: profile.bus_number!,
          latitude: location.latitude,
          longitude: location.longitude,
          speed: location.speed || 0,
          heading: location.heading || 0,
        };

        if (existing) {
          await supabase
            .from('bus_locations')
            .update(locationData)
            .eq('id', existing.id);
        } else {
          await supabase
            .from('bus_locations')
            .insert(locationData);
        }
      }
    };

    updateLocation();
    const interval = setInterval(updateLocation, 10000);

    return () => clearInterval(interval);
  }, [isDriver, profile?.bus_number, user, location]);

  const fetchBuses = async () => {
    const { data, error } = await supabase
      .from('bus_locations')
      .select('*')
      .gte('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString());

    if (!error && data) {
      setBuses(data);
    }
  };

  const handleGuestMode = () => {
    setGuestMode(true);
    setShowAuth(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm z-20 transition-colors duration-300">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gray-900 dark:bg-gray-700 rounded-2xl flex items-center justify-center shadow-lg">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">Душанбе Транспорт</h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {profile ? `${profile.first_name} ${profile.last_name}` : 'Гость'}
              </p>
            </div>
          </div>

          {!user && !guestMode && (
            <button
              onClick={() => setShowAuth(true)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-900 dark:bg-gray-700 text-white shadow-sm active:scale-95 transition-all hover:bg-gray-800 dark:hover:bg-gray-600"
            >
              <span className="inline-flex items-center space-x-1">
                <LogIn className="w-4 h-4" />
                <span>Войти</span>
              </span>
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden">
        <div className="h-full relative">
          {activeTab === 'map' && (
            <div className="h-full animate-fade-in">
              <MapView
                buses={buses}
                userLocation={
                  location.latitude && location.longitude && !location.loading
                    ? { lat: location.latitude, lng: location.longitude }
                    : null
                }
                onBusClick={setSelectedBus}
                isDriver={isDriver}
                driverBusNumber={profile?.bus_number || null}
                driverId={user?.id || null}
              />
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="h-full animate-fade-in">
              <ScheduleView
                buses={buses}
                userLocation={
                  location.latitude && location.longitude && !location.loading
                    ? { lat: location.latitude, lng: location.longitude }
                    : null
                }
                isDriver={isDriver}
                driverBusNumber={profile?.bus_number || null}
              />
            </div>
          )}

          {activeTab === 'settings' && user && (
            <div className="h-full overflow-y-auto pb-20 animate-fade-in">
              <Settings
                onClose={() => undefined}
                onOpenAdmin={() => setShowAdmin(true)}
              />
            </div>
          )}

          {!user && activeTab === 'settings' && (
            <div className="h-full flex items-center justify-center px-6 text-center text-sm text-gray-600 dark:text-gray-400 animate-fade-in">
              <div>
                <p className="mb-4">Чтобы изменить профиль и темы, войдите в аккаунт.</p>
                <button
                  onClick={() => setShowAuth(true)}
                  className="px-4 py-2 rounded-full bg-gray-900 dark:bg-gray-700 text-white font-semibold shadow-lg active:scale-95 transition-all hover:bg-gray-800 dark:hover:bg-gray-600"
                >
                  Войти
                </button>
              </div>
            </div>
          )}

          {isDriver && profile?.bus_number && activeTab === 'map' && (
            <div className="absolute top-4 left-4 bg-white dark:bg-gray-800 rounded-2xl shadow-lg px-4 py-2 text-xs border border-gray-200 dark:border-gray-700 animate-fade-in">
              <p className="text-gray-600 dark:text-gray-400">Вы водитель автобуса</p>
              <p className="font-bold text-gray-900 dark:text-gray-100">№{profile.bus_number}</p>
            </div>
          )}

          {location.error && (
            <div className="absolute top-4 right-4 bg-red-600 dark:bg-red-700 text-white rounded-2xl shadow-lg px-4 py-2 max-w-xs text-xs animate-slide-up border border-red-700 dark:border-red-800">
              <p>{location.error}</p>
            </div>
          )}

          {selectedBus && activeTab === 'map' && (
            <BusInfo
              bus={selectedBus}
              userLocation={
                location.latitude && location.longitude
                  ? { lat: location.latitude, lng: location.longitude }
                  : null
              }
              onClose={() => setSelectedBus(null)}
            />
          )}
        </div>
      </main>

      {/* Нижняя навигация под мобильный */}
      <nav className="h-16 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex items-center justify-around px-2 sm:px-6 shadow-lg">
        <button
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center justify-center flex-1 mx-1 rounded-2xl py-2 text-xs font-medium transition-all duration-300 ${
            activeTab === 'map'
              ? 'bg-gray-900 dark:bg-gray-700 text-white shadow-lg scale-105'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <Map className={`w-5 h-5 mb-0.5 transition-transform ${activeTab === 'map' ? 'scale-110' : ''}`} />
          <span className="font-semibold">Карта</span>
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex flex-col items-center justify-center flex-1 mx-1 rounded-2xl py-2 text-xs font-medium transition-all duration-300 ${
            activeTab === 'schedule'
              ? 'bg-gray-900 dark:bg-gray-700 text-white shadow-lg scale-105'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <Clock4 className={`w-5 h-5 mb-0.5 transition-transform ${activeTab === 'schedule' ? 'scale-110' : ''}`} />
          <span className="font-semibold">Расписание</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center justify-center flex-1 mx-1 rounded-2xl py-2 text-xs font-medium transition-all duration-300 ${
            activeTab === 'settings'
              ? 'bg-gray-900 dark:bg-gray-700 text-white shadow-lg scale-105'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <SettingsIcon className={`w-5 h-5 mb-0.5 transition-transform ${activeTab === 'settings' ? 'scale-110' : ''}`} />
          <span className="font-semibold">Настройки</span>
        </button>
      </nav>

      {showAuth && <Auth onClose={() => setShowAuth(false)} onGuestMode={handleGuestMode} />}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </div>
  );
}

export default App;
