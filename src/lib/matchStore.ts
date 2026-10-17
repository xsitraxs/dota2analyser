import demo1 from '../data/demo/7490235544.json';
import demo2 from '../data/demo/1781962623.json';
import { normalizeMatch } from './normalize';
import { analyzeMatch } from './analyze';
import { fetchMatch } from './openDota';
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

const cache = new Map<number, Match>();
const sessionPrefix = 'd2a.match.';

function demoPayload(id: number): unknown | null {
  return DEMO_MODULES.find((payload) => {
    const candidate = payload as { __demo?: DemoMeta };
    return candidate.__demo?.matchId === id;
  }) ?? null;
}

export const DEMO_META_LIST: DemoMeta[] = DEMO_MODULES.map(
  (payload) => (payload as { __demo: DemoMeta }).__demo,
);

export function getCachedMatch(id: number): Match | null {
  return cache.get(id) ?? null;
}

export function cacheMatch(match: Match): void {
  cache.set(match.id, match);
  try {
    const serialized = JSON.stringify(match);
    if (serialized.length < 3_500_000) sessionStorage.setItem(`${sessionPrefix}${match.id}`, serialized);
  } catch {
    /* ignore quota errors */
  }
}

export async function loadMatch(id: number, apiKey: string): Promise<Match> {
  const cached = cache.get(id);
  if (cached) return cached;

  try {
    const stored = sessionStorage.getItem(`${sessionPrefix}${id}`);
    if (stored) {
      const match = JSON.parse(stored) as Match;
      cache.set(id, match);
      return match;
    }
  } catch {
    /* ignore */
  }

  const demo = demoPayload(id);
  if (demo) {
    const match = normalizeMatch([demo]);
    cacheMatch(match);
    return match;
  }

  const raw = await fetchMatch(id, apiKey);
  const match = normalizeMatch([raw]);
  cacheMatch(match);
  return match;
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

export async function refreshMatch(id: number, apiKey: string): Promise<Match> {
  const raw = await fetchMatch(id, apiKey);
  const match = normalizeMatch([raw]);
  cacheMatch(match);
  return match;
}
