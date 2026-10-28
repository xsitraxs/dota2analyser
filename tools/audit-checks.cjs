#!/usr/bin/env node
/**
 * Повторяемая диагностика аудита dota2analyser.
 *
 * Запуск: node tools/audit-checks.cjs
 *
 * ВАЖНО: это не «спецификация» и не доказательство корректности. Скрипт
 * делает простые статические проверки исходников — ровно того класса
 * проблем, который нашёл аудит. Он нужен, чтобы исправления не откатились
 * unnoticed: «зелёный» результат означает «защита на месте», а не
 * «ошибок нет». Настоящая проверка — юнит-тесты (npm test) и ручной прогон.
 *
 * Выход: 0 — замечаний нет, 1 — есть FAIL.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const results = [];

function read(relative) {
  try {
    return fs.readFileSync(path.join(ROOT, relative), 'utf8');
  } catch {
    return null;
  }
}

function exists(relative) {
  return fs.existsSync(path.join(ROOT, relative));
}

function listFiles(dir, filter = () => true) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(path.join(ROOT, current), { withFileTypes: true })) {
      const rel = path.join(current, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (filter(rel)) out.push(rel);
    }
  };
  if (exists(dir)) walk(dir);
  return out;
}

const check = (id, title, fn, hint) => {
  let ok = false;
  let detail = '';
  try {
    const result = fn();
    if (typeof result === 'boolean') ok = result;
    else {
      ok = result.ok;
      detail = result.detail ?? '';
    }
  } catch (error) {
    detail = String(error.message);
  }
  results.push({ id, title, ok, detail, hint });
};

const src = listFiles('src', (f) => /\.(ts|tsx)$/.test(f)).map((f) => ({ file: f, text: read(f) }));
const all = (file) => src.find((item) => item.file === file)?.text ?? '';

// ── 1. Целостность данных ────────────────────────────────────────────────────
check(
  'data-1',
  'нормализация проверяет ожидаемый match_id (нет склейки разных матчей)',
  () => /expectedMatchId/.test(all('src/lib/normalize.ts')),
  'нормализация должна принимать expectedMatchId и отклонять чужой match_id',
);

check(
  'data-2',
  'неизвестные и нулевые значения различаются (метрики без данных = null)',
  () => {
    const text = all('src/lib/normalize.ts');
    return /numOrNull/.test(text) && /function num\(/.test(text);
  },
  'для метрик нужны отдельные функции: «число или null» и «число с нулём по умолчанию»',
);

check(
  'data-3',
  'валидатор исходных данных подключён к нормализации',
  () => {
    const text = all('src/lib/normalize.ts');
    return /from '\.\/validate'|from "\.\/validate"/.test(text);
  },
  'normalize.ts должен вызывать проверки из src/lib/validate.ts',
);

check(
  'data-4',
  'есть ограничения размера файла и общей суммы при импорте',
  () => {
    const text = all('src/lib/validate.ts');
    return /maxFileBytes/.test(text) && /maxTotalBytes/.test(text) && /checkFileSize/.test(text);
  },
  'импорт JSON должен ограничивать размер файла и суммарный объём',
);

// ── 2. API ───────────────────────────────────────────────────────────────────
check(
  'api-1',
  'Valve: игроки читаются из players, а не с верхнего уровня',
  () => /result\.players|raw\.players|\.players\b/.test(all('src/lib/steam.ts')),
  'GetMatchHistory возвращает матчи; состав команд лежит в players',
);

check(
  'api-2',
  'OpenDota: профиль читается из вложенного profile',
  () => /profile/.test(all('src/lib/openDota.ts')),
  '/api/players/:id возвращает profile как объект, а не плоские поля',
);

check(
  'api-3',
  'пользовательские URL прокси проверяются до запроса',
  () => /checkApiBaseUrl/.test(all('src/lib/dataSource.ts')),
  'адрес прокси из настроек должен валидироваться (checkApiBaseUrl)',
);

check(
  'api-4',
  'запросы поддерживают отмену и снимают слушатели',
  () => {
    const text = all('src/lib/request.ts');
    return /AbortSignal/.test(text) && /removeEventListener/.test(text) && /finally/.test(text);
  },
  'AbortSignal-слушатель нужно удалять в finally, иначе течёт память',
);

check(
  'api-5',
  'уже отменённый сигнал не приводит к запросу',
  () => /signal\?\.aborted|signal\.aborted/.test(all('src/lib/request.ts')),
  'если сигнал уже aborted, запрос не должен отправляться',
);

// ── 3. Кэш и состояние ───────────────────────────────────────────────────────
check(
  'state-1',
  'ключ кэша содержит адрес источника',
  () => /cacheKey\(/.test(all('src/lib/matchStore.ts')) && /endpoint/.test(all('src/lib/matchStore.ts')),
  'смена зеркала/прокси не должна возвращать данные прежнего адреса',
);

check(
  'state-2',
  'исходные JSON сохраняются вместе с матчем (догрузка парса офлайн)',
  () => /MatchSource/.test(all('src/lib/matchStore.ts')) && /sources\.set/.test(all('src/lib/matchStore.ts')),
  'без исходников догрузка парса требовала бы сеть',
);

check(
  'state-3',
  'обновление матча сохраняет ранее догруженный парс',
  () => {
    const text = all('src/lib/matchStore.ts');
    const body = text.slice(text.indexOf('export async function refreshMatch'));
    return /source\.kind !== 'base'|kind !== 'base'/.test(body);
  },
  'refreshMatch должен переиспользовать источники, кроме base',
);

check(
  'state-4',
  'повреждённые записи хранилища отбрасываются, а не падают',
  () => /sessionStorage\.removeItem|localStorage\.removeItem/.test(all('src/lib/matchStore.ts') + all('src/lib/storage.ts')),
  'битая запись удаляется, загрузка продолжается',
);

check(
  'state-5',
  'роутер не падает на некорректном URI',
  () => /safeDecodeUriComponent|decodeURIComponent/.test(all('src/lib/router.ts')),
  '#/lesson/% не должен бросать URIError',
);

check(
  'state-6',
  'полный сброс очищает и sessionStorage, и localStorage',
  () => {
    const text = all('src/lib/storage.ts');
    return /sessionStorage/.test(text) && /clearAll/.test(text);
  },
  'clearAll должен зачищать оба хранилища',
);

// ── 4. Аналитика ─────────────────────────────────────────────────────────────
check(
  'analytics-1',
  'метрики по времени считаются только внутри покрытия таймлайна',
  () => {
    const text = all('src/lib/analyze.ts');
    return /coverage|valueAt\(/.test(text) && /null/.test(text);
  },
  'LH10/LH20 вне покрытия должны быть null, а не 0',
);

check(
  'analytics-2',
  'есть отдельные флаги доступности данных',
  () => /MatchCoverage/.test(all('src/types.ts')) && /coverage/.test(all('src/lib/normalize.ts')),
  'таймлайны / варды / драки / объективы — отдельные признаки',
);

// ── 5. Надёжность и безопасность ─────────────────────────────────────────────
check(
  'sec-1',
  'есть Error Boundary с кнопкой восстановления',
  () => {
    const text = all('src/components/ErrorBoundary.tsx');
    return /componentDidCatch|getDerivedStateFromError/.test(text) && /reset|Обновить|Попробовать/.test(text);
  },
  'ошибка рендера не должна оставлять белый экран',
);

check(
  'sec-2',
  'в UI нет утверждения «ключи не покидают браузер»',
  () => {
    const bad = src.filter((item) => /ключи не покидают браузер|ключ не покидает браузер/i.test(item.text));
    return { ok: bad.length === 0, detail: bad.map((item) => item.file).join(', ') };
  },
  'ключ уходит в API и в прокси — формулировка должна быть честной',
);

check(
  'sec-3',
  'нет dangerouslySetInnerHTML и eval',
  () => {
    const bad = src.filter((item) => /dangerouslySetInnerHTML|\beval\(/.test(item.text));
    return { ok: bad.length === 0, detail: bad.map((item) => item.file).join(', ') };
  },
  'любой HTML из данных должен идти как текст',
);

check(
  'sec-4',
  'воркер ограничивает список методов Steam API',
  () => {
    const text = read('tools/steam-proxy-worker.js') ?? '';
    return /ALLOWED_METHODS/.test(text) && /method_not_allowed/.test(text);
  },
  'открытый воркер без списка методов — это открытый прокси к Steam',
);

check(
  'sec-5',
  'воркер игнорирует хост из параметра (нет SSRF) и отклоняет не-http(s)',
  () => {
    const text = read('tools/steam-proxy-worker.js') ?? '';
    return /STEAM_UPSTREAM/.test(text) && /protocol !== 'https:'/.test(text);
  },
  'запрос должен уходить только на заранее заданный upstream',
);

check(
  'sec-6',
  'распаковка архивов в tools/build-data.py безопасна',
  () => {
    const text = read('tools/build-data.py') ?? '';
    return /_safe_members/.test(text) && !/extractall\((?!.*(?:members=|filter=))[^)]*\)\s*$/.test(text);
  },
  'tar.extractall без фильтра опасен: path traversal и symlink',
);

check(
  'sec-7',
  'источники данных закреплены на коммитах',
  () => {
    const text = read('tools/build-data.py') ?? '';
    return !/refs\/heads\//.test(text) && /PIN_/.test(text);
  },
  'master-ветка меняется — сборка должна быть воспроизводимой',
);

// ── 6. UI и качество ─────────────────────────────────────────────────────────
check(
  'ui-1',
  'график доступен с клавиатуры и подписан',
  () => {
    const text = all('src/components/charts.tsx');
    return /aria-label/.test(text) && /onKeyDown/.test(text) && /tabIndex/.test(text);
  },
  'LineChart должен управляться стрелками и иметь описание',
);

check(
  'ui-2',
  'подсказка графика ищет ближайшую точку по X, а не по индексу',
  () => /indexAtX/.test(all('src/components/charts.tsx')),
  'при неравномерных точках по времени индекс врёт',
);

check(
  'ui-3',
  'импорт файлов доступен с клавиатуры (label + input)',
  () => {
    const text = all('src/views/HomePage.tsx');
    return /htmlFor=/.test(text) && /<input[^>]*type="file"/.test(text);
  },
  'drop-зона с onClick на div недоступна для клавиатуры',
);

check(
  'ui-4',
  'есть режим уменьшенной анимации',
  () => /data-motion|prefers-reduced-motion/.test(read('src/index.css') ?? ''),
  'нужно уважать prefers-reduced-motion / ручную настройку',
);

check(
  'ui-5',
  'нет неиспользуемых символов (tsc с noUnusedLocals)',
  () => /"noUnusedLocals":\s*true/.test(read('tsconfig.json') ?? ''),
  'мёртвый код маскирует настоящие ошибки',
);

// ── 7. Процесс ───────────────────────────────────────────────────────────────
check(
  'proc-1',
  'есть тесты на нормализацию, контракты API, кэш и аналитику',
  () => {
    const need = [
      'tests/normalize.test.ts',
      'tests/api-contract.test.ts',
      'tests/match-store.test.ts',
      'tests/state.test.ts',
      'tests/analytics.test.ts',
    ];
    const missing = need.filter((file) => !exists(file));
    return { ok: missing.length === 0, detail: missing.join(', ') };
  },
  'подтверждённые находки должны быть закреплены регрессионными тестами',
);

check(
  'proc-2',
  'есть CI (чистая установка, типы, тесты, сборка)',
  () => {
    const files = listFiles('.github/workflows');
    if (!files.length) return { ok: false, detail: 'нет .github/workflows' };
    const text = files.map((f) => read(f)).join('\n');
    const need = ['npm ci', 'typecheck', 'npm test', 'npm run build'];
    const missing = need.filter((token) => !text.includes(token));
    return { ok: missing.length === 0, detail: missing.join(', ') };
  },
  'без CI исправления никто не проверяет',
);

check(
  'proc-3',
  'зависимости без известных критических/высоких уязвимостей',
  () => {
    const lock = read('package-lock.json');
    if (!lock) return { ok: false, detail: 'нет package-lock.json' };
    const parsed = JSON.parse(lock);
    const entry = parsed.packages?.['node_modules/postcss-selector-parser'];
    if (!entry) return { ok: true, detail: '' };
    const [major, minor, patch] = String(entry.version).split('.').map(Number);
    // GHSA-rj75-hqrm-r3gf затронул версии < 6.1.5 (reDoS при разборе селекторов).
    const vulnerable = major < 6 || (major === 6 && (minor < 1 || (minor === 1 && patch < 5)));
    return { ok: !vulnerable, detail: `postcss-selector-parser ${entry.version}` };
  },
  'npm audit — часть CI (--audit-level=high)',
);

const failed = results.filter((item) => !item.ok);
for (const item of results) {
  const status = item.ok ? 'ok  ' : 'FAIL';
  console.log(`${status}  ${item.id}  ${item.title}${!item.ok && item.detail ? ` — ${item.detail}` : ''}`);
}
console.log(`\n${results.length - failed.length}/${results.length} проверок пройдено.`);
if (failed.length) {
  console.log('\nПодсказки:');
  for (const item of failed) console.log(`  ${item.id}: ${item.hint}`);
  console.log('\nЭто статические проверки-напоминания, а не доказательство корректности.');
  process.exit(1);
}
