import { ApiError } from './openDota';
import { SteamError } from './steam';

export class AppError extends Error {
  code: string;
  hint?: string;
  constructor(code: string, message: string, hint?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.hint = hint;
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof SteamError) return new AppError(`steam-${error.code}`, error.message, error.hint);
  if (error instanceof ApiError) {
    const hint =
      error.code === 'network'
        ? 'Если OpenDota недоступна из твоей сети, переключи источник на Valve в настройках.'
        : error.code === 'rate'
          ? 'Можно добавить бесплатный ключ OpenDota в настройках или подождать.'
          : undefined;
    return new AppError(`opendota-${error.code}`, error.message, hint);
  }
  if (error instanceof Error) return new AppError('unknown', error.message);
  return new AppError('unknown', 'Что-то пошло не так. Попробуй ещё раз.');
}

export function needsSettings(code: string): boolean {
  return (
    code === 'steam-key' ||
    code === 'steam-cors' ||
    code === 'steam-network' ||
    code === 'proxy-config' ||
    code === 'opendota-network' ||
    code === 'opendota-rate'
  );
}
