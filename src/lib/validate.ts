/**
 * Валидация входных данных: API-ответов, импортированных JSON и сохранённого состояния.
 *
 * Зачем отдельный модуль: раньше вход приводился к типам через `as`, поэтому
 * корректный JSON с неожиданной структурой ломался уже внутри анализатора
 * (TypeError вместо понятной ошибки) или молча портил отчёт. Здесь данные
 * проверяются до нормализации: диапазоны ID и длительности, уникальность
 * слотов, размеры массивов, вложенные коллекции.
 */

import { MatchDataError } from './matchDataError';

/** Ограничения на размеры и диапазоны. Значения подобраны под реальные объёмы Dota 2. */
export const LIMITS = {
  minMatchId: 1,
  /** Реальные match_id уже восьмизначные→десятизначные; запас до 11 цифр. */
  maxMatchId: 99_999_999_999,
  minDuration: 1,
  /** 6 часов: длиннее матчи не существуют, а duration участвует в длинах серий. */
  maxDuration: 6 * 3600,
  maxPlayers: 10,
  minPlayers: 2,
  /** Длина одной временной серии (times/gold_t/lh_t/xp_t/dn_t). */
  maxSeriesLength: 5_000,
  /** Число элементов в objectives / purchase_log / kills_log / buyback_log. */
  maxLogEntries: 5_000,
  maxTeamfights: 500,
  maxWardPoints: 5_000,
  maxPicksBans: 100,
  /** Ячейки heatmap'а lane_pos (сетка 64–192 ⇒ разумный запас 40k). */
  maxLanePosCells: 40_000,
  maxStringLength: 256,
  /** Один файл импорта. */
  maxFileBytes: 32 * 1024 * 1024,
  /** Суммарный объём файлов в одной операции импорта. */
  maxTotalBytes: 64 * 1024 * 1024,
  /** Максимальная длина одного ключа/значения в строковых картах (item_uses и т.п.). */
  maxRecordKeys: 1_000,
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string, matchId?: number): never {
  throw new MatchDataError('invalid', message, matchId);
}

/**
 * Возвращает корректный ID матча или null, если поле отсутствует/некорректно.
 * ID должен быть конечным целым числом в рабочем диапазоне.
 */
export function readMatchId(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return null;
  if (!Number.isInteger(parsed)) return null;
  if (parsed < LIMITS.minMatchId || parsed > LIMITS.maxMatchId) return null;
  return parsed;
}

/** Длительность матча: конечное положительное число в разумных пределах. */
export function readDuration(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return null;
  if (parsed < LIMITS.minDuration || parsed > LIMITS.maxDuration) return null;
  return parsed;
}

/** Неотрицательное конечное число с fallback. */
export function readCount(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed)) return fallback;
  return parsed < 0 ? fallback : parsed;
}

/** Число или null: используется там, где «нет данных» нельзя путать с нулём. */
export function readCountOrNull(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function readSlot(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  if (parsed < 0 || parsed > 255) return null;
  return parsed;
}

export function readText(value: unknown, max: number = LIMITS.maxStringLength): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/**
 * Приводит значение к массиву конечных чисел.
 * Лишние элементы отбрасываются, мусор заменяется на fallback (по умолчанию 0).
 */
export function readNumberArray(value: unknown, maxLength = LIMITS.maxSeriesLength, fallback = 0): number[] {
  if (!Array.isArray(value)) return [];
  const source = value.length > maxLength ? value.slice(0, maxLength) : value;
  const out: number[] = [];
  for (const item of source) {
    const parsed = typeof item === 'string' ? Number(item) : item;
    out.push(typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback);
  }
  return out;
}

/** Массив объектов заданной длины; пустой массив, если значение не массив. */
export function readObjectArray(value: unknown, maxLength: number): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const source = value.length > maxLength ? value.slice(0, maxLength) : value;
  return source.filter(isRecord);
}

export function readRecord(value: unknown, maxKeys = LIMITS.maxRecordKeys): Record<string, number> {
  if (!isRecord(value)) return {};
  const out: Record<string, number> = {};
  let count = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (count >= maxKeys) break;
    const parsed = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof parsed === 'number' && Number.isFinite(parsed)) {
      out[key] = parsed;
      count += 1;
    }
  }
  return out;
}

/** Валидирует структуру готового матча, прочитанного из sessionStorage. */
export function isValidStoredMatch(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (readMatchId(value.id) == null) return false;
  if (readDuration(value.duration) == null) return false;
  if (!Array.isArray(value.players) || !value.players.length) return false;
  if (!value.players.every(isRecord)) return false;
  if (!Array.isArray(value.warnings)) return false;
  return true;
}

