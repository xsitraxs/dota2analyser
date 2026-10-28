import { describe, expect, it } from 'vitest';
import { MatchDataError, normalizeMatch, readJsonFiles } from '../src/lib/normalize';
import { LIMITS } from '../src/lib/validate';
import { apiMatch, fakeFile, minimalMatch, parsedMatch, valveDetailsRaw } from './fixtures';

function expectMatchDataError(fn: () => unknown, code?: string): MatchDataError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(MatchDataError);
    if (code) expect((error as MatchDataError).code).toBe(code);
    return error as MatchDataError;
  }
  throw new Error('Ожидалась ошибка MatchDataError, но её не было');
}

describe('normalizeMatch: целостность данных', () => {
  it('склеивает API и парс одного матча', () => {
    const match = normalizeMatch([apiMatch(), parsedMatch()]);
    expect(match.id).toBe(7490235544);
    expect(match.players).toHaveLength(10);
    expect(match.parsed).toBe(true);
    expect(match.coverage.timelines).toBe(true);
    expect(match.coverage.fights).toBe(true);
    expect(match.coverage.objectives).toBe(true);
  });

  it('отклоняет склейку разных match_id (API 100 + парс 200)', () => {
    const error = expectMatchDataError(() => normalizeMatch([apiMatch(), parsedMatch(8234567891)]), 'mismatch');
    expect(error.message).toContain('7490235544');
    expect(error.message).toContain('8234567891');
  });

  it('отклоняет парс другого матча при указанном ожидаемом ID', () => {
    expectMatchDataError(
      () => normalizeMatch([parsedMatch(8234567891)], { expectedMatchId: 7490235544 }),
      'mismatch',
    );
  });

  it('принимает парс с совпадающим ожидаемым ID', () => {
    const match = normalizeMatch([parsedMatch(7490235544)], { expectedMatchId: 7490235544 });
    expect(match.id).toBe(7490235544);
  });

  it('не подменяет данные матча при несовпадении: кэш/состояние не должны меняться', () => {
    // Проверяем, что ошибка выбрасывается до какой-либо мутации входов.
    const api = apiMatch();
    const parsed = parsedMatch(8234567891);
    const apiSnapshot = JSON.stringify(api);
    expect(() => normalizeMatch([api, parsed])).toThrow(MatchDataError);
    expect(JSON.stringify(api)).toBe(apiSnapshot);
  });

  it('отклоняет смешанный массив с разными ID без ожидаемого ID', () => {
    const first = minimalMatch({ match_id: 111 });
    const second = minimalMatch({ match_id: 222 });
    expectMatchDataError(() => normalizeMatch([first, second]), 'mismatch');
  });
});

