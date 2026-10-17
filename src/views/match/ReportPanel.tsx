import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  UserRound,
  BookOpen,
  Check,
  CheckCircle2,
  CircleAlert,
  Flame,
  GraduationCap,
  Lightbulb,
  Sparkles,
  Target,
  TriangleAlert,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../../lib/app-context';
import { buildCoachReport } from '../../lib/insights';
import { DIMENSION_META } from '../../lib/constants';
import { getLesson } from '../../data/lessons';
import { fmtNum, fmtPct, fmtTime } from '../../lib/format';
import { matchPath } from '../../lib/router';
import { loadPlan, togglePlanTask } from '../../lib/storage';
import type { CoachReport, Insight, InsightSeverity, Match, MatchAnalysis, PlayerAnalysis } from '../../types';
import { RadarChart } from '../../components/charts';
import { Bar, HeroAvatar, RoleBadge, ScoreRing, SIDE_COLOR, SIDE_LABEL, SectionHeading } from '../../components/ui';

const SEVERITY_META: Record<InsightSeverity, { label: string; color: string; icon: ReactNode }> = {
  critical: { label: 'Критично', color: '#FF6B62', icon: <CircleAlert size={13} /> },
  warning: { label: 'Стоит исправить', color: '#E9C46A', icon: <TriangleAlert size={13} /> },
  good: { label: 'Сильная сторона', color: '#5FE08B', icon: <CheckCircle2 size={13} /> },
  info: { label: 'К сведению', color: '#7FB5FF', icon: <Lightbulb size={13} /> },
};

const CATEGORY_LABEL: Record<Insight['category'], string> = {
  farm: 'Фарм',
  fighting: 'Драки',
  survival: 'Выживаемость',
  vision: 'Видение',
  items: 'Предметы',
  objectives: 'Объективы',
  discipline: 'Дисциплина',
};

