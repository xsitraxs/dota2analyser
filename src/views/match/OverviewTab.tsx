import { useMemo, type ReactNode } from 'react';
import {
  Activity,
  ArrowRight,
  Award,
  CircleDollarSign,
  Clock,
  Crosshair,
  Eye,
  Flame,
  MapPin,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Target,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import { DIMENSION_META, heroAccent } from '../../lib/constants';
import { fmtCompact, fmtNum, fmtPct, fmtSigned, fmtTime } from '../../lib/format';
import { matchPath } from '../../lib/router';
import type { Match, MatchAnalysis, Side } from '../../types';
import { DualBar, LineChart } from '../../components/charts';
import { HeroAvatar, ScoreRing, SIDE_COLOR, SIDE_LABEL, StatTile } from '../../components/ui';
import { TeamCard } from './TeamCard';

export function MatchHeader({ match }: { match: Match }) {
  const duration = fmtTime(match.duration);
  const radiantWon = match.radiantWin;
  return (
    <div className="panel relative overflow-hidden">
      <div className="grid-fade pointer-events-none absolute inset-0 opacity-70" />
      <div className="relative flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="text-center">
            <div
              className="font-display text-3xl font-bold leading-none"
              style={{ color: SIDE_COLOR.radiant, opacity: radiantWon ? 1 : 0.55 }}
            >
              {match.radiantScore}
            </div>
            <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: SIDE_COLOR.radiant }}>
              Radiant
            </div>
          </div>
          <div className="text-center">
            <div className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-300">
              {duration}
            </div>
            <div className="mt-1.5 text-[9px] uppercase tracking-[0.12em] text-ink-500">
              {match.radiantWin ? 'Победа Radiant' : 'Победа Dire'}
            </div>
          </div>
          <div className="text-center">
            <div
              className="font-display text-3xl font-bold leading-none"
              style={{ color: SIDE_COLOR.dire, opacity: radiantWon ? 0.55 : 1 }}
            >
              {match.direScore}
            </div>
            <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: SIDE_COLOR.dire }}>
              Dire
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={12} className="text-ink-500" />
            {new Date(match.startTime * 1000).toLocaleString('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={12} className="text-ink-500" /> ID {match.id}
          </span>
          {match.firstBlood && (
            <span className="inline-flex items-center gap-1.5">
              <Crosshair size={12} className="text-ink-500" /> FB {fmtTime(match.firstBlood)}
            </span>
          )}
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold"
            style={{
              borderColor: match.parsed ? 'rgba(95,224,139,0.3)' : 'rgba(233,196,106,0.3)',
              background: match.parsed ? 'rgba(95,224,139,0.08)' : 'rgba(233,196,106,0.08)',
              color: match.parsed ? '#5FE08B' : '#E9C46A',
            }}
          >
            {match.parsed ? 'Парс полный' : 'Без парса'}
          </span>
        </div>
      </div>
    </div>
  );
}

