import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Eye, MapPin, Skull, Sparkles } from 'lucide-react';
import { DIMENSION_META } from '../../lib/constants';
import { fmtTime } from '../../lib/format';
import type { MatchAnalysis, PlayerAnalysis, WardPoint } from '../../types';
import { DotaMap } from '../../components/DotaMap';
import { HeroAvatar, SIDE_COLOR, Toggle } from '../../components/ui';

type Layer = 'farm' | 'deaths' | 'wards';

type WardWithKind = WardPoint & { kind: 'obs' | 'sen' };

function heatFor(analysis: PlayerAnalysis): { x: number; y: number; weight: number }[] {
  const lanePos = analysis.player.lanePos;
  if (!lanePos) return [];
  const points: { x: number; y: number; weight: number }[] = [];
  for (const [x, row] of Object.entries(lanePos)) {
    if (!row || typeof row !== 'object') continue;
    for (const [y, count] of Object.entries(row)) {
      const weight = Number(count);
      if (!Number.isFinite(weight) || weight <= 0) continue;
      points.push({ x: Number(x), y: Number(y), weight });
    }
  }
  return points;
}

function MapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-ink-400">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full border-2" style={{ borderColor: '#C9F26B' }} /> Обс
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rotate-45 border-2" style={{ borderColor: '#B7A4FF' }} /> Сентари
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="text-dire">✕</span> Смерть в драке
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-radiant" /> Radiant
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-dire" /> Dire
      </span>
    </div>
  );
}

