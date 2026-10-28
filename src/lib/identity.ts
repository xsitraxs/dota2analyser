import type { Match } from '../types';
import type { IdentityState } from './storage';

/**
 * Определяет слот игрока, который считается «тобой».
 *
 * Приоритет:
 *  1. сохранённый аккаунт (настройки или identity) — если он есть в матче;
 *  2. ручной выбор для этого матча («Это я»);
 *  3. null — игрок не выбран.
 *
 * Раньше settings.accountId и identity.accountId жили независимо, из-за чего
 * сохранённый профиль мог не выбираться в матче, а устаревший identity —
 * продолжать выбирать старый аккаунт.
 */
export function findMySlot(
  match: Match,
  identity: IdentityState,
  savedAccountId: number | null = null,
): number | null {
  const accountId = savedAccountId ?? identity.accountId;
  if (accountId != null) {
    const byAccount = match.players.find((player) => player.accountId === accountId);
    if (byAccount) return byAccount.slot;
  }
  const saved = identity.selectedSlots[String(match.id)];
  if (saved != null && match.players.some((player) => player.slot === saved)) return saved;
  return null;
}

export function displayName(name: string): string | null {
  if (!name || /^Игрок \d+$/.test(name)) return null;
  return name;
}
