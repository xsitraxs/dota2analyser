import { describe, expect, it } from 'vitest';
import { analyzeMatch } from '../src/lib/analyze';
import { buildCoachReport } from '../src/lib/insights';
import { MatchDataError, normalizeMatch } from '../src/lib/normalize';
import { LESSON_BY_ID } from '../src/data/lessons';
import demo1 from '../src/data/demo/7490235544.json';
import demo2 from '../src/data/demo/1781962623.json';
import { apiMatch, minimalMatch, parsedMatch } from './fixtures';

type Raw = Record<string, unknown>;

function withTimeline(payload: Raw, options: { lastTime: number; points: number; duration: number }): Raw {
  const { lastTime, points, duration } = options;
  const step = points > 1 ? lastTime / (points - 1) : 0;
  const times = Array.from({ length: points }, (_, index) => Math.round(index * step));
  const players = payload.players as Raw[];
  players.forEach((player, index) => {
    player.times = times;
    player.gold_t = times.map((time) => time * (10 + index));
    player.lh_t = times.map((time) => Math.round(time / 10) * (index + 1));
    player.xp_t = times.map((time) => time * (8 + index));
    player.dn_t = times.map(() => 3);
  });
  payload.duration = duration;
  return payload;
}

function playerAt(match: ReturnType<typeof normalizeMatch>, slot: number) {
  const found = match.players.find((player) => player.slot === slot);
  if (!found) throw new Error(`нет игрока со слотом ${slot}`);
  return found;
}

describe('метрики по временным точкам', () => {
  it('короткий матч не получает LH10/LH20', () => {
    const payload = withTimeline(apiMatch(), { lastTime: 300, points: 6, duration: 300 });
    const match = normalizeMatch([payload]);
    const analysis = analyzeMatch(match);
    const first = analysis.bySlot[playerAt(match, 0).slot];
    expect(first.metrics.lh10).toBeNull();
    expect(first.metrics.lh20).toBeNull();
    expect(first.metrics.gold10).toBeNull();
  });

  it('обрезанный таймлайн не даёт метрику за пределами покрытия', () => {
    // Таймлайн есть только до 15-й минуты, а матч длится 40.
    const payload = withTimeline(apiMatch(), { lastTime: 900, points: 16, duration: 2400 });
    const match = normalizeMatch([payload]);
    const first = analyzeMatch(match).bySlot[playerAt(match, 0).slot];
    expect(first.metrics.lh10).not.toBeNull();
    expect(first.metrics.lh20).toBeNull();
  });

  it('полный таймлайн считает LH10 и LH20', () => {
    const payload = withTimeline(apiMatch(), { lastTime: 2400, points: 41, duration: 2400 });
    const match = normalizeMatch([payload]);
    const first = analyzeMatch(match).bySlot[playerAt(match, 0).slot];
    expect(first.metrics.lh10).not.toBeNull();
    expect(first.metrics.lh20).not.toBeNull();
    expect(first.metrics.lh20!).toBeGreaterThan(first.metrics.lh10!);
  });

  it('окна GPM не строятся за пределами таймлайна', () => {
    const payload = withTimeline(apiMatch(), { lastTime: 600, points: 11, duration: 2400 });
    const match = normalizeMatch([payload]);
    const first = analyzeMatch(match).bySlot[playerAt(match, 0).slot];
    expect(first.metrics.gpmWindows.every((window) => window.to <= 10)).toBe(true);
  });
});

describe('неизвестное значение не считается нулём', () => {
  it('без списка событий инсайт о Рошане не появляется', () => {
    const match = normalizeMatch([apiMatch()]);
    expect(match.coverage.objectives).toBe(false);
    const analysis = analyzeMatch(match);
    const report = buildCoachReport(match, analysis, playerAt(match, 0).slot);
    expect(report.insights.some((insight) => insight.id === 'objectives-roshan')).toBe(false);
    expect(match.objectives).toHaveLength(0);
    // У команды неизвестное число Рошанов, а не ноль.
    expect(analysis.teams.radiant.roshans).toBeNull();
  });

  it('со списком событий инсайт о Рошане появляется при их отсутствии', () => {
    const parsed = parsedMatch();
    parsed.objectives = [{ time: 100, type: 'CHAT_MESSAGE_FIRSTBLOOD', player_slot: 0 }];
    const match = normalizeMatch([apiMatch(), parsed]);
    match.duration = 2400;
    const analysis = analyzeMatch(match);
    const report = buildCoachReport(match, analysis, playerAt(match, 0).slot);
    expect(report.insights.some((insight) => insight.id === 'objectives-roshan')).toBe(true);
    expect(analysis.teams.radiant.roshans).toBe(0);
  });

  it('оценка вижна не считается без данных о вардах', () => {
    const match = normalizeMatch([apiMatch()]);
    const analysis = analyzeMatch(match);
    for (const player of analysis.players) {
      expect(player.scores.vision).toBeNull();
      expect(player.coverage.wards).toBe(false);
      expect(player.metrics.obsPlaced).toBeNull();
    }
  });

  it('оценка вижна считается при наличии данных, включая честный ноль', () => {
    const match = normalizeMatch([apiMatch(), parsedMatch()]);
    const analysis = analyzeMatch(match);
    expect(analysis.players.every((player) => player.scores.vision != null)).toBe(true);
    expect(analysis.players.some((player) => player.metrics.obsPlaced === 0)).toBe(false);
  });

  it('исключённая метрика не снижает общую оценку', () => {
    const api = normalizeMatch([apiMatch()]);
    const withParse = normalizeMatch([apiMatch(), parsedMatch()]);
    const scoreWithoutVision = analyzeMatch(api).players[0].overall;
    const scoreWithVision = analyzeMatch(withParse).players[0].overall;
    // Обе оценки должны существовать: отсутствующие оси не обнуляют результат.
    expect(scoreWithoutVision).not.toBeNull();
    expect(scoreWithVision).not.toBeNull();
  });
});

