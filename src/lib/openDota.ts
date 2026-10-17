export const OPEN_DOTA_BASE = 'https://api.opendota.com/api';

function normalizeBase(base?: string): string {
  const value = (base ?? '').trim();
  if (!value) return OPEN_DOTA_BASE;
  return value.replace(/\/+$/, '');
}

export class ApiError extends Error {
  status: number;
  code: 'rate' | 'notfound' | 'network' | 'server' | 'parse';
  constructor(status: number, code: ApiError['code'], message: string) {
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
}

async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = new URL(`${normalizeBase(options.baseUrl)}${path}`);
  if (options.apiKey) url.searchParams.set('api_key', options.apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    const response = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
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
      return (await response.json()) as T;
    } catch {
      throw new ApiError(response.status, 'parse', 'Не удалось прочитать ответ OpenDota.');
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error).name === 'AbortError') {
      throw new ApiError(0, 'network', 'Запрос к OpenDota занял слишком много времени. Проверь соединение.');
    }
    throw new ApiError(0, 'network', 'Не удалось связаться с OpenDota. Проверь интернет или загрузи JSON вручную.');
  } finally {
    clearTimeout(timer);
  }
}

export interface PlayerProfile {
  account_id: number;
  personaname: string | null;
  avatarfull?: string | null;
  rank_tier?: number | null;
  leaderboard_rank?: number | null;
}

export interface PlayerSearchResult {
  account_id: number;
  personaname: string | null;
  avatarfull?: string | null;
  last_match_time?: string | null;
}

export interface RecentMatch {
  match_id: number;
  player_slot: number;
  radiant_win: boolean;
  duration: number;
  game_mode: number;
  lobby_type?: number;
  hero_id: number;
  start_time: number;
  kills: number;
  deaths: number;
  assists: number;
  average_rank?: number | null;
  party_size?: number | null;
}

export async function fetchMatch(
  matchId: number | string,
  apiKey?: string,
  signal?: AbortSignal,
  baseUrl?: string,
): Promise<unknown> {
  return request(`/matches/${matchId}`, { apiKey, signal, baseUrl });
}

export async function searchPlayers(
  query: string,
  apiKey?: string,
  signal?: AbortSignal,
  baseUrl?: string,
): Promise<PlayerSearchResult[]> {
  return request(`/search?q=${encodeURIComponent(query.trim())}`, { apiKey, signal, baseUrl });
}

export async function fetchPlayer(
  accountId: number,
  apiKey?: string,
  signal?: AbortSignal,
  baseUrl?: string,
): Promise<PlayerProfile> {
  return request(`/players/${accountId}`, { apiKey, signal, baseUrl });
}

export async function fetchRecentMatches(
  accountId: number,
  apiKey?: string,
  signal?: AbortSignal,
  limit = 20,
  baseUrl?: string,
): Promise<RecentMatch[]> {
  return request(`/players/${accountId}/matches?limit=${limit}`, { apiKey, signal, baseUrl });
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
