import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Database,
  FileJson,
  Gauge,
  GraduationCap,
  Loader2,
  Map,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserRound,
  X,
} from 'lucide-react';
import { useApp } from '../lib/app-context';
import { buildCoachReport } from '../lib/insights';
import { analyzeMatch } from '../lib/analyze';
import { DIMENSION_META, GAME_MODE_LABEL, HERO_BY_ID } from '../lib/constants';
import { fmtDate, fmtNum, fmtTime, plural } from '../lib/format';
import { matchPath } from '../lib/router';
import { getDemoCards, importMatch, type DemoCard } from '../lib/matchStore';
import { MatchDataError, normalizeMatch, readJsonFiles } from '../lib/normalize';
import { parseAccountInput, rankLabel, type RecentMatch } from '../lib/openDota';
import {
  PROVIDERS,
  fetchProfile,
  providerLabel,
  fetchRawMatch,
  fetchRecentMatches,
  providerProblem,
  suggestAccounts,
  type AccountSuggestion,
  type ProfileView,
} from '../lib/dataSource';
import { toAppError, type AppError } from '../lib/errors';
import type { CoachReport, Match, MatchAnalysis, PlayerAnalysis } from '../types';
import { HeroAvatar, RoleBadge, ScoreRing, SectionHeading, SIDE_COLOR } from '../components/ui';
import { RadarChart } from '../components/charts';
import { loadDemoPayload, DEMO_META_LIST } from '../lib/demoData';

function extractMatchId(value: string): number | null {
  const fromUrl = value.match(/matches\/(\d{5,})/i);
  if (fromUrl) return Number(fromUrl[1]);
  const digits = value.trim().match(/^\d{5,}$/);
  if (digits) return Number(digits[0]);
  return null;
}

type HeroPreviewData = {
  match: Match;
  analysis: MatchAnalysis;
  player: PlayerAnalysis;
  coach: CoachReport;
  meta: { featuredSlot: number; title: string };
};

