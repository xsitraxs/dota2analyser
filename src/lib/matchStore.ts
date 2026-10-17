import demo1 from '../data/demo/7490235544.json';
import demo2 from '../data/demo/1781962623.json';
import { normalizeMatch } from './normalize';
import { analyzeMatch } from './analyze';
import { fetchRawMatch } from './dataSource';
import type { Settings } from '../types';
import type { DemoMeta, Match } from '../types';
import data from '../data/constants.json';
import type { ConstantsFile } from '../types';

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

const cache = new Map<string, Match>();
const rawCache = new Map<string, unknown>();
const sessionPrefix = 'd2a.match.';

function cacheKey(id: number, provider: string): string {
  return `${provider}:${id}`;
}

function demoPayload(id: number): unknown | null {
  return DEMO_MODULES.find((payload) => {
    const candidate = payload as { __demo?: DemoMeta };
    return candidate.__demo?.matchId === id;
  }) ?? null;
}

export const DEMO_META_LIST: DemoMeta[] = DEMO_MODULES.map(
  (payload) => (payload as { __demo: DemoMeta }).__demo,
);

export function getCachedMatch(id: number, provider: string): Match | null {
  return cache.get(cacheKey(id, provider)) ?? null;
}

export function cacheMatch(match: Match, provider: string): void {
  const key = cacheKey(match.id, provider);
  cache.set(key, match);
  try {
    const serialized = JSON.stringify(match);
    if (serialized.length < 3_500_000) sessionStorage.setItem(`${sessionPrefix}${key}`, serialized);
  } catch {
    /* ignore quota errors */
  }
}

export function getRawMatch(id: number, provider: string): unknown | null {
  return rawCache.get(cacheKey(id, provider)) ?? null;
}

export async function loadMatch(id: number, settings: Settings): Promise<Match> {
  const provider = settings.provider;
  const key = cacheKey(id, provider);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const stored = sessionStorage.getItem(`${sessionPrefix}${key}`);
    if (stored) {
      const match = JSON.parse(stored) as Match;
      cache.set(key, match);
      return match;
    }
  } catch {
    /* ignore */
  }

  const demo = demoPayload(id);
  if (demo) {
    const match = normalizeMatch([demo]);
    rawCache.set(key, demo);
    cacheMatch(match, provider);
    return match;
  }

  const raw = await fetchRawMatch(id, settings);
  rawCache.set(key, raw);
  const match = normalizeMatch([raw]);
  cacheMatch(match, provider);
  return match;
}

/** Догружает парс реплея к уже загруженному матчу (например, к данным Valve). */
export async function mergeParsedData(
  matchId: number,
  extraRaw: unknown[],
  settings: Settings,
): Promise<Match> {
  const key = cacheKey(matchId, settings.provider);
  let raw: unknown = rawCache.get(key) ?? null;
  if (!raw) {
    raw = await fetchRawMatch(matchId, settings);
    rawCache.set(key, raw);
  }
  const combined = normalizeMatch([raw, ...extraRaw]);
  cacheMatch(combined, settings.provider);
  return combined;
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

export async function refreshMatch(id: number, settings: Settings): Promise<Match> {
  const key = cacheKey(id, settings.provider);
  const existing = rawCache.get(key) ?? null;
  const raw = await fetchRawMatch(id, settings);
  rawCache.set(key, raw);
  const match = normalizeMatch(existing ? [raw, existing] : [raw]);
  cacheMatch(match, settings.provider);
  return match;
}
