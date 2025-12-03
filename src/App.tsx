import { useState, useEffect } from 'react';
import { MapPin, Settings as SettingsIcon, LogIn, Menu } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { useGeolocation } from './hooks/useGeolocation';
import { supabase } from './lib/supabase';
import { MapView } from './components/MapView';
import { Auth } from './components/Auth';
import { Settings } from './components/Settings';
import { AdminPanel } from './components/AdminPanel';
import { BusInfo } from './components/BusInfo';
import { BusWithDriver, UserRole } from './types';

function App() {
  const { user, profile, loading: authLoading } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [buses, setBuses] = useState<BusWithDriver[]>([]);
  const [selectedBus, setSelectedBus] = useState<BusWithDriver | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

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
    <div className="h-screen flex flex-col">
      <header className="bg-white shadow-md z-20 relative">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Душанбе Транспорт</h1>
              <p className="text-xs text-gray-600">
                {profile ? `${profile.first_name} ${profile.last_name}` : 'Гость'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!user && !guestMode && (
              <button
                onClick={() => setShowAuth(true)}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <LogIn className="w-6 h-6" />
              </button>
            )}

            {(user || guestMode) && (
              <>
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors md:hidden"
                >
                  <Menu className="w-6 h-6" />
                </button>

                <button
                  onClick={() => setShowSettings(true)}
                  className="hidden md:block p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <SettingsIcon className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          {showMenu && (
            <div className="absolute top-full right-4 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 py-2 min-w-[200px] md:hidden">
              <button
                onClick={() => {
                  setShowSettings(true);
                  setShowMenu(false);
                }}
                className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors flex items-center space-x-2"
              >
                <SettingsIcon className="w-5 h-5" />
                <span>Настройки</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 relative">
        <MapView
          buses={buses}
          userLocation={
            location.latitude && location.longitude && !location.loading
              ? { lat: location.latitude, lng: location.longitude }
              : null
          }
          onBusClick={setSelectedBus}
        />

        {isDriver && profile?.bus_number && (
          <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg px-4 py-2">
            <p className="text-sm text-gray-600">Вы водитель автобуса</p>
            <p className="font-bold text-blue-600">№{profile.bus_number}</p>
          </div>
        )}

        {location.error && (
          <div className="absolute top-4 right-4 bg-red-500 text-white rounded-lg shadow-lg px-4 py-2 max-w-xs">
            <p className="text-sm">{location.error}</p>
          </div>
        )}

        {selectedBus && (
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
      </main>

      {showAuth && <Auth onClose={() => setShowAuth(false)} onGuestMode={handleGuestMode} />}
      {showSettings && user && <Settings onClose={() => setShowSettings(false)} onOpenAdmin={() => setShowAdmin(true)} />}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </div>
  );
}

export default App;