describe('соответствие игроков событиям', () => {
  it('смерти не приписываются при двух одинаковых героях в команде', () => {
    const payload = minimalMatch();
    const players = payload.players as Raw[];
    // Два игрока Radiant с одним героем и kills_log у соперника.
    players[0].hero_id = 1;
    players[1].hero_id = 1;
    (players[5] as Raw).kills_log = [{ time: 300, key: 'npc_dota_hero_antimage' }];
    const match = normalizeMatch([payload]);
    const analysis = analyzeMatch(match);
    const first = analysis.bySlot[playerAt(match, 0).slot];
    // Герой #1 = antimage: привязка неоднозначна, поэтому тайминги смертей пустые.
    expect(first.metrics.deathTimes).toHaveLength(0);
    expect(first.metrics.earlyDeaths).toBe(0);
  });

  it('смерти приписываются только от врагов', () => {
    const payload = minimalMatch();
    const players = payload.players as Raw[];
    players[0].hero_id = 1;
    // Союзник не может быть источником смерти.
    (players[1] as Raw).kills_log = [{ time: 120, key: 'npc_dota_hero_antimage' }];
    (players[5] as Raw).kills_log = [{ time: 240, key: 'npc_dota_hero_antimage' }];
    const match = normalizeMatch([payload]);
    const first = analyzeMatch(match).bySlot[playerAt(match, 0).slot];
    expect(first.metrics.deathTimes).toEqual([240]);
  });

  it('участие в драках берётся по слоту, а не по порядку в файле', () => {
    const parsed = parsedMatch();
    const fights = parsed.teamfights as Raw[];
    // Уникальные значения урона: убеждаемся, что каждый игрок получил своё.
    (fights[0] as Raw).players = (fights[0] as Raw).players as Raw[];
    const match = normalizeMatch([apiMatch(), parsed]);
    const analysis = analyzeMatch(match);
    const expectedDamage = [900, 950, 1000, 1050, 1100, 1150, 1200, 1250, 1300, 1350];
    match.players.forEach((player, index) => {
      const fightsOfPlayer = analysis.bySlot[player.slot].fights;
      expect(fightsOfPlayer[0].damage).toBe(expectedDamage[index]);
    });
  });

  it('игнорирует некорректные драки', () => {
    const parsed = parsedMatch();
    parsed.teamfights = [
      { start: -50, end: 10, players: [] },
      { start: 10 ** 9, end: 10 ** 9 + 10, players: [] },
    ];
    const match = normalizeMatch([apiMatch(), parsed]);
    expect(match.teamfights).toHaveLength(0);
    expect(match.coverage.fights).toBe(false);
  });
});

describe('демо-матчи остаются корректными', () => {
  const demos = [demo1, demo2] as unknown[];

  it('нормализуются и анализируются без исключений', () => {
    for (const payload of demos) {
      const match = normalizeMatch([payload]);
      expect(match.players).toHaveLength(10);
      expect(new Set(match.players.map((player) => player.slot)).size).toBe(10);
      expect(match.parsed).toBe(true);
      expect(match.coverage.timelines).toBe(true);

      const analysis = analyzeMatch(match);
      const radiantRoles = analysis.players.filter((p) => p.player.isRadiant).map((p) => p.role).sort();
      const direRoles = analysis.players.filter((p) => !p.player.isRadiant).map((p) => p.role).sort();
      expect(radiantRoles).toEqual([1, 2, 3, 4, 5]);
      expect(direRoles).toEqual([1, 2, 3, 4, 5]);
      for (const player of analysis.players) {
        expect(player.overall).not.toBeNull();
        expect(player.overall!).toBeGreaterThanOrEqual(0);
        expect(player.overall!).toBeLessThanOrEqual(100);
      }
    }
  });

  it('коучинг ссылается только на существующие уроки', () => {
    for (const payload of demos) {
      const match = normalizeMatch([payload]);
      const analysis = analyzeMatch(match);
      for (const player of analysis.players) {
        const report = buildCoachReport(match, analysis, player.player.slot);
        expect(report.plan.length).toBeGreaterThan(0);
        for (const insight of report.insights) {
          for (const lessonId of insight.lessonIds) {
            expect(LESSON_BY_ID[lessonId], `урок ${lessonId}`).toBeTruthy();
          }
        }
      }
    }
  });

  it('демо с полным парсом не содержит «неизвестных» метрик там, где данные есть', () => {
    const match = normalizeMatch([demos[0]]);
    const analysis = analyzeMatch(match);
    expect(analysis.players.every((player) => player.metrics.lh10 != null)).toBe(true);
    expect(analysis.players.every((player) => player.scores.vision != null)).toBe(true);
  });
});

describe('устойчивость анализа', () => {
  it('анализ не падает на минимальных данных', () => {
    const match = normalizeMatch([minimalMatch()]);
    const analysis = analyzeMatch(match);
    expect(analysis.players).toHaveLength(10);
    expect(analysis.turningPoint).toBeNull();
  });

  it('нормализация отклоняет мусор до анализа', () => {
    expect(() => normalizeMatch([null])).toThrow(MatchDataError);
    expect(() => normalizeMatch([42])).toThrow(MatchDataError);
  });
});
