import { HERO_BY_ID, HERO_BY_NAME, ITEM_BY_KEY, LANE_LABEL, ROLE_LABEL } from './constants';
import { clamp, sum } from './format';
import type {
  Dimension,
  FightParticipation,
  FightSummary,
  GpmWindow,
  HeroInfo,
  ItemTiming,
  Match,
  MatchAnalysis,
  Player,
  PlayerAnalysis,
  PlayerMetrics,
  Side,
  TeamSummary,
  TurningPoint,
  WardPoint,
} from '../types';

const DIMENSIONS: Dimension[] = ['farm', 'damage', 'survival', 'vision', 'fights', 'objectives'];

export const ROLE_WEIGHTS: Record<number, Record<Dimension, number>> = {
  1: { farm: 0.24, damage: 0.18, survival: 0.2, vision: 0.05, fights: 0.18, objectives: 0.15 },
  2: { farm: 0.22, damage: 0.24, survival: 0.16, vision: 0.06, fights: 0.19, objectives: 0.13 },
  3: { farm: 0.16, damage: 0.19, survival: 0.2, vision: 0.08, fights: 0.22, objectives: 0.15 },
  4: { farm: 0.1, damage: 0.17, survival: 0.15, vision: 0.26, fights: 0.22, objectives: 0.1 },
  5: { farm: 0.08, damage: 0.14, survival: 0.15, vision: 0.31, fights: 0.22, objectives: 0.1 },
};

const GOALS = {
  gpm: { 1: 620, 2: 580, 3: 460, 4: 340, 5: 290 },
  lh10: { 1: 55, 2: 50, 3: 38, 4: 12, 5: 8 },
  lh20: { 1: 150, 2: 135, 3: 100, 4: 28, 5: 18 },
  lhPerMin: { 1: 6, 2: 5.5, 3: 4.6, 4: 1.8, 5: 1.2 },
  deathsPer10: { 1: 1.0, 2: 1.2, 3: 1.4, 4: 1.5, 5: 1.6 },
  damagePerMin: { 1: 620, 2: 760, 3: 520, 4: 400, 5: 320 },
  damageShare: { 1: 0.25, 2: 0.28, 3: 0.22, 4: 0.16, 5: 0.12 },
  wardsPer10: { 1: 0.45, 2: 0.6, 3: 0.8, 4: 1.7, 5: 2.3 },
  senPer10: { 1: 0.1, 2: 0.15, 3: 0.25, 4: 0.7, 5: 1.0 },
  participation: { 1: 0.55, 2: 0.65, 3: 0.62, 4: 0.66, 5: 0.66 },
  towerPerMin: { 1: 150, 2: 80, 3: 90, 4: 30, 5: 20 },
  roshan: { 1: 0.7, 2: 0.6, 3: 0.5, 4: 0.35, 5: 0.3 },
  stacks: { 1: 1, 2: 1, 3: 2, 4: 4, 5: 4 },
  runes: { 1: 5, 2: 7, 3: 5, 4: 6, 5: 5 },
};

type Lane = 'safe' | 'mid' | 'off' | 'jungle' | 'unknown';

function ratioScore(actual: number | null, goal: number, lowerIsBetter = false): number | null {
  if (actual == null || !Number.isFinite(actual) || goal <= 0) return null;
  const ratio = lowerIsBetter ? goal / Math.max(actual, 0.001) : actual / goal;
  return clamp(Math.round((ratio / 1.25) * 100), 0, 100);
}

function weighted(scores: { score: number | null; weight: number }[]): number | null {
  const available = scores.filter((item) => item.score != null && item.weight > 0);
  if (!available.length) return null;
  const totalWeight = available.reduce((acc, item) => acc + item.weight, 0);
  const value = available.reduce((acc, item) => acc + (item.score as number) * item.weight, 0) / totalWeight;
  return Math.round(clamp(value));
}

function gradeOf(score: number | null): string {
  if (score == null) return '—';
  if (score >= 88) return 'S';
  if (score >= 78) return 'A';
  if (score >= 68) return 'B';
  if (score >= 58) return 'C';
  if (score >= 48) return 'D';
  return 'E';
}

