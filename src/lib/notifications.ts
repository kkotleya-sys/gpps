export type NotificationPrefs = {
  enabled: boolean;
  busIds: string[];
  busNumbers: string[];
  stopIds: string[];
};

const STORAGE_KEY = 'gpps_notify_prefs_v1';

const defaultPrefs: NotificationPrefs = {
  enabled: false,
  busIds: [],
  busNumbers: [],
  stopIds: [],
};

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultPrefs };
    const parsed = JSON.parse(raw) as NotificationPrefs;
    return {
      enabled: !!parsed.enabled,
      busIds: Array.isArray(parsed.busIds) ? parsed.busIds : [],
      busNumbers: Array.isArray(parsed.busNumbers) ? parsed.busNumbers : [],
      stopIds: Array.isArray(parsed.stopIds) ? parsed.stopIds : [],
    };
  } catch {
    return { ...defaultPrefs };
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}
