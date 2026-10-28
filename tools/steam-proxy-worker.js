/**
 * Cloudflare Worker: прокси к Steam Web API для dota2analyser.
 *
 * Зачем: у Valve (api.steampowered.com) нет заголовков CORS, поэтому браузер
 * не может вызвать API напрямую. Этот воркер — ваш собственный посредник:
 * вы деплоите его сами на свой аккаунт Cloudflare, и он добавляет CORS.
 *
 * Важно про приватность: ключ Steam, который задан здесь (или передан с
 * клиента), покидает браузер — он уходит в этот воркер и дальше в Steam.
 * Не деплойте чужой воркер и не используйте чужой URL: его владелец видит
 * и ваш ключ, и ваши запросы.
 *
 * Деплой:
 *   npm i -g wrangler
 *   wrangler secret put STEAM_API_KEY
 *   wrangler deploy
 *
 * Локально:
 *   wrangler dev
 *   затем в настройках приложения указать http://localhost:8787/ как
 *   «Valve API (свой прокси)» (локальный адрес разрешён только для http://localhost).
 */

const STEAM_UPSTREAM = 'https://api.steampowered.com';
const STORE_UPSTREAM = 'https://store.steampowered.com';

// Только методы, которые приложение реально использует.
const ALLOWED_METHODS = new Set([
  'IDOTA2Match_570/GetMatchHistory/V001',
  'IDOTA2Match_570/GetMatchDetails/V001',
  'IDOTA2Match_570/GetMatchHistoryBySequenceNum/V001',
  'IDOTA2Match_570/GetLiveLeagueGames/v000',
  'IDOTA2Match_570/GetTopLiveGame/v1',
  'IDOTA2Match_570/GetLeagueListing/v000',
  'IDOTA2Match_570/GetProPlayerList/v001',
  'ISteamUser/GetPlayerSummaries/v0002',
  'ISteamUser/ResolveVanityURL/v0001',
]);

const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 МБ — детали матча всегда меньше
const MAX_URL_LENGTH = 512;

// Ключ из переменных окружения (рекомендуемый путь, ключ не передаётся с клиента).
const ENV_KEYS = new Set(['STEAM_API_KEY', 'STEAM_KEY']);

/** Разрешённые источники для CORS: origins + локальная разработка. */
const ALLOWED_ORIGINS = new Set([
  'http://localhost',
  'http://localhost:8787',
  'http://127.0.0.1',
]);

function corsHeaders(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': allowed ? '*' : 'null',
    'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Steam-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
}

function json(data, status, origin, allowed) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin, allowed) },
  });
}

/** Разрешаем только http(s) URL разумной длины без символов обхода пути. */
function safeUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return url;
}

/** Собирает upstream URL: либо разрешённый метод на api.steampowered.com, либо /api/appdetails. */
function buildUpstream(url) {
  const method = url.searchParams.get('method') || '';
  if (method) {
    if (!ALLOWED_METHODS.has(method)) return null;
    const key = url.searchParams.get('key') || '';
    const upstream = new URL(`/IDOTA2Match_570/${''}`, STEAM_UPSTREAM);
    upstream.pathname = '/' + method.replace(/^\/+/, '');
    // Копируем все параметры, кроме служебных.
    for (const [name, value] of url.searchParams) {
      if (name === 'key' || name === 'method' || name === 'steamProxyUrl') continue;
      upstream.searchParams.set(name, value);
    }
    return { url: upstream, keyParam: key, method };
  }
  // GET /?appdetails&appids=570 — проброс к store.steampowered.com
  if (url.searchParams.has('appdetails')) {
    const upstream = new URL('/api/appdetails', STORE_UPSTREAM);
    for (const [name, value] of url.searchParams) {
      if (name === 'appdetails' || name === 'steamProxyUrl') continue;
      upstream.searchParams.set(name, value);
    }
    return { url: upstream, keyParam: '', method: 'store/appdetails' };
  }
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    // Общий прокси: CORS открыт, потому что воркер рассчитан на любые
    // деплои приложения (GitHub Pages, свой домен, localhost). Но это
    // означает, что вашим воркером может воспользоваться кто угодно —
    // поэтому ключ из окружения имеет приоритет, а список методов закрыт.
    const allowed = true;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) });
    }
    if (request.method !== 'GET' && request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, origin, allowed);
    }

    // Куда идти: параметр steamProxyUrl (из настроек приложения) или
    // относительный путь — но только на доверенные хосты.
    let target;
    const proxied = safeUrl(new URL(request.url).searchParams.get('steamProxyUrl') || '');
    if (proxied) {
      const direct = buildUpstream(proxied);
      if (!direct) return json({ error: 'method_not_allowed' }, 403, origin, allowed);
      target = direct;
    } else {
      target = buildUpstream(new URL(request.url));
      if (!target) return json({ error: 'unknown_method' }, 400, origin, allowed);
    }

    // Ключ: сначала из секретов воркера, затем переданный клиентом.
    let key = '';
    for (const name of ENV_KEYS) {
      const value = env?.[name];
      if (typeof value === 'string' && value) {
        key = value;
        break;
      }
    }
    if (!key) key = target.keyParam || request.headers.get('X-Steam-Key') || '';
    if (target.method.startsWith('IDOTA2Match_570') || target.method.startsWith('ISteamUser')) {
      if (!key) return json({ error: 'missing_key', hint: 'wrangler secret put STEAM_API_KEY' }, 400, origin, allowed);
      target.url.searchParams.set('key', key);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let upstream;
    try {
      upstream = await fetch(target.url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'dota2analyser-proxy/1.0' },
        signal: controller.signal,
        cf: { cacheTtl: 60, cacheEverything: false },
      });
    } catch (error) {
      const aborted = error?.name === 'AbortError';
      return json(
        { error: aborted ? 'upstream_timeout' : 'upstream_unreachable', message: String(error?.message ?? error) },
        aborted ? 504 : 502,
        origin,
        allowed,
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await upstream.text();
    if (text.length > MAX_BODY_BYTES) {
      return json({ error: 'response_too_large', bytes: text.length }, 502, origin, allowed);
    }

    let payload = text;
    try {
      payload = JSON.stringify(JSON.parse(text));
    } catch {
      // Оставляем как есть — клиент сам сообщит о неожиданном формате.
    }

    return new Response(payload, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...corsHeaders(origin, allowed),
        'Cache-Control': 'public, max-age=60',
      },
    });
  },
};