function valueAt(times: number[], values: number[], t: number): number | null {
  if (!values.length) return null;
  if (!times.length) {
    const index = clamp(Math.floor(t / 60), 0, values.length - 1);
    return values[index] ?? null;
  }
  if (t < times[0]) return 0;
  let index = -1;
  for (let i = 0; i < times.length; i += 1) {
    if (times[i] <= t) index = i;
    else break;
  }
  if (index < 0) return 0;
  return values[Math.min(index, values.length - 1)] ?? null;
}

function laneCentroid(lanePos: Record<string, Record<string, number>> | null): { x: number; y: number } | null {
  if (!lanePos) return null;
  let total = 0;
  let sx = 0;
  let sy = 0;
  for (const [x, row] of Object.entries(lanePos)) {
    if (!row || typeof row !== 'object') continue;
    for (const [y, count] of Object.entries(row)) {
      const c = Number(count);
      if (!Number.isFinite(c) || c <= 0) continue;
      total += c;
      sx += Number(x) * c;
      sy += Number(y) * c;
    }
  }
  if (!total) return null;
  return { x: sx / total, y: sy / total };
}

function detectLane(player: Player): { lane: Lane; rawLane: number | null } {
  if (player.laneRole === 1) return { lane: 'safe', rawLane: player.rawLane };
  if (player.laneRole === 2) return { lane: 'mid', rawLane: player.rawLane };
  if (player.laneRole === 3) return { lane: 'off', rawLane: player.rawLane };
  if (player.laneRole === 4) return { lane: 'jungle', rawLane: player.rawLane };

  const centroid = laneCentroid(player.lanePos);
  if (centroid) {
    if (Math.abs(centroid.x - centroid.y) < 26) return { lane: 'mid', rawLane: 2 };
    const top = centroid.y > centroid.x;
    if (player.isRadiant) return { lane: top ? 'off' : 'safe', rawLane: top ? 3 : 1 };
    return { lane: top ? 'safe' : 'off', rawLane: top ? 1 : 3 };
  }
  if (player.rawLane === 2) return { lane: 'mid', rawLane: 2 };
  if (player.rawLane === 1) {
    if (player.isRadiant) return { lane: 'safe', rawLane: 1 };
    return { lane: 'off', rawLane: 1 };
  }
  if (player.rawLane === 3) {
    if (player.isRadiant) return { lane: 'off', rawLane: 3 };
    return { lane: 'safe', rawLane: 3 };
  }
  return { lane: 'unknown', rawLane: null };
}

function laneToLabel(lane: Lane, rawLane: number | null, isRadiant: boolean): 'top' | 'mid' | 'bot' | 'jungle' | 'unknown' {
  if (lane === 'mid') return 'mid';
  if (lane === 'jungle') return 'jungle';
  if (lane === 'safe') return isRadiant ? 'bot' : 'top';
  if (lane === 'off') return isRadiant ? 'top' : 'bot';
  if (rawLane === 3) return 'top';
  if (rawLane === 1) return 'bot';
  return 'unknown';
}

function farmWeight(player: Player): number {
  return player.lastHits + player.gpm / 3 + player.netWorth / 2000;
}