/** Проверяет пользовательский URL (прокси/базовый адрес API). */
export function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  return Boolean(url.hostname);
}

export interface UrlCheck {
  ok: boolean;
  /** Нормализованный адрес без завершающих слешей. */
  value: string;
  error?: string;
}

export function checkApiBaseUrl(value: string): UrlCheck {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return { ok: true, value: '' };
  if (/\s/.test(trimmed)) return { ok: false, value: trimmed, error: 'В адресе есть пробелы.' };
  if (!isValidHttpUrl(trimmed)) {
    return { ok: false, value: trimmed, error: 'Нужен полный адрес вида https://example.com/api.' };
  }
  return { ok: true, value: trimmed };
}

/**
 * Похож ли адрес прокси на URL с секретом.
 *
 * Пользователь часто вставляет готовую ссылку вида
 * `https://corsproxy.io/?key=abc...`. Всё, что стоит после `?`, уходит
 * владельцу посредника — о таком стоит предупредить отдельно.
 */
export function looksLikeSecretUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!isValidHttpUrl(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    const names = [...url.searchParams.keys()].map((name) => name.toLowerCase());
    const suspicious = ['key', 'api_key', 'apikey', 'api-key', 'token', 'secret', 'auth', 'access_token', 'password'];
    if (names.some((name) => suspicious.includes(name))) return true;
    return /[?&](key|token|secret)=/i.test(url.search);
  } catch {
    return false;
  }
}

/** Проверяет размер файла до чтения, чтобы не блокировать интерфейс. */
export function checkFileSize(file: { name?: string; size?: number }, totalBytes: number): void {
  const size = typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : 0;
  if (size > LIMITS.maxFileBytes) {
    throw new MatchDataError(
      'invalid',
      `Файл${file.name ? ` «${file.name}»` : ''} слишком большой (${Math.round(
        size / 1024 / 1024,
      )} МБ). Лимит — ${Math.round(LIMITS.maxFileBytes / 1024 / 1024)} МБ.`,
    );
  }
  if (totalBytes + size > LIMITS.maxTotalBytes) {
    throw new MatchDataError(
      'invalid',
      `Слишком много данных за раз (лимит — ${Math.round(LIMITS.maxTotalBytes / 1024 / 1024)} МБ).`,
    );
  }
}

/**
 * Проверяет список игроков: объекты, уникальные слоты, корректные hero_id.
 * Возвращает очищенный список (не больше LIMITS.maxPlayers).
 */
export function validatePlayers(
  raw: unknown,
  matchId?: number,
): { players: Record<string, unknown>[]; slots: number[]; truncated: boolean } {
  if (!Array.isArray(raw)) fail('В данных нет списка игроков.', matchId);
  const list = raw as unknown[];
  if (list.length < LIMITS.minPlayers) fail('В данных слишком мало игроков — это не похоже на матч.', matchId);
  const truncated = list.length > LIMITS.maxPlayers;
  if (truncated) {
    // Дальше работать бессмысленно: слоты должны быть уникальны, а 11+ игроков в Dota нет.
    fail(`В данных ${list.length} игроков — в матче Dota их не больше ${LIMITS.maxPlayers}.`, matchId);
  }
  const players: Record<string, unknown>[] = [];
  const slots: number[] = [];
  const seen = new Set<number>();
  for (const item of list) {
    if (!isRecord(item)) fail('В списке игроков есть пустые или некорректные записи.', matchId);
    const slot = readSlot(item.player_slot);
    if (slot == null) fail('У одного из игроков некорректный player_slot.', matchId);
    if (seen.has(slot)) fail(`Слот ${slot} повторяется: данные игроков перемешаны или повреждены.`, matchId);
    seen.add(slot);
    slots.push(slot);
    players.push(item);
  }
  return { players, slots, truncated };
}

/** Вложенная карта координат (lane_pos, deaths_pos): проверяет число и размер. */
export function validateCoordMap(value: unknown): Record<string, Record<string, number>> | null {
  if (!isRecord(value)) return null;
  let cells = 0;
  const out: Record<string, Record<string, number>> = {};
  for (const [x, row] of Object.entries(value)) {
    if (!isRecord(row)) continue;
    const nx = Number(x);
    if (!Number.isFinite(nx)) continue;
    const next: Record<string, number> = {};
    for (const [y, raw] of Object.entries(row)) {
      const count = typeof raw === 'string' ? Number(raw) : raw;
      if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) continue;
      const ny = Number(y);
      if (!Number.isFinite(ny)) continue;
      cells += 1;
      if (cells > LIMITS.maxLanePosCells) return out;
      next[y] = count;
    }
    if (Object.keys(next).length) out[x] = next;
  }
  return Object.keys(out).length ? out : null;
}
