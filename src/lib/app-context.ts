import { createContext, useContext } from 'react';
import type { HistoryEntry, Settings } from '../types';
import type { Route } from './router';
import type { LessonProgress } from './storage';
import type { IdentityState } from './storage';

export interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

export interface AppContextValue {
  route: Route;
  navigate: (path: string, replace?: boolean) => void;
  settings: Settings;
  updateSettings: (settings: Settings) => void;
  identity: IdentityState;
  markAsMe: (matchId: number, slot: number, accountId: number | null) => void;
  history: HistoryEntry[];
  recordHistory: (entry: HistoryEntry) => void;
  removeHistoryEntry: (matchId: number, slot: number) => void;
  clearHistoryState: () => void;
  resetEverything: () => void;
  lessonProgress: LessonProgress;
  toggleLesson: (lessonId: string, done: boolean) => void;
  notify: (message: string, tone?: ToastItem['tone']) => void;
  toasts: ToastItem[];
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('AppContext не найден');
  return value;
}
