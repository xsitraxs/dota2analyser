import { HERO_BY_ID, HERO_BY_NAME, ITEM_BY_ID } from './constants';
import type {
  DemoMeta,
  Match,
  Objective,
  ObjectiveKind,
  PickBan,
  Player,
  PurchaseEntry,
  Side,
  Teamfight,
  TeamfightPlayer,
  WardPoint,
} from '../types';

type Raw = Record<string, any>;

export class MatchDataError extends Error {
  code: 'no-api' | 'invalid' | 'empty';
  matchId?: number;
  constructor(code: 'no-api' | 'invalid' | 'empty', message: string, matchId?: number) {
    super(message);
    this.name = 'MatchDataError';
    this.code = code;
    this.matchId = matchId;
  }
}

const SIDE_LABEL: Record<Side, string> = { radiant: 'Radiant', dire: 'Dire' };

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback;
}

function numOrNull(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function arrayOfNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => num(v)).filter((v) => Number.isFinite(v));
}

function slotSide(slot: number): Side {
  return slot < 128 ? 'radiant' : 'dire';
}

function sideFromTeam(team: unknown): Side | null {
  if (team === 2 || team === 0) return 'radiant';
  if (team === 3 || team === 1) return 'dire';
  return null;
}

function reverseSide(side: Side | null): Side | null {
  if (side === 'radiant') return 'dire';
  if (side === 'dire') return 'radiant';
  return null;
}

function unwrap(input: Raw): Raw {
  if (input.result && typeof input.result === 'object' && !Array.isArray(input.result) && !input.players) {
    return input.result as Raw;
  }
  return input;
}

interface InputSet {
  api: Raw | null;
  parsed: Raw | null;
  demo: DemoMeta | null;
  matchId: number | null;
}

export function extractInputs(inputs: unknown[]): InputSet {
  const flat: Raw[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === 'object') flat.push(value as Raw);
  };
  inputs.forEach(walk);

  let api: Raw | null = null;
  let parsed: Raw | null = null;
  let demo: DemoMeta | null = null;
  let matchId: number | null = null;

  for (const item of flat) {
    if (item.__demo && typeof item.__demo === 'object') {
      demo = item.__demo as DemoMeta;
    }
    const candidates: Raw[] = [];
    if (item.api && typeof item.api === 'object') candidates.push(item.api as Raw);
    if (item.parsed && typeof item.parsed === 'object') candidates.push(item.parsed as Raw);
    if (!item.api && !item.parsed) candidates.push(item);
    for (const rawCandidate of candidates) {
      const candidate = unwrap(rawCandidate);
      const players = Array.isArray(candidate.players) ? (candidate.players as Raw[]) : [];
      const id = numOrNull(candidate.match_id);
      if (id) matchId = id;
      if (!players.length) continue;
      const hasApi = players.some((p) => numOrNull(p.hero_id) != null);
      const hasParsed = players.some((p) => Array.isArray(p.gold_t) && p.gold_t.length > 1);
      if (hasApi && !api) api = candidate;
      if (hasParsed && !parsed) parsed = candidate;
      if (hasApi && hasParsed && !parsed) parsed = candidate;
    }
  }

  if (!api && parsed) {
    const players = Array.isArray(parsed.players) ? (parsed.players as Raw[]) : [];
    if (!players.some((p) => numOrNull(p.hero_id) != null)) {
      throw new MatchDataError(
        'no-api',
        'В файле есть данные реплея, но нет базовой статистики (героев и игроков). Загрузи API-матч или дай догрузить его из OpenDota.',
        matchId ?? undefined,
      );
    }
    api = parsed;
  }

  if (!api) {
    throw new MatchDataError('invalid', 'Не удалось найти матч в данных. Нужен JSON ответа OpenDota /api/matches/:id.');
  }

  return { api, parsed, demo, matchId: matchId ?? numOrNull(api.match_id) };
}

function normalizeWards(value: unknown): WardPoint[] {
  if (!Array.isArray(value)) return [];
  const points: WardPoint[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Raw;
    const time = numOrNull(entry.time);
    const x = numOrNull(entry.x);
    const y = numOrNull(entry.y);
    if (time == null || x == null || y == null || time < 0) continue;
    points.push({ time, x, y });
  }
  return points.sort((a, b) => a.time - b.time);
}

function normalizeLanePos(value: unknown): Record<string, Record<string, number>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, Record<string, number>>;
}

