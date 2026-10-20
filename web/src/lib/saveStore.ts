import { useSyncExternalStore } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Состояния всех автосохранений на странице: нужны для общего индикатора и защиты от закрытия вкладки. */
const states = new Map<string, SaveState>();
const listeners = new Set<() => void>();
let snapshot = { saving: 0, error: 0 };

function emit() {
  let saving = 0;
  let error = 0;
  for (const s of states.values()) {
    if (s === 'saving') saving++;
    else if (s === 'error') error++;
  }
  if (saving !== snapshot.saving || error !== snapshot.error) {
    snapshot = { saving, error };
    listeners.forEach((l) => l());
  }
}

export function reportSave(id: string, state: SaveState | null) {
  if (state === null) states.delete(id);
  else states.set(id, state);
  emit();
}

export function useSaveSummary() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}
