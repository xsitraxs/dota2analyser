import { useMemo, useState } from 'react';
import { Activity, CircleDollarSign, Clock, Flame, Skull, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { DIMENSION_META } from '../../lib/constants';
import { fmtClock, fmtCompact, fmtNum, fmtSigned, fmtTime } from '../../lib/format';
import type { Match, MatchAnalysis, PlayerAnalysis, Side } from '../../types';
import { LineChart } from '../../components/charts';
import { HeroAvatar, SIDE_COLOR, SIDE_LABEL } from '../../components/ui';

type TimelineMetric = 'gold' | 'lh' | 'xp';

function TimelineControls({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { key: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={`chip ${value === option.key ? 'chip-active' : ''}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PlayerTimeline({ analysis }: { analysis: PlayerAnalysis }) {
  const [metric, setMetric] = useState<TimelineMetric>('gold');
  const player = analysis.player;
  const series = useMemo(() => {
    if (metric === 'gold') return player.goldT;
    if (metric === 'lh') return player.lhT;
    return player.xpT;
  }, [metric, player]);
  const points = useMemo(
    () => series.map((value, index) => ({ x: (player.times[index] ?? index * 60) / 60, y: value })),
    [series, player.times],
  );
  const last = series[series.length - 1] ?? 0;
  const color = metric === 'gold' ? '#C9F26B' : metric === 'lh' ? '#E9C46A' : '#7FB5FF';

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <HeroAvatar hero={analysis.hero} size={28} side={analysis.player.isRadiant ? 'radiant' : 'dire'} />
          <div>
            <div className="text-[11px] font-semibold text-white">{analysis.hero?.localized_name}</div>
            <div className="text-[9px] text-ink-500">{analysis.roleLabel.split('·')[1]?.trim() ?? analysis.roleLabel}</div>
          </div>
        </div>
        <div className="flex gap-1">
          {(
            [
              { key: 'gold', label: 'Gold' },
              { key: 'lh', label: 'LH' },
              { key: 'xp', label: 'XP' },
            ] as { key: TimelineMetric; label: string }[]
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setMetric(option.key)}
              className={`rounded-md px-1.5 py-1 text-[8.5px] font-semibold uppercase tracking-wider transition ${
                metric === option.key ? 'bg-white/[0.1] text-white' : 'text-ink-500 hover:text-ink-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 text-right font-display text-lg font-semibold" style={{ color }}>
        {metric === 'lh' ? fmtNum(last) : fmtCompact(last)}
      </div>
      <LineChart
        points={points}
        height={104}
        color={color}
        valueFormat={(value) => (metric === 'lh' ? fmtNum(value) : fmtCompact(value))}
        xFormat={(value) => `${Math.round(value)}м`}
        emptyText="Нет таймлайна"
      />
    </div>
  );
}

function TimelineTable({ analysis }: { analysis: PlayerAnalysis }) {
  const player = analysis.player;
  const rows = useMemo(() => {
    type Row = { minute: number; gold: number | null; lh: number | null; dn: number | null; xp: number | null };
    const checkpoints = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
    const mapped: (Row | null)[] = checkpoints.map((minute) => {
      const index = player.times.findIndex((time) => time >= minute * 60);
      if (index < 0) return null;
      return {
        minute,
        gold: player.goldT[index] ?? null,
        lh: player.lhT[index] ?? null,
        dn: player.dnT[index] ?? null,
        xp: player.xpT[index] ?? null,
      };
    });
    return mapped.filter((row): row is Row => row != null);
  }, [player]);

  if (!rows.length) {
    return (
      <div className="panel p-4 text-[11px] text-ink-400">
        Нет таймлайна: матч не распарсен. Загрузи файл парса или запроси разбор реплея.
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <span className="text-[11px] font-semibold text-white">Таймлайн фарма</span>
        <span className="text-[9px] uppercase tracking-wider text-ink-500">каждые 5 минут</span>
      </div>
      <div className="max-h-[340px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-ink-850/95 backdrop-blur">
            <tr>
              <th className="table-head px-3 py-2 text-left">Мин</th>
              <th className="table-head px-3 py-2 text-right">Золото</th>
              <th className="table-head px-3 py-2 text-right">LH</th>
              <th className="table-head px-3 py-2 text-right">DN</th>
              <th className="table-head px-3 py-2 text-right">XP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {rows.map((row) => (
              <tr key={row.minute} className="transition hover:bg-white/[0.03]">
                <td className="px-3 py-2 text-[11px] font-semibold text-ink-300">{row.minute}:00</td>
                <td className="px-3 py-2 text-right text-[11px] font-medium text-white mono">{fmtNum(row.gold)}</td>
                <td className="px-3 py-2 text-right text-[11px] text-ink-200 mono">{fmtNum(row.lh)}</td>
                <td className="px-3 py-2 text-right text-[11px] text-ink-400 mono">{fmtNum(row.dn)}</td>
                <td className="px-3 py-2 text-right text-[11px] text-ink-200 mono">{fmtNum(row.xp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FightsSection({ match, analysis }: { match: Match; analysis: MatchAnalysis }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  if (!analysis.fights.length) {
    return (
      <div className="panel p-5 text-[11px] leading-relaxed text-ink-400">
        Данные о командных драках недоступны — матч не распарсен. Всё остальное можно посмотреть на других вкладках.
      </div>
    );
  }
  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="kicker">Командные бои</div>
          <h3 className="display-title mt-1 text-lg text-white">Драки матча</h3>
        </div>
        <span className="text-[10px] text-ink-500">{analysis.fights.length} драк · раскрой для деталей</span>
      </div>
      <div className="mt-3 space-y-2">
        {analysis.fights.map((fight) => {
          const open = expanded === fight.index;
          const winnerColor = fight.winner === 'even' ? '#8FA69D' : SIDE_COLOR[fight.winner];
          return (
            <div
              key={fight.index}
              className={`rounded-xl border transition ${
                open ? 'border-white/[0.14] bg-white/[0.04]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
              }`}
            >
              <button
                type="button"
                onClick={() => setExpanded(open ? null : fight.index)}
                className="flex w-full flex-wrap items-center gap-3 px-3.5 py-2.5 text-left"
              >
                <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-ink-950/60 text-[9px] font-bold text-ink-200">
                  {fight.index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[11.5px] font-semibold text-white">
                      {fmtTime(fight.start)} — {fmtTime(fight.end)}
                    </span>
                    {fight.key && (
                      <span className="rounded bg-gold/10 px-1.5 py-0.5 text-[7.5px] font-bold uppercase tracking-wider text-gold">
                        ключевая
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[9.5px] text-ink-500">
                    {fight.deaths} {fight.deaths === 1 ? 'смерть' : 'смертей'} · {fmtCompact(fight.totalDamage)} урона
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-display text-[11px] font-semibold" style={{ color: winnerColor }}>
                    {fight.winner === 'even' ? 'Ровно' : SIDE_LABEL[fight.winner]}
                  </span>
                  <span className="text-[9px] text-ink-500">{fmtSigned(fight.radiantGold)} золота</span>
                </span>
              </button>

              {open && (
                <div className="border-t border-white/[0.06] px-3.5 py-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[0, 5].map((offset) => {
                      const side: Side = offset === 0 ? 'radiant' : 'dire';
                      const roster = analysis.players.slice(offset, offset + 5);
                      return (
                        <div key={side} className="rounded-lg border border-white/[0.05] bg-ink-950/40 p-2">
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: SIDE_COLOR[side] }}>
                              {SIDE_LABEL[side]}
                            </span>
                            <span className="text-[9px] text-ink-500">{fmtSigned(fight[side === 'radiant' ? 'radiantGold' : 'direGold'])}</span>
                          </div>
                          <div className="space-y-1">
                            {roster.map((item, index) => {
                              const fp = fight.players[offset + index];
                              if (!fp) return null;
                              const muted = fp.damage === 0 && fp.deaths === 0;
                              return (
                                <div key={item.player.slot} className={`flex items-center gap-1.5 ${muted ? 'opacity-50' : ''}`}>
                                  <HeroAvatar hero={item.hero} size={18} />
                                  <span className="min-w-0 flex-1 truncate text-[9.5px] text-ink-200">{item.hero?.localized_name}</span>
                                  {fp.deaths > 0 && <Skull size={9} className="text-dire" />}
                                  <span className="w-10 text-right text-[8.5px] text-ink-300">{fmtCompact(fp.damage)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[9px] text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <CircleDollarSign size={10} /> Radiant {fmtSigned(fight.radiantGold)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <CircleDollarSign size={10} /> Dire {fmtSigned(fight.direGold)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Flame size={10} /> {fmtCompact(fight.totalDamage)} урона
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TimelineTab({ match, analysis }: { match: Match; analysis: MatchAnalysis }) {
  const [metric, setMetric] = useState<TimelineMetric>('gold');
  const [tableSlot, setTableSlot] = useState<number>(analysis.players[0]?.player.slot ?? 0);
  const advantagePoints = useMemo(() => {
    const source = metric === 'xp' ? match.xpAdv : match.goldAdv;
    return source.map((value, index) => ({ x: index, y: metric === 'lh' ? 0 : value }));
  }, [match, metric]);

  return (
    <div className="space-y-4">
      <div className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="kicker">Ход матча</div>
            <h2 className="display-title mt-1 text-xl text-white">Преимущество по минутам</h2>
          </div>
          <TimelineControls
            value={metric}
            onChange={(value) => setMetric(value as TimelineMetric)}
            options={[
              { key: 'gold', label: 'Золото' },
              { key: 'xp', label: 'Опыт' },
            ]}
          />
        </div>
        <LineChart
          points={advantagePoints}
          height={260}
          color="#C9F26B"
          symmetric
          zeroBaseline
          valueFormat={(value) => fmtCompact(value, 1)}
          markers={analysis.fights.map((fight) => ({
            x: fight.start / 60,
            color: fight.winner === 'even' ? '#8FA69D' : SIDE_COLOR[fight.winner],
            label: `Драка на ${fmtTime(fight.start)}`,
          }))}
        />
        <div className="mt-2 flex items-center justify-between text-[9px]">
          <span className="inline-flex items-center gap-1" style={{ color: SIDE_COLOR.radiant }}>
            <TrendingUp size={10} /> Radiant впереди
          </span>
          <span className="text-ink-500">Пунктиры — драки</span>
          <span className="inline-flex items-center gap-1" style={{ color: SIDE_COLOR.dire }}>
            <TrendingDown size={10} /> Dire впереди
          </span>
        </div>
      </div>

      {analysis.turningPoint && (
        <div className="panel-soft flex flex-wrap items-center gap-4 p-4">
          <div
            className="grid h-10 w-10 place-items-center rounded-xl border"
            style={{
              borderColor: `${analysis.turningPoint.side === 'radiant' ? SIDE_COLOR.radiant : SIDE_COLOR.dire}45`,
              background: `${analysis.turningPoint.side === 'radiant' ? SIDE_COLOR.radiant : SIDE_COLOR.dire}12`,
              color: analysis.turningPoint.side === 'radiant' ? SIDE_COLOR.radiant : SIDE_COLOR.dire,
            }}
          >
            <Sparkles size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">Переломный момент</div>
            <div className="mt-1 text-[12px] leading-relaxed text-ink-200">{analysis.turningPoint.text}</div>
          </div>
          <div className="text-right">
            <div className="font-display text-xl font-semibold text-white">{fmtSigned(analysis.turningPoint.delta)}</div>
            <div className="text-[9px] text-ink-500">{analysis.turningPoint.minute}-я минута</div>
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Activity size={14} className="text-lime" />
          <h3 className="display-title text-lg text-white">Таймлайны игроков</h3>
          <span className="text-[10px] text-ink-500">золото, добивания и опыт</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {analysis.players.map((item) => (
            <PlayerTimeline key={item.player.slot} analysis={item} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Clock size={14} className="text-lime" />
            <h3 className="display-title text-lg text-white">Таймлайн фарма</h3>
          </div>
          <TimelineTable analysis={analysis.bySlot[tableSlot] ?? analysis.players[0]} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {analysis.players.map((item) => (
              <button
                key={item.player.slot}
                type="button"
                onClick={() => setTableSlot(item.player.slot)}
                className={`chip !py-1 text-[9.5px] ${tableSlot === item.player.slot ? 'chip-active' : ''}`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: item.player.isRadiant ? SIDE_COLOR.radiant : SIDE_COLOR.dire }}
                />
                {item.hero?.localized_name}
              </button>
            ))}
          </div>
        </div>
        <FightsSection match={match} analysis={analysis} />
      </div>
    </div>
  );
}
