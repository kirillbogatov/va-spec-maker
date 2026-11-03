import { AlertCircle, Loader2 } from 'lucide-react';
import type { SaveState } from '@/hooks/useAutosave';

const LABEL = { saving: 'Сохранение…', error: 'Ошибка сохранения' };

/** compact — только иконка (для строк таблиц). */
export function SaveIndicator({ state, compact }: { state: SaveState; compact?: boolean }) {
  if (state === 'idle' || state === 'saved') return null;
  if (compact) {
    return (
      <span role="status" aria-label={LABEL[state]} title={LABEL[state]} className="inline-flex size-4 items-center justify-center">
        {state === 'saving' && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
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

export function SaveNote({ state }: { state: SaveState }) {
  return <SaveIndicator state={state} />;
}
