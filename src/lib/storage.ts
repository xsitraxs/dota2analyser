import type { Dimension, HistoryEntry, PlanTaskState, Settings } from '../types';

const PREFIX = 'd2a.v1.';

/** Ключи, которые пользователь может хранить только в рамках сессии. */
const SECRET_FIELDS = ['apiKey', 'steamKey'] as const;
const SESSION_KEYS_KEY = 'keys';

type Target = 'local' | 'session';

function store(target: Target): Storage | null {
  try {
    return target === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function read<T>(key: string, fallback: T, target: Target = 'local'): T {
  try {
    const storage = store(target);
    const raw = storage?.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown, target: Target = 'local'): void {
  try {
    store(target)?.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* localStorage может быть отключён — приложение продолжает работать */
  }
}

function remove(key: string, target: Target = 'local'): void {
  try {
    store(target)?.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function intOrNull(value: unknown): number | null {
  const parsed = numOrNull(value);
  return parsed == null ? null : Math.trunc(parsed);
}

/** Слот игрока: целое число, в том числе из строки (старые записи хранили строки). */
function slotOrNull(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  return parsed;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  accountId: null,
  playerName: '',
  reduceMotion: false,
  provider: 'steam',
  steamKey: '',
  steamProxy: '',
  proxyBase: '',
  keyScope: 'local',
};

const DIMENSIONS: Dimension[] = ['farm', 'damage', 'survival', 'vision', 'fights', 'objectives'];

/**
 * Приводит сохранённые настройки к ожидаемой форме.
 * Настройки читаются из localStorage, где может лежать что угодно
 * (старая версия, ручная правка, чужие данные) — всё это не должно ломать приложение.
 */
export function sanitizeSettings(value: unknown): Settings {
  const raw = isRecord(value) ? value : {};
  const provider = raw.provider;
  const keyScope = raw.keyScope;
  return {
    apiKey: str(raw.apiKey),
    accountId: intOrNull(raw.accountId),
    playerName: str(raw.playerName),
    reduceMotion: bool(raw.reduceMotion),
    provider: provider === 'steam' || provider === 'opendota' || provider === 'proxy' ? provider : 'steam',
    steamKey: str(raw.steamKey),
    steamProxy: str(raw.steamProxy),
    proxyBase: str(raw.proxyBase),
    keyScope: keyScope === 'session' ? 'session' : 'local',
  };
}

export function loadSettings(): Settings {
  const settings = sanitizeSettings(read<unknown>('settings', {}));
  if (settings.keyScope === 'session') {
    const secrets = read<unknown>(SESSION_KEYS_KEY, {}, 'session');
    const parsed = isRecord(secrets) ? secrets : {};
    return {
      ...settings,
      apiKey: str(parsed.apiKey),
      steamKey: str(parsed.steamKey),
    };
  }
  return settings;
}

export function saveSettings(settings: Settings): void {
  const clean = sanitizeSettings(settings);
  if (clean.keyScope === 'session') {
    // Ключи не попадают в localStorage: только sessionStorage (до закрытия вкладки).
    write('settings', { ...clean, apiKey: '', steamKey: '' });
    write(SESSION_KEYS_KEY, { apiKey: clean.apiKey, steamKey: clean.steamKey }, 'session');
    return;
  }
  remove(SESSION_KEYS_KEY, 'session');
  write('settings', clean);
}

export interface LessonProgress {
  [lessonId: string]: { done: boolean; at: number };
}

function sanitizeLessonProgress(value: unknown): LessonProgress {
  if (!isRecord(value)) return {};
  const out: LessonProgress = {};
  for (const [lessonId, entry] of Object.entries(value)) {
    if (!isRecord(entry)) continue;
    out[lessonId] = { done: bool(entry.done), at: numOrNull(entry.at) ?? 0 };
  }
  return out;
}

export function loadLessonProgress(): LessonProgress {
  return sanitizeLessonProgress(read<unknown>('lessons', {}));
}

export function setLessonDone(lessonId: string, done: boolean): LessonProgress {
  const progress = loadLessonProgress();
  if (done) progress[lessonId] = { done: true, at: Date.now() };
  else delete progress[lessonId];
  write('lessons', progress);
  return progress;
}

function sanitizeHistoryEntry(value: unknown): HistoryEntry | null {
  if (!isRecord(value)) return null;
  const matchId = intOrNull(value.matchId);
  const slot = intOrNull(value.slot);
  if (matchId == null || slot == null) return null;
  const scores: Record<Dimension, number | null> = {
    farm: null,
    damage: null,
    survival: null,
    vision: null,
    fights: null,
    objectives: null,
  };
  if (isRecord(value.scores)) {
    for (const key of DIMENSIONS) {
      scores[key] = numOrNull((value.scores as Record<string, unknown>)[key]);
    }
  }
  return {
    matchId,
    slot,
    heroId: numOrNull(value.heroId) ?? 0,
    role: numOrNull(value.role) ?? 1,
    overall: numOrNull(value.overall),
    grade: str(value.grade, '—'),
    scores,
    radiantWin: bool(value.radiantWin),
    isRadiant: bool(value.isRadiant),
    duration: numOrNull(value.duration) ?? 0,
    startTime: numOrNull(value.startTime) ?? 0,
    savedAt: numOrNull(value.savedAt) ?? 0,
    demo: bool(value.demo),
  };
}

/** История разборов. Повреждённые записи отбрасываются, а не ломают страницы. */
export function loadHistory(): HistoryEntry[] {
  const raw = read<unknown>('history', []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map(sanitizeHistoryEntry)
    .filter((entry): entry is HistoryEntry => entry != null);
}

export function addHistory(entry: HistoryEntry): HistoryEntry[] {
  const history = loadHistory();
  const filtered = history.filter((item) => !(item.matchId === entry.matchId && item.slot === entry.slot));
  filtered.unshift(entry);
  const trimmed = filtered.slice(0, 80);
  write('history', trimmed);
  return trimmed;
}

export function removeHistory(matchId: number, slot: number): HistoryEntry[] {
  const next = loadHistory().filter((item) => !(item.matchId === matchId && item.slot === slot));
  write('history', next);
  return next;
}

export function clearHistory(): void {
  write('history', []);
}

export function planKey(matchId: number, slot: number): string {
  return `plan.${matchId}.${slot}`;
}

function sanitizePlan(value: unknown): PlanTaskState {
  if (!isRecord(value)) return {};
  const out: PlanTaskState = {};
  for (const [taskId, state] of Object.entries(value)) {
    out[taskId] = Boolean(state);
  }
  return out;
}

export function loadPlan(matchId: number, slot: number): PlanTaskState {
  return sanitizePlan(read<unknown>(planKey(matchId, slot), {}));
}

export function togglePlanTask(matchId: number, slot: number, taskId: string): PlanTaskState {
  const state = loadPlan(matchId, slot);
  if (state[taskId]) delete state[taskId];
  else state[taskId] = true;
  write(planKey(matchId, slot), state);
  return { ...state };
}

export interface IdentityState {
  accountId: number | null;
  selectedSlots: Record<string, number>;
}

export const EMPTY_IDENTITY: IdentityState = { accountId: null, selectedSlots: {} };

function sanitizeIdentity(value: unknown): IdentityState {
  if (!isRecord(value)) return { ...EMPTY_IDENTITY };
  const selectedSlots: Record<string, number> = {};
  if (isRecord(value.selectedSlots)) {
    for (const [matchId, slot] of Object.entries(value.selectedSlots)) {
      const parsedSlot = slotOrNull(slot);
      if (parsedSlot != null) selectedSlots[matchId] = parsedSlot;
    }
  }
  return { accountId: intOrNull(value.accountId), selectedSlots };
}

export function loadIdentity(): IdentityState {
  return sanitizeIdentity(read<unknown>('identity', {}));
}

export function saveIdentity(identity: IdentityState): void {
  write('identity', sanitizeIdentity(identity));
}

/**
 * Синхронизирует запомненный аккаунт и ручной выбор игрока.
 *
 * Раньше существовало два независимых источника истины: settings.accountId
 * (кнопка «Запомнить» и настройки) и identity.accountId (кнопка «Это я»).
 * Здесь они сводятся к одному: сохранённый аккаунт — источник истины,
 * а ручной выбор остаётся запасным вариантом для конкретного матча.
 */
export function syncIdentity(identity: IdentityState, accountId: number | null): IdentityState {
  const next = sanitizeIdentity(identity);
  if (accountId != null && next.accountId !== accountId) {
    next.accountId = accountId;
  }
  return next;
}

export function rememberPlayerSlot(matchId: number, slot: number, accountId: number | null): IdentityState {
  const identity = loadIdentity();
  identity.selectedSlots[String(matchId)] = slot;
  if (accountId != null) identity.accountId = accountId;
  saveIdentity(identity);
  return identity;
}

export function dimensionAverage(history: HistoryEntry[]): Record<Dimension, number | null> {
  const result = {} as Record<Dimension, number | null>;
  for (const key of DIMENSIONS) {
    const values = history.map((h) => h.scores[key]).filter((v): v is number => v != null);
    result[key] = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  }
  return result;
}

/**
 * Полный сброс локальных данных.
 *
 * «Удалить всё» означает все сохранённые данные приложения: настройки,
 * историю, прогресс уроков, планы, профиль и ключи — плюс кэши загруженных
 * матчей в sessionStorage (раньше они оставались и матч «оживал» после сброса).
 */
export function clearAll(): void {
  for (const target of ['local', 'session'] as Target[]) {
    try {
      const storage = store(target);
      if (!storage) continue;
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key?.startsWith(PREFIX)) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    } catch {
      /* ignore */
    }
  }
  clearSessionCaches();
}

/** Удаляет закэшированные матчи текущей сессии (sessionStorage). */
export function clearSessionCaches(): void {
  try {
    const storage = store('session');
    if (!storage) return;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith('d2a.match.')) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    /* ignore */
  }
}

export { SECRET_FIELDS };
