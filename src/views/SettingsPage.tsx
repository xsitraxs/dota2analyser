import { useState } from 'react';
import { Check, KeyRound, Link2, RefreshCw, ShieldCheck, Sparkles, Trash2, UserRound, XCircle } from 'lucide-react';
import { useApp } from '../lib/app-context';
import { fetchMatch, fetchPlayer, parseAccountInput, rankLabel, type PlayerProfile } from '../lib/openDota';
import { normalizeMatch } from '../lib/normalize';
import { clearAll } from '../lib/storage';
import { Toggle } from '../components/ui';

export default function SettingsPage() {
  const { settings, updateSettings, notify, history, lessonProgress, clearHistoryState } = useApp();
  const [accountInput, setAccountInput] = useState(settings.accountId ? String(settings.accountId) : '');
  const [testMatch, setTestMatch] = useState('');
  const [testing, setTesting] = useState(false);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(false);

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
      const next = await fetchPlayer(accountId, settings.apiKey);
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
    setTesting(true);
    try {
      const raw = await fetchMatch(Number(id), settings.apiKey);
      const match = normalizeMatch([raw]);
      notify(`Связь работает: матч #${match.id} получен.`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Не удалось получить матч.', 'error');
    } finally {
      setTesting(false);
    }
  };

  const doneLessons = Object.values(lessonProgress).filter((item) => item.done).length;

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 animate-enter">
      <div>
        <div className="kicker">Настройки</div>
        <h1 className="display-title mt-1.5 text-2xl text-white">Профиль и данные</h1>
        <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-ink-400">
          Всё хранится локально в браузере. API-ключ нужен только для расширенных запросов OpenDota — без него
          приложение тоже работает.
        </p>
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
                  {profile?.personaname || settings.playerName || `Аккаунт ${settings.accountId}`}
                </div>
                <div className="mt-0.5 text-[9.5px] text-ink-400">
                  {profile ? rankLabel(profile.rank_tier) : 'профиль сохранён'} · ID {settings.accountId}
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
            <KeyRound size={15} className="text-gold" />
            <h2 className="display-title text-base text-white">API-ключ OpenDota</h2>
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-ink-500">
            Необязательно. Ключ повышает лимиты запросов. Хранится только в этом браузере и подставляется в запросы
            напрямую к api.opendota.com.
          </p>
          <input
            value={settings.apiKey}
            onChange={(event) => updateSettings({ ...settings, apiKey: event.target.value.trim() })}
            placeholder="Вставь API-ключ"
            className="input mt-3"
            type="password"
            autoComplete="off"
            aria-label="API-ключ"
          />
          <div className="mt-2 flex items-center justify-between text-[9.5px] text-ink-500">
            <a
              href="https://www.opendota.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="link-lime inline-flex items-center gap-1"
            >
              <Link2 size={10} /> Получить ключ
            </a>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={10} /> только локально
            </span>
          </div>

          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-500">Проверка связи</div>
            <div className="mt-2 flex gap-2">
              <input
                value={testMatch}
                onChange={(event) => setTestMatch(event.target.value)}
                placeholder="ID матча"
                className="input"
                aria-label="ID матча для проверки"
              />
              <button type="button" onClick={runTest} className="btn-secondary px-3 text-[11px]" disabled={testing}>
                {testing ? '…' : 'Тест'}
              </button>
            </div>
          </div>
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
              clearAll();
              updateSettings({ apiKey: '', accountId: null, playerName: '', reduceMotion: false });
              clearHistoryState();
              notify('Все локальные данные удалены.', 'info');
            }}
            className="btn-danger text-[11px]"
          >
            <Trash2 size={12} /> Удалить всё
          </button>
        </div>
        <p className="mt-2 text-[9.5px] leading-relaxed text-ink-500">
          Удаление затрагивает только браузер: сохранённые разборы, прогресс уроков, профиль и ключ. Матчи в OpenDota
          остаются нетронутыми.
        </p>
      </div>

      <div className="panel-soft flex flex-wrap items-center justify-between gap-2 p-4 text-[9.5px] text-ink-500">
        <span>Dota 2 Analyser · локальная аналитика матчей</span>
        <span>Данные: OpenDota · dotaconstants · MIT</span>
      </div>
    </div>
  );
}