function assignRoles(players: Player[]): Map<number, number> {
  const lanes = new Map<number, { lane: Lane; rawLane: number | null }>();
  for (const player of players) lanes.set(player.slot, detectLane(player));

  const roleMap = new Map<number, number>();
  const used = new Set<number>();
  const byFarm = [...players].sort((a, b) => farmWeight(b) - farmWeight(a));
  const laneOf = (player: Player) => lanes.get(player.slot)?.lane ?? 'unknown';

  // Источники без парса (например, Valve) не отдают линии — тогда позиции
  // определяем по объёму фарма: самый богатый игрок команды = P1, дальше по убыванию.
  const hasLaneData = players.some((player) => laneOf(player) !== 'unknown');
  if (!hasLaneData) {
    byFarm.forEach((player, index) => {
      roleMap.set(player.slot, Math.min(5, index + 1));
    });
    return roleMap;
  }

  const assign = (player: Player | undefined, role: number) => {
    if (!player || used.has(player.slot) || roleMap.has(player.slot)) return;
    const taken = [...roleMap.values()];
    if (taken.includes(role)) return;
    roleMap.set(player.slot, role);
    used.add(player.slot);
  };

  const mids = byFarm.filter((p) => laneOf(p) === 'mid');
  if (mids.length) assign(mids[0], 2);

  const safes = byFarm.filter((p) => laneOf(p) === 'safe');
  if (safes.length) assign(safes[0], 1);

  const offs = byFarm.filter((p) => laneOf(p) === 'off');
  if (offs.length) assign(offs[0], 3);

  const safeSupports = byFarm.filter((p) => laneOf(p) === 'safe' && !used.has(p.slot));
  if (safeSupports.length) assign(safeSupports[safeSupports.length - 1], 5);

  const offSupports = byFarm.filter((p) => laneOf(p) === 'off' && !used.has(p.slot));
  if (offSupports.length) assign(offSupports[offSupports.length - 1], 4);

  const junglers = byFarm.filter((p) => laneOf(p) === 'jungle' && !used.has(p.slot));
  for (const jungler of junglers) {
    const emptyCore = [3, 1].find((role) => ![...roleMap.values()].includes(role));
    const emptySupport = [4, 5].find((role) => ![...roleMap.values()].includes(role));
    const highFarm = farmWeight(jungler) >= (byFarm[2] ? farmWeight(byFarm[2]) * 0.75 : 0);
    if (highFarm && emptyCore) assign(jungler, emptyCore);
    else if (emptySupport) assign(jungler, emptySupport);
  }

  for (const role of [1, 3, 2, 4, 5]) {
    if ([...roleMap.values()].includes(role)) continue;
    const candidate = byFarm.find((p) => !used.has(p.slot));
    if (candidate) assign(candidate, role);
  }
  for (const player of byFarm) {
    if (roleMap.has(player.slot)) continue;
    const empty = [5, 4, 3, 2, 1].find((role) => ![...roleMap.values()].includes(role));
    if (empty) assign(player, empty);
  }

  return roleMap;
}

function computeItemTimings(player: Player): ItemTiming[] {
  const seen = new Set<string>();
  const timings: ItemTiming[] = [];
  for (const entry of player.purchaseLog) {
    if (entry.time < 0) continue;
    if (entry.key.startsWith('recipe_')) continue;
    const info = ITEM_BY_KEY[entry.key];
    if (!info) continue;
    if (info.cost < 1500) continue;
    if (info.qual === 'secret_shop' || info.qual === 'consumable') continue;
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    timings.push({ time: entry.time, key: entry.key, info });
  }
  return timings.sort((a, b) => a.time - b.time).slice(0, 14);
}

function computeGpmWindows(player: Player, durationMin: number): GpmWindow[] {
  if (!player.times.length || !player.goldT.length) return [];
  const bounds: { label: string; from: number; to: number }[] = [
    { label: '0–10', from: 0, to: 10 },
    { label: '10–20', from: 10, to: 20 },
    { label: '20–30', from: 20, to: 30 },
    { label: '30+', from: 30, to: Math.max(31, durationMin) },
  ];
  const windows: GpmWindow[] = [];
  for (const bound of bounds) {
    if (bound.from >= durationMin) continue;
    const to = Math.min(bound.to, durationMin);
    const startGold = valueAt(player.times, player.goldT, bound.from * 60) ?? 0;
    const endGold = valueAt(player.times, player.goldT, to * 60) ?? startGold;
    const minutes = Math.max(1, to - bound.from);
    windows.push({ label: bound.label, from: bound.from, to, gpm: Math.round((endGold - startGold) / minutes) });
  }
  return windows;
}

interface DeathInfo {
  times: number[];
  causes: string[];
}

function collectDeaths(match: Match, player: Player): DeathInfo {
  const hero = HERO_BY_ID[player.heroId];
  if (!hero) return { times: [], causes: [] };
  const times: number[] = [];
  for (const other of match.players) {
    for (const kill of other.killsLog) {
      if (kill.key === hero.name && kill.time >= 0) times.push(kill.time);
    }
  }
  times.sort((a, b) => a - b);
  return { times, causes: [] };
}

