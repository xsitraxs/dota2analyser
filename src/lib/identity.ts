import type { Match } from '../types';
import type { IdentityState } from './storage';

export function findMySlot(match: Match, identity: IdentityState): number | null {
  if (identity.accountId != null) {
    const byAccount = match.players.find((player) => player.accountId === identity.accountId);
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
