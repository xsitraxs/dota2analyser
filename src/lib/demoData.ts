/**
 * Демо-матчи: описания — сразу, тяжёлые JSON — по требованию.
 *
 * Раньше оба демо (≈350 КБ JSON) импортировались статически и попадали в
 * основной бандл, хотя нужны только при открытии демо-страницы. Теперь
 * метаданные лежат в этом модуле, а сами данные подгружаются отдельным
 * чанком в момент обращения.
 *
 * Офлайн-сценарий: если чанк не удалось получить (нет сети, кэш пуст),
 * loadDemoPayload возвращает null, и вызывающий код показывает понятное
 * сообщение вместо падения — см. MatchPage и раздел «Демо-матчи».
 */
import type { DemoMeta } from '../types';

interface DemoDescriptor {
  id: number;
  meta: DemoMeta;
  load: () => Promise<unknown>;
}

const DESCRIPTORS: DemoDescriptor[] = [
  {
    id: 7490235544,
    meta: {
      title: '47 минут фарма и давления',
      subtitle: 'Lifestealer · 10 / 1 / 10 · 737 GPM',
      note: 'Публичный матч из открытого датасета OpenDota. Полный разбор реплея.',
      featuredSlot: 0,
      matchId: 7490235544,
      source: 'OpenDota / odota/core',
      license: 'MIT',
    },
    load: () => import('../data/demo/7490235544.json'),
  },
  {
    id: 1781962623,
    meta: {
      title: '25 убийств на Templar Assassin',
      subtitle: 'TA · 25 / 2 / 6 · 37 минут',
      note: 'Публичный матч из открытого датасета OpenDota. Смотри, где терялся фарм.',
      featuredSlot: 3,
      matchId: 1781962623,
      source: 'OpenDota / odota/core',
      license: 'MIT',
    },
    load: () => import('../data/demo/1781962623.json'),
  },
];

/** Метаданные всех демо — доступны синхронно, без загрузки самих данных. */
export const DEMO_META_LIST: DemoMeta[] = DESCRIPTORS.map((item) => item.meta);

/** ID демо-матчей. */
export const DEMO_IDS: number[] = DESCRIPTORS.map((item) => item.id);

/** Демо, которое открывается по умолчанию (кнопка в шапке). */
export function demoMatchId(): number {
  return DESCRIPTORS[0]?.id ?? 7490235544;
}

/** Метаданные конкретного демо, если оно есть в сборке. */
export function demoMeta(id: number): DemoMeta | null {
  return DESCRIPTORS.find((item) => item.id === id)?.meta ?? null;
}

export function isDemoId(id: number): boolean {
  return DESCRIPTORS.some((item) => item.id === id);
}

/**
 * Загружает JSON демо отдельным чанком.
 * Возвращает null, если демо нет в сборке или чанк не удалось получить.
 */
export async function loadDemoPayload(id: number): Promise<unknown | null> {
  const descriptor = DESCRIPTORS.find((item) => item.id === id);
  if (!descriptor) return null;
  try {
    const module = await descriptor.load();
    return (module as { default?: unknown }).default ?? module;
  } catch {
    return null;
  }
}

/** Загружает все демо (используется карточками на главной). */
export async function loadAllDemoPayloads(): Promise<{ id: number; payload: unknown }[]> {
  const loaded = await Promise.all(
    DESCRIPTORS.map(async (descriptor) => ({ id: descriptor.id, payload: await loadDemoPayload(descriptor.id) })),
  );
  return loaded.filter((item): item is { id: number; payload: unknown } => item.payload != null);
}