function buildFights(match: Match, playerIndex: number, player: Player): FightParticipation[] {
  return match.teamfights.map((fight, index) => {
    const fp = fight.players[playerIndex];
    const teamDamage = sum(
      fight.players.filter((_, idx) => match.players[idx]?.isRadiant === player.isRadiant).map((p) => p.damage),
    );
    const teamDeaths = sum(
      fight.players.filter((_, idx) => match.players[idx]?.isRadiant === player.isRadiant).map((p) => p.deaths),
    );
    const damage = fp?.damage ?? 0;
    const healing = fp?.healing ?? 0;
    const deaths = fp?.deaths ?? 0;
    const participated = damage > 0 || healing > 0 || deaths > 0 || (fp?.goldDelta ?? 0) > 120;
    const playerTeamWon = fight.winner === 'even' ? null : (fight.winner === 'radiant') === player.isRadiant;
    return {
      index,
      start: fight.start,
      end: fight.end,
      damage,
      damageShare: teamDamage > 0 ? damage / teamDamage : 0,
      goldDelta: fp?.goldDelta ?? 0,
      xpDelta: fp?.xpDelta ?? 0,
      deaths,
      teamDamage,
      teamDeaths,
      participated,
      winner: fight.winner,
      playerTeamWon,
    };
  });
}

