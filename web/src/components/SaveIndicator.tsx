import { useEffect, useState } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';
import type { SaveState } from '@/hooks/useAutosave';

const LABEL: Record<SaveState, string> = { idle: '', saving: 'Сохранение…', saved: 'Сохранено', error: 'Ошибка сохранения' };

/** compact — только иконка (для строк таблиц). */
export function SaveIndicator({ state, compact }: { state: SaveState; compact?: boolean }) {
  if (compact) {
    return (
      <span role="status" aria-label={LABEL[state]} title={LABEL[state]} className="inline-flex size-4 items-center justify-center">
        {state === 'saving' && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        {state === 'saved' && <Check className="size-3.5 text-success" />}
        {state === 'error' && <AlertCircle className="size-3.5 text-destructive" />}
      </span>
    );
  }
  return (
    <span role="status" className={state === 'error' ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>
      {LABEL[state]}
    </span>
  );
}

/** Подпись состояния сохранения для окон: «Сохранено» показывается ненадолго и исчезает. */
export function SaveNote({ state, hideAfter = 2000 }: { state: SaveState; hideAfter?: number }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    if (state !== 'saved') return;
    const t = setTimeout(() => setVisible(false), hideAfter);
    return () => clearTimeout(t);
  }, [state, hideAfter]);
  return visible ? <SaveIndicator state={state} /> : <span role="status" />;
}
