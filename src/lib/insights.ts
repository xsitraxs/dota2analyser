import { DIMENSION_META, ROLE_SHORT } from './constants';
import { GOALS, ROLE_WEIGHTS, gradeOf } from './analyze';
import { fmtClock, fmtNum, fmtPct, fmtTime, plural } from './format';
import type {
  CoachReport,
  Dimension,
  Insight,
  InsightCategory,
  InsightSeverity,
  Match,
  MatchAnalysis,
  PlayerAnalysis,
} from '../types';

const DIMENSIONS: Dimension[] = ['farm', 'damage', 'survival', 'vision', 'fights', 'objectives'];
const SEVERITY_ORDER: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, good: 3 };

const PLAN_TITLES: Record<InsightCategory, string> = {
  farm: 'Фарм-режим: 3 игры с фокусом на добивания',
  fighting: 'Драки: приходи на ключевые бои вовремя',
  survival: 'Смерти: пауза «зачем я здесь» перед каждым входом',
  vision: 'Вижн: держи 2 активных варда на карте',
  items: 'Предметы: тайминги и защитный предмет',
  objectives: 'Объективы: после драки — башня или Рошан',
  discipline: 'Дисциплина: ТП, байбеки и ментальность',
};

function metricSentence(analysis: PlayerAnalysis, dimension: Dimension): string {
  const m = analysis.metrics;
  switch (dimension) {
    case 'farm':
      return `${m.gpm} GPM, ${analysis.player.lastHits} добиваний`;
    case 'damage':
      return `${fmtNum(analysis.player.heroDamage)} урона, ${fmtNum(m.damagePerMin)}/мин`;
    case 'survival':
      return `${analysis.player.deaths} ${plural(analysis.player.deaths, 'смерть', 'смерти', 'смертей')} за ${fmtTime(m.durationMin * 60)}`;
    case 'vision':
      return m.wardsPer10 == null
        ? 'нет данных о вардах'
        : `${m.obsPlaced ?? 0} ${plural(m.obsPlaced ?? 0, 'обс', 'обса', 'обсов')} + ${m.senPlaced ?? 0} ${plural(
            m.senPlaced ?? 0,
            'сентари',
            'сентари',
            'сентарей',
          )} — ${m.wardsPer10.toFixed(2)}/10 мин`;
    case 'fights':
      return `${fmtPct(m.killParticipation)} участие, ${fmtPct(m.fightInvolvement)} драк`;
    case 'objectives':
      return `${fmtNum(analysis.player.towerDamage)} урона по строениям${
        m.roshansKilled == null ? '' : `, ${m.roshansKilled} Рошан`
      }`;
    default:
      return '';
  }
}

