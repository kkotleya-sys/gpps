export function repairUtf8Text(value: string): string {
  if (!value) return value;
  if (!/[\u00C0-\u00FF]/.test(value)) return value;

  try {
    const bytes = Uint8Array.from(value.split('').map((ch) => ch.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8').decode(bytes);
    if (decoded && decoded !== value) {
      return decoded;
    }
  } catch {
    // ignore broken input and return original value
  }

  return value;
}

export function formatEta(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) {
    return 'Нет данных';
  }

  if (minutes <= 0) {
    return 'Сейчас';
  }

  return `${minutes} мин`;
}
