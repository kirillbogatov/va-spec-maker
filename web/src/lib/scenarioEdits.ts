const KEY = 'scenario-edits';

export function readScenarioEdits(): Record<number, number> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Запоминает время последнего изменения сценария (на сервере его нет). */
export function markScenarioEdited(id: number): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readScenarioEdits(), [id]: Date.now() }));
  } catch {
    /* хранилище недоступно — порядок не запомнится */
  }
}
