import { useMemo } from 'react';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  GraduationCap,
  History,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../lib/app-context';
import { DIMENSION_META, HERO_BY_ID } from '../lib/constants';
import { fmtDate, fmtTime } from '../lib/format';
import { matchPath } from '../lib/router';
import { dimensionAverage } from '../lib/storage';
import { LESSONS } from '../data/lessons';
import type { Dimension } from '../types';
import { RadarChart, Sparkline } from '../components/charts';
import { EmptyState, HeroAvatar, RoleBadge, ScoreRing, SIDE_COLOR, SectionHeading } from '../components/ui';

const DIMENSIONS: Dimension[] = ['farm', 'damage', 'survival', 'vision', 'fights', 'objectives'];

export default function ProgressPage() {
  const { history, removeHistoryEntry, clearHistoryState, lessonProgress, notify, navigate } = useApp();

  const averages = useMemo(() => dimensionAverage(history), [history]);
  const overallValues = history.map((entry) => entry.overall).filter((value): value is number => value != null);
  const averageOverall = overallValues.length
    ? Math.round(overallValues.reduce((a, b) => a + b, 0) / overallValues.length)
    : null;
  const bestOverall = overallValues.length ? Math.max(...overallValues) : null;
  const wins = history.filter((entry) => entry.radiantWin === entry.isRadiant).length;
  const winrate = history.length ? Math.round((wins / history.length) * 100) : 0;
  const doneLessons = Object.values(lessonProgress).filter((item) => item.done).length;

  const weakest = useMemo(() => {
    const focus: Dimension[] = ['farm', 'damage', 'survival', 'fights', 'objectives'];
    const entries = focus
      .map((key) => ({ key, value: averages[key] }))
      .filter((item): item is { key: Dimension; value: number } => item.value != null);
    return entries.sort((a, b) => a.value - b.value)[0] ?? null;
  }, [averages]);

  const trend = useMemo(() => [...history].reverse(), [history]);

  const suggestedLessons = useMemo(() => {
    if (!weakest) return LESSONS.filter((lesson) => lesson.level === 'base').slice(0, 3);
    const map: Record<Dimension, string[]> = {
      farm: ['last-hits', 'farm-patterns', 'efficiency'],
      damage: ['positioning', 'teamfights'],
      survival: ['death-review', 'positioning', 'mindset'],
      vision: ['vision', 'map-awareness'],
      fights: ['teamfights', 'pregame-checklist'],
      objectives: ['objectives', 'tp-discipline'],
    };
    return LESSONS.filter((lesson) => (map[weakest.key] ?? []).includes(lesson.id)).slice(0, 3);
  }, [weakest]);

  if (!history.length) {
    return (
      <div className="space-y-5 animate-enter">
        <SectionHeading
          eyebrow="Личный прогресс"
          title="Здесь будет твоя динамика"
          description="Сохраняй разборы матчей — и приложение построит графики оценок, покажет слабые зоны и предложит уроки."
        />
        <EmptyState
          icon={<TrendingUp size={22} />}
          title="Пока нет сохранённых разборов"
          description="Открой любой матч, выбери себя на вкладке «Оценка и коучинг» и нажми «Сохранить разбор». Или начни с демо-матча."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <a href={`#${matchPath(7490235544, 'report', 0)}`} className="btn-primary text-xs">
                <Sparkles size={14} /> Демо-разбор
              </a>
              <a href="#/academy" className="btn-secondary text-xs">
                <GraduationCap size={14} /> В академию
              </a>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-enter">
      <SectionHeading
        eyebrow="Личный прогресс"
        title="Твоя динамика"
        description="Средние оценки по зонам, история матчей и уроки, которые помогут закрыть слабые места."
        action={
          <button
            type="button"
            onClick={() => {
              clearHistoryState();
              notify('История разборов очищена.', 'info');
            }}
            className="btn-ghost text-[10px]"
          >
            <Trash2 size={12} /> Очистить историю
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="panel p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="kicker">Средний профиль</div>
              <h2 className="display-title mt-1 text-lg text-white">Оценки по зонам</h2>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-ink-400">
              <History size={12} /> {history.length} {history.length === 1 ? 'матч' : history.length < 5 ? 'матча' : 'матчей'}
            </div>
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,260px)_minmax(0,1fr)] sm:items-center">
            <RadarChart
              size={260}
              values={DIMENSIONS.map((key) => ({
                key,
                label: DIMENSION_META[key].short,
                value: averages[key],
              }))}
            />
            <div className="space-y-2.5">
              {DIMENSIONS.map((key) => (
                <div key={key}>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-ink-300">{DIMENSION_META[key].label}</span>
                    <span className="font-display text-[11px] font-semibold" style={{ color: DIMENSION_META[key].color }}>
                      {averages[key] ?? '—'}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${averages[key] ?? 0}%`, background: DIMENSION_META[key].color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="panel-soft p-4">
            <div className="label">Средняя оценка</div>
            <div className="mt-2 flex items-center gap-3">
              <ScoreRing value={averageOverall} size={60} stroke={5} />
              <div className="text-[10px] leading-relaxed text-ink-400">
                из {history.length} {history.length === 1 ? 'матча' : 'матчей'}
                <br />
                лучший — <span className="font-semibold text-white">{bestOverall ?? '—'}</span>
              </div>
            </div>
          </div>
          <div className="panel-soft p-4">
            <div className="label">Винрейт в сохранённых</div>
            <div className="mt-2 font-display text-3xl font-semibold text-white">{winrate}%</div>
            <div className="mt-1 text-[10px] text-ink-400">{wins} побед из {history.length}</div>
          </div>
          <div className="panel-soft p-4">
            <div className="label">Пройдено уроков</div>
            <div className="mt-2 font-display text-3xl font-semibold text-white">
              {doneLessons}
              <span className="text-base text-ink-500">/{LESSONS.length}</span>
            </div>
            <div className="mt-1 text-[10px] text-ink-400">академия</div>
          </div>
          <div className="panel-soft p-4">
            <div className="label">Слабая зона</div>
            <div className="mt-2 font-display text-lg font-semibold" style={{ color: weakest ? DIMENSION_META[weakest.key].color : '#8FA69D' }}>
              {weakest ? DIMENSION_META[weakest.key].label : '—'}
            </div>
            <div className="mt-1 text-[10px] text-ink-400">
              {weakest ? `${weakest.value}/100 в среднем` : 'недостаточно данных'}
            </div>
          </div>
        </div>
      </div>

      <div className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="kicker">Динамика</div>
            <h2 className="display-title mt-1 text-lg text-white">Оценка от матча к матчу</h2>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-ink-500">
            <BarChart3 size={12} /> {trend.length} матчей
          </div>
        </div>
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <Sparkline
            values={trend.map((entry) => entry.overall ?? 0)}
            height={70}
            color="#C9F26B"
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[9px] text-ink-500">
          <span>{trend[0] ? fmtDate(trend[0].startTime) : ''}</span>
          <span>{trend[trend.length - 1] ? fmtDate(trend[trend.length - 1].startTime) : ''}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div>
              <div className="kicker">История</div>
              <div className="mt-0.5 text-[12px] font-semibold text-white">Сохранённые разборы</div>
            </div>
            <span className="text-[9px] text-ink-500">нажми на строку, чтобы открыть</span>
          </div>
          <div className="divide-y divide-white/[0.045]">
            {history.map((entry) => {
              const hero = HERO_BY_ID[entry.heroId];
              const won = entry.radiantWin === entry.isRadiant;
              return (
                <div key={`${entry.matchId}-${entry.slot}`} className="group flex items-center gap-2 px-3 py-2.5 sm:px-4">
                  <button
                    type="button"
                    onClick={() => navigate(matchPath(entry.matchId, 'report', entry.slot))}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <HeroAvatar hero={hero ?? null} size={34} side={entry.isRadiant ? 'radiant' : 'dire'} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12px] font-semibold text-white">{hero?.localized_name ?? 'Матч'}</span>
                        <span className="text-[9px] font-bold uppercase" style={{ color: won ? SIDE_COLOR.radiant : SIDE_COLOR.dire }}>
                          {won ? 'W' : 'L'}
                        </span>
                        {entry.demo && (
                          <span className="rounded bg-lime/10 px-1 py-0.5 text-[7px] font-bold uppercase tracking-wider text-lime">
                            демо
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-ink-500">
                        <RoleBadge role={entry.role} short />
                        <span>{fmtDate(entry.startTime)}</span>
                        <span>· {fmtTime(entry.duration)}</span>
                      </div>
                    </div>
                    <div className="hidden items-center gap-1 sm:flex">
                      {DIMENSIONS.map((key) => (
                        <span
                          key={key}
                          title={`${DIMENSION_META[key].label}: ${entry.scores[key] ?? '—'}`}
                          className="h-1.5 w-3.5 rounded-full"
                          style={{
                            background: DIMENSION_META[key].color,
                            opacity: entry.scores[key] == null ? 0.12 : 0.25 + (entry.scores[key]! / 100) * 0.75,
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="hidden font-display text-[10px] text-ink-400 sm:inline">{entry.grade}</span>
                      <ScoreRing value={entry.overall} size={34} stroke={3} />
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeHistoryEntry(entry.matchId, entry.slot)}
                    className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-ink-600 opacity-0 transition hover:bg-dire/10 hover:text-dire group-hover:opacity-100"
                    aria-label="Удалить из истории"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <div className="flex items-center gap-2">
              <Target size={14} className="text-lime" />
              <h3 className="display-title text-base text-white">Фокус на неделю</h3>
            </div>
            {weakest ? (
              <>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-300">
                  Самая слабая зона — <strong style={{ color: DIMENSION_META[weakest.key].color }}>{DIMENSION_META[weakest.key].label.toLowerCase()}</strong>{' '}
                  ({weakest.value}/100). Возьми один конкретный навык и проверяй его 3 игры подряд.
                </p>
                <div className="mt-3 space-y-2">
                  {suggestedLessons.map((lesson) => {
                    const done = lessonProgress[lesson.id]?.done;
                    return (
                      <a
                        key={lesson.id}
                        href={`#/lesson/${lesson.id}`}
                        className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition hover:border-white/[0.12] hover:bg-white/[0.04]"
                      >
                        <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-lime/10 text-lime">
                          {done ? <Check size={13} /> : <BookOpen size={13} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-semibold text-white">{lesson.title}</span>
                          <span className="block text-[9px] text-ink-500">{lesson.minutes} мин · практика</span>
                        </span>
                        <ArrowRight size={12} className="text-ink-500" />
                      </a>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
                Нужно больше сохранённых разборов, чтобы определить слабую зону. Сохрани ещё пару матчей.
              </p>
            )}
          </div>
          <div className="panel p-4">
            <div className="flex items-center gap-2">
              <History size={14} className="text-ink-400" />
              <h3 className="display-title text-base text-white">Как это работает</h3>
            </div>
            <div className="mt-2 space-y-2 text-[10.5px] leading-relaxed text-ink-400">
              <p>
                Средние считаются по сохранённым разборам. Оценки по зонам сравниваются с ориентирами для твоей роли —
                поэтому саппорт не проигрывает керри по фарму.
              </p>
              <p>
                Очистка истории удаляет только локальные сохранения (в браузере), сами матчи остаются в OpenDota.
              </p>
            </div>
            <a href="#/academy" className="btn-secondary mt-3 w-full text-[11px]">
              <GraduationCap size={13} /> Все уроки
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
