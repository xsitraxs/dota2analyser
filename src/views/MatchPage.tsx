import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Database, Loader2, RefreshCw, Sparkles, Upload } from 'lucide-react';
import { useApp } from '../lib/app-context';
import { analyzeMatch } from '../lib/analyze';
import { findMySlot } from '../lib/identity';
import { loadMatch, mergeParsedData, refreshMatch } from '../lib/matchStore';
import { matchPath, type MatchTab } from '../lib/router';
import { requestParse } from '../lib/openDota';
import { providerLabel, providerProblem } from '../lib/dataSource';
import { needsSettings, toAppError, type AppError } from '../lib/errors';
import { readJsonFiles } from '../lib/normalize';
import type { Match } from '../types';
import { EmptyState } from '../components/ui';
import { OverviewTab } from './match/OverviewTab';
import { PlayersTab } from './match/PlayersTab';
import { TimelineTab } from './match/TimelineTab';
import { MapTab } from './match/MapTab';
import { ReportPanel } from './match/ReportPanel';

const TABS: { key: MatchTab; label: string }[] = [
  { key: 'overview', label: 'Обзор' },
  { key: 'players', label: 'Игроки' },
  { key: 'timeline', label: 'Таймлайн' },
  { key: 'map', label: 'Карта' },
  { key: 'report', label: 'Оценка и коучинг' },
];

