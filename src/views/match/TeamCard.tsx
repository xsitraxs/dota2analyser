import { ChevronRight, Crown, Shield, Swords } from 'lucide-react';
import { useApp } from '../../lib/app-context';
import { displayName } from '../../lib/identity';
import { fmtNum } from '../../lib/format';
import { matchPath } from '../../lib/router';
import type { Match, MatchAnalysis, Side } from '../../types';
import { HeroAvatar, RoleBadge, SIDE_COLOR, SIDE_LABEL, ScoreRing } from '../../components/ui';

export function TeamCard({
  match,
  analysis,
  side,
  mySlot,
  compact = false,
}: {
  match: Match;
  analysis: MatchAnalysis;
  side: Side;
  mySlot: number | null;
  compact?: boolean;
}) {
  const { navigate } = useApp();
  const players = analysis.players
    .filter((item) => item.player.isRadiant === (side === 'radiant'))
    .sort((a, b) => a.role - b.role);
  const team = analysis.teams[side];
  const won = (side === 'radiant') === match.radiantWin;
  const top = [...players].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))[0];

  return (
    <div className={`panel relative overflow-hidden ${compact ? '' : 'p-0'}`}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-[0.13]"
        style={{ background: `radial-gradient(ellipse at 20% 0%, ${SIDE_COLOR[side]}, transparent 70%)` }}
      />
      <div className="relative flex items-center justify-between gap-3 border-b border-white/[0.055] px-4 py-3.5 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-8 w-8 place-items-center rounded-lg border text-[10px] font-bold"
            style={{ borderColor: `${SIDE_COLOR[side]}40`, background: `${SIDE_COLOR[side]}10`, color: SIDE_COLOR[side] }}
          >
            {side === 'radiant' ? 'R' : 'D'}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold" style={{ color: SIDE_COLOR[side] }}>
                {SIDE_LABEL[side]}
              </span>
              <span
                className="rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em]"
                style={{
                  borderColor: `${won ? SIDE_COLOR[side] : '#64756E'}45`,
                  color: won ? SIDE_COLOR[side] : '#8FA69D',
                  background: won ? `${SIDE_COLOR[side]}12` : 'rgba(255,255,255,0.03)',
                }}
              >
                {won ? 'победа' : 'поражение'}
              </span>
            </div>
            <div className="mt-0.5 text-[9.5px] text-ink-500">
              {team.kills} {team.kills === 1 ? 'убийство' : 'убийств'} · {fmtNum(team.netWorth)} нетворс
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {top && (
            <span className="hidden items-center gap-1 text-[10px] text-ink-400 sm:flex">
              <Crown size={11} className="text-gold" />
              {top.hero?.localized_name}
            </span>
          )}
          <div className="text-right">
            <div className="font-display text-xl font-semibold text-white">{side === 'radiant' ? match.radiantScore : match.direScore}</div>
            <div className="text-[8px] uppercase tracking-[0.12em] text-ink-500">счёт</div>
          </div>
        </div>
      </div>

      <div className="relative divide-y divide-white/[0.045]">
        {players.map((item) => {
          const isMe = mySlot === item.player.slot;
          const name = displayName(item.player.name);
          return (
            <button
              key={item.player.slot}
              type="button"
              onClick={() => navigate(matchPath(match.id, 'report', item.player.slot))}
              className={`group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-white/[0.035] sm:px-4 ${
                isMe ? 'bg-lime/[0.045]' : ''
              }`}
            >
              <HeroAvatar hero={item.hero} size={34} side={side} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-semibold text-white">{item.hero?.localized_name ?? 'Герой'}</span>
                  {isMe && (
                    <span className="rounded bg-lime/15 px-1.5 py-0.5 text-[7.5px] font-bold uppercase tracking-wider text-lime">
                      ты
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-ink-500">
                  <RoleBadge role={item.role} short />
                  <span className="truncate">{name ?? item.laneLabel}</span>
                  {name && <span>· {item.laneLabel}</span>}
                </div>
              </div>
              <div className="hidden w-16 text-right sm:block">
                <div className="text-[11px] font-semibold text-ink-200">
                  {item.player.kills}/{item.player.deaths}/{item.player.assists}
                </div>
                <div className="text-[8px] uppercase tracking-wider text-ink-500">K/D/A</div>
              </div>
              <div className="hidden w-12 text-right md:block">
                <div className="text-[11px] font-semibold text-ink-200">{fmtNum(item.player.gpm)}</div>
                <div className="text-[8px] uppercase tracking-wider text-ink-500">GPM</div>
              </div>
              <div className="flex items-center gap-1.5">
                <ScoreRing value={item.overall} size={34} stroke={3} />
                <ChevronRight size={13} className="text-ink-600 transition group-hover:translate-x-0.5 group-hover:text-lime" />
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.055] px-4 py-2.5 text-[9px] text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <Shield size={11} /> {team.towers} {team.towers === 1 ? 'башня' : team.towers > 1 && team.towers < 5 ? 'башни' : 'башен'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Swords size={11} /> {team.fightsWon} {team.fightsWon === 1 ? 'драка' : 'драк'}
        </span>
        <span>Средняя оценка: <strong className="font-semibold text-ink-200">{team.avgScore ?? '—'}</strong></span>
      </div>
    </div>
  );
}
