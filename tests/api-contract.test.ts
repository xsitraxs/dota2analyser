import { describe, expect, it, vi } from 'vitest';
import {
  OPEN_DOTA_BASE,
  ApiError,
  fetchPlayer,
  fetchRecentMatches,
  toPlayerProfile,
  type PlayerProfileEnvelope,
} from '../src/lib/openDota';
import {
  STEAM_API_BASE,
  SteamError,
  findHistoryPlayer,
  loadHistoryDetails,
  steamMatchDetails,
  steamMatchHistory,
  steamPlayerSummaries,
} from '../src/lib/steam';
import { fetchProfile, fetchRecentMatches as fetchRecent, PROVIDERS } from '../src/lib/dataSource';
import { DEFAULT_SETTINGS } from '../src/lib/storage';
import { FIXTURES, clone, valveDetailsRaw, valveHistoryRaw } from './fixtures';
import type { Settings } from '../src/types';

interface FetchCall {
  url: string;
  options?: RequestInit;
}

/** Подменяет глобальный fetch и собирает историю вызовов. */
function mockFetch(handler: (url: string, options?: RequestInit) => unknown) {
  const calls: FetchCall[] = [];
  const impl = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, options });
    const body = await handler(url, options);
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', impl);
  return { calls, impl };
}

const settings = (overrides: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...overrides });

describe('контракт Valve GetMatchHistory', () => {
  it('ищет игрока внутри players, а не в полях верхнего уровня', () => {
    const [match] = (valveHistoryRaw().result as { matches: ReturnType<typeof clone>[] }).matches;
    const historyMatch = match as never;
    const player = findHistoryPlayer(historyMatch, 1000);
    expect(player).toBeTruthy();
    expect(player?.player_slot).toBe(0);
    expect(findHistoryPlayer(historyMatch, 424242)).toBeNull();
  });

  it('элемент истории не содержит длительности, результата и KDA', () => {
    // Защита контракта: эти поля появятся только из GetMatchDetails.
    const [match] = (FIXTURES.valveHistory.result.matches ?? []) as Record<string, unknown>[];
    expect(match).not.toHaveProperty('duration');
    expect(match).not.toHaveProperty('radiant_win');
    expect(match).not.toHaveProperty('kills');
    expect(Array.isArray(match.players)).toBe(true);
  });

  it('возвращает историю и корректно обрабатывает приватный аккаунт', async () => {
    mockFetch(() => clone(FIXTURES.valveHistory));
    const matches = await steamMatchHistory(1000, { key: 'KEY' }, 2);
    expect(matches.map((match) => match.match_id)).toEqual([7490235544, 7490235545]);

    mockFetch(() => ({ result: { status: 15 } }));
    await expect(steamMatchHistory(1000, { key: 'KEY' })).rejects.toMatchObject({ code: 'private' });
  });

  it('догружает детали матчей с ограничением параллельности', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { calls } = mockFetch((url) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const requested = Number(new URL(url, 'https://api.steampowered.com').searchParams.get('match_id'));
      return new Promise((resolve) => {
        setTimeout(() => {
          inFlight -= 1;
          const details = clone(FIXTURES.valveDetails).result;
          // Отвечаем тем match_id, который запросили: иначе сработает защита от подмены.
          details.match_id = requested;
          resolve(new Response(JSON.stringify({ result: details }), { status: 200 }));
        }, 1);
      });
    });

    const history = (valveHistoryRaw().result as { matches: { match_id: number }[] }).matches;
    const details = await loadHistoryDetails(history as never, { key: 'KEY' }, 1);
    expect(details.size).toBe(2);
    expect(maxInFlight).toBe(1);
    expect(calls.every((call) => call.url.includes('/IDOTA2Match_570/GetMatchDetails/v1/'))).toBe(true);
  });

  it('не выдумывает отсутствующие детали: недоступный матч просто пропускается', async () => {
    let first = true;
    mockFetch(() => {
      first = !first;
      if (first) return { result: { error: 'match not found' } };
      return clone(FIXTURES.valveDetails);
    });
    const history = (valveHistoryRaw().result as { matches: { match_id: number }[] }).matches;
    const details = await loadHistoryDetails(history as never, { key: 'KEY' }, 1);
    expect(details.size).toBe(1);
  });

  it('отклоняет детали чужого матча (подмена или неверный прокси)', async () => {
    const details = clone(FIXTURES.valveDetails);
    details.result.match_id = 111;
    mockFetch(() => details);
    await expect(steamMatchDetails(7490235544, { key: 'KEY' })).rejects.toMatchObject({ code: 'notfound' });
  });

  it('требует ключ и не отправляет запрос без него', async () => {
    const { impl } = mockFetch(() => ({}));
    await expect(steamMatchDetails(1, { key: '  ' })).rejects.toMatchObject({ code: 'key' });
    expect(impl).not.toHaveBeenCalled();
  });

  it('отправляет запрос на официальный адрес и передаёт ключ в query string', async () => {
    const { calls } = mockFetch(() => clone(FIXTURES.valveDetails));
    await steamMatchDetails(7490235544, { key: 'SECRET' });
    // В dev (и в vitest) запрос идёт через прокси Vite, в проде — напрямую на Valve.
    expect(
      calls[0].url.startsWith(`${STEAM_API_BASE}/IDOTA2Match_570/GetMatchDetails/v1/`) ||
        calls[0].url.startsWith('/steam/IDOTA2Match_570/GetMatchDetails/v1/'),
    ).toBe(true);
    expect(calls[0].url).toContain('key=SECRET');
    expect(calls[0].url).toContain('match_id=7490235544');
  });

  it('преобразует steamid → account_id в summaries', async () => {
    mockFetch(() => clone(FIXTURES.valveSummaries));
    const summaries = await steamPlayerSummaries([1000, 1002], { key: 'KEY' });
    expect(Object.keys(summaries).sort()).toEqual(['1000', '1002']);
    expect(summaries[1000].personaname).toBe('Radiant Core');
  });
});

