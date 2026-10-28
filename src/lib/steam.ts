/**
 * Официальный Valve / Steam Web API — альтернатива OpenDota.
 *
 * Почему это полезно: api.steampowered.com обычно доступен из России,
 * когда OpenDota заблокирована. Ключ бесплатный:
 * https://steamcommunity.com/dev/apikey
 *
 * Ограничение: Steam отдаёт только базовую статистику матча (KDA, GPM, XPM,
 * добивания, урон, предметы), без парса реплея — таймлайнов, вардов и драк.
 * Приложение это учитывает и честно предупреждает.
 *
 * Важно про контракт: GetMatchHistory возвращает только список матчей и
 * участников внутри `players` — ни длительности, ни результата, ни KDA там нет.
 * Эти поля догружаются отдельным GetMatchDetails (см. loadHistoryDetails).
 */

import { checkApiBaseUrl } from './validate';
import { RequestAbortError, fetchWithTimeout, mapWithConcurrency, readJsonBody } from './request';

export const STEAM_API_BASE = 'https://api.steampowered.com';
const DEV_PROXY_BASE = '/steam';
const STEAM_ID_OFFSET = 76561197960265728n;

/** Сколько деталей матчей догружаем одновременно (Valve ограничивает частоту). */
export const DETAILS_CONCURRENCY = 3;

export type SteamErrorCode =
  | 'key'
  | 'notfound'
  | 'private'
  | 'network'
  | 'cors'
  | 'server'
  | 'rate'
  | 'parse'
  | 'proxy'
  | 'abort';

export class SteamError extends Error {
  code: SteamErrorCode;
  hint?: string;
  constructor(code: SteamErrorCode, message: string, hint?: string) {
    super(message);
    this.name = 'SteamError';
    this.code = code;
    this.hint = hint;
  }
}

export interface SteamPlayerDetails {
  account_id?: number;
  player_slot: number;
  hero_id: number;
  item_0?: number;
  item_1?: number;
  item_2?: number;
  item_3?: number;
  item_4?: number;
  item_5?: number;
  backpack_0?: number;
  backpack_1?: number;
  backpack_2?: number;
  item_neutral?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  leaver_status?: number;
  gold?: number;
  last_hits?: number;
  denies?: number;
  gold_per_min?: number;
  xp_per_min?: number;
  level?: number;
  hero_damage?: number;
  tower_damage?: number;
  hero_healing?: number;
  gold_spent?: number;
}

export interface SteamMatchDetails {
  match_id: number;
  players: SteamPlayerDetails[];
  radiant_win: boolean;
  duration: number;
  pre_game_duration?: number;
  start_time: number;
  match_seq_num?: number;
  tower_status_radiant?: number;
  tower_status_dire?: number;
  barracks_status_radiant?: number;
  barracks_status_dire?: number;
  cluster?: number;
  first_blood_time?: number;
  lobby_type?: number;
  human_players?: number;
  leagueid?: number;
  game_mode?: number;
  flags?: number;
  engine?: number;
  radiant_score?: number;
  dire_score?: number;
  picks_bans?: { is_pick: boolean; hero_id: number; team: number; order: number }[];
}

/**
 * Участник матча в ответе GetMatchHistory.
 * Реально доступны только account_id, player_slot и hero_id.
 */
export interface SteamHistoryPlayer {
  account_id?: number;
  player_slot: number;
  hero_id: number;
}

/**
 * Элемент `result.matches[]` метода GetMatchHistory.
 *
 * Полей `duration`, `radiant_win`, `kills/deaths/assists` и `hero_id` выбранного
 * аккаунта на этом уровне нет — они есть только в GetMatchDetails.
 * Раньше ответ приводился к «готовому» типу, и отсутствующие поля попадали
 * в карточки как undefined (а результат — как false).
 */
export interface SteamHistoryMatch {
  match_id: number;
  match_seq_num?: number;
  start_time: number;
  lobby_type?: number;
  players?: SteamHistoryPlayer[];
}

export interface SteamPlayerSummary {
  steamid: string;
  personaname: string | null;
  avatarfull?: string | null;
  profileurl?: string | null;
}

export interface SteamHistoryResponse {
  result?: {
    status?: number;
    num_results?: number;
    total_results?: number;
    results_remaining?: number;
    matches?: SteamHistoryMatch[];
    error?: string;
  };
}