function normalizePlayer(apiPlayer: Raw, parsedPlayer: Raw | null, index: number): Player {
  const slot = num(apiPlayer.player_slot, index < 5 ? index : index + 123);
  const source = parsedPlayer ?? apiPlayer;
  const pick = (key: string): unknown => (parsedPlayer && parsedPlayer[key] !== undefined ? parsedPlayer[key] : apiPlayer[key]);

  const items: number[] = [];
  for (let i = 0; i <= 5; i += 1) {
    const id = num(apiPlayer[`item_${i}`]);
    if (id > 0) items.push(id);
  }
  const backpack: number[] = [];
  for (let i = 0; i <= 2; i += 1) {
    const id = num(apiPlayer[`backpack_${i}`]);
    if (id > 0) backpack.push(id);
  }

  let goldT = arrayOfNumbers(pick('gold_t'));
  let lhT = arrayOfNumbers(pick('lh_t'));
  let dnT = arrayOfNumbers(pick('dn_t'));
  let xpT = arrayOfNumbers(pick('xp_t'));
  let times = arrayOfNumbers(pick('times'));

  const minLen = Math.min(goldT.length || Infinity, lhT.length || Infinity, xpT.length || Infinity);
  if (Number.isFinite(minLen) && minLen > 0) {
    goldT = goldT.slice(0, minLen);
    if (lhT.length) lhT = lhT.slice(0, minLen);
    if (dnT.length) dnT = dnT.slice(0, minLen);
    if (xpT.length) xpT = xpT.slice(0, minLen);
  }
  if (!times.length && goldT.length) {
    times = goldT.map((_, i) => i * 60);
  }
  if (times.length && goldT.length !== times.length) {
    const length = Math.min(times.length, goldT.length);
    times = times.slice(0, length);
    goldT = goldT.slice(0, length);
    if (lhT.length) lhT = lhT.slice(0, length);
    if (dnT.length) dnT = dnT.slice(0, length);
    if (xpT.length) xpT = xpT.slice(0, length);
  }

  const gold = num(apiPlayer.gold, num(source.gold));
  const goldSpent = num(apiPlayer.gold_spent, num(source.gold_spent));
  const inventoryValue = [...items, ...backpack, num(apiPlayer.item_neutral)]
    .filter((id) => id > 0)
    .map((id) => ITEM_BY_ID[id]?.cost ?? 0)
    .reduce((a, b) => a + b, 0);
  let netWorth = numOrNull(apiPlayer.net_worth);
  if (netWorth == null) {
    netWorth = gold + inventoryValue;
    if (netWorth < goldSpent * 0.4) netWorth = goldSpent + gold;
  }

  const purchaseLog: PurchaseEntry[] = Array.isArray(pick('purchase_log'))
    ? (pick('purchase_log') as Raw[])
        .map((entry) => ({
          time: num(entry.time),
          key: str(entry.key),
          charges: numOrNull(entry.charges) ?? undefined,
        }))
        .filter((entry) => entry.key && Number.isFinite(entry.time))
        .sort((a, b) => a.time - b.time)
    : [];

  const killsLog = Array.isArray(pick('kills_log'))
    ? (pick('kills_log') as Raw[])
        .map((entry) => ({ time: num(entry.time), key: str(entry.key) }))
        .filter((entry) => entry.key && Number.isFinite(entry.time))
        .sort((a, b) => a.time - b.time)
    : [];

  const obsLog = normalizeWards(pick('obs_log'));
  const senLog = normalizeWards(pick('sen_log'));

  const rawLane = numOrNull(pick('lane'));
  const laneRole = numOrNull(pick('lane_role'));
  const parsedFlag = goldT.length > 1;

  return {
    slot,
    isRadiant: slotSide(slot) === 'radiant',
    heroId: num(apiPlayer.hero_id),
    accountId: numOrNull(apiPlayer.account_id),
    name: str(apiPlayer.personaname).trim() || str(apiPlayer.name).trim() || `Игрок ${(slot % 128) + 1}`,
    kills: num(apiPlayer.kills),
    deaths: num(apiPlayer.deaths),
    assists: num(apiPlayer.assists),
    gpm: num(apiPlayer.gold_per_min),
    xpm: num(apiPlayer.xp_per_min),
    lastHits: num(apiPlayer.last_hits),
    denies: num(apiPlayer.denies),
    netWorth,
    level: num(apiPlayer.level),
    heroDamage: num(apiPlayer.hero_damage),
    towerDamage: num(apiPlayer.tower_damage),
    heroHealing: num(apiPlayer.hero_healing),
    gold,
    goldSpent,
    items,
    neutralItem: numOrNull(apiPlayer.item_neutral),
    backpack,
    laneRole,
    rawLane,
    laneEfficiency: numOrNull(pick('lane_efficiency_pct')),
    times,
    goldT,
    lhT,
    dnT,
    xpT,
    purchaseLog,
    killsLog,
    buybackLog: Array.isArray(pick('buyback_log'))
      ? (pick('buyback_log') as Raw[]).map((entry) => ({ time: num(entry.time) }))
      : [],
    obsLog,
    senLog,
    lanePos: normalizeLanePos(pick('lane_pos')),
    obsPlaced: num(pick('obs_placed'), obsLog.length),
    senPlaced: num(pick('sen_placed'), senLog.length),
    campsStacked: num(pick('camps_stacked')),
    runePickups: num(
      pick('rune_pickups'),
      Array.isArray(pick('runes_log')) ? (pick('runes_log') as Raw[]).length : 0,
    ),
    roshansKilled: num(pick('roshans_killed')),
    stuns: num(pick('stuns')),
    maxHeroHit: num(pick('max_hero_hit')),
    multiKills: (pick('multi_kills') as Record<string, number>) ?? {},
    killStreaks: (pick('kill_streaks') as Record<string, number>) ?? {},
    itemUses: (pick('item_uses') as Record<string, number>) ?? {},
    abilityUses: (pick('ability_uses') as Record<string, number>) ?? {},
    teamfightParticipation: numOrNull(pick('teamfight_participation')),
    isParsed: parsedFlag,
  };
}

