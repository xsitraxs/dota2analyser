import { useMemo, useState } from 'react';
import { ArrowUpDown, Search, UserRound } from 'lucide-react';
import { useApp } from '../../lib/app-context';
import { displayName } from '../../lib/identity';
import { DIMENSION_META, ROLE_COLOR } from '../../lib/constants';
import { fmtNum, fmtPct } from '../../lib/format';
import { matchPath } from '../../lib/router';
import type { Match, MatchAnalysis, PlayerAnalysis } from '../../types';
import { HeroAvatar, RoleBadge, SIDE_COLOR, SIDE_LABEL } from '../../components/ui';

type SortKey = 'role' | 'overall' | 'gpm' | 'xpm' | 'lastHits' | 'deaths' | 'netWorth' | 'heroDamage';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'role', label: 'По роли' },
  { key: 'overall', label: 'Оценка' },
  { key: 'gpm', label: 'GPM' },
  { key: 'xpm', label: 'XPM' },
  { key: 'lastHits', label: 'Добивания' },
  { key: 'deaths', label: 'Смерти' },
  { key: 'netWorth', label: 'Нетворс' },
  { key: 'heroDamage', label: 'Урон' },
];

function sortValue(item: PlayerAnalysis, key: SortKey): number {
  switch (key) {
    case 'role':
      return item.role;
    case 'overall':
      return item.overall ?? -1;
    case 'gpm':
      return item.player.gpm;
    case 'xpm':
      return item.player.xpm;
    case 'lastHits':
      return item.player.lastHits;
    case 'deaths':
      return item.player.deaths;
    case 'netWorth':
      return item.player.netWorth;
    case 'heroDamage':
      return item.player.heroDamage;
    default:
      return 0;
  }
}

