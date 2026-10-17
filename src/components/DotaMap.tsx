import type { WardPoint } from '../types';

export interface HeatPoint {
  x: number;
  y: number;
  weight: number;
}

interface DotaMapProps {
  heat?: HeatPoint[];
  heatColor?: string;
  wards?: (WardPoint & { kind: 'obs' | 'sen' })[];
  deaths?: { x: number; y: number; time: number }[];
  height?: number;
  className?: string;
  showHeat?: boolean;
  showWards?: boolean;
  showDeaths?: boolean;
}

const SIZE = 512;

const CELL_MIN = 64;
const CELL_SPAN = 128;

function project(value: number): number {
  const ratio = (value - CELL_MIN) / CELL_SPAN;
  return Math.max(-6, Math.min(SIZE + 6, ratio * SIZE));
}

function toScreen(x: number, y: number): { x: number; y: number } {
  return { x: project(x), y: SIZE - project(y) };
}

export function DotaMap({
  heat = [],
  heatColor = '#5FE08B',
  wards = [],
  deaths = [],
  height = 520,
  className = '',
  showHeat = true,
  showWards = true,
  showDeaths = true,
}: DotaMapProps) {
  const maxWeight = Math.max(1, ...heat.map((point) => point.weight));
  const sortedHeat = [...heat].sort((a, b) => b.weight - a.weight).slice(0, 260);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/[0.07] ${className}`} style={{ height }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full" role="img" aria-label="Карта Dota">
        <defs>
          <radialGradient id="map-bg" cx="35%" cy="65%" r="80%">
            <stop offset="0%" stopColor="#16241E" />
            <stop offset="55%" stopColor="#0E1714" />
            <stop offset="100%" stopColor="#080C0B" />
          </radialGradient>
          <linearGradient id="map-territory" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#5FE08B" stopOpacity="0.10" />
            <stop offset="45%" stopColor="#5FE08B" stopOpacity="0.015" />
            <stop offset="55%" stopColor="#FF6B62" stopOpacity="0.015" />
            <stop offset="100%" stopColor="#FF6B62" stopOpacity="0.09" />
          </linearGradient>
          <linearGradient id="river-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1B4762" />
            <stop offset="50%" stopColor="#12384F" />
            <stop offset="100%" stopColor="#0E2C3E" />
          </linearGradient>
          <radialGradient id="base-radiant" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5FE08B" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#5FE08B" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="base-dire" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF6B62" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#FF6B62" stopOpacity="0" />
          </radialGradient>
          <filter id="heat-blur" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <filter id="soft-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="map-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="rgba(255,255,255,0.028)" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width={SIZE} height={SIZE} fill="url(#map-bg)" />
        <rect width={SIZE} height={SIZE} fill="url(#map-territory)" />
        <rect width={SIZE} height={SIZE} fill="url(#map-grid)" />

        {/* лесные массивы */}
        <g opacity="0.5">
          {[
            [145, 175, 42],
            [100, 210, 32],
            [190, 300, 38],
            [265, 350, 34],
            [330, 245, 30],
            [365, 175, 38],
            [300, 130, 30],
            [230, 110, 28],
          ].map(([x, y, r], index) => (
            <circle key={index} cx={x} cy={y} r={r} fill="#1A2B23" opacity="0.55" />
          ))}
        </g>

        {/* река */}
        <path
          d="M 18 86 C 110 145 200 210 280 272 C 350 326 430 368 500 398"
          fill="none"
          stroke="url(#river-grad)"
          strokeWidth="32"
          strokeLinecap="round"
          opacity="0.95"
        />
        <path
          d="M 18 86 C 110 145 200 210 280 272 C 350 326 430 368 500 398"
          fill="none"
          stroke="rgba(127,181,255,0.18)"
          strokeWidth="2"
          strokeDasharray="2 10"
          strokeLinecap="round"
        />

        {/* линии */}
        <g fill="none" stroke="#2C3E36" strokeLinecap="round">
          <path d="M 92 438 C 42 376 30 260 52 126 C 70 60 132 30 240 28 C 348 26 428 40 452 76" strokeWidth="30" opacity="0.55" />
          <path d="M 84 438 C 150 486 264 500 372 480 C 448 464 476 402 472 300 C 470 212 460 120 452 80" strokeWidth="30" opacity="0.55" />
          <path d="M 84 432 L 256 256 L 430 82" strokeWidth="26" opacity="0.6" />
        </g>
        <g fill="none" stroke="#3A4F45" strokeLinecap="round" opacity="0.55">
          <path d="M 92 438 C 42 376 30 260 52 126 C 70 60 132 30 240 28 C 348 26 428 40 452 76" strokeWidth="1.5" strokeDasharray="4 9" />
          <path d="M 84 438 C 150 486 264 500 372 480 C 448 464 476 402 472 300 C 470 212 460 120 452 80" strokeWidth="1.5" strokeDasharray="4 9" />
          <path d="M 84 432 L 256 256 L 430 82" strokeWidth="1.5" strokeDasharray="4 9" />
        </g>

        {/* базы */}
        <circle cx="54" cy="452" r="78" fill="url(#base-radiant)" />
        <circle cx="460" cy="64" r="72" fill="url(#base-dire)" />
        <g transform="translate(54 452)">
          <polygon points="0,-18 17,0 0,18 -17,0" fill="#0A0F0D" stroke="#5FE08B" strokeWidth="2" />
          <circle r="4" fill="#5FE08B" />
        </g>
        <g transform="translate(458 64)">
          <polygon points="0,-18 17,0 0,18 -17,0" fill="#0A0F0D" stroke="#FF6B62" strokeWidth="2" />
          <circle r="4" fill="#FF6B62" />
        </g>
        <text x="90" y="480" fill="#5FE08B" fontSize="11" fontWeight="700" letterSpacing="2" opacity="0.8">
          RADIANT
        </text>
        <text x="430" y="42" fill="#FF6B62" fontSize="11" fontWeight="700" letterSpacing="2" textAnchor="end" opacity="0.8">
          DIRE
        </text>

        {/* рошан и руны */}
        <g>
          <ellipse cx="198" cy="206" rx="24" ry="18" fill="#0A1210" stroke="#3A4F45" strokeWidth="1.5" />
          <ellipse cx="198" cy="206" rx="13" ry="9" fill="#141E1A" stroke="#C9F26B" strokeWidth="1" opacity="0.8" />
          <text x="198" y="248" fill="#91A69D" fontSize="9" fontWeight="600" textAnchor="middle" letterSpacing="1">
            ROSHAN
          </text>
        </g>
        <g>
          <circle cx="138" cy="192" r="8" fill="#0A0F0D" stroke="#7FB5FF" strokeWidth="1.4" />
          <path d="M138 186v12M132 192h12" stroke="#7FB5FF" strokeWidth="1.2" />
          <circle cx="356" cy="338" r="8" fill="#0A0F0D" stroke="#7FB5FF" strokeWidth="1.4" />
          <path d="M356 332v12M350 338h12" stroke="#7FB5FF" strokeWidth="1.2" />
        </g>

        {/* лесные лагеря */}
        <g fill="#3C5549" opacity="0.55">
          {[
            [150, 250], [185, 330], [115, 300], [220, 380], [290, 430], [320, 300], [370, 230], [330, 180], [270, 140], [410, 300],
          ].map(([x, y], index) => (
            <circle key={index} cx={x} cy={y} r="2.4" />
          ))}
        </g>

        {/* heatmap */}
        {showHeat && sortedHeat.length > 0 && (
          <g filter="url(#heat-blur)" opacity="0.8">
            {sortedHeat.map((point, index) => {
              const screen = toScreen(point.x, point.y);
              const weight = Math.max(0.12, point.weight / maxWeight);
              return (
                <circle
                  key={index}
                  cx={screen.x}
                  cy={screen.y}
                  r={7 + weight * 17}
                  fill={heatColor}
                  opacity={0.06 + weight * 0.24}
                />
              );
            })}
          </g>
        )}

        {/* варды */}
        {showWards &&
          wards.map((ward, index) => {
            const screen = toScreen(ward.x, ward.y);
            const isObs = ward.kind === 'obs';
            return (
              <g key={`${ward.kind}-${ward.time}-${index}`} filter="url(#soft-glow)">
                {isObs ? (
                  <circle cx={screen.x} cy={screen.y} r="4.4" fill="#0A0F0D" stroke="#C9F26B" strokeWidth="1.8" opacity="0.95">
                    <title>{`Обс · ${Math.floor(ward.time / 60)}:${String(Math.round(ward.time % 60)).padStart(2, '0')}`}</title>
                  </circle>
                ) : (
                  <rect
                    x={screen.x - 3.6}
                    y={screen.y - 3.6}
                    width="7.2"
                    height="7.2"
                    transform={`rotate(45 ${screen.x} ${screen.y})`}
                    fill="#0A0F0D"
                    stroke="#B7A4FF"
                    strokeWidth="1.7"
                    opacity="0.95"
                  >
                    <title>{`Сентари · ${Math.floor(ward.time / 60)}:${String(Math.round(ward.time % 60)).padStart(2, '0')}`}</title>
                  </rect>
                )}
              </g>
            );
          })}

        {/* смерти в драках */}
        {showDeaths &&
          deaths.map((death, index) => {
            const screen = toScreen(death.x, death.y);
            return (
              <g key={`death-${death.time}-${index}`} opacity="0.9">
                <circle cx={screen.x} cy={screen.y} r="7" fill="#FF6B62" opacity="0.12" />
                <path
                  d={`M${screen.x - 3} ${screen.y - 3}l6 6M${screen.x + 3} ${screen.y - 3}l-6 6`}
                  stroke="#FF6B62"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <title>{`Смерть · ${Math.floor(death.time / 60)}-я минута`}</title>
                </path>
              </g>
            );
          })}

        {/* рамка */}
        <rect x="1" y="1" width={SIZE - 2} height={SIZE - 2} rx="14" fill="none" stroke="rgba(255,255,255,0.07)" />
      </svg>
    </div>
  );
}
