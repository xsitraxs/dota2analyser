/**
 * Cloudflare Worker: прокси для Valve / Steam Web API.
 *
 * Зачем: api.steampowered.com не отдаёт CORS-заголовки, поэтому статичная
 * сборка приложения не может обратиться к нему напрямую из браузера.
 * В dev-режиме (npm run dev) это уже решает Vite; для продакшена можно
 * поднять этот воркер (бесплатного тарифа Cloudflare хватает).
 *
 * Как задеплоить:
 *   1. https://dash.cloudflare.com → Workers & Pages → Create Worker
 *   2. Вставь этот код, сохрани и опубликуй
 *   3. В настройках приложения укажи URL воркера в поле
 *      «Прокси для Steam API», например https://steam.example.workers.dev
 *
 * Воркер не хранит ключи: Steam Web API key приходит в запросе
 * из браузера пользователя и просто пробрасывается дальше.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const isAllowed =
      url.pathname.startsWith('/IDOTA2Match_570/') ||
      url.pathname.startsWith('/ISteamUser/') ||
      url.pathname.startsWith('/IDOTA2MatchStats_570/');
    if (!isAllowed) {
      return json({ error: 'Разрешены только методы Dota 2 / ISteamUser' }, 404);
    }

    const target = `https://api.steampowered.com${url.pathname}${url.search}`;
    const upstream = await fetch(target, { headers: { Accept: 'application/json' } });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
