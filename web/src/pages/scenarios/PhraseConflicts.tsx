import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { usePath } from '@/hooks/project';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ConflictKind, ConflictPair } from '@/lib/types';

const KIND: Record<ConflictKind, { label: string; className: string }> = {
  exact: { label: 'дословно', className: 'text-destructive' },
  template: { label: 'по шаблону', className: 'text-warning' },
};

interface Group { key: string; a: ConflictPair['a']; b: ConflictPair['b']; pairs: ConflictPair[] }

/** Группы по паре интентов: сначала пары внутри сценария, затем остальные; порядок внутри сохраняется. */
export function groupConflicts(pairs: ConflictPair[], scenarioId: number): Group[] {
  const groups = new Map<string, Group>();
  for (const p of pairs) {
    const key = `${p.a.id}:${p.b.id}`;
    const g = groups.get(key) ?? { key, a: p.a, b: p.b, pairs: [] };
    g.pairs.push(p);
    groups.set(key, g);
  }
  const inside = (g: Group) => [g.a, g.b].every((x) => x.scenarios.some((s) => s.id === scenarioId));
  return [...groups.values()].sort((x, y) => Number(inside(y)) - Number(inside(x)));
}

/** Кнопка и диалог-отчёт «Пересечения фраз» сценария. */
export function PhraseConflicts({ scenarioId }: { scenarioId: number }) {
  const path = usePath();
  const [open, setOpen] = useState(false);
  const { data = [], isPending, isError, refetch } = useQuery({
    queryKey: ['phrase-conflicts', scenarioId],
    queryFn: () => api.intents.conflicts(scenarioId),
  });
  const groups = groupConflicts(data, scenarioId);
  const count = data.length;
  const where = (g: Group['a']) => {
    const others = g.scenarios.filter((s) => s.id !== scenarioId).map((s) => s.name);
    return g.scenarios.some((s) => s.id === scenarioId) ? (others.length ? `этот сценарий, ${others.join(', ')}` : 'этот сценарий') : others.join(', ');
  };

  return (
    <>
      <Button variant="outline" className="max-md:h-10" onClick={() => {
        setOpen(true);
        refetch();
      }}>
        <TriangleAlert className="size-4" /> Пересечения<span className="max-sm:hidden"> фраз</span>
        {count > 0 && <span className="rounded-full bg-warning-bg px-1.5 text-xs text-warning">{count}</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Пересечения фраз</DialogTitle>
            <DialogDescription>Одинаковые тренировочные фразы у разных включённых интентов проекта. Экспорт они не блокируют.</DialogDescription>
          </DialogHeader>
          {isPending && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {isError && (
            <div role="alert" className="flex items-center gap-3 text-sm text-destructive">
              Не удалось загрузить отчёт
              <Button size="sm" variant="outline" onClick={() => refetch()}>Повторить</Button>
            </div>
          )}
          {!isPending && !isError && groups.length === 0 && <p className="text-sm text-muted-foreground">Пересечений не найдено</p>}
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.key} className="rounded-lg border p-3">
                <h3 className="flex flex-wrap items-baseline gap-x-2 font-medium">
                  <Link className="font-mono hover:underline" to={path(`/lists/intents/${g.a.id}`)} onClick={() => setOpen(false)}>{g.a.name}</Link>
                  <span aria-hidden className="text-muted-foreground">⇄</span>
                  <Link className="font-mono hover:underline" to={path(`/lists/intents/${g.b.id}`)} onClick={() => setOpen(false)}>{g.b.name}</Link>
                </h3>
                <p className="text-xs text-muted-foreground">{where(g.a)} ⇄ {where(g.b)}</p>
                <ul className="mt-2 space-y-1">
                  {g.pairs.map((p, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-2">
                      <span>«{p.phrase}»</span>
                      {p.other_phrase !== p.phrase && <span className="text-muted-foreground">≈ «{p.other_phrase}»</span>}
                      <span className={cn('ml-auto text-xs', KIND[p.kind].className)}>{KIND[p.kind].label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
