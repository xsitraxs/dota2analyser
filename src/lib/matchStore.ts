import demo1 from '../data/demo/7490235544.json';
import demo2 from '../data/demo/1781962623.json';
import { MatchDataError, normalizeMatch } from './normalize';
import { analyzeMatch } from './analyze';
import { fetchRawMatch, providerLabel, proxyBase } from './dataSource';
import { isValidStoredMatch, readMatchId } from './validate';
import type { Settings } from '../types';
import type { DemoMeta, Match } from '../types';
import type { ConstantsFile, MatchCoverage } from '../types';
import data from '../data/constants.json';

const DEMO_MODULES = [demo1, demo2] as unknown[];

const constants = data as unknown as ConstantsFile;

export interface DemoCard {
  id: number;
  meta: DemoMeta;
  heroName: string;
  heroId: number;
  kills: number;
  deaths: number;
  assists: number;
  gpm: number;
  duration: number;
  score: number | null;
  role: number;
  won: boolean;
  isRadiant: boolean;
  startTime: number;
  gameMode: number;
}

/** Исходный JSON, из которого собран матч. Хранится вместе с нормализованным матчем. */
export interface MatchSource {
  /** base — базовая статистика, parsed/import — догруженный парс, demo — встроенное демо. */
  kind: 'base' | 'parsed' | 'import' | 'demo';
  label: string;
  raw: unknown;
  matchId: number | null;
  addedAt: number;
}

interface StoredEntry {
  version: number;
  match: Match;
  sources: MatchSource[];
}

const CACHE_VERSION = 2;
const sessionPrefix = 'd2a.match.';
const MAX_SESSION_BYTES = 8_000_000;

const cache = new Map<string, Match>();
const sources = new Map<string, MatchSource[]>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Ключ кэша учитывает не только источник и ID, но и адрес прокси:
 * смена зеркала не должна возвращать данные, полученные от прежнего адреса.
 */
export function endpointOf(settings: Settings): string {
  if (settings.provider === 'steam') return settings.steamProxy.trim().replace(/\/+$/, '');
  if (settings.provider === 'proxy') return proxyBase(settings) ?? '';
  return '';
}

export function cacheKey(id: number, provider: string, endpoint = ''): string {
  return `${provider}:${endpoint}:${id}`;
}

function keyFor(id: number, settings: Settings): string {
  return cacheKey(id, settings.provider, endpointOf(settings));
}

function demoPayload(id: number): unknown | null {
  return (
    DEMO_MODULES.find((payload) => {
      const candidate = payload as { __demo?: DemoMeta };
      return candidate.__demo?.matchId === id;
    }) ?? null
  );
}

export const DEMO_META_LIST: DemoMeta[] = DEMO_MODULES.map((payload) => (payload as { __demo: DemoMeta }).__demo);

/** Восстанавливает признаки покрытия для записей, сохранённых старой версией. */
function coverageOf(match: Match): MatchCoverage {
  if (match.coverage) return match.coverage;
  return {
    timelines: match.players.some((p) => p.times.length > 1 && p.goldT.length > 1),
    wards: match.players.some((p) => p.obsPlaced != null || p.senPlaced != null),
    fights: match.teamfights.length > 0,
    objectives: match.objectives.length > 0,
    purchases: match.players.some((p) => p.purchaseLog.length > 0),
  };
}

function isValidSource(value: unknown): value is MatchSource {
  if (!isRecord(value)) return false;
  const kind = value.kind;
  return kind === 'base' || kind === 'parsed' || kind === 'import' || kind === 'demo';
}

function readStored(key: string): StoredEntry | null {
  try {
    const raw = sessionStorage.getItem(sessionPrefix + key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== CACHE_VERSION || !isValidStoredMatch(parsed.match)) {
      // Повреждённая запись не должна ломать загрузку: просто забываем её.
      sessionStorage.removeItem(sessionPrefix + key);
      return null;
    }
    const match = { ...(parsed.match as unknown as Match) };
    match.coverage = coverageOf(match);
    const list = Array.isArray(parsed.sources) ? parsed.sources.filter(isValidSource) : [];
    return { version: CACHE_VERSION, match, sources: list };
  } catch {
    try {
      sessionStorage.removeItem(sessionPrefix + key);
    } catch {
      /* ignore */
    }
    return null;
  }
}

function persist(key: string, entry: StoredEntry): void {
  try {
    let payload = JSON.stringify(entry);
    if (payload.length > MAX_SESSION_BYTES) {
      // Исходники могут не влезть в квоту — сохраняем хотя бы нормализованный матч.
      payload = JSON.stringify({ version: CACHE_VERSION, match: entry.match, sources: [] });
    }
    if (payload.length > MAX_SESSION_BYTES) {
      sessionStorage.removeItem(sessionPrefix + key);
      return;
    }
    sessionStorage.setItem(sessionPrefix + key, payload);
  } catch {
    /* quota errors — кэш в памяти уже есть, работа продолжается */
  }
}

function save(key: string, match: Match, list: MatchSource[]): Match {
  cache.set(key, match);
  sources.set(key, list);
  persist(key, { version: CACHE_VERSION, match, sources: list });
  return match;
}

function makeSource(kind: MatchSource['kind'], label: string, raw: unknown, matchId: number | null): MatchSource {
  return { kind, label, raw, matchId, addedAt: Date.now() };
}

export function getCachedMatch(id: number, settings: Settings): Match | null {
  return cache.get(keyFor(id, settings)) ?? null;
}

