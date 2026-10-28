export type Side = 'radiant' | 'dire';
export type Dimension = 'farm' | 'damage' | 'survival' | 'vision' | 'fights' | 'objectives';

export interface HeroInfo {
  id: number;
  name: string;
  localized_name: string;
  primary_attr: 'str' | 'agi' | 'int' | 'all';
  attack_type: string;
  roles: string[];
}

export interface ItemInfo {
  id: number;
  key: string;
  dname: string;
  cost: number;
  qual: string;
}

export interface ConstantsFile {
  heroes: Record<string, HeroInfo>;
  items: Record<string, ItemInfo>;
  gameModes: Record<string, string>;
  lobbyTypes: Record<string, string>;
  generatedAt: string;
}

export interface WardPoint {
  time: number;
  x: number;
  y: number;
}

export interface PurchaseEntry {
  time: number;
  key: string;
  charges?: number;
}

export interface Player {
  slot: number;
  isRadiant: boolean;
  heroId: number;
  accountId: number | null;
  name: string;
  kills: number;
  deaths: number;
  assists: number;
  gpm: number;
  xpm: number;
  lastHits: number;
  denies: number;
  netWorth: number;
  level: number;
  heroDamage: number;
  towerDamage: number;
  heroHealing: number;
  gold: number;
  goldSpent: number;
  items: number[];
  neutralItem: number | null;
  backpack: number[];
  laneRole: number | null;
  rawLane: number | null;
  laneEfficiency: number | null;
  times: number[];
  goldT: number[];
  lhT: number[];
  dnT: number[];
  xpT: number[];
  purchaseLog: PurchaseEntry[];
  killsLog: { time: number; key: string }[];
  buybackLog: { time: number }[];
  obsLog: WardPoint[];
  senLog: WardPoint[];
  lanePos: Record<string, Record<string, number>> | null;
  /** null — метрика неизвестна (нет соответствующего источника), 0 — измеренный ноль. */
  obsPlaced: number | null;
  senPlaced: number | null;
  campsStacked: number | null;
  runePickups: number | null;
  roshansKilled: number | null;
  stuns: number | null;
  maxHeroHit: number | null;
  multiKills: Record<string, number>;
  killStreaks: Record<string, number>;
  itemUses: Record<string, number>;
  abilityUses: Record<string, number>;
  teamfightParticipation: number | null;
  isParsed: boolean;
}

/**
 * Признаки наличия данных по независимым возможностям.
 *
 * Один общий флаг `parsed` недостаточен: источник может отдать таймлайны,
 * но не отдать варды, или наоборот. Без этих флагов «нет данных»
 * превращалось в «ноль событий» и штрафовало игрока.
 */
export interface MatchCoverage {
  /** Таймлайны золота/опыта (есть хотя бы у одного игрока). */
  timelines: boolean;
  /** Варды: логи постановки или счётчики obs/sen. */
  wards: boolean;
  /** Командные драки. */
  fights: boolean;
  /** Список событий матча (Рошан, башни, первая кровь). */
  objectives: boolean;
  /** Журнал покупок. */
  purchases: boolean;
}

export type ObjectiveKind =
  | 'firstblood'
  | 'tower'
  | 'rax'
  | 'fort'
  | 'roshan'
  | 'aegis'
  | 'courier'
  | 'other';

export interface Objective {
  time: number;
  kind: ObjectiveKind;
  team: Side | null;
  target: Side | null;
  title: string;
  detail: string;
  lane?: 'top' | 'mid' | 'bot';
  tier?: number;
  playerSlot: number | null;
  heroId: number | null;
  importance: number;
}

export interface TeamfightPlayer {
  damage: number;
  healing: number;
  goldDelta: number;
  xpDelta: number;
  deaths: number;
  deathsPos: { x: number; y: number }[];
}

export interface Teamfight {
  start: number;
  end: number;
  deaths: number;
  players: TeamfightPlayer[];
  radiantGold: number;
  direGold: number;
  winner: Side | 'even';
  totalDamage: number;
}

export interface PickBan {
  heroId: number;
  isPick: boolean;
  team: number;
  order: number;
}

export interface DemoMeta {
  title: string;
  subtitle: string;
  note: string;
  featuredSlot: number;
  matchId: number;
  source?: string;
  license?: string;
}

export interface Match {
  id: number;
  startTime: number;
  duration: number;
  radiantWin: boolean;
  gameMode: number;
  lobbyType: number;
  region: number | null;
  radiantScore: number;
  direScore: number;
  firstBlood: number | null;
  averageRank: number | null;
  players: Player[];
  picksBans: PickBan[];
  objectives: Objective[];
  teamfights: Teamfight[];
  goldAdv: number[];
  xpAdv: number[];
  /** Есть распарсенные таймлайны хотя бы у одного игрока. */
  parsed: boolean;
  hasTimelines: boolean;
  /** Что именно есть в данных (таймлайны, варды, драки, объекты, покупки). */
  coverage: MatchCoverage;
  demo: DemoMeta | null;
  warnings: string[];
}

export interface GpmWindow {
  label: string;
  from: number;
  to: number;
  gpm: number;
}

