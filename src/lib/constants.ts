import raw from '../data/constants.json';
import type { ConstantsFile, HeroInfo, ItemInfo } from '../types';

export const CONSTANTS = raw as unknown as ConstantsFile;

export const HEROES: HeroInfo[] = Object.values(CONSTANTS.heroes);
export const HERO_BY_ID: Record<number, HeroInfo> = {};
for (const hero of HEROES) HERO_BY_ID[hero.id] = hero;

export const HERO_BY_NAME: Record<string, HeroInfo> = {};
for (const hero of HEROES) HERO_BY_NAME[hero.name] = hero;

export const ITEM_BY_ID: Record<number, ItemInfo> = {};
export const ITEM_BY_KEY: Record<string, ItemInfo> = {};
for (const item of Object.values(CONSTANTS.items)) {
  ITEM_BY_ID[item.id] = item;
  ITEM_BY_KEY[item.key] = item;
}

export const GAME_MODES = CONSTANTS.gameModes;
export const LOBBY_TYPES = CONSTANTS.lobbyTypes;

export const ATTR_LABEL: Record<string, string> = {
  str: 'Сила',
  agi: 'Ловкость',
  int: 'Интеллект',
  all: 'Универсал',
};

export const ATTR_SHORT: Record<string, string> = {
  str: 'СИЛ',
  agi: 'ЛВК',
  int: 'ИНТ',
  all: 'УНИ',
};

export const ATTR_COLOR: Record<string, string> = {
  str: '#FF7A66',
  agi: '#6FE39A',
  int: '#7FB5FF',
  all: '#E9C46A',
};

export const ROLE_LABEL: Record<number, string> = {
  1: 'Позиция 1 · Керри',
  2: 'Позиция 2 · Мидер',
  3: 'Позиция 3 · Оффлейнер',
  4: 'Позиция 4 · Роумер',
  5: 'Позиция 5 · Поддержка',
};

export const ROLE_SHORT: Record<number, string> = {
  1: 'Керри',
  2: 'Мидер',
  3: 'Оффлейнер',
  4: 'Поз. 4',
  5: 'Поз. 5',
};

export const ROLE_COLOR: Record<number, string> = {
  1: '#E9C46A',
  2: '#7FB5FF',
  3: '#FF8A72',
  4: '#B7A4FF',
  5: '#5FE08B',
};

export const LANE_LABEL: Record<string, string> = {
  top: 'Топ-лейн',
  mid: 'Мид',
  bot: 'Бот-лейн',
  jungle: 'Лес',
  unknown: 'Неизвестно',
};

export const DIMENSION_META = {
  farm: {
    label: 'Фарм',
    short: 'Фарм',
    color: '#C9F26B',
    description: 'Добивания, GPM и стабильность экономики',
    icon: 'wheat',
  },
  damage: {
    label: 'Урон',
    short: 'Урон',
    color: '#FF8A72',
    description: 'Урон по героям и вклад в урон команды',
    icon: 'swords',
  },
  survival: {
    label: 'Выживаемость',
    short: 'Выжив.',
    color: '#5FE08B',
    description: 'Смерти, ранние потери и дисциплина',
    icon: 'heart',
  },
  vision: {
    label: 'Видение',
    short: 'Вижн',
    color: '#7FB5FF',
    description: 'Варды, сентари и контроль карты',
    icon: 'eye',
  },
  fights: {
    label: 'Драки',
    short: 'Драки',
    color: '#B7A4FF',
    description: 'Участие в убийствах и командных боях',
    icon: 'users',
  },
  objectives: {
    label: 'Объективы',
    short: 'Объект.',
    color: '#E9C46A',
    description: 'Башни, Рошан и давление на карту',
    icon: 'tower',
  },
} as const;

export function heroInitials(name: string): string {
  const cleaned = name
    .replace(/^Anti-Mage$/i, 'Anti Mage')
    .replace(/[^A-Za-zА-Яа-я0-9' -]/g, '')
    .trim();
  const words = cleaned.split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function heroGradient(heroId: number, primaryAttr?: string): string {
  const hue = (heroId * 47 + 130) % 360;
  const base = primaryAttr && ATTR_COLOR[primaryAttr] ? ATTR_COLOR[primaryAttr] : `hsl(${hue} 70% 60%)`;
  const hue2 = (hue + 38) % 360;
  return `linear-gradient(145deg, ${base}33 0%, hsl(${hue2} 65% 42% / 0.55) 55%, #0A0F0D 130%)`;
}

export function heroAccent(heroId: number, primaryAttr?: string): string {
  const hue = (heroId * 47 + 130) % 360;
  return primaryAttr && ATTR_COLOR[primaryAttr] ? ATTR_COLOR[primaryAttr] : `hsl(${hue} 70% 60%)`;
}

export function itemRarityColor(item: ItemInfo | undefined): string {
  if (!item) return '#64756E';
  if (item.cost >= 4000) return '#E9C46A';
  if (item.cost >= 2500) return '#B7A4FF';
  if (item.cost >= 1500) return '#7FB5FF';
  if (item.cost >= 500) return '#8FA69D';
  return '#64756E';
}

export const GAME_MODE_LABEL = (mode: number) => GAME_MODES[String(mode)] ?? 'Неизвестный режим';
export const LOBBY_LABEL = (lobby: number) => LOBBY_TYPES[String(lobby)] ?? 'Другое';
