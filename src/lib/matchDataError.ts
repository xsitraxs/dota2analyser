/**
 * Ошибка данных матча.
 *
 * Вынесена в отдельный модуль, чтобы валидация и нормализация могли
 * использовать её без циклических импортов.
 *
 * Коды:
 *  - `no-api`     — есть парс, но нет базовой статистики;
 *  - `invalid`    — данные не похожи на матч или повреждены;
 *  - `empty`      — ничего не передано;
 *  - `mismatch`   — источники относятся к разным match_id.
 */
export type MatchDataErrorCode = 'no-api' | 'invalid' | 'empty' | 'mismatch';

export class MatchDataError extends Error {
  code: MatchDataErrorCode;
  matchId?: number;

  constructor(code: MatchDataErrorCode, message: string, matchId?: number) {
    super(message);
    this.name = 'MatchDataError';
    this.code = code;
    this.matchId = matchId;
  }
}
