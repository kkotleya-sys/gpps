import { X, Navigation } from 'lucide-react';
import { BusWithDriver } from '../types';

interface BusInfoProps {
  bus: BusWithDriver;
  userLocation: { lat: number; lng: number } | null;
  onClose: () => void;
}

export function BusInfo({ bus, userLocation, onClose }: BusInfoProps) {
  const calculateETA = () => {
    if (!userLocation) return null;

    const R = 6371;
    const dLat = ((bus.latitude - userLocation.lat) * Math.PI) / 180;
    const dLon = ((bus.longitude - userLocation.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((userLocation.lat * Math.PI) / 180) *
        Math.cos((bus.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    const speed = bus.speed || 30;
    const timeInHours = distance / speed;
    const timeInMinutes = Math.round(timeInHours * 60);

    return { distance: distance.toFixed(2), time: timeInMinutes };
  };

  const eta = calculateETA();

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl p-6 z-10 animate-slide-up">
      <button
        onClick={onClose}
        className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="flex items-start space-x-4">
        <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0">
          <svg
            width="40"
            height="40"
            viewBox="0 0 32 32"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="4"
              y="8"
              width="24"
              height="18"
              rx="3"
              fill="white"
              opacity="0.9"
            />
          </svg>
        </div>

        <div className="flex-1">
          <h3 className="text-2xl font-bold text-gray-800 mb-2">
            Автобус №{bus.bus_number}
          </h3>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Navigation className="w-5 h-5 text-gray-500" />
              <span className="text-gray-600">
                Скорость: <span className="font-semibold text-gray-800">{bus.speed.toFixed(0)} км/ч</span>
              </span>
            </div>

            {eta && (
              <>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-600">
                    Расстояние: <span className="font-semibold text-gray-800">{eta.distance} км</span>
                  </span>
                </div>
                <div className="bg-blue-50 p-4 rounded-xl">
                  <p className="text-sm text-gray-600 mb-1">Время прибытия</p>
                  <p className="text-3xl font-bold text-blue-600">
                    {eta.time} мин
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