function parseBuildingKey(key: string): {
  kind: ObjectiveKind;
  target: Side;
  lane?: 'top' | 'mid' | 'bot';
  tier?: number;
  title: string;
} | null {
  if (!key.startsWith('npc_dota_goodguys') && !key.startsWith('npc_dota_badguys')) return null;
  const target: Side = key.includes('badguys') ? 'dire' : 'radiant';
  const laneMatch = key.match(/_(top|mid|bot)(?:_|$)/);
  const lane = laneMatch ? (laneMatch[1] as 'top' | 'mid' | 'bot') : undefined;
  if (key.includes('_fort')) {
    return { kind: 'fort', target, title: 'Трон разрушен' };
  }
  if (key.includes('_rax')) {
    return { kind: 'rax', target, lane, title: 'Барак разрушен' };
  }
  const towerMatch = key.match(/_tower(\d)/);
  if (towerMatch) {
    return { kind: 'tower', target, lane, tier: Number(towerMatch[1]), title: `Башня T${towerMatch[1]} разрушена` };
  }
  return { kind: 'other', target, title: 'Строение разрушено' };
}

function parseObjectives(raw: unknown, playersBySlot: Map<number, Player>): Objective[] {
  if (!Array.isArray(raw)) return [];
  const objectives: Objective[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Raw;
    const time = num(entry.time);
    const type = str(entry.type);
    const slot = numOrNull(entry.player_slot) ?? numOrNull(entry.slot);
    const player = slot != null ? playersBySlot.get(slot) : undefined;
    const heroId = player?.heroId ?? null;

    if (type === 'building_kill') {
      const key = str(entry.key);
      const parsed = parseBuildingKey(key);
      if (!parsed) continue;
      const laneRu = parsed.lane === 'top' ? 'топ' : parsed.lane === 'mid' ? 'мид' : parsed.lane === 'bot' ? 'бот' : '';
      const detail = [SIDE_LABEL[parsed.target], laneRu].filter(Boolean).join(' · ');
      const importance =
        parsed.kind === 'fort' ? 10 : parsed.kind === 'rax' ? 9 : parsed.tier ? Math.min(8, 4 + parsed.tier) : 4;
      objectives.push({
        time,
        kind: parsed.kind,
        team: reverseSide(parsed.target),
        target: parsed.target,
        title: parsed.title,
        detail,
        lane: parsed.lane,
        tier: parsed.tier,
        playerSlot: slot,
        heroId,
        importance,
      });
      continue;
    }

    if (type === 'CHAT_MESSAGE_FIRSTBLOOD') {
      const side = slot != null ? slotSide(slot) : null;
      objectives.push({
        time,
        kind: 'firstblood',
        team: side,
        target: null,
        title: 'Первая кровь',
        detail: player?.name ?? '',
        playerSlot: slot,
        heroId,
        importance: 6,
      });
      continue;
    }

    if (type === 'CHAT_MESSAGE_ROSHAN_KILL') {
      const side = sideFromTeam(entry.team);
      objectives.push({
        time,
        kind: 'roshan',
        team: side,
        target: null,
        title: 'Рошан убит',
        detail: side ? SIDE_LABEL[side] : '',
        playerSlot: player?.slot ?? null,
        heroId,
        importance: 8,
      });
      continue;
    }

    if (type === 'CHAT_MESSAGE_AEGIS') {
      const side = slot != null ? slotSide(slot) : null;
      objectives.push({
        time,
        kind: 'aegis',
        team: side,
        target: null,
        title: 'Аегис поднят',
        detail: heroId ? HERO_BY_ID[heroId]?.localized_name ?? '' : '',
        playerSlot: slot,
        heroId,
        importance: 7,
      });
      continue;
    }

    if (type === 'CHAT_MESSAGE_COURIER_LOST') {
      const side = slot != null ? slotSide(slot) : null;
      objectives.push({
        time,
        kind: 'courier',
        team: side ? reverseSide(side) : null,
        target: side,
        title: 'Курьер убит',
        detail: side ? SIDE_LABEL[side] : '',
        playerSlot: slot,
        heroId,
        importance: 2,
      });
    }
  }
  return objectives.sort((a, b) => a.time - b.time);
}

