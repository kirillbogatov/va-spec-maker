import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Hit { key: string; kind: string; name: string; hint?: string; to: string }

/** Глобальный поиск по Ctrl+K: сценарии, интенты, промпты, сущности, регулировки и зависимости. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const enabled = { enabled: open, staleTime: 10_000 };
  const scenarios = useQuery({ queryKey: ['scenarios', projectId], queryFn: () => api.scenarios.list(projectId), ...enabled });
  const intents = useQuery({ queryKey: ['intents', projectId], queryFn: () => api.intents.list(projectId), ...enabled });
  const prompts = useQuery({ queryKey: ['prompts', projectId], queryFn: () => api.prompts.list(projectId), ...enabled });
  const entities = useQuery({ queryKey: ['entities', projectId], queryFn: () => api.entities.list(projectId), ...enabled });
  const adjustments = useQuery({ queryKey: ['adjustments', projectId], queryFn: () => api.adjustments.list(projectId), ...enabled });
  const codes = useQuery({ queryKey: ['result-codes', projectId], queryFn: () => api.resultCodes.list(projectId), ...enabled });
  const deps = useQuery({ queryKey: ['dependency-dictionary', projectId], queryFn: () => api.dependencyDictionary.list(projectId), ...enabled });

  const scenarioName = (id: number | null) => scenarios.data?.find((s) => s.id === id)?.name;
  const all = useMemo<Hit[]>(
    () => [
      ...(scenarios.data ?? []).map((s) => ({ key: `s${s.id}`, kind: 'Сценарий', name: s.name, to: `/scenarios/${s.id}` })),
      ...(intents.data ?? []).map((i) => ({
        key: `i${i.id}`, kind: 'Интент', name: i.name, hint: scenarioName(i.scenario_id),
        to: i.scenario_id ? `/scenarios/${i.scenario_id}/intents?open=${i.id}` : '/scenarios',
      })),
      ...(prompts.data ?? []).map((p) => ({
        key: `p${p.id}`, kind: 'Промпт', name: p.name, hint: scenarioName(p.scenario_id),
        to: p.scenario_id ? `/scenarios/${p.scenario_id}/prompts` : '/scenarios',
      })),
      ...(entities.data ?? []).map((e) => ({ key: `e${e.id}`, kind: 'Сущность', name: e.name, to: `/entities?focus=${e.id}` })),
      ...(adjustments.data ?? []).map((a) => ({ key: `a${a.id}`, kind: 'Регулировка', name: a.name, to: `/adjustments?focus=${a.id}` })),
      ...(deps.data ?? []).map((d) => ({ key: `d${d.id}`, kind: 'Зависимость', name: d.name, to: `/dependencies?focus=${d.id}` })),
      ...(codes.data ?? []).map((c) => ({ key: `c${c.id}`, kind: 'Result code', name: c.name, to: `/result-codes?focus=${c.id}` })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenarios.data, intents.data, prompts.data, entities.data, adjustments.data, deps.data, codes.data],
  );
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? all.filter((h) => h.name.toLowerCase().includes(t) || h.kind.toLowerCase().includes(t)) : all).slice(0, 30);
  }, [all, q]);

  useEffect(() => setCursor(0), [q, open]);
  const go = (h: Hit | undefined) => {
    if (!h) return;
    onOpenChange(false);
    setQ('');
    navigate(h.to);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Поиск</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти сценарий, интент, промпт, сущность…"
            aria-label="Поиск"
            className="h-11 flex-1 bg-transparent text-sm outline-none"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); go(hits[cursor]); }
            }}
          />
        </div>
        <ul className="max-h-80 overflow-y-auto py-1" role="listbox">
          {hits.map((h, i) => (
            <li key={h.key} role="option" aria-selected={i === cursor}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(h)}
                className={cn('flex w-full items-center gap-3 px-3 py-2 text-left text-sm', i === cursor && 'bg-muted')}
              >
                <span className="w-24 shrink-0 text-xs text-muted-foreground">{h.kind}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{h.name}</span>
                {h.hint && <span className="shrink-0 truncate text-xs text-muted-foreground">{h.hint}</span>}
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Ничего не найдено</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
