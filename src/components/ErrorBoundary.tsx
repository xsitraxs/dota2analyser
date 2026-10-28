import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Дополнительный сброс состояния при восстановлении интерфейса. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Верхнеуровневый Error Boundary.
 *
 * Это страховка, а не замена валидации: кривой hash или неожиданный JSON
 * должен обрабатываться штатно, но если исключение всё же дошло до рендера,
 * приложение должно показать понятный экран с кнопкой восстановления,
 * а не белую страницу.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Подробности остаются в консоли: в интерфейсе они пользователю не нужны.
    console.error('Необработанная ошибка интерфейса:', error, info.componentStack);
  }

  private reset = (): void => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  private reload = (): void => {
    try {
      window.location.hash = '#/';
      window.location.reload();
    } catch {
      this.setState({ error: null });
    }
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto mt-10 max-w-[560px] px-4">
        <div className="panel p-6">
          <div className="flex items-center gap-2 text-gold">
            <TriangleAlert size={18} />
            <h1 className="display-title text-lg text-white">Интерфейс не отрисовался</h1>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-400">
            Произошла непредвиденная ошибка. Данные в браузере не изменялись — можно вернуться к последнему экрану
            или перезапустить приложение.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-white/[0.08] bg-ink-950/60 p-3 text-[10.5px] leading-relaxed text-ink-400">
            {String(error.message ?? error)}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={this.reset} className="btn-primary text-xs">
              <RefreshCw size={13} /> Попробовать снова
            </button>
            <button type="button" onClick={this.reload} className="btn-secondary text-xs">
              На главную и перезапустить
            </button>
          </div>
        </div>
      </div>
    );
  }
}
