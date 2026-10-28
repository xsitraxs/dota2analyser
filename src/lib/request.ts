/**
 * Общий HTTP-слой для внешних API (Valve, OpenDota, пользовательский прокси).
 *
 * Раньше каждый модуль по-своему работал с таймаутом и AbortSignal, из-за чего:
 *  - запрос начинался даже с уже отменённым сигналом;
 *  - обработчик отмены не снимался после успешного ответа;
 *  - пользовательская отмена показывалась как таймаут.
 * Здесь эти случаи разведены, а обработчики всегда очищаются в finally.
 */

export type AbortReason = 'abort' | 'timeout';

export class RequestAbortError extends Error {
  reason: AbortReason;
  constructor(reason: AbortReason, message: string) {
    super(message);
    this.name = 'RequestAbortError';
    this.reason = reason;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Выполняет fetch с таймаутом и внешней отменой.
 * Бросает RequestAbortError('abort') для отмены пользователем
 * и RequestAbortError('timeout') по истечении времени ожидания.
 */
export async function fetchWithTimeout(url: string, options: RequestOptions = {}): Promise<Response> {
  if (options.signal?.aborted) {
    throw new RequestAbortError('abort', 'Запрос уже отменён.');
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (options.signal) {
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof RequestAbortError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      // Внешняя отмена важнее таймаута: пользователь сам прервал запрос.
      if (options.signal?.aborted && !timedOut) {
        throw new RequestAbortError('abort', 'Запрос отменён.');
      }
      throw new RequestAbortError('timeout', `Источник не ответил за ${Math.round(timeoutMs / 1000)} сек.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (options.signal) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/** Читает JSON-ответ, превращая ошибки разбора в понятное сообщение. */
export async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('Ответ не является JSON.');
  }
}

/**
 * Ограничивает число одновременных асинхронных операций.
 * Нужно для догрузки деталей матчей: Valve не любит резкие пачки запросов.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export { DEFAULT_TIMEOUT_MS };
