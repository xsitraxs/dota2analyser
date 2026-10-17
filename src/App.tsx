import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layout, ToastViewport } from './components/Layout';
import { AppContext, type ToastItem } from './lib/app-context';
import { useHashRoute } from './lib/router';
import {
  addHistory,
  clearHistory,
  loadHistory,
  loadIdentity,
  loadLessonProgress,
  loadSettings,
  rememberPlayerSlot,
  removeHistory,
  saveSettings,
  setLessonDone,
} from './lib/storage';
import type { HistoryEntry, Settings } from './types';
import HomePage from './views/HomePage';
import MatchPage from './views/MatchPage';
import AcademyPage from './views/AcademyPage';
import LessonPage from './views/LessonPage';
import ProgressPage from './views/ProgressPage';
import SettingsPage from './views/SettingsPage';

export default function App() {
  const [route, navigate, hash] = useHashRoute();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [lessonProgress, setLessonProgress] = useState(() => loadLessonProgress());
  const [identity, setIdentity] = useState(() => loadIdentity());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastCounter = useRef(0);

  const notify = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = ++toastCounter.current;
    setToasts((current) => [...current.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5200);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motion = settings.reduceMotion ? 'reduce' : 'default';
  }, [settings.reduceMotion]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [hash]);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const markAsMe = useCallback(
    (matchId: number, slot: number, accountId: number | null) => {
      const next = rememberPlayerSlot(matchId, slot, accountId);
      setIdentity({ ...next });
      notify('Отлично! Теперь этот игрок будет открываться первым.', 'success');
    },
    [notify],
  );

  const recordHistory = useCallback((entry: HistoryEntry) => {
    const next = addHistory(entry);
    setHistory(next);
  }, []);

  const removeHistoryEntry = useCallback((matchId: number, slot: number) => {
    const next = removeHistory(matchId, slot);
    setHistory(next);
  }, []);

  const clearHistoryState = useCallback(() => {
    clearHistory();
    setHistory([]);
  }, []);

  const toggleLesson = useCallback((lessonId: string, done: boolean) => {
    const next = setLessonDone(lessonId, done);
    setLessonProgress({ ...next });
  }, []);

  const value = useMemo(
    () => ({
      route,
      navigate,
      settings,
      updateSettings,
      identity,
      markAsMe,
      history,
      recordHistory,
      removeHistoryEntry,
      clearHistoryState,
      lessonProgress,
      toggleLesson,
      notify,
      toasts,
    }),
    [
      route,
      navigate,
      settings,
      updateSettings,
      identity,
      markAsMe,
      history,
      recordHistory,
      removeHistoryEntry,
      clearHistoryState,
      lessonProgress,
      toggleLesson,
      notify,
      toasts,
    ],
  );

  return (
    <AppContext.Provider value={value}>
      <Layout>
        {route.name === 'home' && <HomePage />}
        {route.name === 'match' && <MatchPage route={route} />}
        {route.name === 'academy' && <AcademyPage />}
        {route.name === 'lesson' && <LessonPage lessonId={route.lessonId} />}
        {route.name === 'progress' && <ProgressPage />}
        {route.name === 'settings' && <SettingsPage />}
      </Layout>
      <ToastViewport />
    </AppContext.Provider>
  );
}