function analyzePlayer(match: Match, player: Player, index: number, role: number): PlayerAnalysis {
  const hero = HERO_BY_ID[player.heroId] ?? null;
  const durationMin = Math.max(1, match.duration / 60);
  const teamPlayers = match.players.filter((p) => p.isRadiant === player.isRadiant);
  const teamKills = sum(teamPlayers.map((p) => p.kills));
  const teamDamage = sum(teamPlayers.map((p) => p.heroDamage));
  const teamNetWorth = sum(teamPlayers.map((p) => p.netWorth));
  const teamTowerDamage = sum(teamPlayers.map((p) => p.towerDamage));

  const timelineAvailable = player.times.length > 0 && player.goldT.length > 1;
  const lh10 = timelineAvailable ? valueAt(player.times, player.lhT, 600) : null;
  const lh20 = timelineAvailable ? valueAt(player.times, player.lhT, 1200) : null;
  const gold10 = timelineAvailable ? valueAt(player.times, player.goldT, 600) : null;
  const gold20 = timelineAvailable ? valueAt(player.times, player.goldT, 1200) : null;
  const xp10 = timelineAvailable ? valueAt(player.times, player.xpT, 600) : null;

  const deaths = collectDeaths(match, player);
  const earlyDeaths = deaths.times.filter((time) => time < 600).length;
  const fights = buildFights(match, index, player);
  const fightCount = fights.length;
  const playedFights = fights.filter((f) => f.participated);
  const missedFights = fights.filter((f) => !f.participated && f.teamDamage > 0).length;
  const fightDamageShare =
    sum(playedFights.map((f) => f.damage)) / Math.max(1, sum(fights.map((f) => f.teamDamage)));
  const fightInvolvement = fightCount ? playedFights.length / fightCount : 0;
  const killParticipation = teamKills > 0 ? Math.min(1, (player.kills + player.assists) / teamKills) : 0;

  const obsPlaced = player.obsPlaced || player.obsLog.length;
  const senPlaced = player.senPlaced || player.senLog.length;
  const wardsPer10 = ((obsPlaced + senPlaced * 0.65) / durationMin) * 10;
  const senPer10 = (senPlaced / durationMin) * 10;

  const metrics: PlayerMetrics = {
    durationMin,
    gpm: player.gpm,
    xpm: player.xpm,
    lh10,
    lh20,
    lhPerMin: player.lastHits / durationMin,
    gold10,
    gold20,
    xp10,
    deathsPer10: (player.deaths / durationMin) * 10,
    killParticipation,
    fightInvolvement,
    fightDamageShare,
    damagePerMin: player.heroDamage / durationMin,
    damageShare: teamDamage > 0 ? player.heroDamage / teamDamage : 0,
    healingPerMin: player.heroHealing / durationMin,
    towerDamagePerMin: player.towerDamage / durationMin,
    netWorthShare: teamNetWorth > 0 ? player.netWorth / teamNetWorth : 0,
    wardsPer10,
    senPer10,
    obsPlaced,
    senPlaced,
    wardsScore: 0,
    campsStacked: player.campsStacked,
    runePickups: player.runePickups,
    earlyDeaths,
    deathTimes: deaths.times,
    missedFights,
    fightCount,
    fightDeaths: sum(fights.map((f) => f.deaths)),
    buybacks: player.buybackLog.length,
    roshansKilled: player.roshansKilled,
    stuns: player.stuns,
    gpmWindows: computeGpmWindows(player, durationMin),
    firstDeath: deaths.times.length ? deaths.times[0] : null,
  };

  const isCore = role <= 3;
  const parsedData = player.isParsed;
  const farmComps = isCore
    ? [
        { score: ratioScore(metrics.lh10, GOALS.lh10[role as 1 | 2 | 3]), weight: 0.32 },
        { score: ratioScore(metrics.lh20, GOALS.lh20[role as 1 | 2 | 3]), weight: 0.18 },
        { score: ratioScore(metrics.lhPerMin, GOALS.lhPerMin[role as 1 | 2 | 3]), weight: 0.2 },
        { score: ratioScore(metrics.gpm, GOALS.gpm[role as 1 | 2 | 3]), weight: 0.3 },
      ]
    : parsedData
      ? [
          { score: ratioScore(metrics.gpm, GOALS.gpm[role as 4 | 5]), weight: 0.5 },
          { score: ratioScore(metrics.campsStacked, GOALS.stacks[role as 4 | 5]), weight: 0.25 },
          { score: ratioScore(metrics.runePickups, GOALS.runes[role as 4 | 5]), weight: 0.25 },
        ]
      : [{ score: ratioScore(metrics.gpm, GOALS.gpm[role as 4 | 5]), weight: 1 }];

  const damageComps = [
    { score: ratioScore(metrics.damagePerMin, GOALS.damagePerMin[role as 1 | 2 | 3 | 4 | 5]), weight: 0.7 },
    { score: ratioScore(metrics.damageShare, GOALS.damageShare[role as 1 | 2 | 3 | 4 | 5]), weight: 0.3 },
  ];
  if (!isCore) {
    damageComps.push({ score: ratioScore(metrics.healingPerMin, 30), weight: 0.15 });
  }

  const survivalBase = ratioScore(metrics.deathsPer10, GOALS.deathsPer10[role as 1 | 2 | 3 | 4 | 5], true);
  const survivalScore =
    survivalBase == null ? null : clamp(Math.round(survivalBase - Math.min(28, earlyDeaths * 7)));

  const visionComps = [
    { score: ratioScore(metrics.wardsPer10, GOALS.wardsPer10[role as 1 | 2 | 3 | 4 | 5]), weight: 0.72 },
    { score: ratioScore(metrics.senPer10, GOALS.senPer10[role as 1 | 2 | 3 | 4 | 5]), weight: 0.28 },
  ];

  const fightsComps = [
    { score: ratioScore(metrics.killParticipation, GOALS.participation[role as 1 | 2 | 3 | 4 | 5]), weight: 0.45 },
    { score: ratioScore(metrics.fightInvolvement, 0.68), weight: 0.28 },
    { score: ratioScore(metrics.fightDamageShare, 0.18), weight: 0.27 },
  ];
  if (fightCount === 0) {
    fightsComps.length = 1;
  }

  const roshanGoal = Math.max(0.3, (GOALS.roshan[role as 1 | 2 | 3 | 4 | 5] * durationMin) / 40);
  const objectivesComps = [
    { score: ratioScore(metrics.towerDamagePerMin, GOALS.towerPerMin[role as 1 | 2 | 3 | 4 | 5]), weight: 0.7 },
    { score: ratioScore(metrics.roshansKilled, roshanGoal), weight: 0.3 },
  ];

  const scores: Record<Dimension, number | null> = {
    farm: weighted(farmComps),
    damage: weighted(damageComps),
    survival: survivalScore,
    vision: parsedData ? weighted(visionComps) : null,
    fights: weighted(fightsComps),
    objectives: weighted(objectivesComps),
  };
  metrics.wardsScore = scores.vision ?? 0;

  const weights = ROLE_WEIGHTS[role] ?? ROLE_WEIGHTS[1];
  const overallComps = DIMENSIONS.map((key) => ({ score: scores[key], weight: weights[key] }));
  const overall = weighted(overallComps);

  const laneInfo = detectLane(player);
  const lane = laneToLabel(laneInfo.lane, laneInfo.rawLane, player.isRadiant);

  const itemTimings = computeItemTimings(player);
  const bkb = player.purchaseLog.find((entry) => entry.key === 'black_king_bar' && entry.time >= 0);
  const blink = player.purchaseLog.find((entry) => entry.key === 'blink' && entry.time >= 0);

  const wardPoints: (WardPoint & { kind: 'obs' | 'sen' })[] = [
    ...player.obsLog.map((point) => ({ ...point, kind: 'obs' as const })),
    ...player.senLog.map((point) => ({ ...point, kind: 'sen' as const })),
  ].sort((a, b) => a.time - b.time);
  const deathPoints = match.teamfights.flatMap((fight) =>
    (fight.players[index]?.deathsPos ?? []).map((point) => ({ ...point, time: fight.start })),
  );

  const all = match.players;
  const ranks: Record<string, number> = {
    gpm: rankOf(player.gpm, all.map((p) => p.gpm)),
    damage: rankOf(player.heroDamage, all.map((p) => p.heroDamage)),
    netWorth: rankOf(player.netWorth, all.map((p) => p.netWorth)),
    lastHits: rankOf(player.lastHits, all.map((p) => p.lastHits)),
    kills: rankOf(player.kills, all.map((p) => p.kills)),
    deaths: rankOf(player.deaths, all.map((p) => p.deaths), false),
    assists: rankOf(player.assists, all.map((p) => p.assists)),
    wards: rankOf(obsPlaced + senPlaced, all.map((p) => (p.obsPlaced || 0) + (p.senPlaced || 0))),
    towerDamage: rankOf(player.towerDamage, all.map((p) => p.towerDamage)),
  };

  return {
    player,
    hero,
    role,
    roleLabel: ROLE_LABEL[role] ?? 'Игрок',
    lane,
    laneLabel: LANE_LABEL[lane] ?? 'Неизвестно',
    scores,
    overall,
    grade: gradeOf(overall),
    metrics,
    wardPoints,
    deathPoints,
    itemTimings,
    fights,
    ranks,
    bkbTiming: bkb ? bkb.time : null,
    blinkTiming: blink ? blink.time : null,
    hasTimeline: timelineAvailable,
  };
}