describe('normalizeMatch: валидация структуры', () => {
  it('не падает с TypeError на players=[null]', () => {
    const error = expectMatchDataError(
      () => normalizeMatch([minimalMatch({ players: [null, null] })]),
      'invalid',
    );
    expect(error.name).toBe('MatchDataError');
  });

  it('отклоняет повторяющиеся слоты', () => {
    const players = Array.from({ length: 10 }, () => ({ player_slot: 0, hero_id: 5 }));
    expectMatchDataError(() => normalizeMatch([minimalMatch({ players })]), 'invalid');
  });

  it('отклоняет 11 игроков', () => {
    const players = Array.from({ length: 11 }, (_, index) => ({ player_slot: index, hero_id: 5 }));
    expectMatchDataError(() => normalizeMatch([minimalMatch({ players })]), 'invalid');
  });

  it('отклоняет отрицательную длительность', () => {
    expectMatchDataError(() => normalizeMatch([minimalMatch({ duration: -120 })]), 'invalid');
  });

  it('отклоняет нулевую и отсутствующую длительность', () => {
    expectMatchDataError(() => normalizeMatch([minimalMatch({ duration: 0 })]), 'invalid');
    expectMatchDataError(() => normalizeMatch([minimalMatch({ duration: undefined })]), 'invalid');
  });

  it('отклоняет некорректный ID матча (в том числе «бесконечный» из 400 цифр)', () => {
    expectMatchDataError(() => normalizeMatch([minimalMatch({ match_id: Number('9'.repeat(400)) })]), 'invalid');
    expectMatchDataError(() => normalizeMatch([minimalMatch({ match_id: 0 })]), 'invalid');
    expectMatchDataError(() => normalizeMatch([minimalMatch({ match_id: 'abc' })]), 'invalid');
  });

  it('отклоняет слишком длинный матч', () => {
    expectMatchDataError(
      () => normalizeMatch([minimalMatch({ duration: LIMITS.maxDuration + 1 })]),
      'invalid',
    );
  });

  it('обрезaет слишком длинные временные ряды', () => {
    const times = Array.from({ length: LIMITS.maxSeriesLength + 500 }, (_, index) => index);
    const payload = minimalMatch();
    (payload.players as Record<string, unknown>[])[0].times = times;
    (payload.players as Record<string, unknown>[])[0].gold_t = times.map(() => 100);
    const match = normalizeMatch([payload]);
    expect(match.players[0].times).toHaveLength(LIMITS.maxSeriesLength);
  });

  it('отбрасывает события с некорректным временем', () => {
    const parsed = parsedMatch();
    parsed.objectives = [
      { time: 62, type: 'CHAT_MESSAGE_FIRSTBLOOD', player_slot: 128 },
      { time: -500, type: 'CHAT_MESSAGE_FIRSTBLOOD', player_slot: 0 },
      { time: 10_000_000, type: 'CHAT_MESSAGE_FIRSTBLOOD', player_slot: 0 },
      { time: 'not-a-number', type: 'CHAT_MESSAGE_FIRSTBLOOD', player_slot: 0 },
    ];
    const match = normalizeMatch([apiMatch(), parsed]);
    expect(match.objectives).toHaveLength(1);
    expect(match.objectives[0].time).toBe(62);
  });

  it('не падает на мусоре вместо массива игроков', () => {
    expectMatchDataError(() => normalizeMatch([minimalMatch({ players: 'nope' })]), 'invalid');
    expectMatchDataError(() => normalizeMatch([{ match_id: 1 }]), 'invalid');
    expectMatchDataError(() => normalizeMatch([]), 'empty');
  });
});

describe('normalizeMatch: неизвестное значение ≠ ноль', () => {
  it('без парса roshans_killed и варды остаются неизвестными', () => {
    const match = normalizeMatch([apiMatch()]);
    expect(match.coverage.wards).toBe(false);
    expect(match.coverage.objectives).toBe(false);
    expect(match.players.every((player) => player.roshansKilled == null)).toBe(true);
    expect(match.players.every((player) => player.obsPlaced == null)).toBe(true);
    expect(match.players.every((player) => player.campsStacked == null)).toBe(true);
  });

  it('с парсом значения берутся из данных, включая честный ноль', () => {
    const match = normalizeMatch([apiMatch(), parsedMatch()]);
    const dire = match.players.filter((player) => !player.isRadiant);
    expect(dire.every((player) => player.roshansKilled != null)).toBe(true);
    expect(dire.some((player) => player.roshansKilled === 0)).toBe(true);
    expect(match.players.every((player) => player.obsPlaced != null)).toBe(true);
  });

  it('Valve-данные не считаются распарсенными', () => {
    const match = normalizeMatch([valveDetailsRaw()]);
    expect(match.parsed).toBe(false);
    expect(match.coverage.timelines).toBe(false);
    expect(match.coverage.wards).toBe(false);
    expect(match.warnings.join(' ')).toContain('не распарсен');
  });
});

describe('readJsonFiles', () => {
  it('читает корректный JSON', async () => {
    const result = await readJsonFiles([fakeFile('a.json', '{"match_id":1}')]);
    expect(result).toEqual([{ match_id: 1 }]);
  });

  it('сообщает о некорректном JSON как о MatchDataError', async () => {
    await expect(readJsonFiles([fakeFile('a.json', '{oops')])).rejects.toBeInstanceOf(MatchDataError);
  });

  it('проверяет размер до чтения содержимого', async () => {
    await expect(
      readJsonFiles([fakeFile('big.json', '{}', LIMITS.maxFileBytes + 1)]),
    ).rejects.toBeInstanceOf(MatchDataError);
  });

  it('отклоняет пустой список файлов', async () => {
    await expect(readJsonFiles([])).rejects.toBeInstanceOf(MatchDataError);
  });
});
