import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Clock, Filter, GraduationCap, Search, Sparkles } from 'lucide-react';
import { useApp } from '../lib/app-context';
import {
  LESSONS,
  LESSON_CATEGORIES,
  categoryColor,
  categoryLabel,
  type LessonCategoryId,
  type LessonLevel,
} from '../data/lessons';

const LEVELS: { key: LessonLevel | 'all'; label: string }[] = [
  { key: 'all', label: 'Все уровни' },
  { key: 'base', label: 'База' },
  { key: 'mid', label: 'Средний' },
  { key: 'pro', label: 'Продвинутый' },
];

const LEVEL_LABEL: Record<LessonLevel, string> = {
  base: 'База',
  mid: 'Средний',
  pro: 'Продвинутый',
};

export default function AcademyPage() {
  const { lessonProgress, history } = useApp();
  const [category, setCategory] = useState<LessonCategoryId | 'all'>('all');
  const [level, setLevel] = useState<LessonLevel | 'all'>('all');
  const [query, setQuery] = useState('');

  const doneCount = Object.values(lessonProgress).filter((item) => item.done).length;
  const progressPct = Math.round((doneCount / LESSONS.length) * 100);

  const filtered = useMemo(() => {
    return LESSONS.filter((lesson) => {
      if (category !== 'all' && lesson.category !== category) return false;
      if (level !== 'all' && lesson.level !== level) return false;
      if (query.trim()) {
        const needle = query.trim().toLowerCase();
        const haystack = `${lesson.title} ${lesson.subtitle} ${lesson.intro} ${lesson.takeaways.join(' ')}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [category, level, query]);

  const recommended = useMemo(() => {
    if (!history.length) return LESSONS.filter((lesson) => lesson.level === 'base').slice(0, 3);
    const keys = ['farm', 'damage', 'survival', 'vision', 'fights', 'objectives'] as const;
    const averages = keys.map((key) => ({
      key,
      value:
        history
          .map((entry) => entry.scores[key])
          .filter((value): value is number => value != null)
          .reduce((acc, value, _, array) => acc + value / array.length, 0) || 100,
    }));
    const weakest = [...averages].sort((a, b) => a.value - b.value)[0];
    const map: Record<string, string[]> = {
      farm: ['last-hits', 'farm-patterns'],
      damage: ['positioning', 'teamfights'],
      survival: ['death-review', 'positioning'],
      vision: ['vision', 'map-awareness'],
      fights: ['teamfights', 'positioning'],
      objectives: ['objectives', 'tp-discipline'],
    };
    const ids = map[weakest?.key ?? 'farm'] ?? ['review-method'];
    return LESSONS.filter((lesson) => ids.includes(lesson.id));
  }, [history]);

  return (
    <div className="space-y-6 animate-enter">
      <section className="panel relative overflow-hidden p-5 sm:p-7">
        <div className="grid-fade pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-lime/25 bg-lime/[0.07] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-lime">
              <GraduationCap size={11} /> Академия
            </div>
            <h1 className="display-title mt-3 max-w-xl text-[28px] leading-tight text-white sm:text-[34px]">
              Теория, которая сразу видна в разборе
            </h1>
            <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-ink-400">
              {LESSONS.length} коротких уроков на русском: фарм, роли, драки, карта, предметы и макро. Каждый урок
              привязан к метрикам и инсайтам твоих матчей.
            </p>
          </div>
          <div className="w-full max-w-[280px] rounded-2xl border border-white/[0.08] bg-ink-950/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">Пройдено</span>
              <span className="font-display text-sm font-semibold text-white">
                {doneCount}/{LESSONS.length}
              </span>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#8FD94A] to-lime transition-all duration-700"
                style={{ width: `${Math.max(2, progressPct)}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[9px] text-ink-500">
              <span>{progressPct}% программы</span>
              <a href="#/progress" className="font-semibold text-lime/90 hover:text-lime">
                Мой прогресс
              </a>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="kicker">Рекомендации</div>
            <h2 className="display-title mt-1 text-xl text-white">
              {history.length ? 'Начни с этих уроков' : 'С чего начать'}
            </h2>
            <p className="mt-1 text-[11.5px] text-ink-400">
              {history.length
                ? 'Подобрано по слабым зонам из твоих сохранённых разборов.'
                : 'Базовые уроки, которые дают самый быстрый рост.'}
            </p>
          </div>
          {history.length > 0 && (
            <a href="#/progress" className="btn-ghost text-[11px]">
              <Sparkles size={13} /> Открыть прогресс
            </a>
          )}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {recommended.map((lesson) => {
            const done = lessonProgress[lesson.id]?.done;
            return (
              <a
                key={lesson.id}
                href={`#/lesson/${lesson.id}`}
                className="panel panel-hover group relative overflow-hidden p-4"
              >
                <div
                  className="absolute inset-x-0 top-0 h-0.5"
                  style={{ background: `linear-gradient(90deg, ${categoryColor(lesson.category)}, transparent)` }}
                />
                <div className="flex items-center justify-between">
                  <span
                    className="rounded-md border px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em]"
                    style={{
                      color: categoryColor(lesson.category),
                      borderColor: `${categoryColor(lesson.category)}35`,
                      background: `${categoryColor(lesson.category)}10`,
                    }}
                  >
                    {categoryLabel(lesson.category)}
                  </span>
                  {done ? (
                    <CheckCircle2 size={15} className="text-radiant" />
                  ) : (
                    <span className="text-[9px] text-ink-500">{lesson.minutes} мин</span>
                  )}
                </div>
                <h3 className="mt-3 text-[13px] font-semibold leading-snug text-white">{lesson.title}</h3>
                <p className="mt-1.5 line-clamp-3 text-[10.5px] leading-relaxed text-ink-400">{lesson.intro}</p>
                <div className="mt-3 flex items-center justify-between text-[9px] text-ink-500">
                  <span>{lesson.takeaways.length} вывода · практика</span>
                  <ArrowRight size={12} className="transition group-hover:translate-x-0.5 group-hover:text-lime" />
                </div>
              </a>
            );
          })}
        </div>
      </section>

      <section>
        <div className="panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-lime" />
              <span className="text-[12px] font-semibold text-white">Все уроки</span>
              <span className="text-[10px] text-ink-500">{filtered.length} из {LESSONS.length}</span>
            </div>
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск по урокам"
                className="h-8 w-52 rounded-lg border border-white/[0.09] bg-white/[0.035] pl-8 pr-3 text-[11.5px] text-white outline-none placeholder:text-ink-500 focus:border-lime/40"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={`chip ${category === 'all' ? 'chip-active' : ''}`}
            >
              Все категории
            </button>
            {LESSON_CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={`chip ${category === item.id ? 'chip-active' : ''}`}
                style={category === item.id ? { borderColor: `${item.color}55`, background: `${item.color}14`, color: item.color } : undefined}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {LEVELS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setLevel(item.key)}
                className={`chip !py-1 text-[10px] ${level === item.key ? 'chip-active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((lesson) => {
            const done = lessonProgress[lesson.id]?.done;
            const color = categoryColor(lesson.category);
            return (
              <a
                key={lesson.id}
                href={`#/lesson/${lesson.id}`}
                className="panel panel-hover group flex h-full flex-col p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    <span className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color }}>
                      {categoryLabel(lesson.category)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={10} /> {lesson.minutes} мин
                    </span>
                    {done && <CheckCircle2 size={13} className="text-radiant" />}
                  </div>
                </div>
                <h3 className="mt-2.5 text-[13px] font-semibold leading-snug text-white">{lesson.title}</h3>
                <p className="mt-1 text-[10.5px] leading-relaxed text-ink-400">{lesson.subtitle}</p>
                <div className="mt-auto flex items-center justify-between pt-3 text-[9px] text-ink-500">
                  <span>{LEVEL_LABEL[lesson.level]}</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-ink-300 transition group-hover:text-lime">
                    {done ? 'Повторить' : 'Изучить'} <ArrowRight size={11} />
                  </span>
                </div>
              </a>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="panel mt-4 flex flex-col items-center py-12 text-center">
            <BookOpen size={22} className="text-ink-500" />
            <div className="mt-3 text-sm font-semibold text-white">Ничего не нашлось</div>
            <div className="mt-1 text-[11px] text-ink-400">Попробуй другой запрос или сбрось фильтры.</div>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategory('all');
                setLevel('all');
              }}
              className="btn-secondary mt-4 text-[11px]"
            >
              Сбросить фильтры
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