export default function MatchPage({ route }: { route: { name: 'match'; id: number; tab: MatchTab; slot?: number } }) {
  const { settings, navigate, identity, notify, recordHistory } = useApp();
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [parseRequested, setParseRequested] = useState(false);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMatch(null);
    loadMatch(route.id, settings)
      .then((next) => {
        if (!cancelled) setMatch(next);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(toAppError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [route.id, settings, reloadKey]);

  const analysis = useMemo(() => (match ? analyzeMatch(match) : null), [match]);

  const mySlot = useMemo(() => {
    if (!match) return null;
    return findMySlot(match, identity);
  }, [match, identity]);

  const activeSlot = route.tab === 'report' ? (route.slot ?? mySlot ?? analysis?.players[0].player.slot ?? 0) : mySlot;

  const setTab = useCallback(
    (tab: MatchTab, slot?: number) => {
      navigate(matchPath(route.id, tab, slot ?? (tab === 'report' ? (route.slot ?? mySlot ?? undefined) : undefined)));
    },
    [navigate, route.id, route.slot, mySlot],
  );

  const autoSave = useCallback(
    (slot: number) => {
      if (!match || !analysis) return;
      const current = analysis.bySlot[slot];
      if (!current) return;
      recordHistory({
        matchId: match.id,
        slot,
        heroId: current.hero?.id ?? 0,
        role: current.role,
        overall: current.overall,
        grade: current.grade,
        scores: current.scores,
        radiantWin: match.radiantWin,
        isRadiant: current.player.isRadiant,
        duration: match.duration,
        startTime: match.startTime,
        savedAt: Date.now(),
        demo: Boolean(match.demo),
      });
    },
    [match, analysis, recordHistory],
  );

  const retry = () => setReloadKey((key) => key + 1);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-24" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="skeleton h-[360px]" />
          <div className="skeleton h-[360px]" />
        </div>
        <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-ink-400">
          <Loader2 size={15} className="animate-spin text-lime" /> Загружаю матч #{route.id}…
        </div>
      </div>
    );
  }

  if (error || !match || !analysis) {
    return (
      <EmptyState
        icon={<Sparkles size={22} />}
        title="Матч пока не открылся"
        description={
          <span className="block">
            <span className="block">{error?.message ?? 'Не удалось получить данные матча.'}</span>
            {error?.hint && <span className="mt-2 block text-[11px] text-ink-500">{error.hint}</span>}
          </span>
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={retry} className="btn-primary text-xs">
              <RefreshCw size={14} /> Попробовать снова
            </button>
            {(error == null || needsSettings(error.code)) && (
              <a href="#/settings" className="btn-secondary text-xs">
                <Database size={14} /> Источник данных
              </a>
            )}
            <a href="#/" className="btn-secondary text-xs">
              <ChevronLeft size={14} /> На главную
            </a>
            <a
              href={`https://www.opendota.com/matches/${route.id}`}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost text-xs"
            >
              Открыть на OpenDota
            </a>
          </div>
        }
        className="mt-8"
      />
    );
  }

  return (
    <div className="space-y-4 animate-enter">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <a href="#/" className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-ink-400 transition hover:text-white">
            <ChevronLeft size={15} />
          </a>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-ink-500">Матч</span>
              {match.demo ? (
                <span className="rounded border border-lime/25 bg-lime/[0.08] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-lime">
                  демо
                </span>
              ) : (
                <span
                  className="rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-ink-300"
                  title={providerProblem(settings)?.message ?? 'Источник данных можно сменить в настройках'}
                >
                  {providerLabel(settings.provider)}
                </span>
              )}
            </div>
            <h1 className="display-title text-lg text-white sm:text-xl">
              #{match.id}{' '}
              {match.demo && <span className="text-sm font-normal text-ink-400">· {match.demo.title}</span>}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!match.parsed && settings.provider !== 'steam' && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await requestParse(
                    match.id,
                    settings.apiKey,
                    settings.provider === 'proxy' ? settings.proxyBase : undefined,
                  );
                  setParseRequested(true);
                  notify('Запрос на разбор реплея отправлен. Обычно это занимает 2–10 минут.', 'success');
                } catch (err) {
                  notify(toAppError(err).message, 'error');
                }
              }}
              disabled={parseRequested}
              className="btn-secondary !px-2.5 !py-1.5 text-[10px]"
            >
              <Sparkles size={12} /> {parseRequested ? 'Парс запрошен' : 'Запросить парс'}
            </button>
          )}
          {!match.parsed && (
            <label
              className={`btn-secondary !px-2.5 !py-1.5 text-[10px] ${merging ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
              title="Загрузи JSON парса (например, от друга с VPN или из другого источника) — таймлайны и карта появятся"
            >
              {merging ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              Догрузить парс
              <input
                type="file"
                multiple
                accept=".json,application/json"
                className="hidden"
                onChange={async (event) => {
                  const files = event.target.files ? Array.from(event.target.files) : [];
                  if (!files.length) return;
                  setMerging(true);
                  try {
                    const raw = await readJsonFiles(files);
                    const merged = await mergeParsedData(match.id, raw, settings);
                    setMatch(merged);
                    notify('Парс добавлен: таймлайны, карта и драки обновлены.', 'success');
                  } catch (err) {
                    notify(toAppError(err).message, 'error');
                  } finally {
                    setMerging(false);
                    event.target.value = '';
                  }
                }}
              />
            </label>
          )}
          <button
            type="button"
            onClick={async () => {
              try {
                const fresh = await refreshMatch(match.id, settings);
                setMatch(fresh);
                notify('Матч обновлён.', 'success');
              } catch (err) {
                notify(toAppError(err).message, 'error');
              }
            }}
            className="btn-ghost !px-2.5 !py-1.5 text-[10px]"
          >
            <RefreshCw size={12} /> Обновить
          </button>
          {mySlot == null ? (
            <button
              type="button"
              onClick={() => setTab('players')}
              className="btn-secondary !px-2.5 !py-1.5 text-[10px]"
            >
              Найти себя в матче
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                autoSave(mySlot);
                notify('Разбор сохранён в прогрессе.', 'success');
              }}
              className="btn-primary !px-2.5 !py-1.5 text-[10px]"
            >
              <Sparkles size={12} /> Сохранить мой разбор
            </button>
          )}
        </div>
      </div>

      <div className="tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setTab(tab.key)}
            className={`tab-item ${route.tab === tab.key ? 'tab-item-active' : ''}`}
          >
            {tab.label}
            {tab.key === 'report' && mySlot != null && (
              <span className="ml-1.5 rounded bg-lime/15 px-1 py-0.5 text-[8px] font-bold text-lime">мой</span>
            )}
          </button>
        ))}
      </div>

      {route.tab === 'overview' && <OverviewTab match={match} analysis={analysis} mySlot={mySlot} />}
      {route.tab === 'players' && <PlayersTab match={match} analysis={analysis} mySlot={mySlot} />}
      {route.tab === 'timeline' && <TimelineTab match={match} analysis={analysis} />}
      {route.tab === 'map' && <MapTab analysis={analysis} match={match} />}
      {route.tab === 'report' && (
        <ReportPanel
          key={activeSlot ?? 'default'}
          match={match}
          analysis={analysis}
          slot={activeSlot ?? analysis.players[0].player.slot}
          onSelectSlot={(slot) => setTab('report', slot)}
          mySlot={mySlot}
        />
      )}

      <div className="flex items-center justify-center gap-2 pt-2 text-[9px] text-ink-600">
        <span>Источник: {match.demo ? 'OpenDota (демо)' : providerLabel(settings.provider)}</span>
        <span>·</span>
        <span>Данные матча #{match.id}</span>
        {!match.parsed && (
          <>
            <span>·</span>
            <span className="text-gold/70">разбор без парса</span>
          </>
        )}
      </div>
    </div>
  );
}