function rankOf(value: number, values: number[], higherIsBetter = true): number {
  const sorted = [...values].sort((a, b) => (higherIsBetter ? b - a : a - b));
  return sorted.findIndex((item) => item === value) + 1;
}

function buildTeamSummary(
  match: Match,
  side: Side,
  players: PlayerAnalysis[],
): TeamSummary {
  const roster = players.filter((p) => p.player.isRadiant === (side === 'radiant')).map((p) => p.player);
  const objectives = match.objectives;
  const towers = objectives.filter((o) => o.kind === 'tower' && o.team === side).length;
  const roshans = objectives.filter((o) => o.kind === 'roshan' && o.team === side).length;
  const fightsWon = match.teamfights.filter((f) => f.winner === side).length;
  const scoreValues = players
    .filter((p) => p.player.isRadiant === (side === 'radiant'))
    .map((p) => p.overall)
    .filter((v): v is number => v != null);
  return {
    side,
    kills: roster.reduce((acc, p) => acc + p.kills, 0),
    deaths: roster.reduce((acc, p) => acc + p.deaths, 0),
    assists: roster.reduce((acc, p) => acc + p.assists, 0),
    netWorth: roster.reduce((acc, p) => acc + p.netWorth, 0),
    heroDamage: roster.reduce((acc, p) => acc + p.heroDamage, 0),
    towers,
    roshans,
    fightsWon,
    wards: roster.reduce((acc, p) => acc + (p.obsPlaced || 0) + (p.senPlaced || 0), 0),
    gpm: roster.length ? Math.round(roster.reduce((acc, p) => acc + p.gpm, 0) / roster.length) : 0,
    avgScore: scoreValues.length
      ? Math.round(scoreValues.reduce((acc, v) => acc + v, 0) / scoreValues.length)
      : null,
  };
}

