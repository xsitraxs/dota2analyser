import { beforeEach, describe, expect, it } from 'vitest';
import { parseHash, matchPath } from '../src/lib/router';
import {
  DEFAULT_SETTINGS,
  addHistory,
  clearAll,
  loadHistory,
  loadIdentity,
  loadLessonProgress,
  loadPlan,
  loadSettings,
  rememberPlayerSlot,
  saveIdentity,
  saveSettings,
  setLessonDone,
  syncIdentity,
  togglePlanTask,
} from '../src/lib/storage';
import { findMySlot } from '../src/lib/identity';
import { normalizeMatch } from '../src/lib/normalize';
import { apiMatch, parsedMatch } from './fixtures';

const PREFIX = 'd2a.v1.';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('роутер', () => {
  it('разбирает обычный маршрут матча', () => {
    expect(parseHash('#/match/7490235544/report/3')).toEqual({
      name: 'match',
      id: 7490235544,
      tab: 'report',
      slot: 3,
    });
  });

  it('неизвестная вкладка → обзор', () => {
    expect(parseHash('#/match/7490235544/unknown')).toMatchObject({ tab: 'overview' });
  });

  it('некорректный lesson URI не роняет приложение', () => {
    // Раньше decodeURIComponent('%') выбрасывал URIError во время рендера.
    expect(() => parseHash('#/lesson/%')).not.toThrow();
    expect(parseHash('#/lesson/%')).toEqual({ name: 'lesson', lessonId: '' });
    expect(parseHash('#/lesson/%E0%A4%A')).toEqual({ name: 'lesson', lessonId: '' });
  });

  it('корректный lesson URI декодируется', () => {
    expect(parseHash('#/lesson/last-hits')).toEqual({ name: 'lesson', lessonId: 'last-hits' });
    expect(parseHash('#/lesson/%D1%84%D0%B0%D1%80%D0%BC')).toEqual({ name: 'lesson', lessonId: 'фарм' });
  });

  it('ID из 400 цифр не превращается в Infinity', () => {
    const long = `#/match/${'9'.repeat(400)}`;
    expect(parseHash(long)).toEqual({ name: 'home' });
  });

  it('нечисловой ID и слишком большой слот отклоняются', () => {
    expect(parseHash('#/match/abc')).toEqual({ name: 'home' });
    expect(parseHash('#/match/7490235544/report/9999')).toMatchObject({ slot: undefined });
    expect(parseHash('#/match/0')).toEqual({ name: 'home' });
  });

  it('неизвестный маршрут → главная', () => {
    expect(parseHash('#/nope')).toEqual({ name: 'home' });
    expect(parseHash('')).toEqual({ name: 'home' });
  });

  it('matchPath строит ожидаемый путь', () => {
    expect(matchPath(42, 'report', 7)).toBe('/match/42/report/7');
    expect(matchPath(42)).toBe('/match/42/overview');
  });
});

