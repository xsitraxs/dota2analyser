import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { fmtCompact } from '../lib/format';

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartMarker {
  x: number;
  color: string;
  label: string;
}

interface LineChartProps {
  points: ChartPoint[];
  height?: number;
  color?: string;
  valueFormat?: (value: number) => string;
  xFormat?: (value: number) => string;
  zeroBaseline?: boolean;
  symmetric?: boolean;
  markers?: ChartMarker[];
  className?: string;
  emptyText?: string;
  /** Подпись для скринридеров: что именно показывает график. */
  label?: string;
  /** Единицы по оси X для подсказки «используй стрелки». */
  xLabel?: string;
}

export function LineChart({
  points,
  height = 260,
  color = '#C9F26B',
  valueFormat = (value) => fmtCompact(value),
  xFormat = (value) => `${Math.round(value)}м`,
  zeroBaseline = false,
  symmetric = false,
  markers = [],
  className = '',
  emptyText = 'Недостаточно данных для графика',
  label = 'График',
  xLabel = 'время',
}: LineChartProps) {
  const id = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 720;
      setWidth(Math.max(280, nextWidth));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const sorted = useMemo(
    () =>
      [...points]
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
        .sort((a, b) => a.x - b.x),
    [points],
  );

  if (sorted.length < 2) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-white/[0.015] px-4 text-center text-xs text-ink-400 ${className}`}
        style={{ height }}
      >
        {emptyText}
      </div>
    );
  }

  const pad = { l: 46, r: 12, t: 16, b: 25 };
  const plotW = Math.max(10, width - pad.l - pad.r);
  const plotH = Math.max(10, height - pad.t - pad.b);

  const xs = sorted.map((point) => point.x);
  const ys = sorted.map((point) => point.y);
  const minX = xs[0];
  const maxX = xs[xs.length - 1];
  let minY: number;
  let maxY: number;
  if (symmetric) {
    const maxAbs = Math.max(Math.abs(Math.min(...ys)), Math.abs(Math.max(...ys)), 1);
    minY = -maxAbs * 1.08;
    maxY = maxAbs * 1.08;
  } else {
    minY = zeroBaseline ? Math.min(0, ...ys) : Math.min(...ys);
    maxY = zeroBaseline ? Math.max(0, ...ys) : Math.max(...ys);
    if (minY === maxY) {
      minY -= 1;
      maxY += 1;
    }
    const padY = (maxY - minY) * 0.08;
    minY -= padY;
    maxY += padY;
  }

  const sx = (x: number) => pad.l + ((x - minX) / (maxX - minX || 1)) * plotW;
  const sy = (y: number) => pad.t + (1 - (y - minY) / (maxY - minY || 1)) * plotH;

  const path = sorted.map((point, index) => `${index === 0 ? 'M' : 'L'}${sx(point.x).toFixed(2)},${sy(point.y).toFixed(2)}`).join(' ');
  const baseline = zeroBaseline ? Math.min(0, maxY) : minY;
  const area = `${path} L${sx(maxX).toFixed(2)},${sy(baseline).toFixed(2)} L${sx(minX).toFixed(2)},${sy(baseline).toFixed(2)} Z`;

  const yTicks = Array.from({ length: 4 }, (_, index) => minY + ((maxY - minY) / 3) * index);
  const xTicks = Array.from({ length: 4 }, (_, index) => minX + ((maxX - minX) / 3) * index);

  /**
   * Индекс ближайшей по X точки.
   *
   * Раньше индекс считался как «доля ширины × число точек», поэтому на
   * неравномерных временных рядах подсказка показывала соседний момент.
   */
  const indexAtX = (px: number): number => {
    if (!sorted.length) return 0;
    const clampedX = Math.max(pad.l, Math.min(pad.l + plotW, px));
    const value = minX + ((clampedX - pad.l) / plotW) * (maxX - minX);
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index < sorted.length; index += 1) {
      const distance = Math.abs(sorted[index].x - value);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  };

  const handleMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHover(indexAtX(event.clientX - rect.left));
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    event.preventDefault();
    setHover((current) => {
      const base = current ?? 0;
      if (event.key === 'Home') return 0;
      if (event.key === 'End') return sorted.length - 1;
      const next = event.key === 'ArrowLeft' ? base - 1 : base + 1;
      return Math.max(0, Math.min(sorted.length - 1, next));
    });
  };

  const hovered = hover != null ? sorted[Math.min(sorted.length - 1, Math.max(0, hover))] : null;
  const hoverLeft = hovered ? sx(hovered.x) : 0;
  const hoverTop = hovered ? sy(hovered.y) : 0;
  const tooltipLeft = Math.min(Math.max(hoverLeft, 62), width - 62);

  return (
    <div ref={wrapRef} className={`relative select-none ${className}`} style={{ height }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover((current) => current ?? 0)}
        onBlur={() => setHover(null)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="img"
        aria-label={`${label}. Стрелки влево/вправо — перебор точек по ${xLabel}.`}
      >
        <defs>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.26" />
            <stop offset="70%" stopColor={color} stopOpacity="0.05" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`line-${id}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.65" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              x1={pad.l}
              x2={width - pad.r}
              y1={sy(tick)}
              y2={sy(tick)}
              stroke="rgba(255,255,255,0.055)"
              strokeDasharray="3 5"
            />
            <text x={pad.l - 8} y={sy(tick) + 3} textAnchor="end" fontSize="9.5" fill="#64756E">
              {valueFormat(tick)}
            </text>
          </g>
        ))}

        {xTicks.map((tick, index) => (
          <text
            key={`x-${tick}`}
            x={sx(tick)}
            y={height - 7}
            textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}
            fontSize="9.5"
            fill="#64756E"
          >
            {xFormat(tick)}
          </text>
        ))}

        {zeroBaseline && minY < 0 && maxY > 0 && (
          <line x1={pad.l} x2={width - pad.r} y1={sy(0)} y2={sy(0)} stroke="rgba(255,255,255,0.16)" />
        )}

        {markers
          .filter((marker) => marker.x >= minX && marker.x <= maxX)
          .slice(0, 16)
          .map((marker) => (
            <g key={`${marker.label}-${marker.x}`}>
              <line
                x1={sx(marker.x)}
                x2={sx(marker.x)}
                y1={pad.t}
                y2={height - pad.b}
                stroke={marker.color}
                strokeOpacity="0.25"
                strokeDasharray="2 4"
              />
              <circle cx={sx(marker.x)} cy={pad.t + 1} r="2.6" fill={marker.color} opacity="0.9">
                <title>{marker.label}</title>
              </circle>
            </g>
          ))}

        <path d={area} fill={`url(#area-${id})`} />
        <path d={path} fill="none" stroke={`url(#line-${id})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {hovered && (
          <g pointerEvents="none">
            <line
              x1={hoverLeft}
              x2={hoverLeft}
              y1={pad.t}
              y2={height - pad.b}
              stroke="rgba(255,255,255,0.28)"
              strokeDasharray="3 3"
            />
            <circle cx={hoverLeft} cy={hoverTop} r="4.5" fill="#0A0F0D" stroke={color} strokeWidth="2" />
          </g>
        )}
      </svg>

      {hovered && (
        <div
          className="tooltip"
          role="status"
          style={{
            left: tooltipLeft,
            top: Math.max(30, hoverTop - 12),
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="text-[9px] uppercase tracking-wider text-ink-400">{xFormat(hovered.x)}</div>
          <div className="mt-0.5 font-semibold" style={{ color }}>
            {valueFormat(hovered.y)}
          </div>
        </div>
      )}

      {/* Табличная альтернатива: значения доступны без наведения мыши. */}
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{xLabel}</th>
            <th scope="col">Значение</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((point) => (
            <tr key={`row-${point.x}`}>
              <th scope="row">{xFormat(point.x)}</th>
              <td>{valueFormat(point.y)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Sparkline({
  values,
  color = '#C9F26B',
  height = 46,
  className = '',
}: {
  values: number[];
  color?: string;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) {
    return <div className={`flex items-end text-[10px] text-ink-400 ${className}`} style={{ height }}>Нет динамики</div>;
  }
  const width = 220;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => `${(index / (values.length - 1)) * width},${height - 4 - ((value - min) / range) * (height - 8)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} style={{ height, width: '100%' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline
        points={`0,${height} ${points} ${width},${height}`}
        fill={`${color}14`}
        stroke="none"
      />
    </svg>
  );
}

export interface RadarValue {
  key: string;
  label: string;
  value: number | null;
}

export function RadarChart({
  values,
  size = 300,
  color = '#C9F26B',
}: {
  values: RadarValue[];
  size?: number;
  color?: string;
}) {
  const cx = 160;
  const cy = 148;
  const radius = 92;
  const count = Math.max(3, values.length);
  const angle = (index: number) => -Math.PI / 2 + (index * Math.PI * 2) / count;
  const point = (index: number, ratio: number) => ({
    x: cx + Math.cos(angle(index)) * radius * ratio,
    y: cy + Math.sin(angle(index)) * radius * ratio,
  });

  const polygon = (ratio: number) =>
    values
      .map((_, index) => {
        const p = point(index, ratio);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(' ');

  const valuePolygon = values
    .map((item, index) => {
      const p = point(index, Math.max(0, Math.min(1, (item.value ?? 0) / 100)));
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox="0 0 320 290" style={{ width: '100%', maxWidth: size }} className="mx-auto overflow-visible">
      {[0.25, 0.5, 0.75, 1].map((ratio) => (
        <polygon
          key={ratio}
          points={polygon(ratio)}
          fill="none"
          stroke={ratio === 1 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'}
          strokeWidth="1"
        />
      ))}
      {values.map((_, index) => {
        const p = point(index, 1);
        return <line key={index} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.06)" />;
      })}
      <polygon points={valuePolygon} fill={`${color}24`} stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      {values.map((item, index) => {
        const p = point(index, Math.max(0, Math.min(1, (item.value ?? 0) / 100)));
        return <circle key={item.key} cx={p.x} cy={p.y} r="2.8" fill={color} />;
      })}
      {values.map((item, index) => {
        const p = point(index, 1.2);
        const cos = Math.cos(angle(index));
        const anchor = Math.abs(cos) < 0.22 ? 'middle' : cos > 0 ? 'start' : 'end';
        return (
          <g key={item.key}>
            <text x={p.x} y={p.y} textAnchor={anchor} fontSize="9.5" fontWeight="600" fill="#B0C4BB">
              {item.label}
            </text>
            <text x={p.x} y={p.y + 12} textAnchor={anchor} fontSize="9" fill={item.value == null ? '#64756E' : color}>
              {item.value == null ? '—' : Math.round(item.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function DualBar({
  left,
  right,
  leftLabel,
  rightLabel,
  leftColor = '#5FE08B',
  rightColor = '#FF6B62',
}: {
  left: number;
  right: number;
  leftLabel: string;
  rightLabel: string;
  leftColor?: string;
  rightColor?: string;
}) {
  const total = Math.max(1, left + right);
  const leftPct = (left / total) * 100;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold">
        <span style={{ color: leftColor }}>{leftLabel}</span>
        <span style={{ color: rightColor }}>{rightLabel}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.05]">
        <div style={{ width: `${leftPct}%`, background: leftColor }} />
        <div style={{ width: `${100 - leftPct}%`, background: rightColor }} />
      </div>
    </div>
  );
}
