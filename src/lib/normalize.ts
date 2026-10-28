import { HERO_BY_ID, ITEM_BY_ID } from './constants';
import {
  LIMITS,
  checkFileSize,
  isRecord,
  readCount,
  readCountOrNull,
  readDuration,
  readMatchId,
  readNumberArray,
  readObjectArray,
  readRecord,
  readSlot,
  readText,
  validateCoordMap,
  validatePlayers,
} from './validate';
import type {
  DemoMeta,
  Match,
  MatchCoverage,
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

export { MatchDataError } from './matchDataError';
export type { MatchDataErrorCode } from './matchDataError';
import { MatchDataError } from './matchDataError';

type Raw = Record<string, unknown>;

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
  return readNumberArray(value, LIMITS.maxSeriesLength);
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
  if (isRecord(input.result) && !Array.isArray(input.players)) {
    return input.result;
  }
  return input;
}

export interface InputSet {
  api: Raw | null;
  parsed: Raw | null;
  demo: DemoMeta | null;
  matchId: number | null;
}

export interface ExtractOptions {
  /** Ожидаемый match_id: источники с другим ID отклоняются (защита от склейки разных матчей). */
  expectedMatchId?: number | null;
}

/**
 * Разбирает список источников (ответ API, файл парса, демо-пакет) на базу и парс.
 *
 * Главное правило: все источники должны относиться к одному матчу. Раньше
 * первый попавшийся API-объект и первый попавшийся парс склеивались без
 * проверки ID, поэтому таймлайны чужого матча попадали в отчёт как свои.
 */
