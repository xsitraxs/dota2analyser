import type { Dimension, HistoryEntry, PlanTaskState, Settings } from '../types';

const PREFIX = 'd2a.v1.';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* localStorage может быть отключён — приложение продолжает работать */
  }
}

export function loadSettings(): Settings {
  return read<Settings>('settings', {
    apiKey: '',
    accountId: null,
    playerName: '',
    reduceMotion: false,
  });
}

export function saveSettings(settings: Settings): void {
  write('settings', settings);
}

export interface LessonProgress {
  [lessonId: string]: { done: boolean; at: number };
}

export function loadLessonProgress(): LessonProgress {
  return read<LessonProgress>('lessons', {});
}

export function setLessonDone(lessonId: string, done: boolean): LessonProgress {
  const progress = loadLessonProgress();
  if (done) progress[lessonId] = { done: true, at: Date.now() };
  else delete progress[lessonId];
  write('lessons', progress);
  return progress;
}

export function loadHistory(): HistoryEntry[] {
  return read<HistoryEntry[]>('history', []);
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

export function loadPlan(matchId: number, slot: number): PlanTaskState {
  return read<PlanTaskState>(planKey(matchId, slot), {});
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

export function loadIdentity(): IdentityState {
  return read<IdentityState>('identity', { accountId: null, selectedSlots: {} });
}

export function saveIdentity(identity: IdentityState): void {
  write('identity', identity);
}

export function rememberPlayerSlot(matchId: number, slot: number, accountId: number | null): IdentityState {
  const identity = loadIdentity();
  identity.selectedSlots[String(matchId)] = slot;
  if (accountId) identity.accountId = accountId;
  saveIdentity(identity);
  return identity;
}

export function dimensionAverage(history: HistoryEntry[]): Record<Dimension, number | null> {
  const keys: Dimension[] = ['farm', 'damage', 'survival', 'vision', 'fights', 'objectives'];
  const result = {} as Record<Dimension, number | null>;
  for (const key of keys) {
    const values = history.map((h) => h.scores[key]).filter((v): v is number => v != null);
    result[key] = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  }
  return result;
}

export function clearAll(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}
