import { useState, useEffect, useRef } from 'react';
import { User, Save, Shield, Moon, Sun, Upload, X as XIcon, Globe } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage, Language } from '../contexts/LanguageContext';
import { UserRole } from '../types';
import { supabase } from '../lib/supabase';

interface SettingsProps {
  onClose: () => void;
  onOpenAdmin?: () => void;
}

export function Settings({ onClose, onOpenAdmin }: SettingsProps) {
  const { profile, updateProfile, signOut, user } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busNumber, setBusNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [languageChanging, setLanguageChanging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setBusNumber(profile.bus_number || '');
    }
  }, [profile]);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const isDark = stored === 'dark';
    setDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    setDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      return next;
    });
  };

  const handleLanguageChange = (lang: Language) => {
    if (lang === language) return;
    setLanguageChanging(true);
    setTimeout(() => {
      setLanguage(lang);
      setTimeout(() => setLanguageChanging(false), 200);
    }, 200);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 5 * 1024 * 1024) {
      setMessage('Файл слишком большой (максимум 5 МБ)');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      // Use user ID as folder to match RLS policy
      const filePath = `${user.id}/${fileName}`;

      // Delete old avatar if exists
      const { data: listData } = await supabase.storage
        .from('avatars')
        .list(user.id);
      
      if (listData && listData.length > 0) {
        const filesToDelete = listData.map(f => `${user.id}/${f.name}`);
        await supabase.storage.from('avatars').remove(filesToDelete);
      }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const avatarUrl = urlData.publicUrl;

      await updateProfile({ avatar_url: avatarUrl });
      setMessage('Аватар обновлён');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Ошибка при загрузке аватара');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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
    <div className={`w-full max-w-md mx-auto py-6 px-4 space-y-6 ${languageChanging ? 'opacity-50' : 'animate-fade-in'} transition-opacity duration-300`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-2xl font-bold text-gray-900 dark:text-gray-50 animate-language-transition`}>{t('settings.title')}</h2>
      </div>

      {/* Профиль с аватаром */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-4 mb-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 dark:from-gray-600 dark:to-gray-800 flex items-center justify-center text-white text-2xl font-bold overflow-hidden border-4 border-white dark:border-gray-700 shadow-lg">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.toUpperCase() || 'U'
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-gray-900 dark:bg-gray-700 text-white flex items-center justify-center shadow-lg hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              {uploadingAvatar ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-lg text-gray-900 dark:text-gray-50">
              {profile?.first_name} {profile?.last_name}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300">{profile?.email}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-1">
              {getRoleName(profile?.role || UserRole.USER)}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <label className="block text-sm font-semibold text-gray-900 dark:text-gray-50 mb-3">
            {t('settings.firstName')}
          </label>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full px-5 py-3.5 border border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-900 text-base text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all"
            placeholder={t('settings.firstName')}
          />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <label className="block text-sm font-semibold text-gray-900 dark:text-gray-50 mb-3">
            {t('settings.lastName')}
          </label>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full px-5 py-3.5 border border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-900 text-base text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all"
            placeholder={t('settings.lastName')}
          />
        </div>

        {profile?.role === UserRole.DRIVER && (
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-50 mb-3">
              {t('settings.busNumber')}
            </label>
            <input
              type="text"
              value={busNumber}
              onChange={(e) => setBusNumber(e.target.value)}
              className="w-full px-5 py-3.5 border border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-900 text-base text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all"
              placeholder="1"
            />
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <p className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-1 flex items-center space-x-2">
                <Globe className="w-5 h-5" />
                <span>{t('settings.language')}</span>
              </p>
            </div>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => handleLanguageChange('ru')}
              className={`flex-1 px-4 py-2.5 rounded-xl font-semibold transition-all ${
                language === 'ru'
                  ? 'bg-gray-900 dark:bg-gray-700 text-white shadow-lg'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              RU
            </button>
            <button
              onClick={() => handleLanguageChange('tj')}
              className={`flex-1 px-4 py-2.5 rounded-xl font-semibold transition-all ${
                language === 'tj'
                  ? 'bg-gray-900 dark:bg-gray-700 text-white shadow-lg'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              TJ
            </button>
            <button
              onClick={() => handleLanguageChange('eng')}
              className={`flex-1 px-4 py-2.5 rounded-xl font-semibold transition-all ${
                language === 'eng'
                  ? 'bg-gray-900 dark:bg-gray-700 text-white shadow-lg'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              ENG
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-1">
                {t('settings.theme')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {darkMode ? t('settings.darkTheme') : t('settings.lightTheme')}
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 shadow-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-all active:scale-95"
            >
              {darkMode ? (
                <Moon className="w-6 h-6 text-gray-700 dark:text-gray-300" />
              ) : (
                <Sun className="w-6 h-6 text-gray-700 dark:text-gray-300" />
              )}
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-2xl text-sm animate-slide-up ${
            message.includes('Ошибка')
              ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : 'bg-green-50 text-green-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          }`}
        >
          {message}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-gray-900 dark:bg-gray-700 text-white py-4 rounded-2xl font-semibold hover:bg-gray-800 dark:hover:bg-gray-600 transition-all disabled:opacity-50 flex items-center justify-center space-x-2 text-base shadow-lg active:scale-95"
      >
        <Save className="w-5 h-5" />
        <span>{saving ? t('common.loading') : t('settings.saveProfile')}</span>
      </button>

      {profile?.role === UserRole.DRIVER && (
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
          Для водителя: в разделе «Карта» вы можете создать свой маршрут по остановкам и видеть
          синюю линию пути автобуса.
        </div>
      )}

      {profile?.role === UserRole.ADMIN && onOpenAdmin && (
        <button
          onClick={onOpenAdmin}
          className="w-full bg-gray-800 dark:bg-gray-700 text-white py-4 rounded-2xl font-semibold hover:bg-gray-700 dark:hover:bg-gray-600 transition-all flex items-center justify-center space-x-2 text-base shadow-lg active:scale-95"
        >
          <Shield className="w-5 h-5" />
          <span>Админ панель</span>
        </button>
      )}

      <button
        onClick={handleSignOut}
        className="w-full bg-gray-600 dark:bg-gray-700 text-white py-4 rounded-2xl font-semibold hover:bg-gray-700 dark:hover:bg-gray-600 transition-all text-base shadow-lg active:scale-95"
      >
        {t('auth.logout')}
      </button>
    </div>
  );
}
