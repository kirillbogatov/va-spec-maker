import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScenarioChange } from '@/lib/types';
import type { ScenarioTab } from './ScenarioForm';

export interface Criterion { area: string; ok: boolean; text: string; problems: { text: string; tab: ScenarioTab }[]; tab: ScenarioTab }
export interface ReviewChange { key: string; change_ids: number[]; reviewed: boolean; source_type: string; source_id: number; source_name: string; label: string; details: string }

export function groupScenarioChanges(changes: ScenarioChange[]): ReviewChange[] {
  const groups = new Map<string, { source_type: string; source_id: number; source_name: string; summaries: string[]; change_ids: number[]; reviewed: boolean }>();
  for (const change of changes) {
    const key = `${change.source_type}:${change.source_id}`;
    const group = groups.get(key) ?? { source_type: change.source_type, source_id: change.source_id, source_name: change.source_name, summaries: [], change_ids: [], reviewed: true };
    if (!group.summaries.includes(change.summary)) group.summaries.push(change.summary);
    group.change_ids.push(change.id);
    group.reviewed = group.reviewed && !!change.reviewed_at;
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => {
    const details = group.summaries.map((summary) => { const separator = summary.indexOf(': '); return separator >= 0 ? summary.slice(separator + 2) : summary; }).filter((detail) => detail !== 'изменены параметры' || group.summaries.length === 1);
    const sourceLabel = ({ entity: 'Сущность', dependency: 'Зависимость', intent: 'Интент', prompt: 'Промпт', result_code: 'Код результата' } as Record<string, string>)[group.source_type] ?? 'Изменение';
    return { key, change_ids: group.change_ids, reviewed: group.reviewed, source_type: group.source_type, source_id: group.source_id, source_name: group.source_name, label: `${sourceLabel} «${group.source_name}»`, details: details.join('; ') };
  });
}

export function ReadinessPill({ hasUnreviewedChanges, onOpen }: { criteria: Criterion[]; hasUnreviewedChanges: boolean; onOpen: () => void }) {
  if (!hasUnreviewedChanges) return null;
  return <button type="button" onClick={onOpen} aria-label="Есть непроверенные изменения" title="Есть непроверенные изменения" className={cn('inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50', 'bg-warning-bg text-warning hover:bg-warning-bg/80')}><TriangleAlert className="size-3.5" /><span className="max-sm:hidden">Проверьте неучтенные изменения</span><span className="sm:hidden">Проверить</span></button>;
}
