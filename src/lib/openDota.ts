import { checkApiBaseUrl } from './validate';
import { RequestAbortError, DEFAULT_TIMEOUT_MS, fetchWithTimeout, readJsonBody } from './request';

export const OPEN_DOTA_BASE = 'https://api.opendota.com/api';

function normalizeBase(base?: string): string {
  const value = (base ?? '').trim();
  if (!value) return OPEN_DOTA_BASE;
  const check = checkApiBaseUrl(value);
  if (!check.ok) return value.replace(/\/+$/, '');
  return check.value;
}

/** Проверяет пользовательский базовый URL и возвращает ошибку для интерфейса. */
export function checkBaseUrl(base?: string): { ok: boolean; error?: string } {
  return checkApiBaseUrl(base ?? '');
}

export type ApiErrorCode = 'rate' | 'notfound' | 'network' | 'server' | 'parse' | 'proxy' | 'abort';

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface FetchOptions {
  apiKey?: string;
  signal?: AbortSignal;
  method?: 'GET' | 'POST';
  body?: unknown;
  baseUrl?: string;
  timeoutMs?: number;
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const base = normalizeBase(options.baseUrl);
  if (options.baseUrl && options.baseUrl.trim() && !checkApiBaseUrl(options.baseUrl).ok) {
    throw new ApiError(
      0,
      'proxy',
      `Некорректный адрес прокси: ${checkApiBaseUrl(options.baseUrl).error ?? 'проверь формат'}`,
    );
  }
  const url = new URL(`${base}${path}`);
  if (options.apiKey) url.searchParams.set('api_key', options.apiKey);

  let response: Response;
  try {
    response = await fetchWithTimeout(url.toString(), {
      method: options.method ?? 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body,
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof RequestAbortError) {
      throw error.reason === 'timeout'
        ? new ApiError(0, 'network', 'Запрос к OpenDota занял слишком много времени. Проверь соединение.')
        : new ApiError(0, 'abort', 'Запрос к OpenDota отменён.');
    }
    throw new ApiError(0, 'network', 'Не удалось связаться с OpenDota. Проверь интернет или загрузи JSON вручную.');
  }

  if (response.status === 429) {
    throw new ApiError(429, 'rate', 'OpenDota ограничил частоту запросов. Подожди минуту или добавь API-ключ в настройках.');
  }
  if (response.status === 404) {
    throw new ApiError(404, 'notfound', 'OpenDota не нашёл такие данные.');
  }
  if (!response.ok) {
    throw new ApiError(response.status, 'server', `OpenDota ответил ошибкой ${response.status}. Попробуй позже.`);
  }

  try {
    return (await readJsonBody(response)) as T;
  } catch {
    throw new ApiError(response.status, 'parse', 'Не удалось прочитать ответ OpenDota.');
  }
}

/**
 * Профиль игрока OpenDota.
 *
 * Контракт `/players/:account_id`: `rank_tier` и `leaderboard_rank` лежат
 * в корне, а имя и аватар — внутри вложенного объекта `profile`.
 * Раньше код читал personaname/avatarfull из корня, поэтому имя не показывалось.
 */
export interface PlayerProfileEnvelope {
  account_id?: number;
  rank_tier?: number | null;
  leaderboard_rank?: number | null;
  solo_competitive_rank?: number | null;
  competitive_rank?: number | string | null;
  mmr_estimate?: { estimate?: number } | null;
  profile?: {
    account_id?: number;
    personaname?: string | null;
    name?: string | null;
    avatarfull?: string | null;
    avatarmedium?: string | null;
    avatar?: string | null;
    profileurl?: string | null;
    plus?: boolean;
  } | null;
  /** Плоская форма (встречается у зеркал): имя и аватар в корне. */
  personaname?: string | null;
  avatarfull?: string | null;
}

export interface PlayerProfile {
  accountId: number;
  name: string | null;
  avatar: string | null;
  rankTier: number | null;
}

export interface PlayerSearchResult {
  account_id: number;
  personaname: string | null;
  avatarfull?: string | null;
  last_match_time?: string | null;
}

export interface RecentMatch {
  match_id: number;
  /** null — участник не найден (например, скрытый аккаунт). */
  player_slot: number | null;
  /** null — результат неизвестен (источник его не отдал). */
  radiant_win: boolean | null;
  duration: number | null;
  game_mode: number | null;
  lobby_type?: number | null;
  hero_id: number | null;
  start_time: number;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  average_rank?: number | null;
  party_size?: number | null;
  /** true, если KDA/длительность/результат реально получены. */
  hasDetails: boolean;
}

/** Приводит ответ /players/:id к виду, с которым работает интерфейс. */
export function toPlayerProfile(accountId: number, envelope: PlayerProfileEnvelope | null): PlayerProfile {
  const profile = envelope?.profile ?? null;
  const name = profile?.personaname ?? profile?.name ?? envelope?.personaname ?? null;
  const avatar = profile?.avatarfull ?? envelope?.avatarfull ?? null;
  const rankTier = envelope?.rank_tier ?? null;
  return { accountId, name: name || null, avatar: avatar || null, rankTier: rankTier ?? null };
}

export async function fetchMatch(
  matchId: number | string,
  apiKey?: string,
  signal?: AbortSignal,
  baseUrl?: string,
): Promise<unknown> {
  const data = await request<unknown>(`/matches/${matchId}`, { apiKey, signal, baseUrl });
  if (typeof data !== 'object' || data === null) {
    throw new ApiError(200, 'parse', 'OpenDota вернула неожиданный ответ вместо матча.');
  }
  return data;
}

export async function searchPlayers(
  query: string,
  apiKey?: string,
  signal?: AbortSignal,
  baseUrl?: string,
): Promise<PlayerSearchResult[]> {
  const data = await request<unknown>(`/search?q=${encodeURIComponent(query.trim())}`, {
    apiKey,
    signal,
    baseUrl,
  });
  return Array.isArray(data) ? (data as PlayerSearchResult[]) : [];
}

export async function fetchPlayer(
  accountId: number,
  apiKey?: string,
  signal?: AbortSignal,
  baseUrl?: string,
): Promise<PlayerProfileEnvelope> {
  return request<PlayerProfileEnvelope>(`/players/${accountId}`, { apiKey, signal, baseUrl });
}

export async function fetchRecentMatches(
  accountId: number,
  apiKey?: string,
  signal?: AbortSignal,
  limit = 20,
  baseUrl?: string,
): Promise<RecentMatch[]> {
  const data = await request<unknown>(`/players/${accountId}/matches?limit=${limit}`, {
    apiKey,
    signal,
    baseUrl,
  });
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is RecentMatch => typeof item === 'object' && item != null && 'match_id' in item);
}

