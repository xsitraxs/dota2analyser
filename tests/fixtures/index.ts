import valveHistory from './valve-getmatchhistory.json';
import valveDetails from './valve-getmatchdetails.json';
import valveSummaries from './valve-getplayersummaries.json';
import openDotaMatch from './opendota-match.json';
import openDotaParsed from './opendota-parsed.json';
import openDotaParsedOther from './opendota-parsed-other-match.json';
import openDotaPlayerPublic from './opendota-player-public.json';
import openDotaPlayerHidden from './opendota-player-hidden.json';
import openDotaPlayerFlat from './opendota-player-flat.json';

export const FIXTURES = {
  valveHistory,
  valveDetails,
  valveSummaries,
  openDotaMatch,
  openDotaParsed,
  openDotaParsedOther,
  openDotaPlayerPublic,
  openDotaPlayerHidden,
  openDotaPlayerFlat,
};

export const API_MATCH_ID = openDotaMatch.match_id;

/** Глубокая копия фикстуры: тесты не должны портить исходный объект. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function apiMatch(): Record<string, unknown> {
  return clone(FIXTURES.openDotaMatch) as unknown as Record<string, unknown>;
}

export function parsedMatch(matchId: number = API_MATCH_ID): Record<string, unknown> {
  const source = matchId === API_MATCH_ID ? FIXTURES.openDotaParsed : FIXTURES.openDotaParsedOther;
  return clone(source) as unknown as Record<string, unknown>;
}

export function valveDetailsRaw(): Record<string, unknown> {
  return clone(FIXTURES.valveDetails) as unknown as Record<string, unknown>;
}

export function valveHistoryRaw(): Record<string, unknown> {
  return clone(FIXTURES.valveHistory) as unknown as Record<string, unknown>;
}

/** Минимальный матч на 10 игроков: удобно для точечных проверок валидации. */
export function minimalMatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const players = Array.from({ length: 10 }, (_, index) => ({
    player_slot: index < 5 ? index : 123 + index,
    hero_id: 1 + index,
    kills: 5,
    deaths: 3,
    assists: 4,
    gold_per_min: 400,
    xp_per_min: 450,
    last_hits: 100,
    denies: 5,
    net_worth: 9000,
    level: 20,
    hero_damage: 12000,
    tower_damage: 1500,
    hero_healing: 200,
    gold: 800,
    gold_spent: 8000,
  }));
  return {
    match_id: 7490235544,
    duration: 1800,
    start_time: 1690000000,
    radiant_win: true,
    game_mode: 22,
    lobby_type: 7,
    radiant_score: 30,
    dire_score: 20,
    players,
    ...overrides,
  };
}

/** Объект, похожий на File: нужен для проверок импорта. */
export function fakeFile(name: string, content: string, size?: number): File {
  const file = {
    name,
    size: size ?? new TextEncoder().encode(content).length,
    text: async () => content,
  };
  return file as unknown as File;
}