function parseTeamfights(raw: unknown): Teamfight[] {
  if (!Array.isArray(raw)) return [];
  const fights: Teamfight[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Raw;
    const rawPlayers = Array.isArray(entry.players) ? (entry.players as Raw[]) : [];
    const players: TeamfightPlayer[] = rawPlayers.map((p) => {
      const deathsPosRaw = (p.deaths_pos ?? {}) as Record<string, Record<string, number>>;
      const deathsPos: { x: number; y: number }[] = [];
      for (const [x, row] of Object.entries(deathsPosRaw)) {
        if (!row || typeof row !== 'object') continue;
        for (const [y, count] of Object.entries(row)) {
          const times = Math.max(1, Math.min(4, num(count, 1)));
          for (let i = 0; i < times; i += 1) {
            deathsPos.push({ x: num(x), y: num(y) });
          }
        }
      }
      return {
        damage: num(p.damage),
        healing: num(p.healing),
        goldDelta: num(p.gold_delta),
        xpDelta: num(p.xp_delta),
        deaths: num(p.deaths),
        deathsPos,
      };
    });
    while (players.length < 10) {
      players.push({ damage: 0, healing: 0, goldDelta: 0, xpDelta: 0, deaths: 0, deathsPos: [] });
    }
    const radiantGold = players.slice(0, 5).reduce((acc, p) => acc + p.goldDelta, 0);
    const direGold = players.slice(5, 10).reduce((acc, p) => acc + p.goldDelta, 0);
    const winner: Side | 'even' =
      Math.abs(radiantGold - direGold) < 250 ? 'even' : radiantGold > direGold ? 'radiant' : 'dire';
    fights.push({
      start: num(entry.start),
      end: num(entry.end),
      deaths: num(entry.deaths),
      players,
      radiantGold,
      direGold,
      winner,
      totalDamage: players.reduce((acc, p) => acc + p.damage, 0),
    });
  }
  return fights.sort((a, b) => a.start - b.start);
}

function deriveAdvantage(players: Player[], duration: number, field: 'goldT' | 'xpT'): number[] {
  const length = Math.floor(duration / 60) + 1;
  const out: number[] = [];
  const timed = players.filter((p) => p.times.length && p[field].length);
  if (!timed.length) return [];
  for (let minute = 0; minute < length; minute += 1) {
    const t = minute * 60;
    let radiant = 0;
    let dire = 0;
    for (const p of players) {
      const times = p.times;
      const values = p[field];
      if (!times.length || !values.length) continue;
      let idx = -1;
      for (let i = 0; i < times.length; i += 1) {
        if (times[i] <= t) idx = i;
        else break;
      }
      const value = idx >= 0 ? values[idx] : 0;
      if (p.isRadiant) radiant += value;
      else dire += value;
    }
    out.push(radiant - dire);
  }
  return out;
}

function parsePicksBans(raw: unknown, players: Player[]): PickBan[] {
  if (Array.isArray(raw) && raw.length) {
    return raw.map((entry) => ({
      heroId: num((entry as Raw).hero_id),
      isPick: Boolean((entry as Raw).is_pick),
      team: num((entry as Raw).team),
      order: num((entry as Raw).order),
    }));
  }
  return players.map((player, index) => ({
    heroId: player.heroId,
    isPick: true,
    team: player.isRadiant ? 0 : 1,
    order: index,
  }));
}

