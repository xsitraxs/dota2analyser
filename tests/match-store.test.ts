import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiMatch, parsedMatch } from './fixtures';
import { DEFAULT_SETTINGS } from '../src/lib/storage';
import type { Settings } from '../src/types';

vi.mock('../src/lib/dataSource', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/dataSource')>();
  return { ...actual, fetchRawMatch: vi.fn() };
});

/** ID, которого нет среди встроенных демо: иначе loadMatch вернул бы демо-данные. */
const MATCH_ID = 8234567891;

async function freshStore() {
  vi.resetModules();
  const store = await import('../src/lib/matchStore');
  const dataSource = await import('../src/lib/dataSource');
  const fetchRawMatch = vi.mocked(dataSource.fetchRawMatch);
  // Сбрасываем и список вызовов: между «перезагрузками» модуля мок переиспользуется.
  fetchRawMatch.mockReset();
  return { store, fetchRawMatch };
}

const steam = (overrides: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  provider: 'steam',
  steamKey: 'KEY',
  ...overrides,
});

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('жизненный цикл данных матча', () => {
  it('импорт сохраняет исходники и не требует сеть для догрузки парса', async () => {
    const { store, fetchRawMatch } = await freshStore();
    const settings = steam();

    const match = store.importMatch([apiMatch(MATCH_ID)], settings);
    expect(match.parsed).toBe(false);

    // Сеть не нужна: базовые данные уже есть локально.
    fetchRawMatch.mockImplementation(() => {
      throw new Error('сеть не должна использоваться');
    });

    const merged = await store.mergeParsedData(MATCH_ID, [parsedMatch(MATCH_ID)], settings);
    expect(merged.parsed).toBe(true);
    expect(merged.coverage.timelines).toBe(true);
    expect(fetchRawMatch).not.toHaveBeenCalled();
    expect(store.getMatchSources(MATCH_ID, settings)).toHaveLength(2);
  });

  it('догруженный парс сохраняется после обновления', async () => {
    const { store, fetchRawMatch } = await freshStore();
    const settings = steam();

    fetchRawMatch.mockResolvedValue(apiMatch(MATCH_ID));
    const loaded = await store.loadMatch(MATCH_ID, settings);
    expect(loaded.parsed).toBe(false);

    const merged = await store.mergeParsedData(MATCH_ID, [parsedMatch(MATCH_ID)], settings);
    expect(merged.parsed).toBe(true);

    fetchRawMatch.mockResolvedValue(apiMatch(MATCH_ID));
    const refreshed = await store.refreshMatch(MATCH_ID, settings);
    expect(refreshed.parsed).toBe(true);
    expect(refreshed.coverage.timelines).toBe(true);
    expect(refreshed.coverage.fights).toBe(true);
    expect(refreshed.players[0].goldT.length).toBeGreaterThan(1);
  });

  it('восстанавливает матч и исходники из sessionStorage (эмуляция перезагрузки)', async () => {
    const first = await freshStore();
    const settings = steam();
    first.fetchRawMatch.mockResolvedValue(apiMatch(MATCH_ID));
    await first.store.loadMatch(MATCH_ID, settings);
    await first.store.mergeParsedData(MATCH_ID, [parsedMatch(MATCH_ID)], settings);

    // «Перезагрузка страницы»: новый экземпляр модуля, sessionStorage остаётся.
    const second = await freshStore();
    second.fetchRawMatch.mockImplementation(() => {
      throw new Error('сеть не нужна: данные уже в sessionStorage');
    });
    const restored = await second.store.loadMatch(MATCH_ID, settings);
    expect(restored.parsed).toBe(true);
    expect(second.store.getMatchSources(MATCH_ID, settings)).toHaveLength(2);

    const mergedAgain = await second.store.mergeParsedData(MATCH_ID, [parsedMatch(MATCH_ID)], settings);
    expect(mergedAgain.parsed).toBe(true);
    expect(second.fetchRawMatch).not.toHaveBeenCalled();
  });

  it('повреждённая запись sessionStorage безопасно игнорируется', async () => {
    const { store, fetchRawMatch } = await freshStore();
    const settings = steam();
    const key = `steam::${MATCH_ID}`;
    sessionStorage.setItem(`d2a.match.${key}`, '{"version":2,"match":{"id":"oops"},"sources":[]}');

    fetchRawMatch.mockResolvedValue(apiMatch(MATCH_ID));
    const match = await store.loadMatch(MATCH_ID, settings);
    expect(match.id).toBe(MATCH_ID);
    expect(fetchRawMatch).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(`d2a.match.${key}`)).not.toBe('{"version":2,"match":{"id":"oops"},"sources":[]}');
  });

  it('адрес источника входит в ключ кэша', async () => {
    const { store, fetchRawMatch } = await freshStore();
    const firstSettings = steam({ provider: 'proxy', proxyBase: 'https://a.example.com/api' });
    fetchRawMatch.mockResolvedValue(apiMatch(MATCH_ID));
    await store.loadMatch(MATCH_ID, firstSettings);
    expect(fetchRawMatch).toHaveBeenCalledTimes(1);

    const secondSettings = steam({ provider: 'proxy', proxyBase: 'https://b.example.com/api' });
    await store.loadMatch(MATCH_ID, secondSettings);
    // Другое зеркало — отдельная запись кэша, старые данные не подсовываются.
    expect(fetchRawMatch).toHaveBeenCalledTimes(2);
  });

  it('обновление отклоняет ответ с чужим match_id и не портит кэш', async () => {
    const { store, fetchRawMatch } = await freshStore();
    const settings = steam();
    fetchRawMatch.mockResolvedValue(apiMatch(MATCH_ID));
    const loaded = await store.loadMatch(MATCH_ID, settings);
    await store.mergeParsedData(MATCH_ID, [parsedMatch(MATCH_ID)], settings);

    // Источник вернул другой match_id (подмена или неверный ID) — данные не склеиваем.
    fetchRawMatch.mockResolvedValue(apiMatch(111));
    // Класс ошибки из «перезагруженного» модуля — сравниваем по имени и коду.
    await expect(store.refreshMatch(MATCH_ID, settings)).rejects.toMatchObject({
      name: 'MatchDataError',
      code: 'mismatch',
    });

    const cached = store.getCachedMatch(MATCH_ID, settings);
    expect(cached?.id).toBe(MATCH_ID);
    expect(cached?.parsed).toBe(true);
    expect(loaded.id).toBe(MATCH_ID);
  });

  it('догрузка парса чужого матча отклоняется', async () => {
    const { store, fetchRawMatch } = await freshStore();
    const settings = steam();
    fetchRawMatch.mockResolvedValue(apiMatch(MATCH_ID));
    await store.loadMatch(MATCH_ID, settings);

    await expect(store.mergeParsedData(MATCH_ID, [parsedMatch(7490235544)], settings)).rejects.toMatchObject({
      name: 'MatchDataError',
      code: 'mismatch',
    });

    // Кэш не должен измениться.
    expect(store.getCachedMatch(MATCH_ID, settings)?.parsed).toBe(false);
    expect(store.getMatchSources(MATCH_ID, settings)).toHaveLength(1);
  });

  it('загрузка проверяет ожидаемый ID матча', async () => {
    const { store, fetchRawMatch } = await freshStore();
    const settings = steam();
    fetchRawMatch.mockResolvedValue(apiMatch(111));
    await expect(store.loadMatch(MATCH_ID, settings)).rejects.toMatchObject({
      name: 'MatchDataError',
      code: 'mismatch',
    });
    expect(store.getCachedMatch(MATCH_ID, settings)).toBeNull();
  });

  it('сброс очищает кэши матчей в памяти и sessionStorage', async () => {
    const { store, fetchRawMatch } = await freshStore();
    const settings = steam();
    fetchRawMatch.mockResolvedValue(apiMatch(MATCH_ID));
    await store.loadMatch(MATCH_ID, settings);
    expect(sessionStorage.length).toBeGreaterThan(0);

    store.clearMatchCaches();
    expect(store.getCachedMatch(MATCH_ID, settings)).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(store.getMatchSources(MATCH_ID, settings)).toEqual([]);
  });
});
