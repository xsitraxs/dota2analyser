import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, Clock, GraduationCap, Quote, Sparkles } from 'lucide-react';
import { useApp } from '../lib/app-context';
import {
  LESSONS,
  LESSON_BY_ID,
  categoryColor,
  categoryLabel,
  type LessonLevel,
} from '../data/lessons';
import { EmptyState } from '../components/ui';

const LEVEL_LABEL: Record<LessonLevel, string> = {
  base: 'База',
  mid: 'Средний',
  pro: 'Продвинутый',
};

export default function LessonPage({ lessonId }: { lessonId: string }) {
  const { lessonProgress, toggleLesson, navigate, notify } = useApp();
  const lesson = LESSON_BY_ID[lessonId];

  if (!lesson) {
    return (
      <EmptyState
        icon={<BookOpen size={22} />}
        title="Урок не найден"
        description="Возможно, ссылка устарела. Открой академию и выбери урок из списка."
        action={
          <a href="#/academy" className="btn-primary text-xs">
            <ArrowLeft size={14} /> В академию
          </a>
        }
        className="mt-8"
      />
    );
  }

  const index = LESSONS.findIndex((item) => item.id === lesson.id);
  const previous = index > 0 ? LESSONS[index - 1] : null;
  const next = index < LESSONS.length - 1 ? LESSONS[index + 1] : null;
  const done = lessonProgress[lesson.id]?.done;
  const color = categoryColor(lesson.category);
  const related = LESSONS.filter((item) => item.category === lesson.category && item.id !== lesson.id).slice(0, 3);
  const totalDone = Object.values(lessonProgress).filter((item) => item.done).length;

  return (
    <div className="mx-auto max-w-[980px] animate-enter">
      <div className="flex items-center justify-between gap-3">
        <a href="#/academy" className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-400 transition hover:text-white">
          <ArrowLeft size={13} /> Академия
        </a>
        <span className="text-[10px] text-ink-500">
          Урок {index + 1} из {LESSONS.length} · пройдено {totalDone}
        </span>
      </div>

      <article className="panel mt-3 overflow-hidden">
        <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${color}, transparent 85%)` }} />
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-md border px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.14em]"
              style={{ color, borderColor: `${color}35`, background: `${color}10` }}
            >
              {categoryLabel(lesson.category)}
            </span>
            <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-wider text-ink-400">
              {LEVEL_LABEL[lesson.level]}
            </span>
            <span className="inline-flex items-center gap-1 text-[9.5px] text-ink-500">
              <Clock size={10} /> {lesson.minutes} мин чтения
            </span>
          </div>

          <h1 className="display-title mt-3 text-[26px] leading-tight text-white sm:text-[32px]">{lesson.title}</h1>
          <p className="mt-1.5 text-[13px] font-medium text-ink-300">{lesson.subtitle}</p>
          <p className="mt-4 text-[12.5px] leading-[1.75] text-ink-300">{lesson.intro}</p>

          <div className="mt-6 space-y-6">
            {lesson.sections.map((section, sectionIndex) => (
              <section key={section.title}>
                <h2 className="flex items-center gap-2 font-display text-[16px] font-semibold text-white">
                  <span
                    className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-md border text-[10px] font-bold"
                    style={{ color, borderColor: `${color}38`, background: `${color}10` }}
                  >
                    {sectionIndex + 1}
                  </span>
                  {section.title}
                </h2>
                <p className="mt-2 text-[12px] leading-[1.8] text-ink-300">{section.body}</p>
                {section.bullets && (
                  <ul className="mt-2.5 space-y-1.5">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-300">
                        <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full" style={{ background: color }} />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
                {section.quote && (
                  <blockquote className="mt-3 flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
                    <Quote size={14} className="mt-0.5 flex-shrink-0 text-lime/70" />
                    <p className="text-[11.5px] font-medium italic leading-relaxed text-ink-200">{section.quote}</p>
                  </blockquote>
                )}
              </section>
            ))}
          </div>

          <div className="mt-7 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-lime">
              <Sparkles size={12} /> Забери с собой
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {lesson.takeaways.map((takeaway) => (
                <li key={takeaway} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-200">
                  <Check size={13} className="mt-0.5 flex-shrink-0 text-radiant" />
                  {takeaway}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3 rounded-2xl border border-gold/20 bg-gold/[0.05] p-4">
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-gold">
              <GraduationCap size={12} /> Практика
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-200">{lesson.practice}</p>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5">
            <button
              type="button"
              onClick={() => {
                toggleLesson(lesson.id, !done);
                notify(done ? 'Отметка снята.' : 'Урок отмечен как пройденный.', done ? 'info' : 'success');
              }}
              className={done ? 'btn-secondary' : 'btn-primary'}
            >
              {done ? <CheckCircle2 size={15} /> : <Check size={15} />}
              {done ? 'Пройдено' : 'Отметить как пройденное'}
            </button>
            <div className="flex gap-2">
              {previous && (
                <button type="button" onClick={() => navigate(`/lesson/${previous.id}`)} className="btn-ghost text-[11px]">
                  <ArrowLeft size={13} /> Назад
                </button>
              )}
              {next && (
                <button type="button" onClick={() => navigate(`/lesson/${next.id}`)} className="btn-secondary text-[11px]">
                  Следующий <ArrowRight size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      </article>

      {related.length > 0 && (
        <div className="mt-5">
          <div className="kicker">Из этой же категории</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {related.map((item) => (
              <a key={item.id} href={`#/lesson/${item.id}`} className="panel panel-hover p-4">
                <div className="text-[9px] font-semibold uppercase tracking-[0.1em]" style={{ color }}>
                  {categoryLabel(item.category)}
                </div>
                <div className="mt-1.5 text-[12px] font-semibold leading-snug text-white">{item.title}</div>
                <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-ink-400">{item.subtitle}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