export function normalizeMatch(inputs: unknown[]): Match {
  const { api, parsed, demo } = extractInputs(inputs);
  if (!api) throw new MatchDataError('invalid', 'Не найден матч.');

  const apiPlayersRaw = Array.isArray(api.players) ? (api.players as Raw[]) : [];
  if (apiPlayersRaw.length < 2) {
    throw new MatchDataError('invalid', 'В данных нет списка игроков.');
  }
  const parsedPlayersRaw = parsed && Array.isArray(parsed.players) ? (parsed.players as Raw[]) : [];
  const parsedBySlot = new Map<number, Raw>();
  for (const p of parsedPlayersRaw) {
    const slot = numOrNull(p.player_slot);
    if (slot != null) parsedBySlot.set(slot, p);
  }

  const sortedApi = [...apiPlayersRaw].sort((a, b) => num(a.player_slot) - num(b.player_slot));
  const players = sortedApi.map((apiPlayer, index) => {
    const slot = num(apiPlayer.player_slot, index < 5 ? index : index + 123);
    return normalizePlayer(apiPlayer, parsedBySlot.get(slot) ?? null, index);
  });
  const playersBySlot = new Map(players.map((p) => [p.slot, p]));

  const duration = num(api.duration) || num(parsed?.duration);
  const parsedFlag = players.some((p) => p.isParsed);

  let goldAdv = arrayOfNumbers(parsed?.radiant_gold_adv ?? api.radiant_gold_adv);
  let xpAdv = arrayOfNumbers(parsed?.radiant_xp_adv ?? api.radiant_xp_adv);
  if (!goldAdv.length || goldAdv.every((v) => v === 0)) {
    goldAdv = deriveAdvantage(players, duration, 'goldT');
  }
  if (!xpAdv.length || xpAdv.every((v) => v === 0)) {
    xpAdv = deriveAdvantage(players, duration, 'xpT');
  }

  const teamfights = parseTeamfights(parsed?.teamfights ?? api.teamfights);
  const objectives = parseObjectives(parsed?.objectives ?? api.objectives, playersBySlot);
  const picksBans = parsePicksBans(api.picks_bans ?? parsed?.picks_bans, players);

  const radiantKills = players.filter((p) => p.isRadiant).reduce((a, p) => a + p.kills, 0);
  const direKills = players.filter((p) => !p.isRadiant).reduce((a, p) => a + p.kills, 0);

  const warnings: string[] = [];
  if (!parsedFlag) {
    warnings.push('Матч не распарсен: таймлайны, варды и драки недоступны. Загрузи JSON парса для полного разбора.');
  }
  if (!players.some((player) => player.laneRole != null || player.lanePos)) {
    warnings.push('Нет разбивки по линиям: позиции определены по объёму фарма, линия не отображается.');
  }
  if (!teamfights.length) {
    warnings.push('Нет данных о командных драках — часть выводов скрыта.');
  }

  const matchId = num(api.match_id) || num(parsed?.match_id);
  if (!matchId) throw new MatchDataError('invalid', 'В данных нет ID матча.');

  return {
    id: matchId,
    startTime: num(api.start_time) || num(parsed?.start_time),
    duration,
    radiantWin: Boolean(api.radiant_win ?? parsed?.radiant_win),
    gameMode: num(api.game_mode),
    lobbyType: num(api.lobby_type, 7),
    region: numOrNull(api.region),
    radiantScore: numOrNull(api.radiant_score) ?? radiantKills,
    direScore: numOrNull(api.dire_score) ?? direKills,
    firstBlood:
      numOrNull(api.first_blood_time) ??
      objectives.find((o) => o.kind === 'firstblood')?.time ??
      null,
    averageRank: numOrNull(api.average_rank),
    players,
    picksBans,
    objectives,
    teamfights,
    goldAdv,
    xpAdv,
    parsed: parsedFlag,
    hasTimelines: players.some((p) => p.goldT.length > 1),
    demo,
    warnings,
  };
}

export async function readJsonFiles(files: File[]): Promise<unknown[]> {
  const outputs: unknown[] = [];
  for (const file of files) {
    const text = await file.text();
    try {
      outputs.push(JSON.parse(text));
    } catch {
      throw new MatchDataError('invalid', `Файл «${file.name}» не похож на JSON.`);
    }
  }
  return outputs;
}

export function matchTitle(match: Match): string {
  if (match.demo) return match.demo.title;
  return `Матч ${match.id}`;
}

export { SIDE_LABEL };
