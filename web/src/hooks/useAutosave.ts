import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { reportSave, type SaveState } from '@/lib/saveStore';

export type { SaveState };

/** Сохраняет `value` через `save` спустя `delay` мс после последнего изменения.
 *  Не сохраняет начальное значение. При размонтировании досохраняет ожидающее изменение. */
export function useAutosave<T>(value: T, save: (v: T) => Promise<unknown>, { delay = 700 } = {}): SaveState {
  const [state, setState] = useState<SaveState>('idle');
  const id = useId();
  const initial = useRef(value);
  const saveRef = useRef(save);
  saveRef.current = save;
  const pending = useRef<{ v: T } | null>(null);

  useEffect(() => {
    if (value === initial.current) return;
    pending.current = { v: value };
    setState('saving');
    const t = setTimeout(() => {
      pending.current = null;
      saveRef
        .current(value)
        .then(() => setState('saved'))
        .catch((e: Error) => {
          setState('error');
          toast.error(e.message);
        });
    }, delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  useEffect(() => {
    reportSave(id, state === 'idle' ? null : state);
  }, [id, state]);

  useEffect(
    () => () => {
      reportSave(id, null);
      if (pending.current) void saveRef.current(pending.current.v).catch((e: Error) => toast.error(`Изменения не сохранены: ${e.message}`));
    },
    [id],
  );

  return state;
}