export async function requestParse(
  matchId: number,
  apiKey?: string,
  baseUrl?: string,
): Promise<{ job?: { job_id?: number } }> {
  return request(`/request/${matchId}`, { apiKey, method: 'POST', body: {}, baseUrl });
}

export function parseAccountInput(value: string): { accountId: number | null; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { accountId: null, error: 'Введи Steam ID или ссылку на профиль.' };
  const profileMatch = trimmed.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  const raw = profileMatch ? profileMatch[1] : trimmed;
  if (/^\d{17}$/.test(raw)) {
    const accountId = Number(BigInt(raw) - BigInt('76561197960265728'));
    if (accountId > 0) return { accountId };
  }
  if (/^\d{1,10}$/.test(raw)) {
    const accountId = Number(raw);
    if (accountId > 0) return { accountId };
  }
  if (/steamcommunity\.com\/id\//i.test(trimmed)) {
    return { accountId: null, error: 'Короткие ссылки /id/... не поддерживаются без Steam API. Укажи SteamID64 или account_id.' };
  }
  return { accountId: null, error: 'Похоже, это не SteamID64 и не account_id. Проверь значение.' };
}

export function rankLabel(rankTier: number | null | undefined): string {
  if (!rankTier) return 'Рейтинг скрыт';
  const medals = ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'];
  const medal = medals[Math.floor(rankTier / 10)] ?? 'Рейтинг';
  const star = rankTier % 10;
  return `${medal}${star ? ` ${star}` : ''}`;
}