export function MapTab({ analysis }: { analysis: MatchAnalysis; match?: unknown }) {
  const [selectedSlot, setSelectedSlot] = useState<number>(analysis.players[0]?.player.slot ?? 0);
  const [layer, setLayer] = useState<Layer>('farm');
  const [showRadar, setShowRadar] = useState(false);
  const [showWards, setShowWards] = useState(true);
  const selected = analysis.bySlot[selectedSlot] ?? analysis.players[0];

  const heat = useMemo(() => {
    if (!selected) return [];
    if (layer === 'deaths') return selected.deathPoints.map((point) => ({ ...point, weight: 2 }));
    return heatFor(selected);
  }, [selected, layer]);

  const wards = useMemo<WardWithKind[]>(() => {
    if (!selected) return [];
    const own = selected.wardPoints;
    if (!showRadar) return own;
    return analysis.players.flatMap((item) => item.wardPoints);
  }, [selected, analysis.players, showRadar]);

  const deaths = useMemo(() => {
    if (!selected) return [];
    return selected.deathPoints;
  }, [selected]);

  const teammates = useMemo(
    () =>
      analysis.players.filter(
        (item) => item.player.isRadiant === (selected?.player.isRadiant ?? true) && item.player.slot !== selected?.player.slot,
      ),
    [analysis.players, selected],
  );

  const roleGroups = useMemo(() => {
    const groups: Record<string, PlayerAnalysis[]> = { radiant: [], dire: [] };
    for (const item of analysis.players) {
      (item.player.isRadiant ? groups.radiant : groups.dire).push(item);
    }
    groups.radiant.sort((a, b) => a.role - b.role);
    groups.dire.sort((a, b) => a.role - b.role);
    return groups;
  }, [analysis.players]);

  if (!selected) return null;
  const hasLane = Boolean(selected.player.lanePos);
  const hasWards = selected.metrics.obsPlaced + selected.metrics.senPlaced > 0 || selected.wardPoints.length > 0;

  return (
    <div className="space-y-4">
      <div className="panel p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="kicker">Карта действий</div>
            <h2 className="display-title mt-1 text-xl text-white">Где ты провёл матч</h2>
            <p className="mt-1 max-w-xl text-[11.5px] leading-relaxed text-ink-400">
              Тепловая карта по позициям из парса: где фармил, где умирал и куда ставил варды. Выбери игрока слева.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { key: 'farm', label: 'Фарм', icon: <MapPin size={11} /> },
                { key: 'deaths', label: 'Смерти', icon: <Skull size={11} /> },
                { key: 'wards', label: 'Варды', icon: <Eye size={11} /> },
              ] as { key: Layer; label: string; icon: ReactNode }[]
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setLayer(option.key)}
                className={`chip ${layer === option.key ? 'chip-active' : ''}`}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(['radiant', 'dire'] as const).map((side) => (
                <div key={side} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                  <div className="mb-1.5 text-[8.5px] font-bold uppercase tracking-[0.14em]" style={{ color: SIDE_COLOR[side] }}>
                    {side === 'radiant' ? 'Radiant' : 'Dire'}
                  </div>
                  <div className="space-y-1">
                    {roleGroups[side].map((item) => (
                      <button
                        key={item.player.slot}
                        type="button"
                        onClick={() => setSelectedSlot(item.player.slot)}
                        className={`flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition ${
                          selected.player.slot === item.player.slot ? 'bg-white/[0.09]' : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <HeroAvatar hero={item.hero} size={20} />
                        <span className="min-w-0 flex-1 truncate text-[9.5px] text-ink-200">{item.hero?.localized_name}</span>
                        <span className="font-display text-[9px] font-semibold" style={{ color: DIMENSION_META.fights.color }}>
                          {item.overall ?? '—'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center gap-2">
                <HeroAvatar hero={selected.hero} size={30} side={selected.player.isRadiant ? 'radiant' : 'dire'} />
                <div>
                  <div className="text-[11px] font-semibold text-white">{selected.hero?.localized_name}</div>
                  <div className="text-[9px] text-ink-400">{selected.roleLabel} · {selected.laneLabel}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[9.5px]">
                <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                  <div className="text-[8px] uppercase tracking-wider text-ink-500">Обсы</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-white">{selected.metrics.obsPlaced}</div>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                  <div className="text-[8px] uppercase tracking-wider text-ink-500">Сентари</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-white">{selected.metrics.senPlaced}</div>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                  <div className="text-[8px] uppercase tracking-wider text-ink-500">Стеки</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-white">{selected.metrics.campsStacked}</div>
                </div>
                <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                  <div className="text-[8px] uppercase tracking-wider text-ink-500">Руны</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-white">{selected.metrics.runePickups}</div>
                </div>
              </div>
              {selected.wardPoints.length > 0 && (
                <div className="mt-2.5">
                  <div className="mb-1 text-[8px] font-bold uppercase tracking-[0.14em] text-ink-500">Варды по времени</div>
                  <div className="flex flex-wrap gap-1">
                    {selected.wardPoints.slice(0, 8).map((ward, index) => (
                      <span
                        key={index}
                        className="rounded border px-1.5 py-0.5 text-[8px] font-medium"
                        style={{
                          borderColor: ward.kind === 'obs' ? 'rgba(201,242,107,0.3)' : 'rgba(183,164,255,0.3)',
                          color: ward.kind === 'obs' ? '#C9F26B' : '#B7A4FF',
                        }}
                      >
                        {fmtTime(ward.time)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Toggle checked={showWards} onChange={setShowWards} label="Показывать варды" />
              <Toggle
                checked={showRadar}
                onChange={setShowRadar}
                label="Варды всех игроков"
                description="Посмотреть общую картину вижна в матче"
              />
            </div>
          </div>

          <div>
            <DotaMap
              height={480}
              heat={layer === 'wards' ? [] : heat}
              heatColor={layer === 'deaths' ? '#FF6B62' : SIDE_COLOR[selected.player.isRadiant ? 'radiant' : 'dire']}
              wards={showWards ? wards : []}
              deaths={deaths}
              showWards={showWards}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <MapLegend />
              <span className="text-[9px] text-ink-500">
                {layer === 'deaths'
                  ? `${deaths.length} смертей в драках`
                  : layer === 'wards'
                    ? `${wards.length} вардов`
                    : hasLane
                      ? `${heat.length} точек позиции`
                      : 'нет данных о позиции'}
              </span>
            </div>
            {!hasLane && layer === 'farm' && (
              <div className="mt-2 rounded-lg border border-gold/20 bg-gold/[0.05] px-3 py-2 text-[10px] leading-relaxed text-gold/90">
                У этого игрока нет данных о передвижении — матч не распарсен. Варды и смерти могут быть доступны.
              </div>
            )}
            {!hasWards && layer === 'wards' && (
              <div className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[10px] leading-relaxed text-ink-400">
                {selected.hasTimeline ? 'Игрок не ставил вардов в этом матче.' : 'Нет данных о вардах: матч не распарсен.'}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-lime" />
            <h3 className="display-title text-base text-white">Вардинг команды</h3>
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-ink-500">
            Сравни, кто реально отвечал за карту, а кто играл «без глаз».
          </p>
          <div className="mt-3 space-y-2">
            {analysis.players
              .filter((item) => item.role >= 4 || item.metrics.obsPlaced + item.metrics.senPlaced > 0)
              .sort((a, b) => b.metrics.wardsPer10 - a.metrics.wardsPer10)
              .map((item) => (
                <div key={item.player.slot} className="flex items-center gap-2.5">
                  <HeroAvatar hero={item.hero} size={24} side={item.player.isRadiant ? 'radiant' : 'dire'} />
                  <span className="w-24 truncate text-[10px] text-ink-200">{item.hero?.localized_name}</span>
                  <div className="flex-1 space-y-1">
                    <div className="flex gap-1">
                      {Array.from({ length: Math.min(12, Math.ceil(item.metrics.obsPlaced / 2)) }).map((_, index) => (
                        <span key={`o-${index}`} className="h-1.5 w-2 rounded-sm bg-lime/70" />
                      ))}
                    </div>
                    <div className="flex gap-1">
                      {Array.from({ length: Math.min(12, Math.ceil(item.metrics.senPlaced / 2)) }).map((_, index) => (
                        <span key={`s-${index}`} className="h-1.5 w-2 rounded-sm bg-violet/70" />
                      ))}
                    </div>
                  </div>
                  <span className="w-16 text-right text-[9px] text-ink-400">
                    {item.metrics.obsPlaced}о / {item.metrics.senPlaced}с
                  </span>
                </div>
              ))}
          </div>
          <div className="mt-3 text-[9px] text-ink-500">
            Лаймовые полоски — обсы, фиолетовые — сентари. Масштаб: одна полоска ≈ 2 варда.
          </div>
        </div>

        <div className="panel p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Skull size={14} className="text-dire" />
            <h3 className="display-title text-base text-white">Смерти по карте</h3>
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-ink-500">
            Разбор твоих смертей в драках: где именно ловили и на какой минуте.
          </p>
          {selected.deathPoints.length === 0 ? (
            <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-6 text-center text-[10.5px] text-ink-400">
              Нет зафиксированных смертей в командных боях — либо игрок не умирал, либо нет парса.
            </div>
          ) : (
            <div className="mt-3 space-y-1.5">
              {selected.deathPoints.slice(0, 10).map((death, index) => (
                <div key={index} className="flex items-center gap-2 rounded-lg bg-white/[0.025] px-2.5 py-1.5 text-[10px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-dire" />
                  <span className="text-ink-300">Смерть на {fmtTime(death.time)}</span>
                  <span className="ml-auto text-[9px] text-ink-500">
                    x {Math.round(death.x)} · y {Math.round(death.y)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {teammates.length > 0 && (
            <div className="mt-4 rounded-lg bg-white/[0.02] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-ink-500">
                <Sparkles size={10} /> Сравни с командой
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {teammates.map((mate) => (
                  <button
                    key={mate.player.slot}
                    type="button"
                    onClick={() => setSelectedSlot(mate.player.slot)}
                    className="chip !py-1 text-[9.5px]"
                  >
                    <HeroAvatar hero={mate.hero} size={14} />
                    {mate.hero?.localized_name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
