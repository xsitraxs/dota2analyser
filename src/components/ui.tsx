import { useId, type ReactNode } from 'react';
import {
  ATTR_COLOR,
  ATTR_SHORT,
  ROLE_COLOR,
  ROLE_SHORT,
  heroAccent,
  heroGradient,
  heroInitials,
  itemRarityColor,
} from '../lib/constants';
import { ITEM_BY_ID } from '../lib/constants';
import { fmtNum } from '../lib/format';
import type { HeroInfo, Side } from '../types';

export const SIDE_COLOR: Record<Side, string> = {
  radiant: '#5FE08B',
  dire: '#FF6B62',
};

export const SIDE_LABEL: Record<Side, string> = {
  radiant: 'Radiant',
  dire: 'Dire',
};

export function HeroAvatar({
  hero,
  size = 40,
  side,
  className = '',
  muted = false,
}: {
  hero: HeroInfo | null;
  size?: number;
  side?: Side | null;
  className?: string;
  muted?: boolean;
}) {
  const gradient = hero ? heroGradient(hero.id, hero.primary_attr) : 'linear-gradient(145deg,#24332e,#0a0f0d)';
  return (
    <div
      className={`hero-avatar ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.27),
        background: gradient,
        opacity: muted ? 0.65 : 1,
      }}
      title={hero ? `${hero.localized_name} · ${ATTR_SHORT[hero.primary_attr] ?? ''}` : undefined}
    >
      <span style={{ fontSize: Math.max(9, size * 0.245) }}>{hero ? heroInitials(hero.localized_name) : '?'}</span>
      {side && (
        <span
          className="absolute bottom-0 right-0 rounded-full"
          style={{
            width: Math.max(8, size * 0.2),
            height: Math.max(8, size * 0.2),
            background: SIDE_COLOR[side],
            border: `2px solid #0A0F0D`,
          }}
        />
      )}
    </div>
  );
}

export function ItemSquare({ id, size = 26, title }: { id: number; size?: number; title?: string }) {
  const item = ITEM_BY_ID[id];
  if (!item) return null;
  const color = itemRarityColor(item);
  return (
    <div
      className="grid flex-shrink-0 place-items-center rounded-md border text-[8px] font-bold uppercase leading-none"
      style={{
        width: size,
        height: size,
        borderColor: `${color}55`,
        color,
        background: `linear-gradient(145deg, ${color}22, ${color}0a)`,
      }}
      title={title ?? `${item.dname} · ${fmtNum(item.cost)}`}
    >
      {item.dname
        .replace(/^Recipe:\s*/i, '')
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')}
    </div>
  );
}

export function ScoreRing({
  value,
  size = 96,
  stroke = 7,
  showGrade = false,
  grade,
  label,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  showGrade?: boolean;
  grade?: string;
  label?: string;
}) {
  const id = useId().replace(/:/g, '');
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalized = value == null ? 0 : Math.max(0, Math.min(100, value));
  const offset = circumference - (normalized / 100) * circumference;
  const color =
    value == null ? '#64756E' : normalized >= 78 ? '#C9F26B' : normalized >= 62 ? '#5FE08B' : normalized >= 45 ? '#E9C46A' : '#FF6B62';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#ring-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display font-semibold leading-none text-white" style={{ fontSize: size * 0.27 }}>
          {value == null ? '—' : Math.round(value)}
        </span>
        {label && <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-400">{label}</span>}
        {showGrade && grade && (
          <span className="mt-0.5 text-[10px] font-bold" style={{ color }}>
            {grade}
          </span>
        )}
      </div>
    </div>
  );
}

export function GradeBadge({ grade, color = '#C9F26B' }: { grade: string; color?: string }) {
  return (
    <span
      className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border px-1.5 font-display text-xs font-semibold"
      style={{ borderColor: `${color}45`, background: `${color}14`, color }}
    >
      {grade}
    </span>
  );
}

export function RoleBadge({ role, short = false }: { role: number; short?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ borderColor: `${ROLE_COLOR[role]}33`, background: `${ROLE_COLOR[role]}12`, color: ROLE_COLOR[role] }}
    >
      {short ? ROLE_SHORT[role] : `P${role}`}
    </span>
  );
}

export function TeamLabel({ side, dot = true, className = '' }: { side: Side; dot?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${className}`} style={{ color: SIDE_COLOR[side] }}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: SIDE_COLOR[side] }} />}
      {SIDE_LABEL[side]}
    </span>
  );
}

export function Property({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon && <span className="text-ink-400">{icon}</span>}
      <div>
        <div className="label">{label}</div>
        <div className="mt-0.5 text-sm font-semibold text-white">{value}</div>
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  color,
  icon,
  className = '',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`panel-soft p-4 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="label">{label}</span>
        {icon && <span style={{ color: color ?? '#91A69D' }}>{icon}</span>}
      </div>
      <div className="stat-value mt-2.5" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[11px] leading-relaxed text-ink-400">{sub}</div>}
    </div>
  );
}

export function Bar({
  value,
  max = 100,
  color = '#C9F26B',
  height = 6,
  className = '',
}: {
  value: number | null;
  max?: number;
  color?: string;
  height?: number;
  className?: string;
}) {
  const width = value == null ? 0 : Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div className={`overflow-hidden rounded-full bg-white/[0.06] ${className}`} style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${width}%`, background: color, boxShadow: `0 0 12px ${color}55` }}
      />
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className = '',
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 ${className}`}>
      <div>
        {eyebrow && <div className="kicker mb-1.5">{eyebrow}</div>}
        <h2 className="display-title text-xl text-white sm:text-2xl">{title}</h2>
        {description && <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-400">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`panel flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}>
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-lime">
        {icon}
      </div>
      <h3 className="font-display text-lg text-white">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex w-full cursor-pointer items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 text-left transition hover:border-white/[0.12]"
    >
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-400">{description}</span>}
      </span>
      <span
        className="relative mt-0.5 h-5 w-9 flex-shrink-0 rounded-full transition"
        style={{ background: checked ? '#C9F26B' : 'rgba(255,255,255,0.14)' }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-ink-950 transition-all"
          style={{ left: checked ? 18 : 2 }}
        />
      </span>
    </button>
  );
}

export function HeroStat({ hero, label }: { hero: HeroInfo; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] font-semibold text-ink-200"
      title={label}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: heroAccent(hero.id, hero.primary_attr) }} />
      {label}
    </span>
  );
}

export function AttributeHint({ attr }: { attr: string }) {
  return (
    <span className="text-[10px] font-semibold" style={{ color: ATTR_COLOR[attr] ?? '#91A69D' }}>
      {ATTR_SHORT[attr] ?? ''}
    </span>
  );
}

export function MiniLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-[10px] font-medium text-ink-400">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
