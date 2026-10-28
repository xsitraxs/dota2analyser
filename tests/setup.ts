import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Общая подготовка тестового окружения (jsdom).
 *
 * В jsdom нет matchMedia и ResizeObserver — компоненты графиков и layout
 * используют их через опциональные проверки, но явные заглушки делают
 * тесты детерминированными.
 */
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  }

  // jsdom не реализует scrollTo и выбрасывает «Not implemented» на каждый вызов.
  window.scrollTo = ((options?: ScrollToOptions | number, y?: number) => {
    void options;
    void y;
  }) as typeof window.scrollTo;

  if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
  }
}

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* storage может быть недоступен */
  }
});
