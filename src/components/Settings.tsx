import { useState, useEffect } from 'react';
import { X, User, Save, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

interface SettingsProps {
  onClose: () => void;
  onOpenAdmin?: () => void;
}

export function Settings({ onClose, onOpenAdmin }: SettingsProps) {
  const { profile, updateProfile, signOut } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busNumber, setBusNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setBusNumber(profile.bus_number || '');
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    try {
      await updateProfile({
        first_name: firstName,
        last_name: lastName,
        bus_number: profile?.role === UserRole.DRIVER ? busNumber : null,
      });
      setMessage('Настройки сохранены');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    onClose();
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800">Настройки</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-xl">
            <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-800">
                {profile?.first_name} {profile?.last_name}
              </p>
              <p className="text-sm text-gray-600">{profile?.email}</p>
              <p className="text-xs text-blue-600 font-medium mt-1">
                {getRoleName(profile?.role || UserRole.USER)}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Имя
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Фамилия
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              />
            </div>

            {profile?.role === UserRole.DRIVER && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Номер автобуса
                </label>
                <input
                  type="text"
                  value={busNumber}
                  onChange={(e) => setBusNumber(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  placeholder="1"
                />
              </div>
            )}
          </div>

          {message && (
            <div className={`p-4 rounded-lg ${message.includes('Ошибка') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              {message}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            <Save className="w-5 h-5" />
            <span>{saving ? 'Сохранение...' : 'Сохранить'}</span>
          </button>

          {profile?.role === UserRole.ADMIN && onOpenAdmin && (
            <button
              onClick={() => {
                onClose();
                onOpenAdmin();
              }}
              className="w-full bg-purple-500 text-white py-3 rounded-lg font-semibold hover:bg-purple-600 transition-colors flex items-center justify-center space-x-2"
            >
              <Shield className="w-5 h-5" />
              <span>Админ панель</span>
            </button>
          )}

          <button
            onClick={handleSignOut}
            className="w-full bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
          >
            Выйти
          </button>
        </div>
      </div>
    </div>
  );
}
