import type { DataProvider, Settings } from '../types';
import { AppError } from './errors';
import {
  ApiError,
  fetchMatch as openDotaMatch,
  fetchPlayer as openDotaPlayer,
  fetchRecentMatches as openDotaRecent,
  searchPlayers as openDotaSearch,
  toPlayerProfile,
  type PlayerProfileEnvelope,
  type RecentMatch,
} from './openDota';
import {
  DETAILS_CONCURRENCY,
  SteamError,
  findHistoryPlayer,
  loadHistoryDetails,
  steamDetailsToRaw,
  steamMatchDetails,
  steamMatchHistory,
  steamPlayerSummaries,
  steamResolveVanity,
} from './steam';
import { checkApiBaseUrl } from './validate';

export interface ProviderMeta {
  key: DataProvider;
  label: string;
  short: string;
  description: string;
  pros: string;
  cons: string;
}

export const PROVIDERS: ProviderMeta[] = [
  {
    key: 'steam',
    label: 'Valve · Steam Web API',
    short: 'Valve',
    description: 'Официальный API Valve. Обычно доступен из России, VPN не нужен.',
    pros: 'Нужен бесплатный ключ',
    cons: 'Без парса: нет таймлайнов, вардов и драк',
  },
  {
    key: 'opendota',
    label: 'OpenDota',
    short: 'OpenDota',
    description: 'Полный разбор с парсом реплея: таймлайны, варды, драки.',
    pros: 'Максимум данных',
    cons: 'Может быть недоступна из РФ',
  },
  {
    key: 'proxy',
    label: 'Свой прокси',
    short: 'Прокси',
    description: 'OpenDota-совместимое зеркало или CORS-прокси. Указываешь базовый URL сам.',
    pros: 'Обход блокировок',
    cons: 'Нужен свой адрес',
  },
];

export function providerLabel(provider: DataProvider): string {
  return PROVIDERS.find((item) => item.key === provider)?.short ?? provider;
}

export interface ProfileView {
  accountId: number;
  name: string | null;
  avatar: string | null;
  rankTier: number | null;
}

export interface AccountSuggestion {
  accountId: number;
  name: string;
}

export function proxyBase(settings: Settings): string | undefined {
  const value = settings.proxyBase.trim().replace(/\/+$/, '');
  return value || undefined;
}

/**
 * Проверяет адреса прокси из настроек.
 * Пользовательские URL попадают прямо в fetch, поэтому формат проверяется
 * до запроса: так мы не отправляем ключи по мусорному адресу.
 */
export function proxyUrlProblem(settings: Settings): AppError | null {
  if (settings.provider === 'proxy') {
    const check = checkApiBaseUrl(settings.proxyBase);
    if (!proxyBase(settings)) {
      return new AppError(
        'proxy-config',
        'Не указан адрес прокси.',
        'Открой настройки и добавь базовый URL OpenDota-совместимого API (например, свой Cloudflare Worker).',
      );
    }
    if (!check.ok) {
      return new AppError('proxy-config', `Некорректный адрес прокси: ${check.error ?? 'проверь формат'}`, 'Нужен полный адрес вида https://example.com/api.');
    }
  }
  if (settings.provider === 'steam' && settings.steamProxy.trim()) {
    const check = checkApiBaseUrl(settings.steamProxy);
    if (!check.ok) {
      return new AppError(
        'steam-config',
        `Некорректный адрес прокси Steam: ${check.error ?? 'проверь формат'}`,
        'Нужен полный адрес вида https://my-worker.example.com/steam.',
      );
    }
  }
  return null;
}

export function providerProblem(settings: Settings): AppError | null {
  if (settings.provider === 'steam' && !settings.steamKey.trim()) {
    return new AppError(
      'steam-key',
      'Для источника Valve нужен Steam Web API key.',
      'Бесплатный ключ: steamcommunity.com/dev/apikey. Вставь его в настройках — данные будут грузиться напрямую от Valve.',
    );
  }
  return proxyUrlProblem(settings);
}

function fromOpenDotaError(error: unknown): never {
  if (error instanceof ApiError) {
    const hint =
      error.code === 'network'
        ? 'OpenDota может быть недоступна из России. Переключи источник на Valve в настройках или загрузи JSON вручную.'
        : error.code === 'rate'
          ? 'Подожди минуту, добавь ключ OpenDota или переключись на Valve.'
          : error.code === 'proxy'
            ? 'Проверь адрес прокси в настройках: нужен полный https:// адрес.'
            : undefined;
    throw new AppError(`opendota-${error.code}`, error.message, hint);
  }
  throw error;
}

export async function fetchRawMatch(
  matchId: number,
  settings: Settings,
  signal?: AbortSignal,
): Promise<unknown> {
  const problem = providerProblem(settings);
  if (problem) throw problem;

  if (settings.provider === 'steam') {
    try {
      const details = await steamMatchDetails(matchId, {
        key: settings.steamKey,
        base: settings.steamProxy,
        signal,
      });
      const accountIds = details.players
        .map((player) => player.account_id ?? 0)
        .filter((id) => id > 0);
      let summaries = {};
      try {
        summaries = await steamPlayerSummaries(accountIds, {
          key: settings.steamKey,
          base: settings.steamProxy,
          signal,
        });
      } catch {
        summaries = {};
      }
      return steamDetailsToRaw(details, summaries);
    } catch (error) {
      if (error instanceof SteamError) throw new AppError(`steam-${error.code}`, error.message, error.hint);
      throw error;
    }
  }

  try {
    return await openDotaMatch(matchId, settings.apiKey, signal, proxyBase(settings));
  } catch (error) {
    return fromOpenDotaError(error);
  }
}

