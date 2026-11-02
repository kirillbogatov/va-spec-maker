import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { reportSave, type SaveState } from '@/lib/saveStore';

export type { SaveState };

/** Сохраняет `value` через `save` спустя `delay` мс после последнего изменения.
 *  Не сохраняет начальное значение. При размонтировании досохраняет ожидающее изменение. */
export function useAutosave<T>(value: T, save: (v: T) => Promise<unknown>, { delay = 700, enabled = true, resetKey = 0 } = {}): SaveState {
  const [state, setState] = useState<SaveState>('idle');
  const id = useId();
  const initial = useRef(value);
  const saveRef = useRef(save);
  saveRef.current = save;
  const pending = useRef<{ v: T } | null>(null);
  const reset = useRef(resetKey);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = (v: T) => {
    const next = queue.current.catch(() => {}).then(() => {
      if (!enabledRef.current) throw new Error('Автосохранение приостановлено');
      return saveRef.current(v);
    });
    queue.current = next;
    return next;
  };

  useEffect(() => {
    if (reset.current !== resetKey) {
      reset.current = resetKey;
      initial.current = value;
      pending.current = null;
      setState('idle');
      return;
    }
    if (!enabled) { pending.current = null; return; }
    if (value === initial.current) return;
    pending.current = { v: value };
    setState('saving');
    const t = setTimeout(() => {
      pending.current = null;
      enqueue(value)
        .then(() => setState('saved'))
        .catch((e: Error) => {
          setState('error');
          toast.error(e.message);
        });
    }, delay);
    return () => clearTimeout(t);
  }, [value, delay, enabled, resetKey]);

  useEffect(() => {
    reportSave(id, state === 'idle' ? null : state);
  }, [id, state]);

  useEffect(
    () => () => {
      reportSave(id, null);
      if (enabledRef.current && pending.current) void enqueue(pending.current.v).catch((e: Error) => toast.error(`Изменения не сохранены: ${e.message}`));
    },
    [id],
  );

  return state;
}