export function buildCoachReport(match: Match, analysis: MatchAnalysis, slot: number): CoachReport {
  const playerAnalysis = analysis.bySlot[slot] ?? analysis.players[0];
  const player = playerAnalysis.player;
  const role = playerAnalysis.role;
  const isCore = role <= 3;
  const m = playerAnalysis.metrics;
  const durationMin = m.durationMin;
  const insights: Insight[] = [];
  const add = (insight: Insight) => insights.push(insight);

  const lhGoal = GOALS.lh10[role as 1 | 2 | 3 | 4 | 5];
  const gpmGoal = GOALS.gpm[role as 1 | 2 | 3 | 4 | 5];
  const deathsGoal = GOALS.deathsPer10[role as 1 | 2 | 3 | 4 | 5];
  const damageGoal = GOALS.damagePerMin[role as 1 | 2 | 3 | 4 | 5];
  const partGoal = GOALS.participation[role as 1 | 2 | 3 | 4 | 5];
  const visionGoal = GOALS.wardsPer10[role as 1 | 2 | 3 | 4 | 5];
  const senGoal = GOALS.senPer10[role as 1 | 2 | 3 | 4 | 5];
  const towerGoal = GOALS.towerPerMin[role as 1 | 2 | 3 | 4 | 5];

  // ---------- Фарм ----------
  if (isCore && m.lh10 != null && m.lh10 < lhGoal * 0.85) {
    const severity: InsightSeverity = m.lh10 < lhGoal * 0.6 ? 'critical' : 'warning';
    add({
      id: 'farm-lh10',
      severity,
      category: 'farm',
      title: 'Мало добиваний к 10-й минуте',
      detail: `К 10:00 у тебя ${m.lh10} добиваний. Для позиции ${role} ориентир — ${lhGoal}. Это примерно ${fmtNum(
        Math.max(0, lhGoal - m.lh10) * 45,
      )} потерянного золота только за лейн.`,
      why: 'Ранний фарм — самый дешёвый источник золота и опыта. 10 недобраных крипов на лейне отстают тебя на целый предмет к 20-й минуте.',
      fix: 'Тренируй последний удар: не бей крипа без заряда, держи агр на своей стороне, добивай под башней. Смотри на крипов каждую секунду, а не только на героя.',
      lessonIds: ['last-hits', 'farm-patterns'],
      value: `${m.lh10} LH`,
      goal: `${lhGoal} LH`,
    });
  } else if (isCore && m.lh10 != null && m.lh10 >= lhGoal * 1.05) {
    add({
      id: 'farm-lh10-good',
      severity: 'good',
      category: 'farm',
      title: 'Лейн выигран по фарму',
      detail: `${m.lh10} добиваний к 10:00 — выше ориентира для позиции ${role} (${lhGoal}). ${m.lh20 != null ? `К 20:00 — ${m.lh20}.` : ''}`,
      why: 'Ровный лейн даёт темп: ты раньше включаешься в игру и заставляешь врага реагировать.',
      fix: 'Сохрани привычку и перенеси её в мид-гейм: после каждой волны забирай ближайший лагерь.',
      lessonIds: ['farm-patterns'],
      value: `${m.lh10} LH`,
      goal: `${lhGoal} LH`,
    });
  }

  if (m.gpm < gpmGoal * 0.78) {
    add({
      id: 'farm-gpm',
      severity: m.gpm < gpmGoal * 0.6 ? 'critical' : 'warning',
      category: 'farm',
      title: 'Экономика ниже роли',
      detail: `GPM ${m.gpm} при ориентире ${gpmGoal} для позиции ${role}. Итоговый GPM связан с таймингами предметов и уровнем к дракам.`,
      why: 'В Dota экономика — это не только фарм крипов. Если ты стоишь без дела между волнами и не берёшь лагеря, ты теряешь 200–400 золота в минуту.',
      fix: 'Планируй маршрут на 60 секунд вперёд: волна → лагерь → руна/вард → следующая волна. Не стой в кустах без задачи.',
      lessonIds: ['farm-patterns', 'efficiency'],
      value: `${m.gpm} GPM`,
      goal: `${gpmGoal} GPM`,
    });
  }

  if (isCore && m.gpmWindows.length >= 3) {
    const late = m.gpmWindows.filter((w) => w.from >= 10 && w.to > w.from + 2);
    const worst = [...late].sort((a, b) => a.gpm - b.gpm)[0];
    if (worst && worst.gpm < Math.max(240, gpmGoal * 0.55)) {
      add({
        id: 'farm-dip',
        severity: 'warning',
        category: 'farm',
        title: 'Провал фарма в мид-гейме',
        detail: `В отрезке ${worst.label} у тебя ${worst.gpm} GPM — самый слабый отрезок матча. Для позиции ${role} это мало.`,
        why: 'Если фарм просел после лейна, значит ты либо потерял безопасные линии, либо слишком долго ходил за команду без результата.',
        fix: 'Держи крайнюю линию и лагеря рядом с ней. Выходи только на драку, которая даёт объект или убийство; после — сразу возвращайся к волне.',
        lessonIds: ['farm-patterns', 'objectives'],
      });
    }
  }

  if (isCore && m.gpm >= gpmGoal * 1.05 && !insights.some((i) => i.id === 'farm-lh10-good')) {
    add({
      id: 'farm-gpm-good',
      severity: 'good',
      category: 'farm',
      title: 'Экономика работает на тебя',
      detail: `GPM ${m.gpm} выше ориентира ${gpmGoal} для позиции ${role}.`,
      why: 'Хорошая экономика превращается в тайминги предметов и уровни — это главное преимущество в пабе.',
      fix: 'Теперь конвертируй золото в давление: после ключевого предмета бери башни, а не фарми до 40-й минуты.',
      lessonIds: ['item-timings', 'objectives'],
      value: `${m.gpm} GPM`,
      goal: `${gpmGoal} GPM`,
    });
  }

  // ---------- Смерти ----------
  const expectedDeaths = (deathsGoal * durationMin) / 10;
  if (player.deaths > expectedDeaths * 1.25 && durationMin >= 15) {
    const severity: InsightSeverity = player.deaths > expectedDeaths * 1.55 ? 'critical' : 'warning';
    add({
      id: 'survival-deaths',
      severity,
      category: 'survival',
      title: 'Слишком высокая смертность',
      detail: `${player.deaths} ${plural(player.deaths, 'смерть', 'смерти', 'смертей')} за ${fmtTime(match.duration)}. Для позиции ${role} ориентир — около ${Math.round(expectedDeaths)} за матч.`,
      why: 'Каждая смерть в мид-гейме — это потерянная волна, отданный объект и золото врагу. Смерти дороже, чем кажется.',
      fix: 'Перед входом на территорию без вардов спрашивай: «Кто рядом? Где враги? Что я получу?». Одна пауза в 2 секунды дешевле, чем 40 секунд таймера.',
      lessonIds: ['death-review', 'map-awareness'],
      value: `${player.deaths}`,
      goal: `≈${Math.round(expectedDeaths)}`,
    });
  } else if (player.deaths <= expectedDeaths * 0.7 && durationMin >= 15) {
    add({
      id: 'survival-good',
      severity: 'good',
      category: 'survival',
      title: 'Дисциплина по смертям',
      detail: `${player.deaths} ${plural(player.deaths, 'смерть', 'смерти', 'смертей')} за ${fmtTime(match.duration)} — ниже ориентира (${Math.round(expectedDeaths)}).`,
      why: 'Ты дольше остаёшься на карте — значит, чаще можешь забрать волну, башню или драку.',
      fix: 'Оставь это как стандарт. Теперь проверь, не превращается ли осторожность в пассивность: твоё участие в драках не должно падать.',
      lessonIds: ['death-review', 'teamfights'],
      value: `${player.deaths}`,
      goal: `≈${Math.round(expectedDeaths)}`,
    });
  }

  if (m.deathTimes.length && m.earlyDeaths >= 3) {
    const firstThree = m.deathTimes.slice(0, 3).map((t) => fmtClock(t)).join(', ');
    add({
      id: 'survival-early',
      severity: 'critical',
      category: 'survival',
      title: 'Ранние смерти на лейне',
      detail: `${m.earlyDeaths} ${plural(m.earlyDeaths, 'смерть', 'смерти', 'смертей')} до 10-й минуты. Первые: ${firstThree}. Лейн после этого приходится отыгрывать с нуля.`,
      why: 'Смерть на лейне отдаёт врагу опыт, золото и возможность забрать руну или башню. Ранний размен редко окупается.',
      fix: 'Играй от своей половины, пока не знаешь, где вражеский саппорт. Ставь вард до 0:00 и не стой в крипах без хп/маны на обмен.',
      lessonIds: ['death-review', 'vision'],
      value: `${m.earlyDeaths} до 10:00`,
      goal: '≤1',
    });
  }

  if (player.deaths >= 5 && m.buybacks === 0 && player.netWorth > 9000 && durationMin > 25) {
    add({
      id: 'survival-buyback',
      severity: 'warning',
      category: 'survival',
      title: 'Ни одного байбека',
      detail: `При ${player.deaths} смертях и нетворсе ${fmtNum(player.netWorth)} ты ни разу не купил байбек. Часто это значит, что золото уходило не в страховку, а в предметы без плана.`,
      why: 'Байбек в лейте — это второй шанс защитить базу или добить драку. Одна сохранённая игра стоит дороже одного компонента.',
      fix: 'После 25-й минуты всегда держи 1,5–2 тысячи на байбек, если у тебя нет защиты от сплитпуша.',
      lessonIds: ['item-timings', 'objectives'],
    });
  }

  // ---------- Урон ----------
  if (m.damagePerMin < damageGoal * 0.7) {
    add({
      id: 'damage-low',
      severity: isCore ? 'warning' : 'info',
      category: 'fighting',
      title: 'Мало урона по героям',
      detail: `${fmtNum(player.heroDamage)} урона — ${fmtNum(m.damagePerMin)} в минуту. Для позиции ${role} ориентир — ${damageGoal}/мин.`,
      why: 'Урон — это не самоцель, но если его нет, враг выигрывает драки без размена. Особенно важно в матчах, где ты должен быть главным источником урона.',
      fix: 'Не бей первого, кто попался: ищи цель, которую команда может убить, и держи дистанцию до угроз. Следи, чтобы твои способности не уходили в молоко.',
      lessonIds: ['positioning', 'teamfights'],
      value: `${fmtNum(m.damagePerMin)}/мин`,
      goal: `${damageGoal}/мин`,
    });
  } else if (m.damageShare >= 0.3) {
    add({
      id: 'damage-good',
      severity: 'good',
      category: 'fighting',
      title: 'Главный источник урона в команде',
      detail: `${fmtPct(m.damageShare)} урона команды — ${fmtNum(player.heroDamage)} единиц.`,
      why: 'В матчах с высоким уроном ты действительно влияешь на исход драк, а не просто добиваешь.',
      fix: 'Сохраняй темп и следи, чтобы такой вклад не превращался в смерти: урон без выживания не конвертируется в объекты.',
      lessonIds: ['positioning'],
      value: fmtPct(m.damageShare),
      goal: '≥30%',
    });
  }

  // ---------- Драки ----------
  if (m.killParticipation > 0 && m.killParticipation < partGoal * 0.8) {
    add({
      id: 'fights-participation',
      severity: m.killParticipation < partGoal * 0.55 ? 'warning' : 'info',
      category: 'fighting',
      title: 'Мало участия в убийствах',
      detail: `${fmtPct(m.killParticipation)} убийств команды с твоим участием (${player.kills + player.assists} из ${Math.round(
        (player.kills + player.assists) / Math.max(m.killParticipation, 0.01),
      )}). Ориентир для позиции ${role} — ${fmtPct(partGoal)}.`,
      why: 'Убийства без участия керри — это потерянные объекты. Даже если ты фармишь, твоё отсутствие в драке может стоить башни или Рошана.',
      fix: 'После 15-й минуты следи за таймером драки: если команда идёт на объект или враг зашёл на вашу половину, ты должен быть рядом.',
      lessonIds: ['teamfights', 'objectives'],
      value: fmtPct(m.killParticipation),
      goal: fmtPct(partGoal),
    });
  }

  if (m.missedFights >= 2) {
    const times = playerAnalysis.fights
      .filter((f) => !f.participated && f.teamDamage > 0)
      .slice(0, 3)
      .map((f) => fmtClock(f.start))
      .join(', ');
    add({
      id: 'fights-missed',
      severity: 'warning',
      category: 'fighting',
      title: 'Пропущенные драки',
      detail: `Ты не нанёс ни урона в ${m.missedFights} ${plural(m.missedFights, 'драке', 'драках', 'драках')} из ${m.fightCount}. Ближайшие по времени: ${times}.`,
      why: 'Одна пропущенная драка в мид-гейме часто решает, кто заберёт Рошана или башню. Команда дерётся 4 на 5 и теряет темп.',
      fix: 'Смотри на миникарту каждые 3–5 секунд и держи запас маны/хп, чтобы дойти до драки. Если не успеваешь — пингуй отступление, а не фарми рядом.',
      lessonIds: ['teamfights', 'map-awareness'],
      value: `${m.missedFights}`,
      goal: '0',
    });
  }

  const diedWithoutDamage = playerAnalysis.fights.filter((f) => f.deaths > 0 && f.damage === 0).length;
  if (diedWithoutDamage >= 1) {
    add({
      id: 'fights-died-no-damage',
      severity: 'warning',
      category: 'fighting',
      title: 'Смерти без размена',
      detail: `В ${diedWithoutDamage} ${plural(diedWithoutDamage, 'драке', 'драках', 'драках')} ты умер, не нанеся урона. Это чистый минус для команды.`,
      why: 'Даже неудачная драка должна оставлять врагу неудобство: снятый ульт, потраченный БКБ, отведённая цель. Смерть без урона — это подарок.',
      fix: 'Перед входом выбери, какой урон/контроль ты успеешь отдать. Если не можешь — не входи первым, стой на краю и жди ошибки врага.',
      lessonIds: ['positioning', 'death-review'],
    });
  }

  if (m.fightCount > 0 && m.fightInvolvement >= 0.78 && m.killParticipation >= partGoal) {
    add({
      id: 'fights-good',
      severity: 'good',
      category: 'fighting',
      title: 'Ты был в игре',
      detail: `Участие в ${fmtPct(m.fightInvolvement)} драк и ${fmtPct(m.killParticipation)} убийств команды.`,
      why: 'Присутствие в драках важнее идеального фарма: именно оно превращает преимущество в объекты.',
      fix: 'Продолжай. Следующий шаг — приходи в драку с нужным предметом и не трать инициацию впустую.',
      lessonIds: ['teamfights'],
      value: fmtPct(m.fightInvolvement),
      goal: '≥68%',
    });
  }

  // ---------- Видение ----------
  // Раньше здесь проверялся общий флаг «матч распарсен», но варды приходят
  // отдельным блоком данных: без него выводы о вижне не формулируем вовсе.
  const hasVisionData = playerAnalysis.coverage?.wards ?? false;
  const wardsPer10 = m.wardsPer10;
  const obsPlaced = m.obsPlaced ?? 0;
  const senPlaced = m.senPlaced ?? 0;
  if (hasVisionData && !isCore && wardsPer10 != null && wardsPer10 < visionGoal * 0.7) {
    add({
      id: 'vision-low',
      severity: (wardsPer10 ?? 0) < visionGoal * 0.4 ? 'critical' : 'warning',
      category: 'vision',
      title: 'Мало вардов для поддержки',
      detail: `${obsPlaced} обсов и ${senPlaced} сентарей за ${fmtTime(match.duration)} — ${wardsPer10.toFixed(
        2,
      )} варда/10 мин. Для позиции ${role} ориентир — ${visionGoal.toFixed(2)}.`,
      why: 'Вижн — это информация: где враг, можно ли фармить линию, где начнётся драка. Без вардов команда играет вслепую.',
      fix: 'Держи 2 обса на карте всё время. Перед сменой зоны ставь новый вард до того, как старый закончится. Не экономь на вардах в мид-гейме.',
      lessonIds: ['vision', 'map-awareness'],
      value: wardsPer10.toFixed(2),
      goal: visionGoal.toFixed(2),
    });
  } else if (hasVisionData && !isCore && wardsPer10 != null && wardsPer10 >= visionGoal) {
    add({
      id: 'vision-good',
      severity: 'good',
      category: 'vision',
      title: 'Карта под контролем',
      detail: `${obsPlaced} обсов и ${senPlaced} сентарей — ${wardsPer10.toFixed(2)} варда/10 мин против ориентира ${visionGoal.toFixed(2)}.`,
      why: 'Хороший вижн напрямую конвертируется в безопасный фарм керри и успешные драки.',
      fix: 'Добавь девар: если видишь вражеский обс, снимай его сентари или кволингом. Контроль вижна важнее количества.',
      lessonIds: ['vision'],
    });
  }

  if (hasVisionData && !isCore && senPlaced === 0 && obsPlaced >= 3) {
    add({
      id: 'vision-sentry',
      severity: 'warning',
      category: 'vision',
      title: 'Ни одной сентари',
      detail: `Ты поставил ${obsPlaced} обсов, но ни разу не купил сентари. Вражеские варды остаются безнаказанными.`,
      why: 'Сентари — это не только девар. Она отключает вражеский вижн и защищает твои ротации. Без неё ты видишь карту, а враг видит тебя.',
      fix: 'Покупай сентари под каждый обс в важной зоне и перед Рошаном/пушами. Одна снятая сентари окупает себя.',
      lessonIds: ['vision'],
    });
  } else if (hasVisionData && !isCore && senPlaced > 0 && senPlaced < (senGoal * durationMin) / 10) {
    add({
      id: 'vision-sentry-low',
      severity: 'info',
      category: 'vision',
      title: 'Сентарей меньше нормы',
      detail: `${senPlaced} сентарей за матч при ориентире ${Math.max(1, Math.round((senGoal * durationMin) / 10))}.`,
      why: 'Без регулярных сентарей ты не контролируешь вражеский вижн и не можешь безопасно ходить через реку.',
      fix: 'Добавь сентари в закупку перед каждой ротацией и приходом на Рошана. Не обязательно ставить их в одном месте.',
      lessonIds: ['vision'],
    });
  }

  if (hasVisionData && isCore && obsPlaced === 0 && durationMin > 25) {
    add({
      id: 'vision-core-zero',
      severity: 'info',
      category: 'vision',
      title: 'Керри без вардов',
      detail: 'Ты не поставил ни одного обса. Для керри это не критично, но один защитный вард на фарм-зоне часто спасает жизнь.',
      why: 'Керри тоже может помочь команде вижном в ключевой момент — например, перед Рошаном или при сплите.',
      fix: 'Иногда купи один обс на свою фарм-зону или на подход к Рошану. Это дешёвая страховка.',
      lessonIds: ['vision'],
    });
  }

  // ---------- Предметы ----------
  if (isCore && playerAnalysis.bkbTiming != null && playerAnalysis.bkbTiming > 25 * 60) {
    add({
      id: 'items-bkb-late',
      severity: playerAnalysis.bkbTiming > 32 * 60 ? 'critical' : 'warning',
      category: 'items',
      title: 'Поздний BKB',
      detail: `Black King Bar куплен на ${fmtTime(playerAnalysis.bkbTiming)}. Для кор-героя в активном матче это поздновато: типичный тайминг — 18–24 минуты.`,
      why: 'BKB — это не только защита, но и возможность зайти в драку первым. Каждая минута без него — потерянный темп.',
      fix: 'Планируй BKB до 20-й минуты, если у врага 2+ контроля. Не достраивай фарм-предмет, если тебя убивают в каждой драке.',
      lessonIds: ['bkb', 'item-timings'],
      value: fmtTime(playerAnalysis.bkbTiming),
      goal: '18–24 мин',
    });
  } else if (isCore && playerAnalysis.bkbTiming != null && playerAnalysis.bkbTiming <= 22 * 60) {
    add({
      id: 'items-bkb-good',
      severity: 'good',
      category: 'items',
      title: 'Ранний BKB',
      detail: `BKB на ${fmtTime(playerAnalysis.bkbTiming)} — хороший тайминг для активной игры.`,
      why: 'Ранний BKB позволяет команде навязывать драки и забирать объекты, пока враг ещё собирает ключевые предметы.',
      fix: 'Используй окно BKB: сразу после покупки иди на объект или Рошана, не откладывай на «ещё один фарм».',
      lessonIds: ['bkb', 'objectives'],
    });
  }

  const tpUses = player.itemUses.tpscroll ?? player.purchaseLog.filter((entry) => entry.key === 'tpscroll').length;
  const hasPurchaseData = playerAnalysis.coverage?.purchases ?? false;
  if (hasPurchaseData && durationMin > 20 && tpUses < 3) {
    add({
      id: 'items-tp',
      severity: 'warning',
      category: 'discipline',
      title: 'Мало ТП-ротаций',
      detail: `Ты использовал ТП всего ${tpUses} ${plural(tpUses, 'раз', 'раза', 'раз')} за ${fmtTime(match.duration)}.`,
      why: 'Скорость реакции — это не про механику, а про ТП. Один TP на драку может превратить поражение в победу.',
      fix: 'Всегда имей TP и смотри на миникарту после каждой волны. Если драка на другом конце карты — не иди пешком, переключись.',
      lessonIds: ['tp-discipline', 'map-awareness'],
      value: `${tpUses} TP`,
      goal: '≥4',
    });
  }

  // ---------- Объективы ----------
  if (isCore && m.towerDamagePerMin < towerGoal * 0.55 && durationMin > 20) {
    add({
      id: 'objectives-tower',
      severity: 'warning',
      category: 'objectives',
      title: 'Мало давления на строения',
      detail: `${fmtNum(player.towerDamage)} урона по строениям — ${fmtNum(m.towerDamagePerMin)}/мин. Для позиции ${role} ориентир — ${towerGoal}/мин.`,
      why: 'Убийства без башен не выигрывают карту. Ты можешь иметь большое KDA, но не конвертировать его в преимущество.',
      fix: 'После выигранной драки не уходи на фарм. Сначала забери башню или Рошана, потом фарми. Крипы и лагеря не убегут.',
      lessonIds: ['objectives', 'teamfights'],
      value: `${fmtNum(m.towerDamagePerMin)}/мин`,
      goal: `${towerGoal}/мин`,
    });
  } else if (m.towerDamagePerMin >= towerGoal && durationMin > 20) {
    add({
      id: 'objectives-good',
      severity: 'good',
      category: 'objectives',
      title: 'Играешь через объекты',
      detail: `${fmtNum(player.towerDamage)} урона по башням — ${fmtNum(m.towerDamagePerMin)}/мин.`,
      why: 'Объекты выигрывают матч: они дают золото, открывают карту и ограничивают врага.',
      fix: 'Сохраняй фокус. Добавь тайминги Рошана: после 20-й минуты он должен быть приоритетом, если враг на карте открыт.',
      lessonIds: ['objectives'],
    });
  }

  const hasObjectivesData = match.coverage?.objectives ?? match.parsed;
  const teamRoshans = match.objectives.filter(
    (objective) => objective.kind === 'roshan' && objective.team === (player.isRadiant ? 'radiant' : 'dire'),
  ).length;
  // Без списка событий матча отсутствие Рошана — не факт, а отсутствие данных.
  if (hasObjectivesData && durationMin > 28 && teamRoshans === 0) {
    add({
      id: 'objectives-roshan',
      severity: 'info',
      category: 'objectives',
      title: 'Рошан остался не тронут',
      detail: `За ${fmtTime(match.duration)} команда не убила ни одного Рошана.`,
      why: 'Аегис — это бесплатный высокий темп. Без него команда не может безопасно пушить высокие башни.',
      fix: 'После выигранной драки на 20+ минуте сразу проверь Рошана. Ставь вард в яме и не отпускай врага к ней без наказания.',
      lessonIds: ['objectives', 'vision'],
    });
  }

  // ---------- Итог / контекст ----------
  if (!match.coverage?.objectives && match.parsed) {
    add({
      id: 'meta-no-objectives',
      severity: 'info',
      category: 'objectives',
      title: 'Нет списка событий матча',
      detail: 'В данных нет журнала событий, поэтому Рошан, башни и первая кровь не показаны — это не значит, что их не было.',
      why: 'Выводы об объектах можно делать только по фактическому списку событий, а не по его отсутствию.',
      fix: 'Загрузи полный парс реплея (JSON парса или OpenDota с парсом), чтобы увидеть объекты.',
      lessonIds: ['objectives'],
    });
  }

  if (!playerAnalysis.hasTimeline) {
    add({
      id: 'meta-unparsed',
      severity: 'info',
      category: 'discipline',
      title: 'Ограниченный разбор',
      detail: 'Матч не распарсен: нет таймингов фарма, вардов и командных драк. Оценки и выводы построены на базовой статистике.',
      why: 'Для точного разбора нужен парс реплея. Без него не видны провалы по фазам и участие в драках.',
      fix: 'Открой матч в OpenDota, запроси разбор реплея или загрузи JSON с парсом в приложение.',
      lessonIds: ['review-method'],
    });
  }

  if (!match.teamfights.length) {
    add({
      id: 'meta-no-fights',
      severity: 'info',
      category: 'fighting',
      title: 'Нет данных о драках',
      detail: 'OpenDota не отдал таймлайн командных боёв, поэтому часть выводов о драках скрыта.',
      why: 'Без таймлайна нельзя понять, пропускал ли ты драки и наносил ли урон в нужные моменты.',
      fix: 'Для полной картины нужен распарсенный матч.',
      lessonIds: ['review-method'],
    });
  }

  const won = player.isRadiant === match.radiantWin;
  if (won && playerAnalysis.overall != null && playerAnalysis.overall >= 72) {
    add({
      id: 'context-win-good',
      severity: 'good',
      category: 'discipline',
      title: 'Сильный результат в победном матче',
      detail: `Оценка ${playerAnalysis.overall}/100, победа за ${fmtTime(match.duration)}.`,
      why: 'Победа — это итог правильных решений, а не только удачи. Важно понять, какие именно привычки сработали.',
      fix: 'Выпиши 2 действия, которые помогли выиграть, и повторяй их в следующих играх. Это твоя рабочая формула.',
      lessonIds: ['review-method', 'mindset'],
    });
  } else if (!won && playerAnalysis.overall != null && playerAnalysis.overall >= 70) {
    add({
      id: 'context-loss-good',
      severity: 'good',
      category: 'discipline',
      title: 'Хорошая игра в поражении',
      detail: `Оценка ${playerAnalysis.overall}/100, но команда проиграла. Личные метрики не всегда совпадают с результатом.`,
      why: 'Поражение не делает все твои решения ошибочными. Иногда проигрывает команда, а не ты.',
      fix: 'Найди 1–2 решения, которые могли переломить матч (драка, Рошан, давление). Работай над ними, не обесценивая свою игру.',
      lessonIds: ['review-method', 'mindset'],
    });
  }

  if (insights.length < 4) {
    add({
      id: 'baseline',
      severity: 'info',
      category: 'discipline',
      title: 'Базовый разбор',
      detail: `Твоя линия: ${playerAnalysis.roleLabel}. GPM ${m.gpm}, KDA ${player.kills}/${player.deaths}/${player.assists}, ${fmtNum(player.heroDamage)} урона.`,
      why: 'Даже без ярких провалов важно видеть общую картину: где ты силён относительно своей роли, а где нет.',
      fix: 'Сравни свои метрики с целью роли на вкладке «Оценка». Выбери одну самую слабую зону и работай над ней неделю.',
      lessonIds: ['review-method'],
    });
  }

  insights.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const roleWeights = ROLE_WEIGHTS[role] ?? ROLE_WEIGHTS[1];
  const sortedDims = DIMENSIONS.map((key) => ({ key, value: playerAnalysis.scores[key] }))
    .filter((item): item is { key: Dimension; value: number } => item.value != null && roleWeights[item.key] >= 0.1)
    .sort((a, b) => b.value - a.value);
  const strongDims = sortedDims.slice(0, 2);
  const weakDims = [...sortedDims].reverse().slice(0, 2);
  const priorities = insights.filter((i) => i.severity === 'critical' || i.severity === 'warning').slice(0, 3);
  const overall = playerAnalysis.overall;

  const best = strongDims[0];
  const worst = weakDims[0];
  const resultText = won ? 'Победа' : 'Поражение';
  const verdictParts: string[] = [];
  verdictParts.push(
    overall != null
      ? `${resultText} за ${fmtTime(match.duration)}. Итоговая оценка — ${overall}/100 (${gradeOf(overall)}), позиция ${role} (${ROLE_SHORT[role]}).`
      : `${resultText} за ${fmtTime(match.duration)}. Недостаточно данных для полной оценки.`,
  );
  if (best && worst) {
    verdictParts.push(
      `Сильнее всего выглядит «${DIMENSION_META[best.key].label.toLowerCase()}» (${best.value}/100): ${metricSentence(
        playerAnalysis,
        best.key,
      )}. Главный резерв — «${DIMENSION_META[worst.key].label.toLowerCase()}» (${worst.value}/100): ${metricSentence(
        playerAnalysis,
        worst.key,
      )}.`,
    );
  }
  if (priorities[0]) {
    verdictParts.push(`С чего начать: ${priorities[0].title.toLowerCase()}. ${priorities[0].fix}`);
  } else {
    verdictParts.push('Явных провалов нет — можно точечно усиливать сильные стороны и добирать маленькие преимущества.');
  }

  const dimensions = DIMENSIONS.map((key) => {
    const value = playerAnalysis.scores[key];
    const text =
      value == null ? 'нет данных' : value >= 78 ? 'сильно' : value >= 65 ? 'уверенно' : value >= 50 ? 'средне' : 'слабо';
    return { key, label: DIMENSION_META[key].label, value, text };
  });

  const plan: CoachReport['plan'] = priorities.map((insight) => ({
    id: insight.id,
    title: PLAN_TITLES[insight.category],
    detail: `${insight.title}. ${insight.fix}`,
    lessonId: insight.lessonIds[0],
    category: insight.category,
  }));
  if (!plan.length && worst) {
    plan.push({
      id: `dimension-${worst.key}`,
      title: `Подтянуть «${DIMENSION_META[worst.key].label.toLowerCase()}»`,
      detail: `Твоя самая слабая зона — ${DIMENSION_META[worst.key].label.toLowerCase()} (${worst.value}/100). Начни с урока и одной осознанной игры с фокусом на эту метрику.`,
      lessonId: 'review-method',
      category: 'discipline',
    });
  }
  plan.push({
    id: 'review-next',
    title: 'Через 3 игры — повторный разбор',
    detail: 'Сыграй 3 матча, применяя план. Затем открой новый разбор и сравни оценки — так виден прогресс, а не разовые всплески.',
    category: 'discipline',
    lessonId: 'review-method',
  });

  return {
    analysis: playerAnalysis,
    overall,
    grade: gradeOf(overall),
    verdict: verdictParts.join(' '),
    strengths: strongDims.map((item) => `${DIMENSION_META[item.key].label} — ${item.value}/100`),
    weaknesses: weakDims.map((item) => `${DIMENSION_META[item.key].label} — ${item.value}/100`),
    insights,
    priorities,
    dimensions,
    plan,
  };
}
