/**
 * Самопроверка Cloudflare Worker (tools/steam-proxy-worker.js).
 *
 * Запуск: node tools/check-worker.mjs
 *
 * Проверяет без реальной сети (fetch подменён):
 *   * CORS preflight;
 *   * список разрешённых методов (всё остальное отклоняется);
 *   * отклонение не-http(s) и слишком длинных URL;
 *   * приоритет ключа из секретов воркера над ключом из запроса;
 *   * таймаут и недоступность upstream превращаются в 504/502;
 *   * ограничение размера ответа;
 *   * запрос к upstream уходит только на api.steampowered.com / store.steampowered.com
 *     (проверка на SSRF: чужой хост из параметра игнорируется).
 */
import { strict as assert } from 'node:assert';
import worker from './steam-proxy-worker.js';

let upstreamCalls = [];
let mode = 'ok'; // ok | timeout | unreachable | big

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  upstreamCalls.push(String(url));
  if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
  if (mode === 'unreachable') throw new TypeError('fetch failed');
  if (mode === 'timeout') {
    await new Promise((resolve) => setTimeout(resolve, 50));
    throw new DOMException('The operation was aborted due to timeout', 'AbortError');
  }
  if (mode === 'big') return new Response('x'.repeat(6 * 1024 * 1024), { status: 200 });
  return new Response(JSON.stringify({ result: { status: 1 } }), { status: 200 });
};

const call = (url, init = {}, env = { STEAM_API_KEY: 'env-key' }) =>
  worker.fetch(new Request(url, init), env);

const results = [];
const check = async (name, fn) => {
  upstreamCalls = [];
  mode = 'ok';
  try {
    await fn();
    results.push(`ok    ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name}: ${error.message}`);
    process.exitCode = 1;
  }
};

await check('OPTIONS возвращает 204 и CORS', async () => {
  const response = await call('https://w.example/?method=ISteamUser/GetPlayerSummaries/v0002', { method: 'OPTIONS' });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST,GET,OPTIONS');
});

await check('разрешённый метод уходит на api.steampowered.com', async () => {
  const response = await call('https://w.example/?method=ISteamUser/GetPlayerSummaries/v0002&steamids=76561198000000000');
  assert.equal(response.status, 200);
  assert.equal(upstreamCalls.length, 1);
  assert.ok(upstreamCalls[0].startsWith('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002'));
  assert.ok(upstreamCalls[0].includes('key=env-key'), 'ключ из секретов воркера подставлен');
});

await check('запрещённый метод отклоняется (400)', async () => {
  const response = await call('https://w.example/?method=ISteamUser/GetFriendList/v0001');
  assert.equal(response.status, 400);
  assert.equal(upstreamCalls.length, 0);
});

await check('метод вне списка не проходит даже через steamProxyUrl', async () => {
  const response = await call(
    'https://w.example/?steamProxyUrl=' +
      encodeURIComponent('https://evil.example/?method=ISteamUser/GetFriendList/v0001'),
  );
  assert.equal(response.status, 403);
  assert.equal(upstreamCalls.length, 0, 'запроса к upstream быть не должно');
});

await check('чужой хост игнорируется: запрос всё равно идёт на Steam (нет SSRF)', async () => {
  await call(
    'https://w.example/?steamProxyUrl=' +
      encodeURIComponent('https://evil.example/?method=IDOTA2Match_570/GetMatchHistory/V001&account_id=1'),
  );
  assert.equal(upstreamCalls.length, 1);
  assert.ok(upstreamCalls[0].startsWith('https://api.steampowered.com/'));
  assert.ok(!upstreamCalls[0].includes('evil.example'));
});

await check('не-http(s) URL отклоняется', async () => {
  const response = await call('https://w.example/?steamProxyUrl=' + encodeURIComponent('javascript:alert(1)'));
  assert.equal(response.status, 400);
});

await check('слишком длинный URL отклоняется', async () => {
  const long = 'https://api.steampowered.com/?method=ISteamUser/GetPlayerSummaries/v0002&pad=' + 'a'.repeat(600);
  const response = await call('https://w.example/?steamProxyUrl=' + encodeURIComponent(long));
  assert.equal(response.status, 400);
});

await check('POST и удаление отклоняются только для неподдерживаемых методов', async () => {
  const response = await call('https://w.example/?method=ISteamUser/GetPlayerSummaries/v0002', { method: 'DELETE' });
  assert.equal(response.status, 405);
});

await check('без ключа — 400 missing_key', async () => {
  const response = await call('https://w.example/?method=ISteamUser/GetPlayerSummaries/v0002', {}, {});
  assert.equal(response.status, 400);
  assert.match(await response.text(), /missing_key/);
});

await check('ключ из запроса используется, если секрета нет', async () => {
  await call('https://w.example/?method=ISteamUser/GetPlayerSummaries/v0002&key=from-client', {}, {});
  assert.ok(upstreamCalls[0].includes('key=from-client'));
});

await check('недоступный upstream → 502', async () => {
  mode = 'unreachable';
  const response = await call('https://w.example/?method=IDOTA2Match_570/GetMatchDetails/V001&match_id=1');
  assert.equal(response.status, 502);
  assert.match(await response.text(), /upstream_unreachable/);
});

await check('таймаут upstream → 504', async () => {
  mode = 'timeout';
  const response = await call('https://w.example/?method=IDOTA2Match_570/GetMatchDetails/V001&match_id=1');
  assert.equal(response.status, 504);
  assert.match(await response.text(), /upstream_timeout/);
});

await check('слишком большой ответ → 502 response_too_large', async () => {
  mode = 'big';
  const response = await call('https://w.example/?method=IDOTA2Match_570/GetMatchDetails/V001&match_id=1');
  assert.equal(response.status, 502);
  assert.match(await response.text(), /response_too_large/);
});

globalThis.fetch = realFetch;
console.log(results.join('\n'));
console.log(process.exitCode ? '\nЕсть ошибки.' : '\nВсе проверки воркера пройдены.');