describe('хранилище: повреждённые данные', () => {
  it('история в виде {} или массива мусора не ломает страницы', () => {
    localStorage.setItem(`${PREFIX}history`, '{}');
    expect(loadHistory()).toEqual([]);

    localStorage.setItem(`${PREFIX}history`, 'not json at all');
    expect(loadHistory()).toEqual([]);

    localStorage.setItem(`${PREFIX}history`, JSON.stringify([null, 5, { matchId: 1 }, { matchId: 2, slot: 0 }]));
    const history = loadHistory();
    expect(history).toHaveLength(1);
    expect(history[0].matchId).toBe(2);
  });

  it('сохранение истории обрезает список и отбрасывает мусор', () => {
    const next = addHistory({
      matchId: 1,
      slot: 0,
      heroId: 1,
      role: 1,
      overall: 70,
      grade: 'B',
      scores: { farm: 70, damage: 60, survival: 50, vision: null, fights: 40, objectives: 30 },
      radiantWin: true,
      isRadiant: true,
      duration: 1800,
      startTime: 1,
      savedAt: 2,
      demo: false,
    });
    expect(next).toHaveLength(1);
    expect(loadHistory()[0].overall).toBe(70);
  });

  it('настройки приводятся к ожидаемой форме', () => {
    localStorage.setItem(
      `${PREFIX}settings`,
      JSON.stringify({ provider: 'hacker', accountId: 'oops', reduceMotion: 'yes', apiKey: 42 }),
    );
    const settings = loadSettings();
    expect(settings.provider).toBe('steam');
    expect(settings.accountId).toBeNull();
    expect(settings.reduceMotion).toBe(false);
    expect(settings.apiKey).toBe('');
  });

  it('ключи можно хранить только в рамках сессии', () => {
    const settings = { ...DEFAULT_SETTINGS, apiKey: 'OD-KEY', steamKey: 'STEAM-KEY', keyScope: 'session' as const };
    saveSettings(settings);

    const local = JSON.parse(localStorage.getItem(`${PREFIX}settings`) ?? '{}');
    expect(local.apiKey).toBe('');
    expect(local.steamKey).toBe('');

    const session = JSON.parse(sessionStorage.getItem(`${PREFIX}keys`) ?? '{}');
    expect(session.apiKey).toBe('OD-KEY');
    expect(loadSettings().steamKey).toBe('STEAM-KEY');
  });

  it('при обычном хранении ключи попадают в localStorage', () => {
    saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'K1', steamKey: 'K2' });
    const local = JSON.parse(localStorage.getItem(`${PREFIX}settings`) ?? '{}');
    expect(local.apiKey).toBe('K1');
    expect(local.steamKey).toBe('K2');
    expect(sessionStorage.getItem(`${PREFIX}keys`)).toBeNull();
  });

  it('прогресс уроков и план задач переживают мусор', () => {
    localStorage.setItem(`${PREFIX}lessons`, '"nope"');
    expect(loadLessonProgress()).toEqual({});

    localStorage.setItem(`${PREFIX}lessons`, JSON.stringify({ a: 1, b: { done: true, at: 5 } }));
    expect(loadLessonProgress()).toEqual({ b: { done: true, at: 5 } });

    setLessonDone('a', true);
    expect(loadLessonProgress().a.done).toBe(true);

    localStorage.setItem(`${PREFIX}plan.1.0`, '"nope"');
    expect(loadPlan(1, 0)).toEqual({});
    expect(togglePlanTask(1, 0, 'task-1')).toEqual({ 'task-1': true });
  });

  it('identity приводит слоты к числам', () => {
    localStorage.setItem(`${PREFIX}identity`, JSON.stringify({ accountId: 'x', selectedSlots: { 1: 'nope', 2: '5' } }));
    const identity = loadIdentity();
    expect(identity.accountId).toBeNull();
    expect(identity.selectedSlots).toEqual({ 2: 5 });
  });

  it('полный сброс удаляет и localStorage, и кэши сессии', () => {
    saveSettings({ ...DEFAULT_SETTINGS, apiKey: 'K' });
    setLessonDone('a', true);
    sessionStorage.setItem('d2a.match.steam::123', '{"version":2}');
    sessionStorage.setItem('other-app', 'keep');

    clearAll();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.getItem('d2a.match.steam::123')).toBeNull();
    // Чужой ключ в sessionStorage не трогаем.
    expect(sessionStorage.getItem('other-app')).toBe('keep');
  });
});

describe('выбор «я» в матче', () => {
  const match = normalizeMatch([apiMatch(), parsedMatch()]);

  it('сохранённый аккаунт имеет приоритет над ручным выбором', () => {
    const identity = { accountId: null, selectedSlots: { [match.id]: match.players[4].slot } };
    const slot = findMySlot(match, identity, 1000);
    expect(slot).toBe(0); // accountId 1000 — первый игрок
  });

  it('без сохранённого аккаунта работает ручной выбор', () => {
    const identity = { accountId: null, selectedSlots: { [match.id]: match.players[7].slot } };
    expect(findMySlot(match, identity, null)).toBe(match.players[7].slot);
  });

  it('устаревший ручной слот игнорируется', () => {
    const identity = { accountId: null, selectedSlots: { [match.id]: 999 } };
    expect(findMySlot(match, identity, null)).toBeNull();
  });

  it('аккаунт, которого нет в матче, не выбирает чужого игрока', () => {
    const identity = { accountId: 424242, selectedSlots: {} };
    expect(findMySlot(match, identity, 424242)).toBeNull();
  });

  it('«Это я» синхронизирует аккаунт между настройками и identity', () => {
    const player = match.players[2];
    const remembered = rememberPlayerSlot(match.id, player.slot, player.accountId);
    expect(remembered.accountId).toBe(player.accountId);

    const synced = syncIdentity({ accountId: null, selectedSlots: {} }, player.accountId ?? null);
    expect(synced.accountId).toBe(player.accountId);
    saveIdentity(synced);
    expect(loadIdentity().accountId).toBe(player.accountId);
  });
});
