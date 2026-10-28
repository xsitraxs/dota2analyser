import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

/**
 * Дымовой прогон страниц в jsdom.
 *
 * ВАЖНО: это НЕ замена E2E. Здесь нет реального браузера: нет слоёв
 * композитинга, настоящих размеров, скринридера и сети. Тест ловит только
 * грубые падения при первом рендере — то, что иначе остается незамеченным
 * до ручного прогона.
 */
async function open(hash: string) {
  window.location.hash = hash;
  render(<App />);
}

describe('страницы рендерятся без падения', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('главная', async () => {
    await open('#/');
    // Превью и карточки демо приходят асинхронно — ждём заголовок раздела.
    await waitFor(() => expect(document.body.textContent ?? '').toContain('Демо-матчи'), { timeout: 10_000 });
    expect(screen.getByText('Загружаю демо-матчи…')).toBeTruthy();
  });

  it('академия', async () => {
    await open('#/academy');
    await waitFor(() => expect(document.body.textContent?.length ?? 0).toBeGreaterThan(50));
  });

  it('прогресс', async () => {
    await open('#/progress');
    await waitFor(() => expect(document.body.textContent?.length ?? 0).toBeGreaterThan(50));
  });

  it('настройки', async () => {
    await open('#/settings');
    await waitFor(() => expect(document.body.textContent?.length ?? 0).toBeGreaterThan(50));
  });

  it('урок', async () => {
    await open('#/lesson/last-hits');
    await waitFor(() => expect(document.body.textContent?.length ?? 0).toBeGreaterThan(50));
  });

  it('некорректный роут не ломает приложение', async () => {
    await open('#/lesson/%');
    await waitFor(() => expect(document.body.textContent?.length ?? 0).toBeGreaterThan(0));
  });

  it('демо-матч открывается (чанк подгружается динамически)', async () => {
    await open('#/match/7490235544/report');
    // Заголовок демо есть только в данных: значит динамический импорт чанка
    // отработал, а нормализация и анализ прошли без исключений.
    await waitFor(() => expect(document.body.textContent ?? '').toContain('47 минут фарма и давления'), {
      timeout: 15_000,
    });
  });
});