interface SteamOptions {
  key: string;
  base?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

function readFlagBase(): string {
  try {
    const env = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
    return env?.DEV ? DEV_PROXY_BASE : STEAM_API_BASE;
  } catch {
    return STEAM_API_BASE;
  }
}

/** Проверяет пользовательский прокси и возвращает нормализованный базовый адрес. */
export function resolveBase(base?: string): string {
  const custom = (base ?? '').trim();
  if (!custom) return readFlagBase();
  const check = checkApiBaseUrl(custom);
  if (!check.ok) {
    throw new SteamError(
      'proxy',
      `Некорректный адрес прокси: ${check.error ?? 'проверь формат'}`,
      'Нужен полный адрес вида https://my-worker.example.com/steam (http или https, без пробелов).',
    );
  }
  return check.value;
}

async function steamGet<T>(path: string, params: Record<string, string | number>, options: SteamOptions): Promise<T> {
  const key = options.key.trim();
  if (!key) {
    throw new SteamError(
      'key',
      'Нужен Steam Web API key — без него Valve не отдаёт данные матчей.',
      'Бесплатный ключ выдаётся за минуту: steamcommunity.com/dev/apikey → вставь его в настройках.',
    );
  }

  const query = new URLSearchParams();
  Object.entries(params).forEach(([name, value]) => query.set(name, String(value)));
  query.set('key', key);

  const base = resolveBase(options.base);
  const url = `${base}${path}?${query.toString()}`;

  let response: Response;
  try {
    response = await fetchWithTimeout(url, { signal: options.signal, timeoutMs: options.timeoutMs });
  } catch (error) {
    if (error instanceof RequestAbortError) {
      throw error.reason === 'timeout'
        ? new SteamError('network', `Steam API не ответил за ${Math.round((options.timeoutMs ?? 20000) / 1000)} сек. Проверь соединение.`)
        : new SteamError('abort', 'Запрос к Steam API отменён.');
    }
    throw new SteamError(
      'cors',
      'Браузер не смог напрямую обратиться к api.steampowered.com.',
      'Это ограничение CORS или блокировка сети. Запусти приложение через npm run dev (там есть прокси) или укажи прокси для Steam в настройках.',
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new SteamError('key', 'Valve отклонил ключ. Проверь Steam Web API key в настройках.');
  }
  if (response.status === 429) {
    throw new SteamError('rate', 'Valve ограничил частоту запросов. Подожди немного и повтори.');
  }
  if (!response.ok) {
    throw new SteamError('server', `Steam API ответил ошибкой ${response.status}. Попробуй позже.`);
  }

  let body: unknown;
  try {
    body = await readJsonBody(response);
  } catch {
    throw new SteamError('parse', 'Не удалось прочитать ответ Steam API. Возможно, прокси вернул не JSON.');
  }
  if (typeof body !== 'object' || body === null) {
    throw new SteamError('parse', 'Steam API вернул неожиданный ответ.');
  }
  return body as T;
}

export function accountIdToSteamId(accountId: number): string {
  return (BigInt(accountId) + STEAM_ID_OFFSET).toString();
}

export function steamIdToAccountId(steamId: string): number | null {
  if (!/^\d{17}$/.test(steamId)) return null;
  const value = BigInt(steamId) - STEAM_ID_OFFSET;
  if (value <= 0n) return null;
  return Number(value);
}

export async function steamMatchDetails(matchId: number, options: SteamOptions): Promise<SteamMatchDetails> {
  const data = await steamGet<{ result?: SteamMatchDetails & { error?: string } }>(
    '/IDOTA2Match_570/GetMatchDetails/v1/',
    { match_id: matchId },
    options,
  );
  const result = data?.result;
  if (!result || result.error || !Array.isArray(result.players) || !result.players.length) {
    throw new SteamError(
      'notfound',
      `Valve не нашёл матч #${matchId}.`,
      'Возможные причины: матч ещё не проиндексирован, данные скрыты настройками приватности или ID неверный.',
    );
  }
  // Защита от подмены ответа прокси: детали должны относиться к запрошенному матчу.
  if (Number(result.match_id) && Number(result.match_id) !== matchId) {
    throw new SteamError('notfound', `Valve вернул детали матча #${result.match_id} вместо #${matchId}.`);
  }
  return result;
}

/**
 * История матчей аккаунта.
 *
 * Возвращает «сырые» элементы GetMatchHistory: в них есть только участники.
 * Длительность, результат и KDA доступны только через GetMatchDetails —
 * см. loadHistoryDetails в dataSource.
 */
export async function steamMatchHistory(
  accountId: number,
  options: SteamOptions,
  count = 10,
): Promise<SteamHistoryMatch[]> {
  const data = await steamGet<SteamHistoryResponse>(
    '/IDOTA2Match_570/GetMatchHistory/v1/',
    { account_id: accountId, matches_requested: count },
    options,
  );
  const result = data?.result;
  if (!result) {
    throw new SteamError('notfound', 'Valve не вернул историю матчей.');
  }
  if (result.status === 15) {
    throw new SteamError(
      'private',
      'Valve не отдаёт историю этого аккаунта.',
      'Проверь, что в Dota 2 включён пункт «Обнародовать историю матчей» (Настройки → Социальные).',
    );
  }
  if (result.status && result.status !== 1) {
    throw new SteamError('notfound', 'История матчей недоступна для этого аккаунта.');
  }
  return Array.isArray(result.matches) ? result.matches : [];
}

/** Находит участника истории по account_id — «я» в этом матче. */
export function findHistoryPlayer(
  match: SteamHistoryMatch,
  accountId: number,
): SteamHistoryPlayer | null {
  const players = Array.isArray(match.players) ? match.players : [];
  return players.find((player) => Number(player.account_id) === accountId) ?? null;
}

/** Догружает детали матчей с ограничением параллельности. */
export async function loadHistoryDetails(
  matches: SteamHistoryMatch[],
  options: SteamOptions,
  concurrency = DETAILS_CONCURRENCY,
): Promise<Map<number, SteamMatchDetails>> {
  const entries = await mapWithConcurrency(matches, concurrency, async (match) => {
    try {
      const details = await steamMatchDetails(match.match_id, options);
      return [match.match_id, details] as const;
    } catch {
      // Отдельный матч мог стать недоступным — это не должно ронять всю историю.
      return null;
    }
  });
  const map = new Map<number, SteamMatchDetails>();
  for (const entry of entries) {
    if (entry) map.set(entry[0], entry[1]);
  }
  return map;
}

export async function steamPlayerSummaries(
  accountIds: number[],
  options: SteamOptions,
): Promise<Record<number, SteamPlayerSummary>> {
  const ids = accountIds.filter((id) => Number.isFinite(id) && id > 0).slice(0, 100);
  if (!ids.length) return {};
  const data = await steamGet<{ response?: { players?: SteamPlayerSummary[] } }>(
    '/ISteamUser/GetPlayerSummaries/v2/',
    { steamids: ids.map(accountIdToSteamId).join(',') },
    options,
  );
  const players = Array.isArray(data?.response?.players) ? data?.response?.players : [];
  const map: Record<number, SteamPlayerSummary> = {};
  for (const player of players ?? []) {
    const accountId = steamIdToAccountId(player?.steamid ?? '');
    if (accountId != null) map[accountId] = player;
  }
  return map;
}

export async function steamResolveVanity(name: string, options: SteamOptions): Promise<number | null> {
  const vanity = name
    .trim()
    .replace(/^https?:\/\/steamcommunity\.com\/id\//i, '')
    .replace(/\/.*$/, '');
  if (!vanity) return null;
  const data = await steamGet<{ response?: { success?: number; steamid?: string; message?: string } }>(
    '/ISteamUser/ResolveVanityURL/v1/',
    { vanityurl: vanity },
    options,
  );
  const response = data?.response;
  if (!response || response.success !== 1 || !response.steamid) return null;
  return steamIdToAccountId(response.steamid);
}

/** Приводит ответ Valve к форме OpenDota, чтобы дальше шёл тот же анализатор. */
export function steamDetailsToRaw(
  details: SteamMatchDetails,
  summaries: Record<number, SteamPlayerSummary> = {},
): Record<string, unknown> {
  const players = details.players.map((player) => {
    const accountId = player.account_id && player.account_id > 0 ? player.account_id : null;
    const summary = accountId != null ? summaries[accountId] : undefined;
    return {
      account_id: accountId,
      player_slot: player.player_slot,
      hero_id: player.hero_id,
      item_0: player.item_0 ?? 0,
      item_1: player.item_1 ?? 0,
      item_2: player.item_2 ?? 0,
      item_3: player.item_3 ?? 0,
      item_4: player.item_4 ?? 0,
      item_5: player.item_5 ?? 0,
      backpack_0: player.backpack_0 ?? 0,
      backpack_1: player.backpack_1 ?? 0,
      backpack_2: player.backpack_2 ?? 0,
      item_neutral: player.item_neutral ?? 0,
      kills: player.kills ?? 0,
      deaths: player.deaths ?? 0,
      assists: player.assists ?? 0,
      leaver_status: player.leaver_status ?? 0,
      gold: player.gold ?? 0,
      gold_spent: player.gold_spent ?? 0,
      last_hits: player.last_hits ?? 0,
      denies: player.denies ?? 0,
      gold_per_min: player.gold_per_min ?? 0,
      xp_per_min: player.xp_per_min ?? 0,
      level: player.level ?? 0,
      hero_damage: player.hero_damage ?? 0,
      tower_damage: player.tower_damage ?? 0,
      hero_healing: player.hero_healing ?? 0,
      personaname: summary?.personaname ?? null,
    };
  });

  return {
    match_id: details.match_id,
    start_time: details.start_time,
    duration: details.duration,
    radiant_win: Boolean(details.radiant_win),
    game_mode: details.game_mode ?? 0,
    lobby_type: details.lobby_type ?? 0,
    human_players: details.human_players ?? 10,
    radiant_score: details.radiant_score ?? null,
    dire_score: details.dire_score ?? null,
    first_blood_time: details.first_blood_time ?? null,
    tower_status_radiant: details.tower_status_radiant,
    tower_status_dire: details.tower_status_dire,
    barracks_status_radiant: details.barracks_status_radiant,
    barracks_status_dire: details.barracks_status_dire,
    cluster: details.cluster,
    leagueid: details.leagueid,
    picks_bans: details.picks_bans,
    players,
    __source: 'steam',
  };
}