export function extractInputs(inputs: unknown[], options: ExtractOptions = {}): InputSet {
  const flat: Raw[] = [];
  const seen = new Set<unknown>();
  const walk = (value: unknown, depth: number) => {
    if (depth > 6 || value == null) return;
    if (Array.isArray(value)) {
      if (seen.has(value)) return;
      seen.add(value);
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (isRecord(value)) {
      if (seen.has(value)) return;
      seen.add(value);
      flat.push(value);
    }
  };
  (Array.isArray(inputs) ? inputs : []).forEach((item) => walk(item, 0));

  if (!flat.length) {
    throw new MatchDataError('empty', 'Не передано ни одного источника данных матча.');
  }

  let api: Raw | null = null;
  let parsed: Raw | null = null;
  let demo: DemoMeta | null = null;
  let matchId: number | null = null;
  const ids = new Set<number>();

  const expected = options.expectedMatchId ?? null;
  const expectedId = readMatchId(expected);

  for (const item of flat) {
    if (isRecord(item.__demo)) {
      demo = item.__demo as unknown as DemoMeta;
    }
    const candidates: Raw[] = [];
    if (isRecord(item.api)) candidates.push(item.api);
    if (isRecord(item.parsed) && !Array.isArray(item.parsed)) candidates.push(item.parsed);
    if (!item.api && !item.parsed) candidates.push(item);

    for (const rawCandidate of candidates) {
      const candidate = unwrap(rawCandidate);
      const rawPlayers = Array.isArray(candidate.players) ? candidate.players : [];
      // null/мусор в списке игроков не должен приводить к TypeError:
      // сначала отфильтровываем, потом проверяем признаки.
      const players: Raw[] = rawPlayers.filter(isRecord);
      const id = readMatchId(candidate.match_id);

      if (id != null) {
        ids.add(id);
        if (matchId == null) matchId = id;
        if (id !== matchId) {
          throw new MatchDataError(
            'mismatch',
            `Данные относятся к разным матчам (#${matchId} и #${id}). Таймлайны и статистика разных матчей не склеиваются.`,
            matchId,
          );
        }
        if (expectedId != null && id !== expectedId) {
          throw new MatchDataError(
            'mismatch',
            `Данные относятся к матчу #${id}, а ожидался #${expectedId}.`,
            expectedId,
          );
        }
      }

      if (!rawPlayers.length) continue;
      const hasApi = players.some((p) => numOrNull(p.hero_id) != null);
      const hasParsed = players.some((p) => Array.isArray(p.gold_t) && p.gold_t.length > 1);
      if (hasApi && !api) api = candidate;
      if (hasParsed && !parsed) parsed = candidate;
    }
  }

  if (ids.size > 1) {
    const [first, second] = [...ids];
    throw new MatchDataError(
      'mismatch',
      `Данные относятся к разным матчам (#${first} и #${second}). Таймлайны и статистика разных матчей не склеиваются.`,
      first,
    );
  }

  if (expectedId != null && matchId != null && matchId !== expectedId) {
    throw new MatchDataError('mismatch', `Данные относятся к матчу #${matchId}, а ожидался #${expectedId}.`, expectedId);
  }

  if (!api && parsed) {
    const players: Raw[] = Array.isArray(parsed.players) ? (parsed.players.filter(isRecord) as Raw[]) : [];
    const hasHeroes = players.some((p) => numOrNull(p.hero_id) != null);
    if (!hasHeroes) {
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

  return { api, parsed, demo, matchId: matchId ?? readMatchId(api.match_id) };
}

function normalizeWards(value: unknown): WardPoint[] {
  const raw = readObjectArray(value, LIMITS.maxWardPoints);
  const points: WardPoint[] = [];
  for (const entry of raw) {
    const time = numOrNull(entry.time);
    const x = numOrNull(entry.x);
    const y = numOrNull(entry.y);
    if (time == null || x == null || y == null || time < 0) continue;
    points.push({ time, x, y });
  }
  return points.sort((a, b) => a.time - b.time);
}

function normalizePurchaseLog(value: unknown): PurchaseEntry[] {
  const raw = readObjectArray(value, LIMITS.maxLogEntries);
  const out: PurchaseEntry[] = [];
  for (const entry of raw) {
    const time = numOrNull(entry.time);
    const key = readText(entry.key, 64);
    if (time == null || !key) continue;
    out.push({ time, key, charges: readCountOrNull(entry.charges) ?? undefined });
  }
  return out.sort((a, b) => a.time - b.time);
}

function normalizeKillsLog(value: unknown): { time: number; key: string }[] {
  const raw = readObjectArray(value, LIMITS.maxLogEntries);
  const out: { time: number; key: string }[] = [];
  for (const entry of raw) {
    const time = numOrNull(entry.time);
    const key = readText(entry.key, 64);
    if (time == null || !key) continue;
    out.push({ time, key });
  }
  return out.sort((a, b) => a.time - b.time);
}

function normalizePlayer(apiPlayer: Raw, parsedPlayer: Raw | null, slot: number): Player {
  const source = parsedPlayer ?? apiPlayer;
  const pick = (key: string): unknown => (parsedPlayer && parsedPlayer[key] !== undefined ? parsedPlayer[key] : apiPlayer[key]);

  const items: number[] = [];
  for (let i = 0; i <= 5; i += 1) {
    const id = readCount(apiPlayer[`item_${i}`]);
    if (id > 0) items.push(id);
  }
  const backpack: number[] = [];
  for (let i = 0; i <= 2; i += 1) {
    const id = readCount(apiPlayer[`backpack_${i}`]);
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

  const gold = readCount(apiPlayer.gold, readCount(source.gold));
  const goldSpent = readCount(apiPlayer.gold_spent, readCount(source.gold_spent));
  const inventoryValue = [...items, ...backpack, readCount(apiPlayer.item_neutral)]
    .filter((id) => id > 0)
    .map((id) => ITEM_BY_ID[id]?.cost ?? 0)
    .reduce((a, b) => a + b, 0);
  let netWorth = readCountOrNull(apiPlayer.net_worth);
  if (netWorth == null) {
    netWorth = gold + inventoryValue;
    if (netWorth < goldSpent * 0.4) netWorth = goldSpent + gold;
  }

  const obsLog = normalizeWards(pick('obs_log'));
  const senLog = normalizeWards(pick('sen_log'));

  // «Нет данных» и «измеренный ноль» — разные вещи: отсутствующие поля парса
  // остаются null и не учитываются в оценках.
  const obsPlacedRaw = readCountOrNull(pick('obs_placed'));
  const senPlacedRaw = readCountOrNull(pick('sen_placed'));
  const obsPlaced = obsPlacedRaw ?? (obsLog.length ? obsLog.length : null);
  const senPlaced = senPlacedRaw ?? (senLog.length ? senLog.length : null);
  const runePickupsRaw = readCountOrNull(pick('rune_pickups'));
  const runesLog = pick('runes_log');
  const runePickups = runePickupsRaw ?? (Array.isArray(runesLog) ? runesLog.length : null);

  const rawLane = numOrNull(pick('lane'));
  const laneRole = numOrNull(pick('lane_role'));
  const parsedFlag = goldT.length > 1;

  const name = readText(apiPlayer.personaname) || readText(apiPlayer.name) || `Игрок ${(slot % 128) + 1}`;

  return {
    slot,
    isRadiant: slotSide(slot) === 'radiant',
    heroId: readCount(apiPlayer.hero_id),
    accountId: readCountOrNull(apiPlayer.account_id),
    name,
    kills: readCount(apiPlayer.kills),
    deaths: readCount(apiPlayer.deaths),
    assists: readCount(apiPlayer.assists),
    gpm: readCount(apiPlayer.gold_per_min),
    xpm: readCount(apiPlayer.xp_per_min),
    lastHits: readCount(apiPlayer.last_hits),
    denies: readCount(apiPlayer.denies),
    netWorth,
    level: readCount(apiPlayer.level),
    heroDamage: readCount(apiPlayer.hero_damage),
    towerDamage: readCount(apiPlayer.tower_damage),
    heroHealing: readCount(apiPlayer.hero_healing),
    gold,
    goldSpent,
    items,
    neutralItem: readCountOrNull(apiPlayer.item_neutral),
    backpack,
    laneRole,
    rawLane,
    laneEfficiency: numOrNull(pick('lane_efficiency_pct')),
    times,
    goldT,
    lhT,
    dnT,
    xpT,
    purchaseLog: normalizePurchaseLog(pick('purchase_log')),
    killsLog: normalizeKillsLog(pick('kills_log')),
    buybackLog: readObjectArray(pick('buyback_log'), LIMITS.maxLogEntries)
      .map((entry) => ({ time: num(entry.time) }))
      .filter((entry) => Number.isFinite(entry.time))
      .sort((a, b) => a.time - b.time),
    obsLog,
    senLog,
    lanePos: validateCoordMap(pick('lane_pos')),
    obsPlaced,
    senPlaced,
    campsStacked: readCountOrNull(pick('camps_stacked')),
    runePickups,
    roshansKilled: readCountOrNull(pick('roshans_killed')),
    stuns: readCountOrNull(pick('stuns')),
    maxHeroHit: readCountOrNull(pick('max_hero_hit')),
    multiKills: readRecord(pick('multi_kills')),
    killStreaks: readRecord(pick('kill_streaks')),
    itemUses: readRecord(pick('item_uses')),
    abilityUses: readRecord(pick('ability_uses')),
    teamfightParticipation: numOrNull(pick('teamfight_participation')),
    isParsed: parsedFlag,
  };
}

function parseBuildingKey(key: string): {
  kind: ObjectiveKind;
  target: Side;
  lane: 'top' | 'mid' | 'bot';
  tier?: number;
  title: string;
} | null {
  const match = key.match(/^(npc_dota_(good|bad)guys_(tower|rax|fort)\w*)(?:_(\d))?_?(top|mid|bot)?$/i);
  if (!match) return null;
  const [, , side, type, tier, lane] = match;
  const target: Side = side === 'good' ? 'radiant' : 'dire';
  const laneValue: 'top' | 'mid' | 'bot' = (lane as 'top' | 'mid' | 'bot') ?? 'mid';
  if (type === 'fort') {
    return { kind: 'fort', target, lane: laneValue, title: 'Казармы (T4)' };
  }
  if (type === 'rax') {
    return { kind: 'rax', target, lane: laneValue, title: `Казармы ${laneValue.toUpperCase()}` };
  }
  const tierNumber = tier ? Number(tier) : undefined;
  return {
    kind: 'tower',
    target,
    lane: laneValue,
    tier: tierNumber,
    title: tierNumber ? `Башня T${tierNumber}` : 'Башня',
  };
}

function parseObjectives(raw: unknown, playersBySlot: Map<number, Player>, duration: number): Objective[] {
  const rawList = readObjectArray(raw, LIMITS.maxLogEntries);
  const objectives: Objective[] = [];
  const maxTime = duration + 60;
  for (const entry of rawList) {
    const time = numOrNull(entry.time);
    if (time == null || !Number.isFinite(time) || time < 0 || time > maxTime) continue;
    const type = readText(entry.type, 64);
    const slot = readSlot(entry.player_slot) ?? readSlot(entry.slot);
    const player = slot != null ? playersBySlot.get(slot) : undefined;
    const heroId = player?.heroId ?? null;

    if (type === 'building_kill') {
      const parsed = parseBuildingKey(readText(entry.key, 64));
      if (!parsed) continue;
      const laneRu = parsed.lane === 'top' ? 'топ' : parsed.lane === 'mid' ? 'мид' : 'бот';
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

function parseTeamfights(raw: unknown, duration: number): Teamfight[] {
  const rawList = readObjectArray(raw, LIMITS.maxTeamfights);
  const fights: Teamfight[] = [];
  for (const entry of rawList) {
    const rawPlayers = readObjectArray(entry.players, LIMITS.maxPlayers);
    const start = readCount(entry.start);
    const end = readCount(entry.end, start);
    if (!Number.isFinite(start) || start < 0 || start > duration + 60) continue;
    const players: TeamfightPlayer[] = rawPlayers.slice(0, LIMITS.maxPlayers).map((p) => {
      const deathsPosRaw = validateCoordMap(p.deaths_pos) ?? {};
      const deathsPos: { x: number; y: number }[] = [];
      for (const [x, row] of Object.entries(deathsPosRaw)) {
        for (const [y, count] of Object.entries(row)) {
          const times = Math.max(1, Math.min(4, readCount(count, 1)));
          for (let i = 0; i < times; i += 1) {
            deathsPos.push({ x: Number(x), y: Number(y) });
          }
        }
      }
      return {
        damage: readCount(p.damage),
        healing: readCount(p.healing),
        goldDelta: readCount(p.gold_delta),
        xpDelta: readCount(p.xp_delta),
        deaths: readCount(p.deaths),
        deathsPos,
      };
    });
    // Порядок игроков в драке совпадает с порядком слотов (0–4 Radiant, 128–132 Dire).
    while (players.length < LIMITS.maxPlayers) {
      players.push({ damage: 0, healing: 0, goldDelta: 0, xpDelta: 0, deaths: 0, deathsPos: [] });
    }
    const radiantGold = players.slice(0, 5).reduce((acc, p) => acc + p.goldDelta, 0);
    const direGold = players.slice(5, 10).reduce((acc, p) => acc + p.goldDelta, 0);
    const winner: Side | 'even' =
      Math.abs(radiantGold - direGold) < 250 ? 'even' : radiantGold > direGold ? 'radiant' : 'dire';
    fights.push({
      start,
      end: Math.max(start, end),
      deaths: readCount(entry.deaths),
      players,
      radiantGold,
      direGold,
      winner,
      totalDamage: players.reduce((acc, p) => acc + p.damage, 0),
    });
  }
  return fights.sort((a, b) => a.start - b.start);
}

/**
 * Считает преимущество по минутам из таймлайнов.
 * Длина ряда ограничена покрытием данных: за пределами таймлайна значений нет.
 */
function deriveAdvantage(players: Player[], duration: number, field: 'goldT' | 'xpT'): number[] {
  const timed = players.filter((p) => p.times.length && p[field].length);
  if (!timed.length) return [];
  const maxCovered = Math.max(...timed.map((p) => Math.min(p.times.length, p[field].length)));
  const length = Math.min(Math.floor(duration / 60) + 1, maxCovered);
  if (length <= 0) return [];
  const out: number[] = [];
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
  const rawList = readObjectArray(raw, LIMITS.maxPicksBans);
  if (rawList.length) {
    return rawList.map((entry, index) => ({
      heroId: readCount(entry.hero_id),
      isPick: Boolean(entry.is_pick),
      team: readCount(entry.team),
      order: readCount(entry.order, index),
    }));
  }
  return players.map((player, index) => ({
    heroId: player.heroId,
    isPick: true,
    team: player.isRadiant ? 0 : 1,
    order: index,
  }));
}

export interface NormalizeOptions extends ExtractOptions {
  /** Пропустить проверку ожидаемого ID (используется только в тестах совместимости). */
  ignoreExpectedId?: boolean;
}

export function normalizeMatch(inputs: unknown[], options: NormalizeOptions = {}): Match {
  const { api, parsed, demo } = extractInputs(inputs, options);
  if (!api) throw new MatchDataError('invalid', 'Не найден матч.');

  const matchId = readMatchId(api.match_id) ?? readMatchId(parsed?.match_id);
  if (matchId == null) throw new MatchDataError('invalid', 'В данных нет корректного ID матча.');

  const apiPlayers = validatePlayers(api.players, matchId);
  const expectedId = options.ignoreExpectedId ? null : (options.expectedMatchId ?? null);
  if (expectedId != null && matchId !== expectedId) {
    throw new MatchDataError('mismatch', `Данные относятся к матчу #${matchId}, а ожидался #${expectedId}.`, expectedId);
  }

  const parsedPlayersRaw = parsed && Array.isArray(parsed.players) ? readObjectArray(parsed.players, LIMITS.maxPlayers) : [];
  const parsedBySlot = new Map<number, Raw>();
  for (const p of parsedPlayersRaw) {
    const slot = readSlot(p.player_slot);
    // Повторение слота в парсе — признак повреждённых данных: отклоняем весь источник.
    if (slot == null || parsedBySlot.has(slot)) {
      throw new MatchDataError('invalid', 'В данных парса игроки повторяются или слоты повреждены.', matchId);
    }
    parsedBySlot.set(slot, p);
  }

  const duration = readDuration(api.duration) ?? readDuration(parsed?.duration);
  if (duration == null) {
    throw new MatchDataError('invalid', 'В данных нет корректной длительности матча.', matchId);
  }

  const sortedApi = [...apiPlayers.players].sort((a, b) => readCount(a.player_slot) - readCount(b.player_slot));
  const players = sortedApi.map((apiPlayer) => {
    const slot = readSlot(apiPlayer.player_slot) ?? 0;
    return normalizePlayer(apiPlayer, parsedBySlot.get(slot) ?? null, slot);
  });
  const playersBySlot = new Map(players.map((p) => [p.slot, p]));

  const parsedFlag = players.some((p) => p.isParsed);

  let goldAdv = arrayOfNumbers(parsed?.radiant_gold_adv ?? api.radiant_gold_adv);
  let xpAdv = arrayOfNumbers(parsed?.radiant_xp_adv ?? api.radiant_xp_adv);
  if (!goldAdv.length || goldAdv.every((v) => v === 0)) {
    goldAdv = deriveAdvantage(players, duration, 'goldT');
  }
  if (!xpAdv.length || xpAdv.every((v) => v === 0)) {
    xpAdv = deriveAdvantage(players, duration, 'xpT');
  }

  const rawObjectives = parsed?.objectives !== undefined ? parsed.objectives : api.objectives;
  const teamfights = parseTeamfights(parsed?.teamfights ?? api.teamfights, duration);
  const objectives = parseObjectives(rawObjectives, playersBySlot, duration);
  const picksBans = parsePicksBans(api.picks_bans ?? parsed?.picks_bans, players);

  const radiantKills = players.filter((p) => p.isRadiant).reduce((a, p) => a + p.kills, 0);
  const direKills = players.filter((p) => !p.isRadiant).reduce((a, p) => a + p.kills, 0);

  const coverage: MatchCoverage = {
    timelines: players.some((p) => p.times.length > 1 && p.goldT.length > 1),
    wards: parsed != null && players.some((p) => p.obsPlaced != null || p.senPlaced != null),
    fights: teamfights.length > 0,
    objectives: Array.isArray(rawObjectives),
    purchases: players.some((p) => p.purchaseLog.length > 0),
  };

  const warnings: string[] = [];
  if (!coverage.timelines) {
    warnings.push('Матч не распарсен: таймлайны, варды и драки недоступны. Загрузи JSON парса для полного разбора.');
  }
  if (!players.some((player) => player.laneRole != null || player.lanePos)) {
    warnings.push('Нет разбивки по линиям: позиции определены по объёму фарма, линия не отображается.');
  }
  if (!coverage.fights) {
    warnings.push('Нет данных о командных драках — часть выводов скрыта.');
  }
  if (!coverage.objectives) {
    warnings.push('Нет списка событий матча: Рошан, башни и первая кровь не отображаются.');
  }

  return {
    id: matchId,
    startTime: readCount(api.start_time) || readCount(parsed?.start_time),
    duration,
    radiantWin: Boolean(api.radiant_win ?? parsed?.radiant_win),
    gameMode: readCount(api.game_mode),
    lobbyType: readCount(api.lobby_type, 7),
    region: numOrNull(api.region),
    radiantScore: readCountOrNull(api.radiant_score) ?? radiantKills,
    direScore: readCountOrNull(api.dire_score) ?? direKills,
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
    hasTimelines: coverage.timelines,
    coverage,
    demo,
    warnings,
  };
}

interface ImportFile {
  name?: string;
  size?: number;
  text?: () => Promise<string>;
}

/**
 * Читает JSON из выбранных файлов.
 * Размер проверяется до чтения, чтобы огромный файл не блокировал интерфейс.
 */
export async function readJsonFiles(files: ArrayLike<ImportFile> | null | undefined): Promise<unknown[]> {
  const list: ImportFile[] = [];
  const length = files?.length ?? 0;
  for (let i = 0; i < length; i += 1) {
    const file = (files as ArrayLike<ImportFile>)[i];
    if (file) list.push(file);
  }
  if (!list.length) throw new MatchDataError('empty', 'Файлы не выбраны.');

  let total = 0;
  for (const file of list) {
    checkFileSize(file, total);
    total += typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : 0;
  }
  if (total > LIMITS.maxTotalBytes) {
    throw new MatchDataError(
      'invalid',
      `Слишком много данных за раз (лимит — ${Math.round(LIMITS.maxTotalBytes / 1024 / 1024)} МБ).`,
    );
  }

  const outputs: unknown[] = [];
  for (const file of list) {
    const name = file.name ?? 'файл';
    let text: string;
    try {
      text = typeof file.text === 'function' ? await file.text() : '';
    } catch {
      throw new MatchDataError('invalid', `Файл «${name}» не удалось прочитать.`);
    }
    if (!text) throw new MatchDataError('invalid', `Файл «${name}» пустой.`);
    try {
      outputs.push(JSON.parse(text));
    } catch {
      throw new MatchDataError('invalid', `Файл «${name}» не похож на JSON.`);
    }
  }
  return outputs;
}

export function matchTitle(match: Match): string {
  if (match.demo) return match.demo.title;
  return `Матч ${match.id}`;
}

export { SIDE_LABEL };
