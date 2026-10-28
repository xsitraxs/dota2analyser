import { describe, expect, it } from 'vitest';
import { LIMITS, checkApiBaseUrl, checkFileSize, looksLikeSecretUrl, readMatchId, validatePlayers } from '../src/lib/validate';
import { MatchDataError } from '../src/lib/matchDataError';

describe('валидация адресов', () => {
  it('принимает полный https-адрес и убирает завершающие слеши', () => {
    const result = checkApiBaseUrl('https://example.com/api///');
    expect(result.ok).toBe(true);
    expect(result.value).toBe('https://example.com/api');
  });

  it('отклоняет адрес без схемы и с пробелами', () => {
    expect(checkApiBaseUrl('example.com/api').ok).toBe(false);
    expect(checkApiBaseUrl('https://exa mple.com').ok).toBe(false);
  });

  it('отклоняет javascript: и data:', () => {
    expect(checkApiBaseUrl('javascript:alert(1)').ok).toBe(false);
    expect(checkApiBaseUrl('data:text/html,<b>x</b>').ok).toBe(false);
  });

  it('пустая строка допустима (адрес просто не задан)', () => {
    expect(checkApiBaseUrl('').ok).toBe(true);
  });

  it('находит секрет в query-параметрах прокси', () => {
    expect(looksLikeSecretUrl('https://corsproxy.io/?key=abc123')).toBe(true);
    expect(looksLikeSecretUrl('https://proxy.example/api?api_key=1')).toBe(true);
    expect(looksLikeSecretUrl('https://proxy.example/api?token=1')).toBe(true);
    expect(looksLikeSecretUrl('https://proxy.example/api')).toBe(false);
    // Подозрительное слово в пути — не секрет.
    expect(looksLikeSecretUrl('https://proxy.example/keys')).toBe(false);
  });
});

describe('ограничения размера', () => {
  it('отклоняет файл больше лимита', () => {
    expect(() => checkFileSize({ name: 'big.json', size: LIMITS.maxFileBytes + 1 }, 0)).toThrow(MatchDataError);
  });

  it('отклоняет сумму больше общего лимита', () => {
    expect(() => checkFileSize({ name: 'a.json', size: LIMITS.maxTotalBytes }, LIMITS.maxTotalBytes)).toThrow(
      MatchDataError,
    );
  });

  it('пропускает файл в пределах лимитов', () => {
    expect(() => checkFileSize({ name: 'ok.json', size: 1024 }, 0)).not.toThrow();
  });
});

describe('идентификаторы матча', () => {
  it('принимает число и числовую строку', () => {
    expect(readMatchId(7490235544)).toBe(7490235544);
    expect(readMatchId('7490235544')).toBe(7490235544);
  });

  it('отклоняет мусор и слишком большие значения', () => {
    expect(readMatchId('abc')).toBeNull();
    expect(readMatchId(Infinity)).toBeNull();
    expect(readMatchId(LIMITS.maxMatchId + 1)).toBeNull();
    expect(readMatchId(-5)).toBeNull();
  });
});

describe('состав игроков', () => {
  const ok = Array.from({ length: 10 }, (_value, index) => ({ player_slot: index }));

  it('пропускает ровных 10 уникальных слотов', () => {
    expect(() => validatePlayers(ok)).not.toThrow();
  });

  it('отклоняет дубли slot', () => {
    const dup = ok.map((_player, index) => ({ player_slot: index === 9 ? 0 : index }));
    expect(() => validatePlayers(dup)).toThrow(MatchDataError);
  });

  it('отклоняет больше 10 игроков', () => {
    const many = [...ok, { player_slot: 128 }];
    expect(() => validatePlayers(many)).toThrow(MatchDataError);
  });

  it('отклоняет слот вне диапазона', () => {
    expect(() => validatePlayers([{ player_slot: 9999 }])).toThrow(MatchDataError);
  });
});