describe('контракт OpenDota /players/:id', () => {
  it('читает имя и аватар из вложенного profile, rank_tier — из корня', async () => {
    mockFetch(() => clone(FIXTURES.openDotaPlayerPublic));
    const envelope = await fetchPlayer(1000);
    const profile = toPlayerProfile(1000, envelope);
    expect(profile.name).toBe('Test Player');
    expect(profile.avatar).toBe('https://example.com/avatar_full.jpg');
    expect(profile.rankTier).toBe(55);
  });

  it('скрытый профиль остаётся без имени, но не ломается', async () => {
    mockFetch(() => clone(FIXTURES.openDotaPlayerHidden));
    const profile = toPlayerProfile(1001, await fetchPlayer(1001));
    expect(profile.name).toBeNull();
    expect(profile.avatar).toBeNull();
    expect(profile.rankTier).toBeNull();
  });

  it('поддерживает плоский ответ зеркала', () => {
    const profile = toPlayerProfile(1002, clone(FIXTURES.openDotaPlayerFlat) as PlayerProfileEnvelope);
    expect(profile.name).toBe('Flat Player');
    expect(profile.rankTier).toBe(31);
  });

  it('пустой ответ не приводит к падению', () => {
    expect(toPlayerProfile(1, null)).toEqual({ accountId: 1, name: null, avatar: null, rankTier: null });
    expect(toPlayerProfile(1, {})).toEqual({ accountId: 1, name: null, avatar: null, rankTier: null });
  });

  it('fetchProfile возвращает имя из вложенного profile', async () => {
    mockFetch(() => clone(FIXTURES.openDotaPlayerPublic));
    const view = await fetchProfile(1000, settings({ provider: 'opendota' }));
    expect(view).toEqual({
      accountId: 1000,
      name: 'Test Player',
      avatar: 'https://example.com/avatar_full.jpg',
      rankTier: 55,
    });
  });

  it('использует базовый адрес прокси из настроек', async () => {
    const { calls } = mockFetch(() => clone(FIXTURES.openDotaPlayerPublic));
    await fetchProfile(1000, settings({ provider: 'proxy', proxyBase: 'https://mirror.example.com/api/' }));
    expect(calls[0].url.startsWith('https://mirror.example.com/api/players/1000')).toBe(true);
  });

  it('отклоняет некорректный адрес прокси до запроса', async () => {
    const { impl } = mockFetch(() => ({}));
    const error = await fetchProfile(
      1000,
      settings({ provider: 'proxy', proxyBase: 'javascript:alert(1)' }),
    ).catch((err: unknown) => err);
    // Адрес проверяется в dataSource до запроса: код proxy-config.
    expect((error as { code?: string }).code).toBe('proxy-config');
    expect(impl).not.toHaveBeenCalled();
  });

  it('история матчей OpenDota помечается как полная', async () => {
    mockFetch(() => [{ match_id: 7490235544, player_slot: 0, radiant_win: true, duration: 1800, hero_id: 54, start_time: 1, kills: 1, deaths: 2, assists: 3, game_mode: 22 }]);
    const matches = await fetchRecent(1000, settings({ provider: 'opendota' }), 5);
    expect(matches[0].hasDetails).toBe(true);
  });

  it('мусор вместо массива истории не ломает приложение', async () => {
    mockFetch(() => ({ error: 'nope' }));
    await expect(fetchRecentMatches(1000, undefined, undefined, 5, OPEN_DOTA_BASE)).resolves.toEqual([]);
  });
});