function HeroPreview() {
  const [preview, setPreview] = useState<HeroPreviewData | null>(null);
  const [failed, setFailed] = useState(false);

  // Демо подгружается отдельным чанком: первый экран не ждёт 200 КБ JSON.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const payload = await loadDemoPayload(DEMO_META_LIST[0]?.matchId ?? 7490235544);
      if (!alive) return;
      if (payload == null) {
        setFailed(true);
        return;
      }
      try {
        const match = normalizeMatch([payload]);
        const analysis = analyzeMatch(match);
        const meta = (payload as { __demo: { featuredSlot: number; title: string } }).__demo;
        const player = analysis.bySlot[meta.featuredSlot] ?? analysis.players[0];
        const coach = buildCoachReport(match, analysis, player.player.slot);
        if (alive) setPreview({ match, analysis, player, coach, meta });
      } catch (error) {
        console.error('Не удалось построить превью демо-матча:', error);
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!preview) {
    return (
      <div className="relative mx-auto w-full max-w-[390px]">
        <div className="panel flex min-h-[280px] items-center justify-center rounded-[24px] border-white/[0.08] p-5 text-[11px] text-ink-400">
          {failed ? 'Превью демо недоступно — открой демо-матч ниже.' : 'Загружаю превью демо-матча…'}
        </div>
      </div>
    );
  }
  const { match, player, coach } = preview;
  const insight = coach.insights.find((item) => item.severity !== 'good') ?? coach.insights[0];

  return (
    <div className="relative mx-auto w-full max-w-[390px]">
      <div className="absolute -inset-6 rounded-[32px] bg-lime/[0.045] blur-2xl" />
      <div className="panel relative overflow-hidden rounded-[24px] border-white/[0.1] p-5 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.95)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="kicker">Свежий разбор</div>
            <div className="mt-1.5 flex items-center gap-2">
              <HeroAvatar hero={player.hero} size={44} side={player.player.isRadiant ? 'radiant' : 'dire'} />
              <div>
                <div className="font-display text-[15px] font-semibold text-white">{player.hero?.localized_name}</div>
                <div className="mt-0.5 text-[10px] text-ink-400">
                  {player.roleLabel.split('·')[0].trim()} · {fmtTime(match.duration)}
                </div>
              </div>
            </div>
          </div>
          <div className="text-right">
            <ScoreRing value={coach.overall} size={76} stroke={6} showGrade grade={coach.grade} />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2">
          <RadarChart
            size={280}
            values={coach.dimensions.map((dimension) => ({
              key: dimension.key,
              label: DIMENSION_META[dimension.key].short,
              value: dimension.value,
            }))}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {coach.dimensions
            .filter((dimension) => dimension.value != null)
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
            .slice(0, 4)
            .map((dimension) => (
              <div key={dimension.key} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-2">
                <span className="text-[10px] font-medium text-ink-400">{DIMENSION_META[dimension.key].label}</span>
                <span className="font-display text-xs font-semibold" style={{ color: DIMENSION_META[dimension.key].color }}>
                  {dimension.value}
                </span>
              </div>
            ))}
        </div>

        {insight && (
          <div className="mt-3 rounded-xl border border-white/[0.07] bg-ink-950/60 p-3">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-gold">
              <Sparkles size={11} /> Главный инсайт
            </div>
            <div className="mt-1.5 text-[12px] font-semibold leading-snug text-white">{insight.title}</div>
            <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-ink-400">{insight.detail}</div>
          </div>
        )}

        <a
          href={`#${matchPath(match.id, 'report', player.player.slot)}`}
          className="mt-3 flex items-center justify-between rounded-lg px-1 py-1 text-[11px] font-semibold text-lime transition hover:text-[#e0ff9a]"
        >
          <span>Посмотреть полный разбор</span>
          <ArrowRight size={13} />
        </a>
      </div>

      <div className="panel absolute -bottom-6 -left-4 hidden items-center gap-2 rounded-xl border-white/[0.1] px-3 py-2.5 sm:flex">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-radiant/10 text-radiant">
          <CheckCircle2 size={14} />
        </div>
        <div>
          <div className="text-[10px] font-semibold text-white">20 уроков</div>
          <div className="text-[9px] text-ink-400">в академии</div>
        </div>
      </div>
    </div>
  );
}