export function cacheMatch(match: Match, settings: Settings, list: MatchSource[] = []): void {
  save(keyFor(match.id, settings), match, list);
}

/** Исходники, из которых собран матч (нужны для догрузки парса и обновления). */
export function getMatchSources(id: number, settings: Settings): MatchSource[] {
  const key = keyFor(id, settings);
  const known = sources.get(key);
  if (known) return known;
  const stored = readStored(key);
  if (stored) {
    sources.set(key, stored.sources);
    return stored.sources;
  }
  return [];
}

export function getRawMatch(id: number, settings: Settings): unknown | null {
  const base = getMatchSources(id, settings).find((source) => source.kind === 'base' || source.kind === 'demo');
  return base?.raw ?? null;
}

export async function loadMatch(id: number, settings: Settings, signal?: AbortSignal): Promise<Match> {
  const key = keyFor(id, settings);
  const cached = cache.get(key);
  if (cached) return cached;

  const stored = readStored(key);
  if (stored) {
    cache.set(key, stored.match);
    sources.set(key, stored.sources);
    return stored.match;
  }

  const demo = demoPayload(id);
  if (demo) {
    const match = normalizeMatch([demo], { expectedMatchId: id });
    return save(key, match, [makeSource('demo', 'Демо-данные из сборки', demo, match.id)]);
  }

  const raw = await fetchRawMatch(id, settings, signal);
  // Ожидаемый ID проверяется до записи в кэш: источник мог ответить другим матчем.
  const match = normalizeMatch([raw], { expectedMatchId: id });
  return save(key, match, [makeSource('base', providerLabel(settings.provider), raw, match.id)]);
}

/**
 * Импорт JSON: сохраняет и нормализованный матч, и исходные файлы.
 * Без исходников догрузка парса к импортированному матчу требовала бы сеть.
 */
export function importMatch(rawInputs: unknown[], settings: Settings): Match {
  const match = normalizeMatch(rawInputs);
  const list = rawInputs.map((raw, index) =>
    makeSource('import', `Файл ${index + 1}`, raw, readMatchId((raw as Record<string, unknown>)?.match_id)),
  );
  return save(keyFor(match.id, settings), match, list);
}

/**
 * Догружает парс реплея к уже загруженному матчу (например, к данным Valve).
 *
 * Сеть нужна только если базовых данных нет вообще: исходники хранятся вместе
 * с матчем, поэтому обновление и догрузка работают офлайн.
 */
export async function mergeParsedData(
  matchId: number,
  extraRaw: unknown[],
  settings: Settings,
  signal?: AbortSignal,
): Promise<Match> {
  const key = keyFor(matchId, settings);
  let list = getMatchSources(matchId, settings);

  if (!list.length) {
    const raw = await fetchRawMatch(matchId, settings, signal);
    const base = normalizeMatch([raw], { expectedMatchId: matchId });
    list = [makeSource('base', providerLabel(settings.provider), raw, base.id)];
  }

  const combined = normalizeMatch([...list.map((source) => source.raw), ...extraRaw], {
    expectedMatchId: matchId,
  });
  const next = [...list, ...extraRaw.map((raw) => makeSource('parsed', 'Догруженный парс', raw, matchId))];
  return save(key, combined, next);
}

/**
 * Обновляет матч из источника, сохраняя догруженный парс.
 *
 * Раньше обновление собирало данные только из нового ответа и часть
 * распарсенных данных (таймлайны, варды, драки) исчезала после refresh.
 */
export async function refreshMatch(id: number, settings: Settings, signal?: AbortSignal): Promise<Match> {
  const key = keyFor(id, settings);
  const previous = getMatchSources(id, settings).filter((source) => source.kind !== 'base');
  const raw = await fetchRawMatch(id, settings, signal);
  const fresh = normalizeMatch([raw], { expectedMatchId: id });
  const list = [makeSource('base', providerLabel(settings.provider), raw, fresh.id), ...previous];
  const combined = normalizeMatch(
    list.map((source) => source.raw),
    { expectedMatchId: id },
  );
  return save(key, combined, list);
}

/** Полный сброс: чистит и память, и sessionStorage. */
export function clearMatchCaches(): void {
  cache.clear();
  sources.clear();
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(sessionPrefix)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}

export function demoMatchId(): number {
  return DEMO_META_LIST[0]?.matchId ?? 7490235544;
}

export function getDemoCards(): DemoCard[] {
  return DEMO_MODULES.map((payload) => {
    const match = normalizeMatch([payload]);
    const meta = (payload as { __demo: DemoMeta }).__demo;
    const slot = meta.featuredSlot;
    const player = match.players.find((p) => p.slot === slot) ?? match.players[0];
    const hero = constants.heroes[String(player.heroId)];
    let score: number | null = null;
    let role = 1;
    try {
      const analysis = analyzeMatch(match);
      score = analysis.bySlot[slot]?.overall ?? null;
      role = analysis.bySlot[slot]?.role ?? 1;
    } catch {
      score = null;
    }
    return {
      id: match.id,
      meta,
      heroName: hero?.localized_name ?? 'Герой',
      heroId: player.heroId,
      kills: player.kills,
      deaths: player.deaths,
      assists: player.assists,
      gpm: player.gpm,
      duration: match.duration,
      score,
      role,
      won: player.isRadiant === match.radiantWin,
      isRadiant: player.isRadiant,
      startTime: match.startTime,
      gameMode: match.gameMode,
    };
  });
}

export { MatchDataError };
