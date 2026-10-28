/**
 * Возвращает время в формате м:сс.
 *
 * Отрицательные значения не маскируются под 0:00: если в данных всё же
 * встретится отрицательное время (например, событие до старта), это видно.
 */
export function fmtTime(seconds: number | null | undefined, withHours = false): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const sign = seconds < 0 ? '−' : '';
  const s = Math.round(Math.abs(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0 || withHours) {
    return `${sign}${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${sign}${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const sign = seconds < 0 ? '−' : '';
  const s = Math.round(Math.abs(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${sign}${m}:${String(sec).padStart(2, '0')}`;
}

export function fmtDate(unixSeconds: number): string {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function fmtDateLong(unixSeconds: number): string {
  if (!unixSeconds) return '—';
  return new Date(unixSeconds * 1000).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtNum(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtSigned(value: number, digits = 0): string {
  if (value === 0) return '0';
  const sign = value > 0 ? '+' : '−';
  return `${sign}${fmtNum(Math.abs(value), digits)}`;
}

export function fmtCompact(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(digits).replace('.', ',')}M`;
  if (abs >= 10_000) return `${(value / 1000).toFixed(0)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(digits).replace('.', ',')}k`;
  return fmtNum(value, 0);
}

export function fmtPct(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function rankOf(value: number, values: number[], higherIsBetter = true): number {
  const sorted = [...values].sort((a, b) => (higherIsBetter ? b - a : a - b));
  const index = sorted.findIndex((v) => v === value);
  return index === -1 ? sorted.length : index + 1;
}

export function shortName(name: string, max = 16): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}