function DemoSection() {
  const [cards, setCards] = useState<DemoCard[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void getDemoCards().then((list) => {
      if (!alive) return;
      setCards(list);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section id="demos">
      <SectionHeading
        eyebrow="Без регистрации"
        title="Демо-матчи с полным парсом"
        description="Реальные матчи из открытого датасета OpenDota. Открой любой — и увидишь все возможности разбора, даже без интернета."
        action={
          <a href="#/academy" className="btn-secondary text-xs">
            <BookOpen size={14} /> Сначала теория
          </a>
        }
      />
      {!ready && (
        <div className="panel mt-5 p-6 text-center text-[11px] text-ink-400">Загружаю демо-матчи…</div>
      )}
      {ready && !cards.length && (
        <div className="panel mt-5 p-6 text-center text-[11px] text-ink-400">
          Демо-данные не загрузились. Открой матч по ID или импортируй JSON.
        </div>
      )}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {cards.map((card) => {
          const hero = HERO_BY_ID[card.heroId];
          return (
            <div key={card.id} className="panel panel-hover group relative overflow-hidden rounded-2xl p-5">
              <div
                className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-20 blur-3xl transition group-hover:opacity-35"
                style={{ background: card.isRadiant ? SIDE_COLOR.radiant : SIDE_COLOR.dire }}
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-lime/25 bg-lime/[0.08] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-lime">
                    Демо
                  </span>
                  <span
                    className="rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em]"
                    style={{
                      color: card.won ? SIDE_COLOR.radiant : SIDE_COLOR.dire,
                      borderColor: `${card.won ? SIDE_COLOR.radiant : SIDE_COLOR.dire}40`,
                      background: `${card.won ? SIDE_COLOR.radiant : SIDE_COLOR.dire}10`,
                    }}
                  >
                    {card.won ? 'Победа' : 'Поражение'}
                  </span>
                  <span className="text-[9px] font-medium uppercase tracking-wider text-ink-500">
                    {GAME_MODE_LABEL(card.gameMode)}
                  </span>
                </div>
                {card.score != null && <ScoreRing value={card.score} size={42} stroke={4} />}
              </div>

              <div className="relative mt-4 flex items-center gap-3">
                <HeroAvatar hero={hero} size={52} side={card.isRadiant ? 'radiant' : 'dire'} />
                <div className="min-w-0">
                  <h3 className="font-display text-[17px] font-semibold leading-tight text-white">{card.meta.title}</h3>
                  <p className="mt-1 truncate text-[11px] text-ink-400">{card.meta.subtitle}</p>
                </div>
              </div>

              <div className="relative mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2">
                  <div className="label text-[8px]">K / D / A</div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {card.kills} / {card.deaths} / {card.assists}
                  </div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2">
                  <div className="label text-[8px]">GPM</div>
                  <div className="mt-1 text-sm font-semibold text-white">{fmtNum(card.gpm)}</div>
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2">
                  <div className="label text-[8px]">Длительность</div>
                  <div className="mt-1 text-sm font-semibold text-white">{fmtTime(card.duration)}</div>
                </div>
              </div>

              <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3.5">
                <div className="flex items-center gap-2">
                  <RoleBadge role={card.role} short />
                  <span className="text-[10px] text-ink-500">{fmtDate(card.startTime)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <a
                    href={`#${matchPath(card.id, 'overview')}`}
                    className="btn-ghost !px-2.5 !py-1.5 text-[11px]"
                  >
                    Обзор
                  </a>
                  <a href={`#${matchPath(card.id, 'report', card.meta.featuredSlot)}`} className="btn-primary !px-3 !py-1.5 text-[11px]">
                    Разбор <ChevronRight size={13} />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: <Gauge size={18} />,
      title: 'Оценка по 6 осям',
      text: 'Фарм, урон, выживаемость, вижн, драки и объективы — с поправкой на роль и цели.',
      color: '#C9F26B',
    },
    {
      icon: <Sparkles size={18} />,
      title: 'Авто-коуч',
      text: 'Находит конкретные ошибки: ранние смерти, пропущенные драки, поздний BKB, пустой вижн.',
      color: '#B7A4FF',
    },
    {
      icon: <Map size={18} />,
      title: 'Карта и таймлайн',
      text: 'Тепловая карта лейна, варды, смерти в драках и график преимущества по минутам.',
      color: '#7FB5FF',
    },
    {
      icon: <GraduationCap size={18} />,
      title: 'Академия + план',
      text: '20 уроков на русском и персональный план тренировки по слабым зонам.',
      color: '#5FE08B',
    },
  ];
  return (
    <section>
      <SectionHeading eyebrow="Что внутри" title="Не просто цифры — план действий" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {features.map((feature) => (
          <div key={feature.title} className="panel-soft group p-4 transition hover:border-white/[0.12] hover:bg-white/[0.035]">
            <div
              className="grid h-9 w-9 place-items-center rounded-xl border"
              style={{ color: feature.color, borderColor: `${feature.color}30`, background: `${feature.color}10` }}
            >
              {feature.icon}
            </div>
            <h3 className="mt-3 text-[13px] font-semibold text-white">{feature.title}</h3>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">{feature.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProviderChips() {
  const { settings, updateSettings, notify } = useApp();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PROVIDERS.map((provider) => (
        <button
          key={provider.key}
          type="button"
          onClick={() => {
            if (provider.key === settings.provider) return;
            updateSettings({ ...settings, provider: provider.key });
            if (provider.key === 'steam' && !settings.steamKey.trim()) {
              notify('Для Valve нужен бесплатный Steam Web API key — добавь его в настройках.', 'error');
            }
            if (provider.key === 'proxy' && !settings.proxyBase.trim()) {
              notify('Для прокси укажи базовый URL в настройках.', 'error');
            }
          }}
          className={`chip !py-1 text-[10px] ${settings.provider === provider.key ? 'chip-active' : ''}`}
          title={provider.description}
        >
          {provider.short}
        </button>
      ))}
    </div>
  );
}

function MyMatchesPanel() {
  const { settings, updateSettings, navigate, notify } = useApp();
  const [input, setInput] = useState(settings.accountId ? String(settings.accountId) : '');
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [matches, setMatches] = useState<RecentMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [results, setResults] = useState<AccountSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const loadedRef = useRef(false);

  // Защита от гонок: новый запрос отменяет предыдущий, а устаревший ответ
  // не перезаписывает актуальные результаты.
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const provider = PROVIDERS.find((item) => item.key === settings.provider);
  const configError = providerProblem(settings);

  const runSearch = async (accountId: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const [nextProfile, nextMatches] = await Promise.all([
        fetchProfile(accountId, settings, controller.signal),
        fetchRecentMatches(accountId, settings, 8, controller.signal),
      ]);
      if (id !== requestId.current || controller.signal.aborted) return;
      setProfile(nextProfile);
      setMatches(nextMatches ?? []);
    } catch (err) {
      if (id !== requestId.current || controller.signal.aborted) return;
      setError(toAppError(err));
      setProfile(null);
      setMatches([]);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (loadedRef.current) return;
    if (settings.accountId) {
      loadedRef.current = true;
      setInput(String(settings.accountId));
      void runSearch(settings.accountId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.accountId]);

  const submit = async () => {
    const value = input.trim();
    if (!value) {
      notify('Введи ник, SteamID64 или account_id.', 'error');
      return;
    }
    if (configError) {
      setError(configError);
      return;
    }
    const parsed = parseAccountInput(value);
    if (parsed.accountId) {
      loadedRef.current = true;
      setInput(String(parsed.accountId));
      void runSearch(parsed.accountId);
      return;
    }
    if (settings.provider === 'steam' && /steamcommunity\.com\/profiles\//i.test(value)) {
      notify('Ссылка на профиль не распознана. Нужен SteamID64 или account_id.', 'error');
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    setError(null);
    try {
      const found = await suggestAccounts(value, settings);
      if (id !== requestId.current) return;
      setResults(found);
      if (!found.length) {
        setError(
          toAppError(
            parsed.error ??
              'Никого не нашли. Проверь написание или введи SteamID64 / account_id.',
          ),
        );
      }
    } catch (err) {
      if (id !== requestId.current) return;
      setError(toAppError(err));
      setResults([]);
    } finally {
      if (id === requestId.current) setSearching(false);
    }
  };

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="kicker">Мои матчи</div>
          <h2 className="display-title mt-1.5 text-xl text-white">Источник данных</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-400">{provider?.description}</p>
        </div>
        <ProviderChips />
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={
              settings.provider === 'steam'
                ? 'SteamID64, account_id или короткое имя'
                : 'Ник, SteamID64 или account_id'
            }
            className="input !pl-9"
            aria-label="SteamID64 или account_id"
          />
        </div>
        <button type="button" onClick={() => void submit()} className="btn-primary !px-4" disabled={loading || searching}>
          {loading || searching ? <Loader2 size={15} className="animate-spin" /> : 'Найти'}
        </button>
      </div>

      {configError ? (
        <div className="mt-3 rounded-xl border border-gold/25 bg-gold/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-gold/90">
          {configError.message}{' '}
          <a href="#/settings" className="font-semibold underline decoration-gold/40 underline-offset-2">
            Открыть настройки
          </a>
          {configError.hint && <div className="mt-1 text-[10px] text-ink-400">{configError.hint}</div>}
        </div>
      ) : (
        settings.provider === 'steam' && (
          <div className="mt-2 flex items-center justify-between text-[9px] text-ink-500">
            <span>Данные напрямую от Valve, ключ хранится локально</span>
            <a href="#/settings" className="font-semibold text-lime/90 hover:text-lime">
              {settings.steamKey ? 'Ключ добавлен' : 'Добавить ключ'}
            </a>
          </div>
        )
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-dire/20 bg-dire/[0.05] px-3 py-2.5 text-[11px] leading-relaxed text-[#ffb3ae]">
          {error.message}
          {error.hint && <div className="mt-1 text-[10px] text-ink-400">{error.hint}</div>}
          <a href="#/settings" className="ml-1 inline-block font-semibold underline underline-offset-2">
            Настройки источника
          </a>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-white/[0.08]">
          <div className="border-b border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-ink-400">
            Найдено · выбери аккаунт
          </div>
          {results.map((result) => (
            <button
              key={result.accountId}
              type="button"
              onClick={() => {
                setInput(String(result.accountId));
                setResults([]);
                loadedRef.current = true;
                void runSearch(result.accountId);
              }}
              className="flex w-full items-center justify-between gap-2 border-b border-white/[0.04] px-3 py-2 text-left transition last:border-0 hover:bg-white/[0.04]"
            >
              <span className="min-w-0">
                <span className="block truncate text-[11.5px] font-semibold text-white">{result.name}</span>
                <span className="text-[9px] text-ink-500">ID {result.accountId}</span>
              </span>
              <ChevronRight size={13} className="text-ink-500" />
            </button>
          ))}
        </div>
      )}

      {profile && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-ink-300">
            <UserRound size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-white">
              {profile.name || `Аккаунт ${profile.accountId}`}
            </div>
            <div className="mt-0.5 text-[10px] text-ink-400">
              {profile.rankTier ? rankLabel(profile.rankTier) : 'рейтинг скрыт'} · ID {profile.accountId}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              updateSettings({
                ...settings,
                accountId: profile.accountId,
                playerName: profile.name ?? '',
              });
              notify('Профиль сохранён — он будет загружаться автоматически.', 'success');
            }}
            className="btn-secondary !px-2.5 !py-1.5 text-[10px]"
          >
            <ShieldCheck size={12} /> Запомнить
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-12" />
          ))}
        </div>
      ) : (
        matches.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {matches.map((recent) => {
              const hero = recent.hero_id != null ? HERO_BY_ID[recent.hero_id] : null;
              const isRadiant = recent.player_slot != null ? recent.player_slot < 128 : null;
              const won = isRadiant != null && recent.radiant_win != null ? isRadiant === recent.radiant_win : null;
              return (
                <button
                  key={recent.match_id}
                  type="button"
                  onClick={() => navigate(matchPath(recent.match_id, 'overview'))}
                  className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-white/[0.07] hover:bg-white/[0.03]"
                >
                  <HeroAvatar hero={hero ?? null} size={34} side={isRadiant === false ? 'dire' : 'radiant'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-white">{hero?.localized_name ?? 'Герой'}</span>
                      <span
                        className="text-[9px] font-bold uppercase"
                        style={{ color: won == null ? '#64756E' : won ? SIDE_COLOR.radiant : SIDE_COLOR.dire }}
                      >
                        {won == null ? '?' : won ? 'W' : 'L'}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[9.5px] text-ink-500">
                      {recent.game_mode != null ? GAME_MODE_LABEL(recent.game_mode) : 'режим неизвестен'} ·{' '}
                      {recent.start_time ? fmtDate(recent.start_time) : 'дата неизвестна'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-semibold text-ink-200">
                      {recent.hasDetails ? `${recent.kills} / ${recent.deaths} / ${recent.assists}` : '—'}
                    </div>
                    <div className="mt-0.5 text-[9px] text-ink-500">
                      {recent.duration != null ? fmtTime(recent.duration) : 'длительность неизвестна'}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-lime" />
                </button>
              );
            })}
          </div>
        )
      )}

      {!profile && !loading && !error && !results.length && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-dashed border-white/[0.08] px-3 py-3 text-[10.5px] leading-relaxed text-ink-500">
          <CircleHelp size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            {settings.provider === 'steam'
              ? 'Valve отдаёт последние матчи по SteamID64 или короткому имени профиля. Ключ бесплатный: steamcommunity.com/dev/apikey.'
              : 'Свой account_id можно найти в ссылке OpenDota или в SteamID64. Публичные матчи подтягиваются без авторизации.'}
          </span>
        </div>
      )}
    </div>
  );
}

function ImportPanel() {
  const { settings, navigate, notify } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await readJsonFiles(list);
      let match;
      try {
        match = normalizeMatch(raw);
      } catch (err) {
        if (err instanceof MatchDataError && err.code === 'no-api' && err.matchId) {
          const apiRaw = await fetchRawMatch(err.matchId, settings);
          match = normalizeMatch([...raw, apiRaw]);
        } else {
          throw err;
        }
      }
      importMatch(raw, settings);
      notify(`Матч #${match.id} загружен.`, 'success');
      navigate(matchPath(match.id, 'overview'));
    } catch (err) {
      const message =
        err instanceof MatchDataError
          ? err.message
          : toAppError(err).message ||
            'Не удалось прочитать файл. Нужен JSON ответа OpenDota (/api/matches/:id) или файл парса.';
      setError(message);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="panel p-5">
      <div className="kicker">Офлайн и свои данные</div>
      <h2 className="display-title mt-1.5 text-xl text-white">Загрузить JSON</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-400">
        Ответ OpenDota или файл парса. Можно сразу два файла — склею по match_id и слоту.
      </p>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={`mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center transition ${
          dragging
            ? 'border-lime/60 bg-lime/[0.07]'
            : 'border-white/[0.12] bg-white/[0.015] hover:border-white/[0.22] hover:bg-white/[0.03]'
        }`}
      >
        <input
          ref={inputRef}
          id="import-json-input"
          type="file"
          accept=".json,application/json"
          multiple
          className="sr-only"
          disabled={loading}
          onChange={(event) => {
            if (event.target.files) void handleFiles(event.target.files);
          }}
        />
        <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-lime">
          {loading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={19} />}
        </div>
        <div className="mt-3 text-[12px] font-semibold text-white">
          {loading ? 'Читаю файлы…' : 'Перетащи JSON сюда'}
        </div>
        {/* Настоящая кнопка с label: зона доступна с клавиатуры, а не только мышью. */}
        <label
          htmlFor="import-json-input"
          className={`btn-secondary mt-3 cursor-pointer text-[11px] focus-within:ring-2 focus-within:ring-lime/40 ${
            loading ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          <UploadCloud size={13} /> {loading ? 'Загружаю…' : 'Выбрать файлы'}
        </label>
        <div className="mt-1 text-[10px] text-ink-500">или перетащи файлы в эту область</div>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-dire/20 bg-dire/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-[#ffb3ae]">
          <X size={13} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-4 space-y-2 text-[10px] leading-relaxed text-ink-500">
        <div className="flex items-start gap-2">
          <FileJson size={13} className="mt-0.5 flex-shrink-0 text-ink-400" />
          <span>
            Поддерживается ответ <span className="text-ink-300">api.opendota.com/api/matches/:id</span> и файлы{' '}
            <span className="text-ink-300">_api.json / _parsed.json</span>.
          </span>
        </div>
        <div className="flex items-start gap-2">
          <ShieldCheck size={13} className="mt-0.5 flex-shrink-0 text-ink-400" />
          <span>Файлы не загружаются на сервер — всё считается в браузере.</span>
        </div>
      </div>
    </div>
  );
}

function RecentAnalyses() {
  const { history, navigate } = useApp();
  if (!history.length) return null;
  return (
    <section>
      <SectionHeading
        eyebrow="Продолжить"
        title="Последние разборы"
        action={
          <a href="#/progress" className="btn-ghost text-xs">
            Весь прогресс <ArrowRight size={14} />
          </a>
        }
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {history.slice(0, 4).map((entry) => {
          const hero = HERO_BY_ID[entry.heroId];
          return (
            <button
              key={`${entry.matchId}-${entry.slot}`}
              type="button"
              onClick={() => navigate(matchPath(entry.matchId, 'report', entry.slot))}
              className="panel panel-hover flex items-center gap-3 p-3.5 text-left"
            >
              <HeroAvatar hero={hero ?? null} size={40} side={entry.isRadiant ? 'radiant' : 'dire'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold text-white">{hero?.localized_name ?? 'Матч'}</div>
                <div className="mt-0.5 text-[9.5px] text-ink-500">
                  {entry.radiantWin === entry.isRadiant ? 'Победа' : 'Поражение'} · {fmtDate(entry.startTime)}
                </div>
              </div>
              <ScoreRing value={entry.overall} size={38} stroke={3.5} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: '01', title: 'Загрузи матч', text: 'По ID, через профиль Steam или JSON с парсом.', icon: <Search size={16} /> },
    { n: '02', title: 'Получи разбор', text: 'Оценка, метрики, карта и конкретные ошибки.', icon: <BarChart3 size={16} /> },
    { n: '03', title: 'Работай по плану', text: 'Уроки и задачи под твои слабые зоны.', icon: <GraduationCap size={16} /> },
  ];
  return (
    <section className="panel overflow-hidden p-5 sm:p-6">
      <div className="grid gap-5 md:grid-cols-[1.1fr_2fr] md:items-center">
        <div>
          <div className="kicker">Цикл обучения</div>
          <h2 className="display-title mt-1.5 text-2xl text-white">Как это работает</h2>
          <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-ink-400">
            Один матч → один разбор → один фокус на три игры. Так прогресс виден, а не теряется в ощущениях.
          </p>
          <a href="#/academy" className="btn-secondary mt-4 text-xs">
            Открыть академию <ArrowUpRight size={14} />
          </a>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.n} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <span className="font-display text-[11px] font-semibold text-lime">{step.n}</span>
                <span className="text-ink-400">{step.icon}</span>
              </div>
              <div className="mt-3 text-[12px] font-semibold text-white">{step.title}</div>
              <div className="mt-1 text-[10px] leading-relaxed text-ink-500">{step.text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { navigate, notify, settings, history } = useApp();
  const [query, setQuery] = useState('');

  const submitSearch = () => {
    const id = extractMatchId(query);
    if (!id) {
      if (/^\d{17}$/.test(query.trim())) {
        notify('Это SteamID64, а не ID матча. Используй блок «Мои матчи» ниже.', 'error');
      } else {
        notify('Не похоже на ID матча. Например: 7490235544', 'error');
      }
      return;
    }
    navigate(matchPath(id, 'overview'));
  };

  return (
    <div className="space-y-12 animate-enter">
      <section className="relative overflow-hidden rounded-[28px] border border-white/[0.08]">
        <img
          src="hero-bg.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-70"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/90 to-ink-950/20" />
        <div className="absolute inset-0 bg-ink-950/50 lg:hidden" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-transparent to-ink-950/40" />
        <div className="relative grid gap-8 px-5 py-10 sm:px-8 sm:py-12 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:px-10 lg:py-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-ink-950/50 px-3 py-1.5 backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-lime" />
              </span>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-ink-200">
                Dota 2 · аналитика + обучение
              </span>
            </div>

            <h1 className="display-title mt-5 max-w-[650px] text-[34px] leading-[1.06] text-white sm:text-[44px] xl:text-[52px]">
              Разбери свой матч.<br />
              Найди <span className="text-lime">слабое место</span>.<br />
              Стань сильнее.
            </h1>
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-ink-300 sm:text-sm">
              Загрузи игру по ID или JSON — получи оценку по шести осям, карту решений и персональный план обучения.
              Без регистрации, всё считается в браузере.
            </p>

            <form
              className="mt-6 flex max-w-xl flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                submitSearch();
              }}
            >
              <div className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ID матча или ссылка OpenDota"
                  className="input h-12 border-white/[0.14] bg-ink-950/60 pl-10 text-[13px] backdrop-blur"
                  aria-label="ID матча"
                />
              </div>
              <button type="submit" className="btn-primary h-12 px-5 text-[13px]">
                Разобрать матч <ArrowRight size={16} />
              </button>
            </form>

            {settings.provider === 'steam' && !settings.steamKey.trim() && (
              <div className="mt-3 flex max-w-xl items-start gap-2 rounded-xl border border-gold/20 bg-gold/[0.05] px-3 py-2 text-[10.5px] leading-relaxed text-gold/90">
                <ShieldCheck size={13} className="mt-0.5 flex-shrink-0" />
                <span>
                  Для матчей по ID через Valve нужен бесплатный ключ Steam.{' '}
                  <a href="#/settings" className="font-semibold underline underline-offset-2">
                    Добавить ключ
                  </a>{' '}
                  — или открой демо-матч ниже.
                </span>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-ink-400">
              <button
                type="button"
                onClick={() => navigate(matchPath(7490235544, 'overview'))}
                className="inline-flex items-center gap-1.5 font-semibold text-lime/90 transition hover:text-lime"
              >
                <Sparkles size={11} /> Или открыть демо-матч
              </button>
              <a href="#/settings" className="inline-flex items-center gap-1.5 hover:text-ink-200">
                <Database size={11} /> Источник: {providerLabel(settings.provider)}
              </a>
              {settings.accountId && (
                <a href="#/progress" className="inline-flex items-center gap-1.5 hover:text-ink-200">
                  <UserRound size={11} /> Мой профиль подключён
                </a>
              )}
              {history.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 size={11} className="text-radiant" /> {history.length}{' '}
                  {plural(history.length, 'разбор', 'разбора', 'разборов')}
                </span>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-5 border-t border-white/[0.08] pt-5">
              {[
                ['6', 'зон оценки'],
                ['20', 'уроков'],
                ['2', 'демо-матча'],
                ['100%', 'локально'],
              ].map(([value, label]) => (
                <div key={label}>
                  <div className="font-display text-lg font-semibold text-white">{value}</div>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-ink-500">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden lg:block">
            <HeroPreview />
          </div>
        </div>
      </section>

      <DemoSection />
      <Features />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <MyMatchesPanel key={settings.provider} />
        <ImportPanel />
      </div>

      <RecentAnalyses />
      <HowItWorks />

      <footer className="flex flex-col gap-3 border-t border-white/[0.06] pt-6 text-[10px] leading-relaxed text-ink-500 sm:flex-row sm:items-center sm:justify-between">
        <div>
          Данные: <span className="text-ink-300">OpenDota</span> и{' '}
          <span className="text-ink-300">dotaconstants</span>. Демо-матчи — публичные данные из открытого датасета.
        </div>
        <div className="flex items-center gap-4">
          <a href="https://www.opendota.com" target="_blank" rel="noreferrer" className="hover:text-lime">
            opendota.com
          </a>
          <span>Не аффилировано с Valve</span>
        </div>
      </footer>
    </div>
  );
}