export interface FightParticipation {
  index: number;
  start: number;
  end: number;
  damage: number;
  damageShare: number;
  goldDelta: number;
  xpDelta: number;
  deaths: number;
  teamDamage: number;
  teamDeaths: number;
  participated: boolean;
  winner: Side | 'even';
  playerTeamWon: boolean | null;
}

export interface PlayerMetrics {
  durationMin: number;
  gpm: number;
  xpm: number;
  lh10: number | null;
  lh20: number | null;
  lhPerMin: number;
  gold10: number | null;
  gold20: number | null;
  xp10: number | null;
  deathsPer10: number;
  killParticipation: number;
  fightInvolvement: number;
  fightDamageShare: number;
  damagePerMin: number;
  damageShare: number;
  healingPerMin: number;
  towerDamagePerMin: number;
  netWorthShare: number;
  /** null, если данные о вардах отсутствуют (неизвестно ≠ 0). */
  wardsPer10: number | null;
  senPer10: number | null;
  obsPlaced: number | null;
  senPlaced: number | null;
  wardsScore: number;
  campsStacked: number | null;
  runePickups: number | null;
  earlyDeaths: number;
  deathTimes: number[];
  missedFights: number;
  fightCount: number;
  fightDeaths: number;
  buybacks: number;
  roshansKilled: number | null;
  stuns: number | null;
  gpmWindows: GpmWindow[];
  firstDeath: number | null;
}

export interface InventoryItem {
  id: number;
  info: ItemInfo;
}

export interface ItemTiming {
  time: number;
  key: string;
  info: ItemInfo;
}

export interface PlayerAnalysis {
  player: Player;
  hero: HeroInfo | null;
  role: number;
  roleLabel: string;
  lane: 'top' | 'mid' | 'bot' | 'jungle' | 'unknown';
  laneLabel: string;
  scores: Record<Dimension, number | null>;
  overall: number | null;
  grade: string;
  metrics: PlayerMetrics;
  wardPoints: (WardPoint & { kind: 'obs' | 'sen' })[];
  deathPoints: { x: number; y: number; time: number }[];
  itemTimings: ItemTiming[];
  fights: FightParticipation[];
  ranks: Record<string, number>;
  bkbTiming: number | null;
  blinkTiming: number | null;
  hasTimeline: boolean;
  /** Признаки наличия данных у этого игрока. */
  coverage: {
    timelines: boolean;
    wards: boolean;
    purchases: boolean;
  };
}

export interface TeamSummary {
  side: Side;
  kills: number;
  deaths: number;
  assists: number;
  netWorth: number;
  heroDamage: number;
  towers: number;
  /** null — список событий матча недоступен, число Рошанов неизвестно. */
  roshans: number | null;
  fightsWon: number;
  /** null — данные о вардах отсутствуют. */
  wards: number | null;
  gpm: number;
  avgScore: number | null;
}

export interface FightSummary extends Teamfight {
  index: number;
  key: boolean;
  playerTeams: 'radiant' | 'dire' | 'even';
}

export interface TurningPoint {
  minute: number;
  delta: number;
  before: number;
  after: number;
  side: Side;
  fight: FightSummary | null;
  text: string;
}

export interface MatchAnalysis {
  players: PlayerAnalysis[];
  bySlot: Record<number, PlayerAnalysis>;
  teams: Record<Side, TeamSummary>;
  fights: FightSummary[];
  turningPoint: TurningPoint | null;
  goldAt: (minute: number) => number;
  xpAt: (minute: number) => number;
}

export type InsightSeverity = 'critical' | 'warning' | 'good' | 'info';
export type InsightCategory =
  | 'farm'
  | 'fighting'
  | 'survival'
  | 'vision'
  | 'items'
  | 'objectives'
  | 'discipline';

export interface Insight {
  id: string;
  severity: InsightSeverity;
  category: InsightCategory;
  title: string;
  detail: string;
  why: string;
  fix: string;
  lessonIds: string[];
  value?: string;
  goal?: string;
}

export interface CoachReport {
  analysis: PlayerAnalysis;
  overall: number | null;
  grade: string;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  insights: Insight[];
  priorities: Insight[];
  dimensions: { key: Dimension; label: string; value: number | null; text: string }[];
  plan: { id: string; title: string; detail: string; lessonId?: string; category: InsightCategory }[];
}

export interface HistoryEntry {
  matchId: number;
  slot: number;
  heroId: number;
  role: number;
  overall: number | null;
  grade: string;
  scores: Record<Dimension, number | null>;
  radiantWin: boolean;
  isRadiant: boolean;
  duration: number;
  startTime: number;
  savedAt: number;
  demo: boolean;
}

export type DataProvider = 'steam' | 'opendota' | 'proxy';

export interface Settings {
  /** Ключ OpenDota (опционально, повышает лимиты). */
  apiKey: string;
  accountId: number | null;
  playerName: string;
  reduceMotion: boolean;
  /** Откуда брать матчи: официальный Valve API, OpenDota или свой прокси. */
  provider: DataProvider;
  /** Ключ Steam Web API (бесплатный, выдаётся на steamcommunity.com/dev/apikey). */
  steamKey: string;
  /** Необязательный прокси для Steam API (если браузер блокирует CORS). */
  steamProxy: string;
  /** Базовый URL OpenDota-совместимого API для режима «прокси». */
  proxyBase: string;
}

export interface PlanTaskState {
  [taskKey: string]: boolean;
}
