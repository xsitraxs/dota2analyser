import { useState } from 'react';
import {
  Check,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  XCircle,
} from 'lucide-react';
import { useApp } from '../lib/app-context';
import { parseAccountInput, rankLabel } from '../lib/openDota';
import { fetchProfile, fetchRawMatch, PROVIDERS, providerProblem, type ProfileView } from '../lib/dataSource';
import { toAppError } from '../lib/errors';
import { normalizeMatch } from '../lib/normalize';
import { Toggle } from '../components/ui';
import { checkApiBaseUrl, looksLikeSecretUrl } from '../lib/validate';
import type { DataProvider } from '../types';

export default function SettingsPage() {
  const {
    settings,
    updateSettings,
    notify,
    history,
    lessonProgress,
    clearHistoryState,
    resetEverything,
  } = useApp();
  const [accountInput, setAccountInput] = useState(settings.accountId ? String(settings.accountId) : '');
  const [testMatch, setTestMatch] = useState('7490235544');
  const [testing, setTesting] = useState(false);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [showSteamKey, setShowSteamKey] = useState(false);

  const provider = settings.provider;
  const configError = providerProblem(settings);

  const setProvider = (next: DataProvider) => {
    updateSettings({ ...settings, provider: next });
    setProfile(null);
  };

  const saveAccount = () => {
    const parsed = parseAccountInput(accountInput);
    if (parsed.error || !parsed.accountId) {
      notify(parsed.error ?? 'Не удалось распознать аккаунт.', 'error');
      return;
    }
    updateSettings({ ...settings, accountId: parsed.accountId });
    notify('Аккаунт сохранён. Твои матчи будут открываться первыми.', 'success');
    void checkProfile(parsed.accountId);
  };

  const checkProfile = async (accountId: number) => {
    setCheckingProfile(true);
    try {
      const next = await fetchProfile(accountId, settings);
      setProfile(next);
    } catch {
      setProfile(null);
    } finally {
      setCheckingProfile(false);
    }
  };

  const runTest = async () => {
    const id = testMatch.trim().match(/(\d{5,})/)?.[1];
    if (!id) {
      notify('Введи ID матча для проверки, например 7490235544.', 'error');
      return;
    }
    if (configError) {
      notify(configError.message, 'error');
      return;
    }
    setTesting(true);
    try {
      const raw = await fetchRawMatch(Number(id), settings);
      const match = normalizeMatch([raw]);
      notify(
        `Связь работает: матч #${match.id} получен (${Math.round(match.duration / 60)} мин).`,
        'success',
      );
    } catch (err) {
      const appError = toAppError(err);
      notify(appError.hint ? `${appError.message} ${appError.hint}` : appError.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const doneLessons = Object.values(lessonProgress).filter((item) => item.done).length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 animate-enter">
      <div>
        <div className="kicker">Настройки</div>
        <h1 className="display-title mt-1.5 text-2xl text-white">Источник данных и профиль</h1>
        <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-ink-400">
          По умолчанию используется официальный API Valve — он обычно доступен из России без VPN. OpenDota даёт
          полный парс, но может не открываться. Всё хранится локально в браузере.
        </p>
      </div>

      <div className="panel p-5">
        <div className="flex items-center gap-2">
          <Database size={15} className="text-lime" />
          <h2 className="display-title text-base text-white">Откуда брать матчи</h2>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {PROVIDERS.map((item) => {
            const active = provider === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setProvider(item.key)}
                className={`rounded-xl border p-3.5 text-left transition ${
                  active
                    ? 'border-lime/40 bg-lime/[0.07] shadow-[0_0_0_1px_rgba(201,242,107,0.12)]'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-display text-[12px] font-semibold ${active ? 'text-lime' : 'text-white'}`}>
                    {item.label}
                  </span>
                  <span
                    className={`grid h-4 w-4 place-items-center rounded-full border ${
                      active ? 'border-lime bg-lime text-ink-950' : 'border-white/20 text-transparent'
                    }`}
                  >
                    <Check size={10} />
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-ink-400">{item.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="rounded bg-radiant/10 px-1.5 py-0.5 text-[8px] font-semibold text-radiant">
                    {item.pros}
                  </span>
                  <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[8px] font-medium text-ink-400">
                    {item.cons}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {configError && (
          <div className="mt-3 rounded-xl border border-gold/25 bg-gold/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-gold/90">
            {configError.message}
            {configError.hint && <div className="mt-1 text-[10px] text-ink-400">{configError.hint}</div>}
          </div>
        )}

        {provider === 'steam' && (
          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="label">Steam Web API key</span>
                <a
                  href="https://steamcommunity.com/dev/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="link-lime inline-flex items-center gap-1 text-[10px]"
                >
                  <Link2 size={10} /> Получить бесплатно
                </a>
              </div>
              <div className="relative">
                <input
                  value={settings.steamKey}
                  onChange={(event) => updateSettings({ ...settings, steamKey: event.target.value.trim() })}
                  placeholder="32 символа: 0123ABCD... "
                  className="input pr-10 font-mono text-[12px]"
                  type={showSteamKey ? 'text' : 'password'}
                  autoComplete="off"
                  aria-label="Steam Web API key"
                />
                <button
                  type="button"
                  onClick={() => setShowSteamKey((value) => !value)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 transition hover:text-white"
                  aria-label={showSteamKey ? 'Скрыть ключ' : 'Показать ключ'}
                >
                  {showSteamKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div className="mt-1.5 text-[9.5px] leading-relaxed text-ink-500">
                Ключ создаётся на странице Steam и хранится только в этом браузере. В поле «Domain» можно вписать{' '}
                <span className="font-mono text-ink-300">localhost</span> — Valve его не проверяет, покупать домен не
                нужно. Аккаунт должен быть без ограничений (достаточно любой покупки от $5). Valve отдаёт базовую
                статистику без парса: таймлайны, варды и драки появятся, если догрузить JSON парса.
              </div>
            </div>

            <details className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <summary className="flex items-center justify-between text-[11px] font-semibold text-ink-200">
                <span className="inline-flex items-center gap-1.5">
                  <Server size={12} /> Прокси для Steam API (если браузер блокирует запросы)
                </span>
                <span className="text-[10px] text-ink-500">+</span>
              </summary>
              <div className="mt-2">
                <input
                  value={settings.steamProxy}
                  onChange={(event) => updateSettings({ ...settings, steamProxy: event.target.value.trim() })}
                  placeholder="https://my-worker.example.com/steam"
                  className="input font-mono text-[11px]"
                  aria-label="Прокси Steam API"
                />
                {settings.steamProxy.trim() && !checkApiBaseUrl(settings.steamProxy).ok && (
                  <p className="mt-1.5 text-[9.5px] text-rose">
                    {checkApiBaseUrl(settings.steamProxy).error}
                  </p>
                )}
                {looksLikeSecretUrl(settings.steamProxy) && (
                  <p className="mt-1.5 text-[9.5px] text-amber">
                    Похоже, в адресе есть секрет (key/token). Он будет отправлен владельцу прокси — лучше держать ключ
                    в секретах воркера.
                  </p>
                )}
                <p className="mt-1.5 text-[9.5px] leading-relaxed text-ink-500">
                  Необязательно. В режиме <span className="text-ink-300">npm run dev</span> приложение уже проксирует
                  Steam через Vite, поэтому CORS не мешает. Для статичной сборки можно поднять свой Cloudflare Worker —
                  пример лежит в <span className="text-ink-300">tools/steam-proxy-worker.js</span>.
                </p>
              </div>
            </details>
          </div>
        )}

        {provider === 'opendota' && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label">API-ключ OpenDota (необязательно)</span>
              <a
                href="https://www.opendota.com/api-keys"
                target="_blank"
                rel="noreferrer"
                className="link-lime inline-flex items-center gap-1 text-[10px]"
              >
                <Link2 size={10} /> Получить ключ
              </a>
            </div>
            <input
              value={settings.apiKey}
              onChange={(event) => updateSettings({ ...settings, apiKey: event.target.value.trim() })}
              placeholder="Вставь API-ключ OpenDota"
              className="input font-mono text-[12px]"
              type="password"
              autoComplete="off"
              aria-label="API-ключ OpenDota"
            />
            <div className="mt-1.5 text-[9.5px] leading-relaxed text-ink-500">
              Повышает лимиты запросов. Если OpenDota недоступна из твоей сети — выбери Valve или укажи прокси.
            </div>
          </div>
        )}

        {provider === 'proxy' && (
          <div className="mt-4">
            <span className="label">Базовый URL OpenDota-совместимого API</span>
            <input
              value={settings.proxyBase}
              onChange={(event) => updateSettings({ ...settings, proxyBase: event.target.value.trim() })}
              placeholder="https://corsproxy.io/?https://api.opendota.com/api"
              className="input mt-1.5 font-mono text-[11px]"
              aria-label="Базовый URL прокси"
            />
            {settings.proxyBase.trim() && !checkApiBaseUrl(settings.proxyBase).ok && (
              <p className="mt-1.5 text-[9.5px] text-rose">{checkApiBaseUrl(settings.proxyBase).error}</p>
            )}
            {looksLikeSecretUrl(settings.proxyBase) && (
              <p className="mt-1.5 text-[9.5px] text-amber">
                Похоже, в адресе есть секрет (key/token). Он уйдёт владельцу прокси — лучше вынести ключ в заголовок
                или секреты своего воркера.
              </p>
            )}
            <div className="mt-1.5 text-[9.5px] leading-relaxed text-ink-500">
              Сюда будут добавляться пути вида <span className="text-ink-300">/matches/123</span> и{' '}
              <span className="text-ink-300">/players/123/matches</span>. Подойдёт своё зеркало, Cloudflare Worker или
              публичный CORS-прокси.
            </div>
          </div>
        )}

        {(provider === 'steam' || provider === 'opendota') && (
          <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <span className="label">Где хранить ключ</span>
            <div role="radiogroup" aria-label="Где хранить ключ" className="mt-1.5 flex flex-wrap gap-1.5">
              {(
                [
                  {
                    scope: 'local' as const,
                    label: 'В этом браузере',
                    hint: 'ключ сохраняется в localStorage и переживёт перезапуск',
                  },
                  {
                    scope: 'session' as const,
                    label: 'Только в этой вкладке',
                    hint: 'ключ живёт в sessionStorage и исчезает при закрытии вкладки',
                  },
                ]
              ).map((option) => {
                const active = (settings.keyScope ?? 'local') === option.scope;
                return (
                  <button
                    key={option.scope}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={option.hint}
                    onClick={() => updateSettings({ ...settings, keyScope: option.scope })}
                    className={`chip ${active ? 'chip-active' : ''}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-ink-500">
              Ключ всё равно отправляется в API{' '}
              {provider === 'steam' ? 'Valve (и в прокси, если он указан)' : 'OpenDota'} — это необходимо для самого
              запроса. Настройка влияет только на то, останется ли ключ в браузере после закрытия вкладки.
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4">
          <input
            value={testMatch}
            onChange={(event) => setTestMatch(event.target.value)}
            placeholder="ID матча"
            className="input h-9 max-w-[220px] text-[11px]"
            aria-label="ID матча для проверки"
          />
          <button type="button" onClick={() => void runTest()} className="btn-secondary !py-2 text-[11px]" disabled={testing}>
            {testing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Проверить источник
          </button>
          <span className="inline-flex items-center gap-1 text-[9px] text-ink-500">
            <ShieldCheck size={10} /> ключ уходит в выбранный API{settings.steamProxy || settings.proxyBase ? ' и в указанный прокси' : ''}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="panel p-5">
          <div className="flex items-center gap-2">
            <UserRound size={15} className="text-lime" />
            <h2 className="display-title text-base text-white">Мой аккаунт</h2>
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-ink-500">
            Укажи account_id, SteamID64 или ссылку на профиль — так твой игрок будет определяться автоматически.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={accountInput}
              onChange={(event) => setAccountInput(event.target.value)}
              placeholder="76561198000000000 / 123456789"
              className="input"
              aria-label="Account ID"
            />
            <button type="button" onClick={saveAccount} className="btn-primary px-4 text-xs">
              Сохранить
            </button>
          </div>

          {settings.accountId && (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-lime/10 text-lime">
                <UserRound size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-semibold text-white">
                  {profile?.name || settings.playerName || `Аккаунт ${settings.accountId}`}
                </div>
                <div className="mt-0.5 text-[9.5px] text-ink-400">
                  {profile?.rankTier ? rankLabel(profile.rankTier) : 'профиль сохранён'} · ID {settings.accountId}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-radiant">
                <Check size={11} /> подключён
              </span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                if (!settings.accountId) {
                  notify('Сначала сохрани account_id.', 'error');
                  return;
                }
                void checkProfile(settings.accountId);
              }}
              className="btn-secondary text-[11px]"
              disabled={checkingProfile}
            >
              <RefreshCw size={12} className={checkingProfile ? 'animate-spin' : ''} /> Проверить профиль
            </button>
            <button
              type="button"
              onClick={() => {
                updateSettings({ ...settings, accountId: null, playerName: '' });
                setProfile(null);
                setAccountInput('');
                notify('Аккаунт отвязан.', 'info');
              }}
              className="btn-ghost text-[11px]"
            >
              <XCircle size={12} /> Отвязать
            </button>
          </div>
        </div>

        <div className="panel p-5">
          <div className="flex items-center gap-2">
            <KeyRound size={15} className="text-violet" />
            <h2 className="display-title text-base text-white">Как это работает</h2>
          </div>
          <div className="mt-2 space-y-2 text-[10.5px] leading-relaxed text-ink-400">
            <p>
              <span className="font-semibold text-white">Valve</span> — официальный запрос к{' '}
              <span className="text-ink-200">api.steampowered.com</span> с твоим ключом. Работает без VPN, но отдаёт
              матч без парса реплея.
            </p>
            <p>
              <span className="font-semibold text-white">OpenDota</span> — публичный сервис с полным парсом. Может быть
              недоступен из России.
            </p>
            <p>
              <span className="font-semibold text-white">Прокси</span> — если есть своё зеркало или CORS-прокси, укажи
              его базовый URL.
            </p>
            <p className="text-ink-500">
              Нет доступа ни к чему? Скачай JSON матча на другом устройстве и загрузи его на главной — приложение
              разберёт файл офлайн.
            </p>
          </div>
          <a href="#/academy" className="btn-secondary mt-3 w-full text-[11px]">
            <Sparkles size={13} /> Что смотреть в разборе
          </a>
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-violet" />
          <h2 className="display-title text-base text-white">Интерфейс</h2>
        </div>
        <div className="mt-3 max-w-lg">
          <Toggle
            checked={settings.reduceMotion}
            onChange={(value) => updateSettings({ ...settings, reduceMotion: value })}
            label="Уменьшить анимации"
            description="Отключает плавные переходы и анимации появления — удобно на слабых устройствах."
          />
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex items-center gap-2">
          <Trash2 size={15} className="text-dire" />
          <h2 className="display-title text-base text-white">Данные</h2>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[9px] uppercase tracking-wider text-ink-500">Сохранённые разборы</div>
            <div className="mt-1 font-display text-xl font-semibold text-white">{history.length}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[9px] uppercase tracking-wider text-ink-500">Пройдено уроков</div>
            <div className="mt-1 font-display text-xl font-semibold text-white">{doneLessons}</div>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="text-[9px] uppercase tracking-wider text-ink-500">Хранение</div>
            <div className="mt-1 text-[11px] font-semibold text-white">localStorage</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              clearHistoryState();
              notify('История разборов очищена.', 'info');
            }}
            className="btn-secondary text-[11px]"
          >
            <Trash2 size={12} /> Очистить историю
          </button>
          <button
            type="button"
            onClick={() => {
              resetEverything();
              setProfile(null);
              setAccountInput('');
              notify('Все локальные данные удалены.', 'info');
            }}
            className="btn-danger text-[11px]"
          >
            <Trash2 size={12} /> Удалить всё
          </button>
        </div>
        <p className="mt-2 text-[9.5px] leading-relaxed text-ink-500">
          Удаление затрагивает только браузер: сохранённые разборы, прогресс уроков, профиль и ключи. Матчи на
          серверах Valve/OpenDota остаются нетронутыми.
        </p>
      </div>

      <div className="panel-soft flex flex-wrap items-center justify-between gap-2 p-4 text-[9.5px] text-ink-500">
        <span>Dota 2 Analyser · локальная аналитика матчей</span>
        <span>Данные: Valve · OpenDota · dotaconstants · MIT</span>
      </div>
    </div>
  );
}