function InsightCard({ insight, matchId, slot }: { insight: Insight; matchId: number; slot: number }) {
  const { navigate, notify } = useApp();
  const [open, setOpen] = useState(false);
  const meta = SEVERITY_META[insight.severity];
  const firstLesson = getLesson(insight.lessonIds[0]);
  const lessonCount = insight.lessonIds.filter((id) => getLesson(id)).length;

  return (
    <div className={`rounded-2xl border p-4 transition ${open ? 'border-white/[0.16]' : ''}`}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 text-left">
        <span
          className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border"
          style={{ color: meta.color, borderColor: `${meta.color}38`, background: `${meta.color}10` }}
        >
          {meta.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: meta.color }}>
              {meta.label}
            </span>
            <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-ink-400">
              {CATEGORY_LABEL[insight.category]}
            </span>
            {insight.value && insight.goal && (
              <span className="text-[9px] text-ink-500">
                {insight.value} → цель {insight.goal}
              </span>
            )}
          </span>
          <span className="mt-1.5 block text-[13px] font-semibold leading-snug text-white">{insight.title}</span>
          <span className="mt-1 block text-[11.5px] leading-relaxed text-ink-300">{insight.detail}</span>
        </span>
        <span className="mt-1 text-[10px] text-ink-500">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2.5 border-t border-white/[0.07] pt-3 animate-enter">
          <div>
            <div className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-ink-500">Почему это важно</div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-300">{insight.why}</p>
          </div>
          <div>
            <div className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-lime">Что делать</div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-200">{insight.fix}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {firstLesson && (
              <button
                type="button"
                onClick={() => navigate(`/lesson/${firstLesson.id}`)}
                className="btn-secondary !px-2.5 !py-1.5 text-[10px]"
              >
                <BookOpen size={11} /> {firstLesson.title}
                {lessonCount > 1 && <span className="text-ink-500">+{lessonCount - 1}</span>}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const plan = loadPlan(matchId, slot);
                togglePlanTask(matchId, slot, `insight-${insight.id}`);
                notify(plan[`insight-${insight.id}`] ? 'Задача снята.' : 'Добавлено в план тренировки.', 'success');
              }}
              className="btn-ghost !px-2.5 !py-1.5 text-[10px]"
            >
              <Target size={11} /> В план
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerSwitcher({
  analysis,
  selectedSlot,
  onSelect,
  mySlot,
}: {
  analysis: MatchAnalysis;
  selectedSlot: number;
  onSelect: (slot: number) => void;
  mySlot: number | null;
}) {
  const sorted = [...analysis.players].sort((a, b) => (a.player.isRadiant === b.player.isRadiant ? a.role - b.role : a.player.isRadiant ? -1 : 1));
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="kicker">Выбор игрока</div>
        <div className="mt-1 text-[11px] text-ink-400">10 участников · нажми, чтобы разобрать</div>
      </div>
      <div className="grid max-h-[520px] grid-cols-2 gap-1 overflow-y-auto p-2 sm:grid-cols-1">
        {sorted.map((item) => {
          const active = item.player.slot === selectedSlot;
          return (
            <button
              key={item.player.slot}
              type="button"
              onClick={() => onSelect(item.player.slot)}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                active
                  ? 'border-lime/30 bg-lime/[0.07]'
                  : 'border-transparent hover:border-white/[0.08] hover:bg-white/[0.03]'
              }`}
            >
              <HeroAvatar hero={item.hero} size={28} side={item.player.isRadiant ? 'radiant' : 'dire'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate text-[10.5px] font-semibold text-white">{item.hero?.localized_name}</span>
                  {item.player.slot === mySlot && (
                    <span className="rounded bg-lime/15 px-1 text-[7px] font-bold uppercase text-lime">ты</span>
                  )}
                </div>
                <div className="mt-0.5 text-[8px] text-ink-500" style={{ color: SIDE_COLOR[item.player.isRadiant ? 'radiant' : 'dire'] }}>
                  {SIDE_LABEL[item.player.isRadiant ? 'radiant' : 'dire']} · P{item.role}
                </div>
              </div>
              <span
                className="font-display text-[11px] font-semibold"
                style={{ color: (item.overall ?? 0) >= 70 ? '#C9F26B' : '#8FA69D' }}
              >
                {item.overall ?? '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlanSection({ report, match, loadPlanState }: { report: CoachReport; match: Match; loadPlanState: Record<string, boolean> }) {
  const { notify } = useApp();
  const [checked, setChecked] = useState<Record<string, boolean>>(loadPlanState);
  const slot = report.analysis.player.slot;
  return (
    <div className="panel p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Target size={15} className="text-lime" />
        <h3 className="display-title text-base text-white">План на 3 игры</h3>
      </div>
      <p className="mt-1 text-[10.5px] leading-relaxed text-ink-500">
        Не пытайся исправить всё сразу. Отметь задачи, которые берёшь в работу.
      </p>
      <div className="mt-3 space-y-2">
        {report.plan.map((task) => {
          const key = task.id;
          const done = Boolean(checked[key]);
          const lesson = getLesson(task.lessonId);
          return (
            <div
              key={key}
              className={`rounded-xl border p-3 transition ${done ? 'border-radiant/25 bg-radiant/[0.04]' : 'border-white/[0.07] bg-white/[0.02]'}`}
            >
              <div className="flex items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const next = togglePlanTask(match.id, slot, key);
                    setChecked((current) => ({ ...current, [key]: Boolean(next[key]) }));
                    notify(next[key] ? 'Задача отмечена.' : 'Задача снята с отметки.');
                  }}
                  className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-md border transition ${
                    done ? 'border-radiant bg-radiant text-ink-950' : 'border-white/20 text-transparent hover:border-lime/60'
                  }`}
                  aria-label="Отметить задачу"
                >
                  <Check size={12} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-[11.5px] font-semibold ${done ? 'text-ink-300 line-through' : 'text-white'}`}>{task.title}</div>
                  <div className="mt-1 text-[10px] leading-relaxed text-ink-400">{task.detail}</div>
                  {lesson && (
                    <a href={`#${`/lesson/${lesson.id}`}`} className="mt-1.5 inline-flex items-center gap-1 text-[9.5px] font-semibold text-lime/90 hover:text-lime">
                      <GraduationCap size={10} /> Урок: {lesson.title}
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReportPanel({
  match,
  analysis,
  slot,
  onSelectSlot,
  mySlot,
}: {
  match: Match;
  analysis: MatchAnalysis;
  slot: number;
  onSelectSlot: (slot: number) => void;
  mySlot: number | null;
}) {
  const current = analysis.bySlot[slot] ?? analysis.players[0];
  const report = useMemo(() => buildCoachReport(match, analysis, current.player.slot), [match, analysis, current.player.slot]);
  const planState = useMemo(() => loadPlan(match.id, current.player.slot), [match.id, current.player.slot]);
  const { navigate, recordHistory, notify, history, identity, markAsMe } = useApp();
  const [saved, setSaved] = useState(() => history.some((entry) => entry.matchId === match.id && entry.slot === current.player.slot));
  const winning = current.player.isRadiant === match.radiantWin;

  const saveToHistory = () => {
    if (saved) {
      notify('Этот разбор уже сохранён в прогрессе.', 'info');
      return;
    }
    recordHistory({
      matchId: match.id,
      slot: current.player.slot,
      heroId: current.hero?.id ?? 0,
      role: current.role,
      overall: report.overall,
      grade: report.grade,
      scores: current.scores,
      radiantWin: match.radiantWin,
      isRadiant: current.player.isRadiant,
      duration: match.duration,
      startTime: match.startTime,
      savedAt: Date.now(),
      demo: Boolean(match.demo),
    });
    setSaved(true);
    notify('Разбор сохранён в прогрессе.', 'success');
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
      <div className="order-2 space-y-3 xl:order-1">
        <PlayerSwitcher analysis={analysis} selectedSlot={current.player.slot} onSelect={onSelectSlot} mySlot={mySlot} />
        <div className="panel p-4">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-500">Действия</div>
          <div className="mt-2.5 space-y-2">
            <button
              type="button"
              onClick={saveToHistory}
              className={`w-full ${saved ? 'btn-secondary' : 'btn-primary'}`}
            >
              {saved ? <CheckCircle2 size={14} /> : <Sparkles size={14} />}
              {saved ? 'В прогрессе' : 'Сохранить разбор'}
            </button>
            <button
              type="button"
              onClick={() => markAsMe(match.id, current.player.slot, current.player.accountId)}
              className="btn-secondary w-full"
            >
              <UserRound size={14} />{' '}
              {identity.selectedSlots[String(match.id)] === current.player.slot || identity.accountId === current.player.accountId
                ? 'Это ты'
                : 'Это я'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/academy`)}
              className="btn-secondary w-full"
            >
              <GraduationCap size={14} /> В академию
            </button>
          </div>
          {!saved && (
            <p className="mt-2 text-[9px] leading-relaxed text-ink-500">
              Сохрани разбор, чтобы видеть динамику оценок и прогресс по урокам.
            </p>
          )}
        </div>
      </div>

      <div className="order-1 space-y-4 xl:order-2">
        <div className="panel relative overflow-hidden p-5 sm:p-6">
          <div
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl"
            style={{ background: current.player.isRadiant ? SIDE_COLOR.radiant : SIDE_COLOR.dire }}
          />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <HeroAvatar hero={current.hero} size={62} side={current.player.isRadiant ? 'radiant' : 'dire'} />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="kicker">{current.roleLabel}</span>
                  <span
                    className="rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                    style={{
                      color: winning ? SIDE_COLOR.radiant : SIDE_COLOR.dire,
                      borderColor: `${winning ? SIDE_COLOR.radiant : SIDE_COLOR.dire}40`,
                      background: `${winning ? SIDE_COLOR.radiant : SIDE_COLOR.dire}0f`,
                    }}
                  >
                    {winning ? 'победа' : 'поражение'}
                  </span>
                  <span className="text-[9px] text-ink-500">{current.laneLabel}</span>
                </div>
                <h2 className="display-title mt-1.5 text-2xl text-white sm:text-[28px]">{current.hero?.localized_name}</h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10.5px] text-ink-400">
                  <span className="font-semibold text-ink-200">
                    {current.player.kills} / {current.player.deaths} / {current.player.assists}
                  </span>
                  <span>{fmtNum(current.player.gpm)} GPM</span>
                  <span>{fmtNum(current.player.lastHits)} LH</span>
                  <span>{fmtTime(match.duration)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ScoreRing value={report.overall} size={104} stroke={8} showGrade grade={report.grade} />
              <div className="hidden sm:block">
                <div className="text-[9px] uppercase tracking-[0.14em] text-ink-500">Итог</div>
                <div className="mt-1 max-w-[230px] text-[11.5px] leading-relaxed text-ink-300">{report.verdict.split('.')[0]}.</div>
              </div>
            </div>
          </div>

          <div className="relative mt-5 grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-1.5">
              <RadarChart
                size={290}
                color="#C9F26B"
                values={report.dimensions.map((dimension) => ({
                  key: dimension.key,
                  label: DIMENSION_META[dimension.key].short,
                  value: dimension.value,
                }))}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {report.dimensions.map((dimension) => (
                <div key={dimension.key} className="rounded-xl border border-white/[0.055] bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-ink-200">{dimension.label}</span>
                    <span className="font-display text-sm font-semibold" style={{ color: DIMENSION_META[dimension.key].color }}>
                      {dimension.value ?? '—'}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Bar value={dimension.value} color={DIMENSION_META[dimension.key].color} height={5} />
                  </div>
                  <div className="mt-1 text-[8.5px] uppercase tracking-wider text-ink-500">{dimension.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel-soft flex flex-wrap items-center gap-2 p-3.5">
          {report.strengths.map((strength) => (
            <span key={strength} className="inline-flex items-center gap-1.5 rounded-lg border border-radiant/20 bg-radiant/[0.06] px-2.5 py-1.5 text-[10px] font-semibold text-radiant">
              <TrendingUp size={11} /> {strength}
            </span>
          ))}
          {report.weaknesses.map((weakness) => (
            <span key={weakness} className="inline-flex items-center gap-1.5 rounded-lg border border-gold/20 bg-gold/[0.06] px-2.5 py-1.5 text-[10px] font-semibold text-gold">
              <Flame size={11} /> {weakness}
            </span>
          ))}
          <span className="ml-auto text-[9px] text-ink-500">
            Сравнение с ориентирами по роли P{current.role}
          </span>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div>
            <SectionHeading
              eyebrow="Авто-коуч"
              title="Что улучшить и как"
              description={`Найдено ${report.insights.length} наблюдений. Приоритет — сверху; раскрой карточку, чтобы увидеть объяснение и упражнение.`}
            />
            <div className="mt-4 space-y-2.5">
              {report.insights.map((insight) => (
                <InsightCard key={insight.id} insight={insight} matchId={match.id} slot={current.player.slot} />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <PlanSection report={report} match={match} loadPlanState={planState} />
            <div className="panel p-4">
              <div className="flex items-center gap-2">
                <Lightbulb size={14} className="text-gold" />
                <h3 className="display-title text-base text-white">Ключевые цифры</h3>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { label: 'Участие в убийствах', value: fmtPct(current.metrics.killParticipation) },
                  { label: 'Участие в драках', value: fmtPct(current.metrics.fightInvolvement) },
                  { label: 'Урон/мин', value: fmtNum(current.metrics.damagePerMin) },
                  { label: 'Нетворс', value: fmtNum(current.player.netWorth) },
                  { label: 'Вардов/10 мин', value: current.metrics.wardsPer10.toFixed(2) },
                  { label: 'Смертей/10 мин', value: current.metrics.deathsPer10.toFixed(1) },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-white/[0.03] px-2.5 py-2">
                    <div className="text-[8px] uppercase tracking-wider text-ink-500">{item.label}</div>
                    <div className="mt-0.5 text-[12px] font-semibold text-white">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel p-4">
              <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-lime" />
                <h3 className="display-title text-base text-white">Следующий шаг</h3>
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-ink-400">
                Пройди урок по самому слабому инсайту, затем сыграй 3 игры с одним фокусом. После — новый разбор для сравнения.
              </p>
              <a href="#/progress" className="btn-secondary mt-3 w-full text-[11px]">
                Смотреть прогресс <ArrowRight size={12} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
