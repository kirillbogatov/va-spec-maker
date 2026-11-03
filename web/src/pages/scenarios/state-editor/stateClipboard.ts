import { uniqueStateName } from '@/lib/fsm';
import { splitNext } from '@/lib/states';
import type { Layout, StateInfo, Step } from '@/lib/types';

interface CopiedState { type: 'va-spec-maker/state'; version: 1; name: string; info: StateInfo }

/** Состояние переносится со своими свойствами; связи остаются в исходной схеме. */
export function writeStateClipboard(name: string, info?: StateInfo): string {
  return JSON.stringify({ type: 'va-spec-maker/state', version: 1, name, info: info ?? { x: 0, y: 0 } });
}

export function readStateClipboard(text: string): CopiedState | null {
  try {
    const value = JSON.parse(text);
    if (value?.type !== 'va-spec-maker/state' || value.version !== 1 || typeof value.name !== 'string' || !value.name.trim()) return null;
    const info = value.info;
    if (!info || typeof info !== 'object' || Array.isArray(info) || !Number.isFinite(info.x) || !Number.isFinite(info.y)) return null;
    for (const key of ['description', 'system_action', 'result_code']) {
      if (info[key] !== undefined && typeof info[key] !== 'string') return null;
    }
    if (info.prompt_id !== undefined && info.prompt_id !== null && (!Number.isInteger(info.prompt_id) || info.prompt_id < 1)) return null;
    return { type: 'va-spec-maker/state', version: 1, name: value.name.trim(), info };
  } catch {
    return null;
  }
}

export function pasteState(copied: CopiedState, steps: Step[], layout: Layout): { name: string; steps: Step[]; layout: Layout } {
  const names = [...Object.keys(layout), ...steps.flatMap((step) => [step.state.trim(), ...splitNext(step.next_states)])];
  const name = uniqueStateName(names, copied.name);
  return { name, steps, layout: { ...layout, [name]: { ...structuredClone(copied.info), x: 0, y: 0 } } };
}
