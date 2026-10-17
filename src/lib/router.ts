import { useEffect, useState } from 'react';

export type MatchTab = 'overview' | 'players' | 'timeline' | 'map' | 'report';

export type Route =
  | { name: 'home' }
  | { name: 'match'; id: number; tab: MatchTab; slot?: number }
  | { name: 'academy' }
  | { name: 'lesson'; lessonId: string }
  | { name: 'progress' }
  | { name: 'settings' };

const TABS: MatchTab[] = ['overview', 'players', 'timeline', 'map', 'report'];

export function parseHash(hash: string): Route {
  const clean = (hash || '').replace(/^#/, '');
  const parts = clean.split('/').filter(Boolean);
  if (!parts.length) return { name: 'home' };
  if (parts[0] === 'match' && parts[1] && /^\d+$/.test(parts[1])) {
    const id = Number(parts[1]);
    const tab = TABS.includes(parts[2] as MatchTab) ? (parts[2] as MatchTab) : 'overview';
    const slot = parts[3] && /^\d+$/.test(parts[3]) ? Number(parts[3]) : undefined;
    return { name: 'match', id, tab, slot };
  }
  if (parts[0] === 'academy') return { name: 'academy' };
  if (parts[0] === 'lesson' && parts[1]) return { name: 'lesson', lessonId: decodeURIComponent(parts[1]) };
  if (parts[0] === 'progress') return { name: 'progress' };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'home' };
}

export function useHashRoute(): [Route, (path: string, replace?: boolean) => void, string] {
  const [hash, setHash] = useState<string>(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = (path: string, replace = false) => {
    const normalized = path.startsWith('#') ? path : `#/${path.replace(/^\/+/, '')}`;
    if (replace) {
      window.history.replaceState(null, '', normalized);
      setHash(normalized);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else if (window.location.hash === normalized) {
      setHash(normalized);
    } else {
      window.location.hash = normalized;
    }
  };
  return [parseHash(hash), navigate, hash];
}

export function matchPath(id: number, tab: MatchTab = 'overview', slot?: number): string {
  return `/match/${id}/${tab}${slot != null ? `/${slot}` : ''}`;
}