function TeamCompare({ match, analysis }: { match: Match; analysis: MatchAnalysis }) {
  const rows: {
    label: string;
    radiant: number;
    dire: number;
    format: (value: number) => string;
    icon: ReactNode;
  }[] = [
    { label: 'Убийства', radiant: analysis.teams.radiant.kills, dire: analysis.teams.dire.kills, format: (v) => fmtNum(v), icon: <Swords size={12} /> },
    { label: 'Нетворс', radiant: analysis.teams.radiant.netWorth, dire: analysis.teams.dire.netWorth, format: (v) => fmtCompact(v), icon: <CircleDollarSign size={12} /> },
    { label: 'Урон героям', radiant: analysis.teams.radiant.heroDamage, dire: analysis.teams.dire.heroDamage, format: (v) => fmtCompact(v), icon: <Flame size={12} /> },
    { label: 'Башни', radiant: analysis.teams.radiant.towers, dire: analysis.teams.dire.towers, format: (v) => fmtNum(v), icon: <Target size={12} /> },
    { label: 'Драки', radiant: analysis.teams.radiant.fightsWon, dire: analysis.teams.dire.fightsWon, format: (v) => fmtNum(v), icon: <Activity size={12} /> },
    // Варды и Рошан показываются только когда соответствующие данные реально есть:
    // отсутствие источника не означает «ноль событий».
    ...(analysis.teams.radiant.wards != null && analysis.teams.dire.wards != null
      ? [{ label: 'Варды', radiant: analysis.teams.radiant.wards, dire: analysis.teams.dire.wards, format: (v: number) => fmtNum(v), icon: <Eye size={12} /> }]
      : []),
  ];
  const goldTimeline = useMemo(
    () => match.goldAdv.map((value, index) => ({ x: index, y: value })),
    [match.goldAdv],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
      <div className="panel p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="kicker">Темп матча</div>
            <h3 className="display-title mt-1 text-lg text-white">Преимущество по золоту</h3>
          </div>
          <div className="text-right">
            <div className="font-display text-lg font-semibold" style={{ color: match.goldAdv[match.goldAdv.length - 1] >= 0 ? SIDE_COLOR.radiant : SIDE_COLOR.dire }}>
              {fmtSigned(match.goldAdv[match.goldAdv.length - 1] ?? 0)}
            </div>
            <div className="text-[8px] uppercase tracking-wider text-ink-500">финал</div>
          </div>
        </div>
        <LineChart
          points={goldTimeline}
          height={220}
          color="#C9F26B"
          symmetric
          zeroBaseline
          label="Преимущество Radiant по золоту по минутам"
          xLabel="минута"
          valueFormat={(value) => fmtCompact(value, 1)}
          markers={
            analysis.turningPoint
              ? [{ x: analysis.turningPoint.minute, color: analysis.turningPoint.side === 'radiant' ? SIDE_COLOR.radiant : SIDE_COLOR.dire, label: 'Перелом' }]
              : []
          }
        />
        <div className="mt-2 flex items-center justify-between text-[9px] uppercase tracking-[0.12em]">
          <span style={{ color: SIDE_COLOR.radiant }}>+ Radiant</span>
          <span style={{ color: SIDE_COLOR.dire }}>Dire +</span>
        </div>
      </div>

      <div className="panel p-4 sm:p-5">
        <div className="kicker">Сравнение команд</div>
        <h3 className="display-title mt-1 text-lg text-white">Кто в чём сильнее</h3>
        <div className="mt-4 space-y-3.5">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between text-[10px]">
                <span className="font-semibold" style={{ color: SIDE_COLOR.radiant }}>
                  {row.format(row.radiant)}
                </span>
                <span className="inline-flex items-center gap-1 text-ink-400">
                  {row.icon} {row.label}
                </span>
                <span className="font-semibold" style={{ color: SIDE_COLOR.dire }}>
                  {row.format(row.dire)}
                </span>
              </div>
              <DualBar
                left={row.radiant}
                right={row.dire}
                leftLabel=""
                rightLabel=""
                leftColor={SIDE_COLOR.radiant}
                rightColor={SIDE_COLOR.dire}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ObjectiveTimeline({ match }: { match: Match }) {
  const keyObjectives = match.objectives.filter(
    (objective) => objective.kind !== 'courier' && objective.kind !== 'other',
  );
  if (!keyObjectives.length) return null;
  const icons: Record<string, ReactNode> = {
    tower: <Target size={11} />,
    rax: <Shield size={11} />,
    fort: <Award size={11} />,
    roshan: <Skull size={11} />,
    aegis: <Shield size={11} />,
    firstblood: <Crosshair size={11} />,
  };
  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="kicker">Хронология</div>
          <h3 className="display-title mt-1 text-lg text-white">Ключевые события</h3>
        </div>
        <span className="text-[10px] text-ink-500">{keyObjectives.length} событий</span>
      </div>
      <div className="relative mt-4 max-h-[280px] overflow-y-auto pr-2">
        <div className="absolute bottom-2 left-[7px] top-2 w-px bg-white/[0.07]" />
        <div className="space-y-3">
          {keyObjectives.slice(0, 40).map((objective, index) => {
            const color = objective.team ? SIDE_COLOR[objective.team] : '#8FA69D';
            return (
              <div key={`${objective.time}-${index}`} className="relative flex items-start gap-3 pl-0">
                <span
                  className="relative z-10 mt-0.5 grid h-[15px] w-[15px] flex-shrink-0 place-items-center rounded-full border"
                  style={{ borderColor: `${color}55`, background: '#0A0F0D', color }}
                >
                  {icons[objective.kind] ?? <Activity size={10} />}
                </span>
                <div className="min-w-0 flex-1 pb-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11.5px] font-semibold text-white">{objective.title}</span>
                    <span className="flex-shrink-0 font-mono text-[9.5px] text-ink-500">{fmtTime(objective.time)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[9.5px] text-ink-400">{objective.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MvpCard({ match, analysis, mySlot }: { match: Match; analysis: MatchAnalysis; mySlot: number | null }) {
  const ranked = [...analysis.players].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
  const mvp = ranked[0];
  if (!mvp) return null;
  const side: Side = mvp.player.isRadiant ? 'radiant' : 'dire';
  return (
    <div className="panel relative overflow-hidden p-4 sm:p-5">
      <div
        className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full opacity-25 blur-3xl"
        style={{ background: heroAccent(mvp.player.heroId) }}
      />
      <div className="relative flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-gold">
          <Award size={11} /> Лучший в матче
        </div>
        <span className="text-[9px] uppercase tracking-wider" style={{ color: SIDE_COLOR[side] }}>
          {SIDE_LABEL[side]}
        </span>
      </div>
      <div className="relative mt-4 flex items-center gap-3">
        <HeroAvatar hero={mvp.hero} size={52} side={side} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[15px] font-semibold text-white">{mvp.hero?.localized_name}</div>
          <div className="mt-0.5 text-[10px] text-ink-400">
            {mvp.roleLabel} · {mvp.player.kills}/{mvp.player.deaths}/{mvp.player.assists}
          </div>
        </div>
        <ScoreRing value={mvp.overall} size={46} stroke={4} showGrade grade={mvp.grade} />
      </div>
      <div className="relative mt-4 grid grid-cols-2 gap-2">
        {(['farm', 'damage', 'survival', 'fights'] as const).map((key) => (
          <div key={key} className="rounded-lg bg-white/[0.03] px-2.5 py-2">
            <div className="text-[9px] text-ink-500">{DIMENSION_META[key].label}</div>
            <div className="mt-0.5 font-display text-sm font-semibold" style={{ color: DIMENSION_META[key].color }}>
              {mvp.scores[key] ?? '—'}
            </div>
          </div>
        ))}
      </div>
      <a
        href={`#${matchPath(match.id, 'report', mvp.player.slot)}`}
        className="relative mt-3 flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-[10.5px] font-semibold text-ink-200 transition hover:bg-white/[0.07] hover:text-white"
      >
        Разобрать его игру
        <ArrowRight size={12} />
      </a>
      {mySlot != null && (
        <div className="relative mt-2 text-center text-[9px] text-ink-500">
          Твой рейтинг: <strong className="text-ink-200">{analysis.bySlot[mySlot]?.overall ?? '—'}</strong>/100
        </div>
      )}
    </div>
  );
}

function TurningPointCard({ analysis, match }: { analysis: MatchAnalysis; match: Match }) {
  const point = analysis.turningPoint;
  if (!point) return null;
  const color = point.side === 'radiant' ? SIDE_COLOR.radiant : SIDE_COLOR.dire;
  return (
    <div className="panel-soft relative overflow-hidden p-4 sm:p-5">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color }}>
        <TrendingUp size={12} /> Переломный момент
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="font-display text-2xl font-semibold text-white">{fmtSigned(point.delta)}</div>
          <div className="mt-0.5 text-[10px] text-ink-400">
            золота за минуту · {point.minute}-я минута
          </div>
        </div>
        {point.fight && (
          <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[9px] text-ink-300">
            драка {fmtTime(point.fight.start)}–{fmtTime(point.fight.end)}
          </span>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-300">{point.text}</p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-ink-500">
        Итог матча: {match.radiantWin ? 'Radiant' : 'Dire'} победил с разницей {fmtNum(Math.abs(match.radiantScore - match.direScore))} убийств.
      </p>
    </div>
  );
}

function MyReportBanner({ match, analysis, mySlot }: { match: Match; analysis: MatchAnalysis; mySlot: number }) {
  const mine = analysis.bySlot[mySlot];
  if (!mine) return null;
  const dims = (['farm', 'damage', 'survival', 'vision', 'fights', 'objectives'] as const)
    .map((key) => ({ key, value: mine.scores[key] }))
    .filter((item): item is { key: (typeof item)['key']; value: number } => item.value != null);
  const best = [...dims].sort((a, b) => b.value - a.value)[0];
  const worst = [...dims].sort((a, b) => a.value - b.value)[0];
  return (
    <div className="panel relative overflow-hidden border-lime/25 p-5 glow-lime">
      <div className="pointer-events-none absolute -left-10 -top-14 h-44 w-44 rounded-full bg-lime/[0.12] blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <ScoreRing value={mine.overall} size={78} stroke={6} showGrade grade={mine.grade} />
          <div>
            <div className="kicker">Твой разбор</div>
            <div className="mt-1 flex items-center gap-2">
              <HeroAvatar hero={mine.hero} size={30} side={mine.player.isRadiant ? 'radiant' : 'dire'} />
              <span className="font-display text-lg font-semibold text-white">{mine.hero?.localized_name}</span>
            </div>
            <div className="mt-1 text-[10.5px] text-ink-400">
              {mine.roleLabel} · {fmtPct(mine.metrics.killParticipation)} участие · {fmtNum(mine.player.gpm)} GPM
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          {best && (
            <span className="rounded-lg border border-radiant/25 bg-radiant/[0.08] px-2.5 py-1.5 font-semibold text-radiant">
              Сильно: {DIMENSION_META[best.key].label} {best.value}
            </span>
          )}
          {worst && (
            <span className="rounded-lg border border-gold/25 bg-gold/[0.08] px-2.5 py-1.5 font-semibold text-gold">
              Расти: {DIMENSION_META[worst.key].label} {worst.value}
            </span>
          )}
          <a href={`#${matchPath(match.id, 'report', mySlot)}`} className="btn-primary !py-2 text-[11px]">
            <Sparkles size={13} /> Открыть отчёт
          </a>
        </div>
      </div>
    </div>
  );
}

export function OverviewTab({ match, analysis, mySlot }: { match: Match; analysis: MatchAnalysis; mySlot: number | null }) {
  const wardTotals = match.coverage.wards
    ? {
        total: match.players.reduce((acc, p) => acc + (p.obsPlaced ?? 0) + (p.senPlaced ?? 0), 0),
        obs: match.players.reduce((acc, p) => acc + (p.obsPlaced ?? 0), 0),
        sen: match.players.reduce((acc, p) => acc + (p.senPlaced ?? 0), 0),
      }
    : null;
  const totalDeaths = match.players.reduce((acc, p) => acc + p.deaths, 0);
  const biggestFight = [...analysis.fights].sort((a, b) => b.deaths - a.deaths || b.totalDamage - a.totalDamage)[0];

  return (
    <div className="space-y-4">
      <MatchHeader match={match} />

      {match.warnings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {match.warnings.map((warning) => (
            <div
              key={warning}
              className="flex items-start gap-2 rounded-xl border border-gold/20 bg-gold/[0.06] px-3 py-2 text-[10.5px] leading-relaxed text-gold/90"
            >
              <TriangleAlert size={13} className="mt-0.5 flex-shrink-0" />
              {warning}
            </div>
          ))}
        </div>
      )}

      {mySlot != null && <MyReportBanner match={match} analysis={analysis} mySlot={mySlot} />}

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.85fr]">
        <TeamCard match={match} analysis={analysis} side="radiant" mySlot={mySlot} />
        <TeamCard match={match} analysis={analysis} side="dire" mySlot={mySlot} />
        <div className="space-y-4">
          <MvpCard match={match} analysis={analysis} mySlot={mySlot} />
          <TurningPointCard analysis={analysis} match={match} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <StatTile label="Всего убийств" value={match.radiantScore + match.direScore} sub={`${match.radiantScore} / ${match.direScore}`} icon={<Swords size={15} />} />
        <StatTile label="Смертей" value={totalDeaths} sub={fmtPct(totalDeaths / Math.max(1, match.radiantScore + match.direScore))} icon={<Skull size={15} />} />
        <StatTile label="Вардов" value={wardTotals ? wardTotals.total : '—'} sub={wardTotals ? `${wardTotals.obs} обс · ${wardTotals.sen} сентари` : 'нет данных о вардах'} icon={<Eye size={15} />} />
        <StatTile
          label="Главная драка"
          value={biggestFight ? fmtTime(biggestFight.start) : '—'}
          sub={biggestFight ? `${biggestFight.deaths} смертей · ${fmtCompact(biggestFight.totalDamage)} урона` : 'нет данных'}
          icon={<Flame size={15} />}
        />
      </div>

      <TeamCompare match={match} analysis={analysis} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <ObjectiveTimeline match={match} />
        <div className="panel p-4 sm:p-5">
          <div className="kicker">Состав</div>
          <h3 className="display-title mt-1 text-lg text-white">Герои матча</h3>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[...analysis.players]
              .sort((a, b) => (a.player.isRadiant === b.player.isRadiant ? a.role - b.role : a.player.isRadiant ? -1 : 1))
              .map((item) => (
                <a
                  key={item.player.slot}
                  href={`#${matchPath(match.id, 'report', item.player.slot)}`}
                  className="group flex items-center gap-2.5 rounded-xl border border-white/[0.055] bg-white/[0.02] p-2.5 transition hover:border-white/[0.12] hover:bg-white/[0.04]"
                >
                  <HeroAvatar hero={item.hero} size={30} side={item.player.isRadiant ? 'radiant' : 'dire'} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold text-white">{item.hero?.localized_name}</div>
                    <div className="mt-0.5 text-[8.5px] text-ink-500">
                      P{item.role} · {item.player.kills}/{item.player.deaths}/{item.player.assists}
                    </div>
                  </div>
                  <span className="font-display text-xs font-semibold" style={{ color: item.overall != null && item.overall >= 70 ? '#C9F26B' : '#8FA69D' }}>
                    {item.overall ?? '—'}
                  </span>
                </a>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
