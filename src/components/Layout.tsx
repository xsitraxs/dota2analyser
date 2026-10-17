import { useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Crosshair,
  GraduationCap,
  Info,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { useApp } from '../lib/app-context';
import { HERO_BY_ID } from '../lib/constants';
import { fmtDate } from '../lib/format';
import { matchPath } from '../lib/router';
import { demoMatchId } from '../lib/matchStore';
import { SIDE_COLOR } from './ui';

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a href="#/" className="group flex items-center gap-3">
      <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-lime text-ink-950 shadow-glow">
        <span className="font-display text-[15px] font-bold tracking-tight">D2</span>
        <span className="absolute -right-1 -top-1 h-3 w-3 rotate-45 bg-ink-950/20" />
      </span>
      {!compact && (
        <span>
          <span className="block font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-white">
            Analyser
          </span>
          <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-400">
            Dota 2 · разбор
          </span>
        </span>
      )}
    </a>
  );
}

function NavItem({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${
        active
          ? 'bg-white/[0.06] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
          : 'text-ink-300 hover:bg-white/[0.035] hover:text-white'
      }`}
    >
      {active && <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-lime" />}
      <span className={active ? 'text-lime' : 'text-ink-400'}>{icon}</span>
      {label}
    </a>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { route, navigate, history, notify } = useApp();
  const [query, setQuery] = useState('');

  const isAcademy = route.name === 'academy' || route.name === 'lesson';
  const isMatch = route.name === 'match';

  const title =
    route.name === 'home'
      ? 'Главная'
      : route.name === 'match'
        ? `Матч #${route.id}`
        : route.name === 'academy'
          ? 'Академия'
          : route.name === 'lesson'
            ? 'Урок'
            : route.name === 'progress'
              ? 'Прогресс'
              : 'Настройки';

  const openSearch = () => {
    const match = query.match(/matches\/(\d{5,})/i);
    const id = match?.[1] ?? (query.trim().match(/^\d{5,}$/)?.[0] ?? null);
    if (!id) {
      notify('Введи ID матча — например, 7490235544', 'error');
      return;
    }
    setQuery('');
    navigate(matchPath(Number(id)));
  };

  const navItems = [
    { href: '#/', active: route.name === 'home' || isMatch, icon: <Crosshair size={17} />, label: 'Разбор' },
    { href: '#/academy', active: isAcademy, icon: <GraduationCap size={17} />, label: 'Академия' },
    { href: '#/progress', active: route.name === 'progress', icon: <TrendingUp size={17} />, label: 'Прогресс' },
    { href: '#/settings', active: route.name === 'settings', icon: <Settings size={17} />, label: 'Настройки' },
  ];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-white/[0.06] bg-ink-950/55 px-5 py-6 backdrop-blur-xl lg:flex">
        <Logo />

        <nav className="mt-9 space-y-1">
          <div className="label mb-2 px-3">Навигация</div>
          {navItems.slice(0, 3).map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>

        <div className="mt-7">
          <div className="mb-2 flex items-center justify-between px-3">
            <span className="label">Последние разборы</span>
            {history.length > 0 && (
              <a href="#/progress" className="text-[10px] font-semibold text-ink-400 hover:text-lime">
                все
              </a>
            )}
          </div>
          {history.length === 0 ? (
            <div className="mx-1 rounded-xl border border-dashed border-white/[0.08] px-3 py-3 text-[11px] leading-relaxed text-ink-400">
              Разбери первый матч — он появится здесь.
            </div>
          ) : (
            <div className="space-y-1">
              {history.slice(0, 4).map((entry) => {
                const hero = HERO_BY_ID[entry.heroId];
                return (
                  <button
                    key={`${entry.matchId}-${entry.slot}`}
                    type="button"
                    onClick={() => navigate(matchPath(entry.matchId, 'report', entry.slot))}
                    className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.04]"
                  >
                    <span
                      className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                      style={{ background: entry.radiantWin === entry.isRadiant ? SIDE_COLOR.radiant : SIDE_COLOR.dire }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold text-ink-200 group-hover:text-white">
                        {hero?.localized_name ?? `Матч #${entry.matchId}`}
                      </span>
                      <span className="block text-[9px] uppercase tracking-wider text-ink-500">
                        {fmtDate(entry.startTime)}
                      </span>
                    </span>
                    <span className="font-display text-[12px] font-semibold text-lime">{entry.overall ?? '—'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-auto space-y-2 pt-6">
          <button
            type="button"
            onClick={() => navigate(matchPath(demoMatchId(), 'report'))}
            className="group flex w-full items-center justify-between rounded-xl border border-lime/20 bg-lime/[0.06] px-3.5 py-3 text-left transition hover:border-lime/35 hover:bg-lime/[0.1]"
          >
            <span>
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-lime">
                <Sparkles size={12} /> ДЕМО-РАЗБОР
              </span>
              <span className="mt-1 block text-[10px] leading-relaxed text-ink-400">Посмотреть, как это работает</span>
            </span>
            <ArrowUpRight size={15} className="text-lime transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </button>
          <div className="flex items-center justify-between px-1 pt-1 text-[9px] uppercase tracking-[0.14em] text-ink-500">
            <span>OpenDota API</span>
            <span>v1.0</span>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="lg:hidden">
                <Logo compact />
              </div>
              <div className="hidden h-5 w-px bg-white/[0.08] lg:block" />
              <div className="flex min-w-0 items-center gap-2">
                {isMatch && <span className="hidden h-1.5 w-1.5 rounded-full bg-lime sm:block" />}
                <span className="truncate text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-300">{title}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  openSearch();
                }}
                className="relative hidden items-center sm:flex"
              >
                <Search size={14} className="pointer-events-none absolute left-3 text-ink-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ID матча"
                  className="h-9 w-40 rounded-lg border border-white/[0.09] bg-white/[0.035] pl-8 pr-3 text-[12px] text-white outline-none transition placeholder:text-ink-500 focus:w-48 focus:border-lime/40"
                  aria-label="Найти матч по ID"
                />
              </form>
              <a
                href="#/academy"
                className="hidden h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[11px] font-semibold text-ink-300 transition hover:text-white md:flex"
              >
                <BookOpen size={13} /> Уроки
              </a>
              <a
                href="#/settings"
                className={`grid h-9 w-9 place-items-center rounded-lg border transition ${
                  route.name === 'settings'
                    ? 'border-lime/30 bg-lime/10 text-lime'
                    : 'border-white/[0.08] bg-white/[0.03] text-ink-400 hover:text-white'
                }`}
                aria-label="Настройки"
              >
                <Settings size={15} />
              </a>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-12">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-4">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-2.5 text-[9px] font-semibold uppercase tracking-[0.08em] transition ${
                item.active ? 'text-lime' : 'text-ink-400'
              }`}
            >
              {item.icon}
              {item.label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function ToastViewport() {
  const { toasts } = useApp();
  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:bottom-6">
      {toasts.map((toast) => {
        const tone =
          toast.tone === 'error'
            ? { color: '#FF6B62', icon: <XCircle size={16} /> }
            : toast.tone === 'success'
              ? { color: '#5FE08B', icon: <CheckCircle2 size={16} /> }
              : { color: '#7FB5FF', icon: <Info size={16} /> };
        return (
          <div
            key={toast.id}
            className="animate-enter pointer-events-auto flex items-start gap-2.5 rounded-xl border border-white/[0.1] bg-ink-800/95 px-4 py-3 text-[12px] font-medium text-ink-100 shadow-2xl backdrop-blur-xl"
          >
            <span className="mt-0.5 flex-shrink-0" style={{ color: tone.color }}>
              {tone.icon}
            </span>
            <span className="leading-relaxed">{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-dire/20 bg-dire/[0.06] px-3 py-2.5 text-[12px] leading-relaxed text-[#ffb3ae]">
      <TriangleAlert size={14} className="mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}