export async function fetchRecentMatches(
  accountId: number,
  settings: Settings,
  limit = 10,
  signal?: AbortSignal,
): Promise<RecentMatch[]> {
  const problem = providerProblem(settings);
  if (problem) throw problem;

  if (settings.provider === 'steam') {
    try {
      const history = await steamMatchHistory(
        accountId,
        { key: settings.steamKey, base: settings.steamProxy, signal },
        limit,
      );
      // GetMatchHistory не содержит ни результата, ни длительности, ни KDA:
      // эти поля есть только в GetMatchDetails. Догружаем с ограничением
      // параллельности, а недоступные матчи оставляем без выдуманных значений.
      const details = await loadHistoryDetails(
        history,
        { key: settings.steamKey, base: settings.steamProxy, signal },
        DETAILS_CONCURRENCY,
      );
      return history.map((match): RecentMatch => {
        const player = findHistoryPlayer(match, accountId);
        const detail = details.get(match.match_id);
        const me = detail
          ? detail.players.find((candidate) => Number(candidate.account_id) === accountId)
          : undefined;
        return {
          match_id: match.match_id,
          player_slot: player?.player_slot ?? me?.player_slot ?? null,
          radiant_win: detail ? Boolean(detail.radiant_win) : null,
          duration: detail?.duration ?? null,
          game_mode: detail?.game_mode ?? null,
          lobby_type: match.lobby_type ?? detail?.lobby_type ?? null,
          hero_id: player?.hero_id ?? me?.hero_id ?? null,
          start_time: match.start_time || detail?.start_time || 0,
          kills: me?.kills ?? null,
          deaths: me?.deaths ?? null,
          assists: me?.assists ?? null,
          average_rank: null,
          hasDetails: Boolean(detail),
        };
      });
    } catch (error) {
      if (error instanceof SteamError) throw new AppError(`steam-${error.code}`, error.message, error.hint);
      throw error;
    }
  }

  try {
    const matches = await openDotaRecent(accountId, settings.apiKey, signal, limit, proxyBase(settings));
    return matches.map((match) => ({ ...match, hasDetails: true }));
  } catch (error) {
    return fromOpenDotaError(error);
  }
}

export async function fetchProfile(accountId: number, settings: Settings): Promise<ProfileView> {
  const problem = providerProblem(settings);
  if (problem) throw problem;

  if (settings.provider === 'steam') {
    try {
      const summaries = await steamPlayerSummaries([accountId], {
        key: settings.steamKey,
        base: settings.steamProxy,
      });
      const summary = summaries[accountId];
      return {
        accountId,
        name: summary?.personaname ?? null,
        avatar: summary?.avatarfull ?? null,
        rankTier: null,
      };
    } catch (error) {
      if (error instanceof SteamError) {
        // Имя — не критично: историю матчей всё равно можно показать.
        return { accountId, name: null, avatar: null, rankTier: null };
      }
      throw error;
    }
  }

  try {
    const envelope: PlayerProfileEnvelope = await openDotaPlayer(
      accountId,
      settings.apiKey,
      undefined,
      proxyBase(settings),
    );
    // Имя и аватар лежат во вложенном profile, rank_tier — в корне ответа.
    const profile = toPlayerProfile(accountId, envelope);
    return {
      accountId,
      name: profile.name,
      avatar: profile.avatar,
      rankTier: profile.rankTier,
    };
  } catch (error) {
    return fromOpenDotaError(error);
  }
}

export async function suggestAccounts(query: string, settings: Settings): Promise<AccountSuggestion[]> {
  const problem = providerProblem(settings);
  if (problem) throw problem;
  const value = query.trim();

  if (settings.provider === 'steam') {
    try {
      const accountId = await steamResolveVanity(value, {
        key: settings.steamKey,
        base: settings.steamProxy,
      });
      if (!accountId) {
        throw new AppError(
          'steam-notfound',
          'Valve не нашёл такой профиль.',
          'Поиск по нику у Valve работает только для короткого имени профиля (steamcommunity.com/id/...). Если у тебя числовой профиль — введи SteamID64 или account_id.',
        );
      }
      return [{ accountId, name: value }];
    } catch (error) {
      if (error instanceof SteamError) throw new AppError(`steam-${error.code}`, error.message, error.hint);
      throw error;
    }
  }

  try {
    const results = await openDotaSearch(value, settings.apiKey, undefined, proxyBase(settings));
    return (results ?? []).slice(0, 6).map((item) => ({
      accountId: item.account_id,
      name: item.personaname ?? `Аккаунт ${item.account_id}`,
    }));
  } catch (error) {
    return fromOpenDotaError(error);
  }
}

export function steamIdFromInput(value: string): number | null {
  const steamMatch = value.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  const candidate = steamMatch ? steamMatch[1] : value.trim();
  if (!/^\d{17}$/.test(candidate)) return null;
  const accountId = Number(BigInt(candidate) - 76561197960265728n);
  return accountId > 0 ? accountId : null;
}