export function PlayersTab({
  match,
  analysis,
  mySlot,
}: {
  match: Match;
  analysis: MatchAnalysis;
  mySlot: number | null;
}) {
  const { navigate } = useApp();
  const [sort, setSort] = useState<SortKey>('role');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const filtered = analysis.players.filter((item) => {
      if (!query.trim()) return true;
      const needle = query.trim().toLowerCase();
      return (
        (item.hero?.localized_name ?? '').toLowerCase().includes(needle) ||
        item.player.name.toLowerCase().includes(needle) ||
        item.roleLabel.toLowerCase().includes(needle)
      );
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'role') {
        if (a.player.isRadiant !== b.player.isRadiant) return a.player.isRadiant ? -1 : 1;
        return a.role - b.role;
      }
      return sortValue(b, sort) - sortValue(a, sort);
    });
  }, [analysis.players, sort, query]);

  const columns: { key: SortKey; label: string; width?: string }[] = [
    { key: 'gpm', label: 'GPM' },
    { key: 'xpm', label: 'XPM' },
    { key: 'lastHits', label: 'LH/DN' },
    { key: 'deaths', label: 'Смерти' },
    { key: 'netWorth', label: 'Нетворс' },
    { key: 'heroDamage', label: 'Урон' },
    { key: 'overall', label: 'Оценка' },
  ];

  return (
    <div className="space-y-4">
      <div className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="kicker">Сравнение игроков</div>
            <h2 className="display-title mt-1 text-xl text-white">Все участники и оценки</h2>
            <p className="mt-1 text-[11.5px] text-ink-400">
              Оценки строятся с поправкой на позицию игрока. Нажми на строку — откроется полный отчёт, там же можно отметить «Это я».
            </p>
          </div>
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Герой или игрок"
              className="h-9 w-48 rounded-lg border border-white/[0.09] bg-white/[0.035] pl-8 pr-3 text-[12px] text-white outline-none placeholder:text-ink-500 focus:border-lime/40"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {SORTS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSort(item.key)}
              className={`chip ${sort === item.key ? 'chip-active' : ''}`}
            >
              {item.key !== 'role' && <ArrowUpDown size={10} />}
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-1">
            <thead>
              <tr>
                <th className="table-head px-2 pb-1 text-left">Игрок</th>
                {columns.map((column) => (
                  <th key={column.key} className="table-head px-2 pb-1 text-right">
                    {column.label}
                  </th>
                ))}
                <th className="table-head px-2 pb-1 text-right">Зоны</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const isMe = item.player.slot === mySlot;
                const side = item.player.isRadiant ? 'radiant' : 'dire';
                const name = displayName(item.player.name);
                return (
                  <tr
                    key={item.player.slot}
                    onClick={() => navigate(matchPath(match.id, 'report', item.player.slot))}
                    className={`group cursor-pointer transition ${isMe ? 'bg-lime/[0.05]' : 'bg-white/[0.018] hover:bg-white/[0.05]'}`}
                  >
                    <td className="rounded-l-xl px-2.5 py-2">
                      <div className="flex items-center gap-2.5">
                        <HeroAvatar hero={item.hero} size={32} side={side} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[12px] font-semibold text-white">
                              {item.hero?.localized_name ?? 'Герой'}
                            </span>
                            {isMe && (
                              <span className="rounded bg-lime/15 px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider text-lime">
                                ты
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-ink-500">
                            <span style={{ color: SIDE_COLOR[side] }}>{SIDE_LABEL[side][0]}</span>
                            <RoleBadge role={item.role} short />
                            <span className="truncate">{name ?? `Слот ${item.player.slot % 128}`}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right text-[12px] font-semibold text-ink-100 mono">{fmtNum(item.player.gpm)}</td>
                    <td className="px-2 py-2 text-right text-[12px] font-semibold text-ink-100 mono">{fmtNum(item.player.xpm)}</td>
                    <td className="px-2 py-2 text-right text-[12px] font-medium text-ink-200 mono">
                      {item.player.lastHits}
                      <span className="text-[9px] text-ink-500">/{item.player.denies}</span>
                    </td>
                    <td className="px-2 py-2 text-right text-[12px] font-medium text-ink-200 mono">{item.player.deaths}</td>
                    <td className="px-2 py-2 text-right text-[12px] font-medium text-ink-200 mono">{fmtNum(item.player.netWorth)}</td>
                    <td className="px-2 py-2 text-right text-[12px] font-medium text-ink-200 mono">{fmtNum(item.player.heroDamage)}</td>
                    <td className="px-2 py-2 text-right">
                      <span
                        className="font-display text-sm font-semibold"
                        style={{
                          color:
                            item.overall == null
                              ? '#64756E'
                              : item.overall >= 78
                                ? '#C9F26B'
                                : item.overall >= 62
                                  ? '#5FE08B'
                                  : item.overall >= 45
                                    ? '#E9C46A'
                                    : '#FF6B62',
                        }}
                      >
                        {item.overall ?? '—'}
                      </span>
                    </td>
                    <td className="rounded-r-xl px-2.5 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {(['farm', 'damage', 'survival', 'vision', 'fights', 'objectives'] as const).map((key) => {
                          const value = item.scores[key];
                          return (
                            <span
                              key={key}
                              title={`${DIMENSION_META[key].label}: ${value ?? '—'}`}
                              className="h-1.5 w-4 rounded-full"
                              style={{
                                background: value == null ? 'rgba(255,255,255,0.08)' : DIMENSION_META[key].color,
                                opacity: value == null ? 1 : 0.35 + (value / 100) * 0.65,
                              }}
                            />
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(['farm', 'damage', 'survival', 'vision'] as const).map((key) => {
          const sorted = [...analysis.players]
            .filter((item) => item.scores[key] != null)
            .sort((a, b) => (b.scores[key] ?? 0) - (a.scores[key] ?? 0));
          return (
            <div key={key} className="panel p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: DIMENSION_META[key].color }} />
                <span className="text-[11px] font-semibold text-white">Лучшие: {DIMENSION_META[key].label}</span>
              </div>
              <div className="mt-3 space-y-2">
                {sorted.slice(0, 3).map((item, index) => (
                  <div key={item.player.slot} className="flex items-center gap-2">
                    <span className="w-3 text-[9px] font-semibold text-ink-500">{index + 1}</span>
                    <HeroAvatar hero={item.hero} size={22} />
                    <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink-200">{item.hero?.localized_name}</span>
                    <span className="font-display text-[11px] font-semibold" style={{ color: DIMENSION_META[key].color }}>
                      {item.scores[key]}
                    </span>
                  </div>
                ))}
                {sorted.length === 0 && <div className="text-[10px] text-ink-500">Нет данных</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel p-4 sm:p-5">
        <div className="kicker">Роли и линии</div>
        <h3 className="display-title mt-1 text-lg text-white">Кто где играл</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((role) => {
            const players = analysis.players.filter((item) => item.role === role);
            return (
              <div key={role} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: ROLE_COLOR[role] }} />
                  <span className="text-[10px] font-semibold" style={{ color: ROLE_COLOR[role] }}>
                    Позиция {role}
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {players.map((item) => (
                    <div key={item.player.slot} className="flex items-center gap-2">
                      <HeroAvatar hero={item.hero} size={22} side={item.player.isRadiant ? 'radiant' : 'dire'} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[10px] font-medium text-ink-200">{item.hero?.localized_name}</div>
                        <div className="text-[8px] text-ink-500">{item.laneLabel} · {item.player.gpm} GPM</div>
                      </div>
                      <span className="text-[9px] font-semibold text-ink-300">{item.player.gpm}</span>
                    </div>
                  ))}
                  {players.length === 0 && <div className="text-[9px] text-ink-500">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel p-4 sm:p-5">
        <div className="kicker">Участие</div>
        <h3 className="display-title mt-1 text-lg text-white">Кто был в игре</h3>
        <div className="mt-4 space-y-3">
          {[...analysis.players]
            .sort((a, b) => b.metrics.killParticipation - a.metrics.killParticipation)
            .map((item) => (
              <div key={item.player.slot} className="flex items-center gap-3">
                <HeroAvatar hero={item.hero} size={26} side={item.player.isRadiant ? 'radiant' : 'dire'} />
                <span className="w-28 truncate text-[10.5px] text-ink-200">{item.hero?.localized_name}</span>
                <div className="flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, item.metrics.killParticipation * 100)}%`,
                        background: item.player.isRadiant ? SIDE_COLOR.radiant : SIDE_COLOR.dire,
                      }}
                    />
                  </div>
                </div>
                <span className="w-10 text-right text-[10px] font-semibold text-ink-200">
                  {fmtPct(item.metrics.killParticipation)}
                </span>
                <span className="hidden w-24 items-center justify-end gap-1 text-[9px] text-ink-500 sm:flex">
                  <UserRound size={10} /> {item.metrics.fightCount} драк
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
