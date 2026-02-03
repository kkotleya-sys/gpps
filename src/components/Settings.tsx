import { useState, useEffect, useRef } from 'react';
import { Shield, Moon, Sun, Upload, X as XIcon, Globe } from 'lucide-react';
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
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropBaseScale, setCropBaseScale] = useState(1);
  const [cropImg, setCropImg] = useState<HTMLImageElement | null>(null);
  const [message, setMessage] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [languageChanging, setLanguageChanging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropDragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const lastSavedRef = useRef<{ first_name: string; last_name: string; bus_number: string | null } | null>(null);
  const latestPayloadRef = useRef<{ first_name: string; last_name: string; bus_number: string | null } | null>(null);
  const debounceRef = useRef<number | null>(null);
  const hydratingRef = useRef(false);
  const dirtyRef = useRef(false);
  const CROP_SIZE = 240;

  useEffect(() => {
    if (profile) {
      if (dirtyRef.current) {
        return;
      }
      hydratingRef.current = true;
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setBusNumber(profile.bus_number || '');
      const snapshot = {
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        bus_number: profile.role === UserRole.DRIVER ? profile.bus_number || '' : null,
      };
      lastSavedRef.current = snapshot;
      latestPayloadRef.current = snapshot;
      setTimeout(() => {
        hydratingRef.current = false;
        dirtyRef.current = false;
      }, 0);
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
  const saveLatestProfile = async () => {
    if (!latestPayloadRef.current) return;
    const payload = latestPayloadRef.current;
    if (
      lastSavedRef.current &&
      lastSavedRef.current.first_name === payload.first_name &&
      lastSavedRef.current.last_name === payload.last_name &&
      lastSavedRef.current.bus_number === payload.bus_number
    ) {
      return;
    }

    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    saveInFlightRef.current = true;
    setSaving(true);
    setMessage('');
    try {
      await updateProfile(payload);
      lastSavedRef.current = payload;
      dirtyRef.current = false;
    } catch (error) {
      setMessage('Ошибка при сохранении');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        await saveLatestProfile();
      }
    }
  };

  const queueSave = (payload: { first_name: string; last_name: string; bus_number: string | null }) => {
    latestPayloadRef.current = payload;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      saveLatestProfile();
    }, 500);
  };

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

    try {
      const reader = new FileReader();
      reader.onload = () => {
        setCropSrc(reader.result as string);
        setCropZoom(1);
        setCropOffset({ x: 0, y: 0 });
        setCropOpen(true);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setMessage('Ошибка при загрузке аватара');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
    if (!cropSrc) {
      setCropImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setCropImg(img);
      const base = Math.max(CROP_SIZE / img.width, CROP_SIZE / img.height);
      setCropBaseScale(base);
      setCropZoom(1);
      setCropOffset({ x: 0, y: 0 });
    };
    img.src = cropSrc;
  }, [cropSrc]);

  const clampOffset = (offset: { x: number; y: number }, zoomValue: number) => {
    if (!cropImg) return offset;
    const scale = cropBaseScale * zoomValue;
    const maxX = Math.max(0, (cropImg.width * scale - CROP_SIZE) / 2);
    const maxY = Math.max(0, (cropImg.height * scale - CROP_SIZE) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, offset.x)),
      y: Math.max(-maxY, Math.min(maxY, offset.y)),
    };
  };

  const handleCropSave = async () => {
    if (!cropImg || !user) return;
    setUploadingAvatar(true);
    try {
      const safeOffset = clampOffset(cropOffset, cropZoom);
      const canvasSize = 256;
      const scaleToCanvas = canvasSize / CROP_SIZE;
      const scale = cropBaseScale * cropZoom * scaleToCanvas;
      const drawW = cropImg.width * scale;
      const drawH = cropImg.height * scale;
      const centerX = canvasSize / 2 + safeOffset.x * scaleToCanvas;
      const centerY = canvasSize / 2 + safeOffset.y * scaleToCanvas;

      const canvas = document.createElement('canvas');
      canvas.width = canvasSize;
      canvas.height = canvasSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');

      ctx.clearRect(0, 0, canvasSize, canvasSize);
      ctx.save();
      ctx.beginPath();
      ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(
        cropImg,
        centerX - drawW / 2,
        centerY - drawH / 2,
        drawW,
        drawH
      );
      ctx.restore();

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (!blob) throw new Error('Failed to create avatar image');

      const fileName = `${user.id}-${Date.now()}.png`;
      const filePath = `${user.id}/${fileName}`;

      const { data: listData } = await supabase.storage
        .from('avatars')
        .list(user.id);

      if (listData && listData.length > 0) {
        const filesToDelete = listData.map((f) => `${user.id}/${f.name}`);
        await supabase.storage.from('avatars').remove(filesToDelete);
      }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, { upsert: true, contentType: 'image/png' });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const avatarUrl = urlData.publicUrl;

      await updateProfile({ avatar_url: avatarUrl });
      setMessage('Аватар обновлён');
      setTimeout(() => setMessage(''), 3000);
      setCropOpen(false);
      setCropSrc(null);
    } catch (error) {
      setMessage('Ошибка при загрузке аватара');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setUploadingAvatar(false);
    }
  };

  useEffect(() => {
    if (!profile || hydratingRef.current) return;
    const payload = {
      first_name: firstName,
      last_name: lastName,
      bus_number: profile.role === UserRole.DRIVER ? busNumber : null,
    };
    if (
      lastSavedRef.current &&
      lastSavedRef.current.first_name === payload.first_name &&
      lastSavedRef.current.last_name === payload.last_name &&
      lastSavedRef.current.bus_number === payload.bus_number
    ) {
      return;
    }
    dirtyRef.current = true;
    queueSave(payload);
  }, [firstName, lastName, busNumber, profile?.role, profile?.id]);

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
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-50 animate-language-transition">{t('settings.title')}</h2>
      </div>

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
            onChange={(e) => {
              dirtyRef.current = true;
              setFirstName(e.target.value);
            }}
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
            onChange={(e) => {
              dirtyRef.current = true;
              setLastName(e.target.value);
            }}
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
            onChange={(e) => {
              dirtyRef.current = true;
              setBusNumber(e.target.value);
            }}
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
      {saving && (
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Сохранение...
        </div>
      )}

      {profile?.role === UserRole.DRIVER && (
        <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-2xl p-4">
          Для водителя: в разделе «Карта» вы можете создать свой маршрут по остановкам и видеть синюю линию пути автобуса.
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

      {cropOpen && cropSrc && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">Обрезка аватара</h3>
              <button
                onClick={() => {
                  setCropOpen(false);
                  setCropSrc(null);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-center">
              <div
                className="relative rounded-full overflow-hidden border border-gray-200 dark:border-gray-700"
                style={{ width: CROP_SIZE, height: CROP_SIZE }}
                onMouseDown={(e) => {
                  cropDragRef.current = {
                    x: e.clientX,
                    y: e.clientY,
                    ox: cropOffset.x,
                    oy: cropOffset.y,
                  };
                }}
                onMouseMove={(e) => {
                  if (!cropDragRef.current) return;
                  const dx = e.clientX - cropDragRef.current.x;
                  const dy = e.clientY - cropDragRef.current.y;
                  const next = clampOffset({
                    x: cropDragRef.current.ox + dx,
                    y: cropDragRef.current.oy + dy,
                  }, cropZoom);
                  setCropOffset(next);
                }}
                onMouseUp={() => {
                  cropDragRef.current = null;
                }}
                onMouseLeave={() => {
                  cropDragRef.current = null;
                }}
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  cropDragRef.current = {
                    x: t.clientX,
                    y: t.clientY,
                    ox: cropOffset.x,
                    oy: cropOffset.y,
                  };
                }}
                onTouchMove={(e) => {
                  const t = e.touches[0];
                  if (!cropDragRef.current) return;
                  const dx = t.clientX - cropDragRef.current.x;
                  const dy = t.clientY - cropDragRef.current.y;
                  const next = clampOffset({
                    x: cropDragRef.current.ox + dx,
                    y: cropDragRef.current.oy + dy,
                  }, cropZoom);
                  setCropOffset(next);
                }}
                onTouchEnd={() => {
                  cropDragRef.current = null;
                }}
              >
                <div
                  className="absolute left-1/2 top-1/2"
                  style={{
                    transform: `translate(${cropOffset.x}px, ${cropOffset.y}px) translate(-50%, -50%) scale(${cropBaseScale * cropZoom})`,
                    transformOrigin: 'center',
                  }}
                >
                  <img src={cropSrc} alt="Crop" className="block" draggable={false} />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={cropZoom}
                onChange={(e) => {
                  const nextZoom = Number(e.target.value);
                  setCropZoom(nextZoom);
                  setCropOffset((prev) => clampOffset(prev, nextZoom));
                }}
                className="w-full"
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setCropOpen(false);
                  setCropSrc(null);
                }}
                className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-50 font-semibold"
              >
                Отмена
              </button>
              <button
                onClick={handleCropSave}
                className="px-4 py-2 rounded-xl bg-gray-900 dark:bg-gray-700 text-white font-semibold"
                disabled={uploadingAvatar}
              >
                {uploadingAvatar ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