describe('история матчей через Valve', () => {
  it('подтягивает результат и KDA из GetMatchDetails', async () => {
    const { calls } = mockFetch((url) => {
      if (url.includes('GetMatchHistory')) return clone(FIXTURES.valveHistory);
      return clone(FIXTURES.valveDetails);
    });
    const matches = await fetchRecent(1000, settings({ steamKey: 'KEY' }), 2);
    expect(matches).toHaveLength(2);
    expect(matches[0].hasDetails).toBe(true);
    expect(matches[0].radiant_win).toBe(true);
    expect(matches[0].duration).toBe(2400);
    expect(matches[0].hero_id).toBe(54);
    expect(calls.some((call) => call.url.includes('GetMatchHistory'))).toBe(true);
    expect(calls.some((call) => call.url.includes('GetMatchDetails'))).toBe(true);
  });

  it('без деталей оставляет результат неизвестным, а не false', async () => {
    mockFetch((url) => {
      if (url.includes('GetMatchHistory')) return clone(FIXTURES.valveHistory);
      return { result: { error: 'nope' } };
    });
    const matches = await fetchRecent(1000, settings({ steamKey: 'KEY' }), 2);
    expect(matches[0].hasDetails).toBe(false);
    expect(matches[0].radiant_win).toBeNull();
    expect(matches[0].duration).toBeNull();
    expect(matches[0].kills).toBeNull();
  });
});

describe('обработка отмены и таймаутов', () => {
  it('не начинает запрос с уже отменённым сигналом', async () => {
    const { impl } = mockFetch(() => ({}));
    const controller = new AbortController();
    controller.abort();
    await expect(steamMatchDetails(1, { key: 'KEY', signal: controller.signal })).rejects.toMatchObject({
      code: 'abort',
    });
    await expect(fetchPlayer(1, undefined, controller.signal)).rejects.toMatchObject({ code: 'abort' });
    expect(impl).not.toHaveBeenCalled();
  });

  it('отличает пользовательскую отмену от таймаута', async () => {
    const controller = new AbortController();
    mockFetch(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    const promise = steamMatchDetails(1, { key: 'KEY', signal: controller.signal });
    setTimeout(() => controller.abort(), 1);
    await expect(promise).rejects.toMatchObject({ code: 'abort' });
  });

  it('по истечении времени ожидания сообщает о таймауте', async () => {
    mockFetch(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const error = new Error('timeout');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );
    await expect(steamMatchDetails(1, { key: 'KEY', timeoutMs: 5 })).rejects.toMatchObject({ code: 'network' });
  });

  it('снимает обработчик внешнего сигнала после завершения запроса', async () => {
    const controller = new AbortController();
    const added: string[] = [];
    const removed: string[] = [];
    const originalAdd = controller.signal.addEventListener.bind(controller.signal);
    const originalRemove = controller.signal.removeEventListener.bind(controller.signal);
    vi.spyOn(controller.signal, 'addEventListener').mockImplementation(((type: string, ...rest: unknown[]) => {
      added.push(type);
      return (originalAdd as (...args: unknown[]) => void)(type, ...rest);
    }) as never);
    vi.spyOn(controller.signal, 'removeEventListener').mockImplementation(((type: string, ...rest: unknown[]) => {
      removed.push(type);
      return (originalRemove as (...args: unknown[]) => void)(type, ...rest);
    }) as never);

    mockFetch(() => clone(FIXTURES.valveDetails));
    await steamMatchDetails(7490235544, { key: 'KEY', signal: controller.signal });
    expect(added).toContain('abort');
    expect(removed).toContain('abort');
  });

  it('сетевая ошибка превращается в понятную ошибку источника', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(steamMatchDetails(1, { key: 'KEY' })).rejects.toMatchObject({ code: 'cors' });
    await expect(fetchPlayer(1)).rejects.toMatchObject({ code: 'network' });
  });

  it('некорректный прокси Steam отклоняется до запроса', async () => {
    const { impl } = mockFetch(() => ({}));
    await expect(steamMatchDetails(1, { key: 'KEY', base: 'ftp://example.com' })).rejects.toBeInstanceOf(SteamError);
    expect(impl).not.toHaveBeenCalled();
  });
});

describe('описание источников', () => {
  it('содержит три источника с понятными ограничениями', () => {
    expect(PROVIDERS.map((item) => item.key)).toEqual(['steam', 'opendota', 'proxy']);
    expect(PROVIDERS.find((item) => item.key === 'steam')?.cons).toContain('парса');
  });

  it('Valve-данные не содержат таймлайнов', () => {
    const raw = valveDetailsRaw().result as Record<string, unknown>;
    const [first] = raw.players as Record<string, unknown>[];
    expect(first).not.toHaveProperty('gold_t');
    expect(first).not.toHaveProperty('obs_log');
    expect(raw).not.toHaveProperty('teamfights');
  });
});