export function analyzeMatch(match: Match): MatchAnalysis {
  const radiantRoles = assignRoles(match.players.filter((p) => p.isRadiant));
  const direRoles = assignRoles(match.players.filter((p) => !p.isRadiant));
  const roleBySlot = new Map<number, number>();
  for (const [slot, role] of radiantRoles) roleBySlot.set(slot, role);
  for (const [slot, role] of direRoles) roleBySlot.set(slot, role);

  const players = match.players.map((player, index) =>
    analyzePlayer(match, player, index, roleBySlot.get(player.slot) ?? 1),
  );
  const bySlot: Record<number, PlayerAnalysis> = {};
  for (const analysis of players) bySlot[analysis.player.slot] = analysis;

  const teams = {
    radiant: buildTeamSummary(match, 'radiant', players),
    dire: buildTeamSummary(match, 'dire', players),
  };

  const fights: FightSummary[] = match.teamfights.map((fight, index) => ({
    ...fight,
    index,
    key: fight.deaths >= 3 || Math.abs(fight.radiantGold - fight.direGold) >= 1500,
    playerTeams: fight.winner,
  }));

  let turningPoint: TurningPoint | null = null;
  if (match.goldAdv.length > 3) {
    let bestIndex = -1;
    let bestDelta = 0;
    for (let i = 2; i < match.goldAdv.length; i += 1) {
      const delta = match.goldAdv[i] - match.goldAdv[i - 1];
      if (Math.abs(delta) > Math.abs(bestDelta)) {
        bestDelta = delta;
        bestIndex = i;
      }
    }
    if (bestIndex > 0 && Math.abs(bestDelta) > 800) {
      const side: Side = bestDelta > 0 ? 'radiant' : 'dire';
      const fight =
        fights.find((f) => Math.abs(f.start / 60 - bestIndex) <= 1.5 && f.key) ??
        fights.find((f) => Math.abs(f.start / 60 - bestIndex) <= 2) ??
        null;
      turningPoint = {
        minute: bestIndex,
        delta: bestDelta,
        before: match.goldAdv[bestIndex - 1],
        after: match.goldAdv[bestIndex],
        side,
        fight,
        text: `${side === 'radiant' ? 'Radiant' : 'Dire'} сделал рывок на ${Math.round(
          Math.abs(bestDelta) / 100) / 10
        }k золота за минуту${fight ? ` — сразу после драки на ${Math.floor(fight.start / 60)}-й минуте` : ''}.`,
      };
    }
  }

  return {
    players,
    bySlot,
    teams,
    fights,
    turningPoint,
    goldAt: (minute: number) => match.goldAdv[clamp(Math.round(minute), 0, match.goldAdv.length - 1)] ?? 0,
    xpAt: (minute: number) => match.xpAdv[clamp(Math.round(minute), 0, match.xpAdv.length - 1)] ?? 0,
  };
}

export function kda(player: Player): number {
  return (player.kills + player.assists) / Math.max(1, player.deaths);
}

export function scoreLabel(score: number | null): string {
  if (score == null) return 'Нет данных';
  if (score >= 88) return 'Выдающийся матч';
  if (score >= 78) return 'Сильная игра';
  if (score >= 68) return 'Уверенная игра';
  if (score >= 58) return 'Есть над чем работать';
  if (score >= 48) return 'Слабый матч';
  return 'Тяжёлый матч';
}

export function heroDisplay(player: Player): HeroInfo | null {
  return HERO_BY_ID[player.heroId] ?? null;
}

export function heroByName(name: string): HeroInfo | null {
  return HERO_BY_NAME[name] ?? null;
}

export { DIMENSIONS, GOALS, gradeOf };
