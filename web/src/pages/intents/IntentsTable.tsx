import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateDialog } from '@/components/CreateDialog';
import { SaveIndicator } from '@/components/SaveIndicator';
import { Section, SectionAction } from '@/components/Section';
import { useProjectId } from '@/hooks/project';
import { useAutosave } from '@/hooks/useAutosave';
import { api } from '@/lib/api';
import { cn, GHOST } from '@/lib/utils';
import type { Intent } from '@/lib/types';
import { EntitiesCell } from './EntitiesCell';
import { PhrasesCell } from './PhrasesCell';

const toPayload = (d: Intent): Omit<Intent, 'id' | 'project_id'> => {
  const { id: _id, project_id: _pid, ...rest } = d;
  return rest;
};

/** Интент занимает одну строку: название и комментарий, сущности, фразы, переключатель «включён». */
function IntentRow({ intent, onDelete }: { intent: Intent; onDelete: () => void }) {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Intent>(intent);
  const [params] = useSearchParams();
  const target = params.get('open') === String(intent.id);
  const { data: entities = [] } = useQuery({ queryKey: ['entities', projectId], queryFn: () => api.entities.list(projectId) });

  const status = useAutosave(draft, async (d) => {
    if (!d.name.trim()) return;
    await api.intents.save(intent.id, toPayload(d));
    qc.invalidateQueries({ queryKey: ['intents'] });
    qc.invalidateQueries({ queryKey: ['entities'] });
  });
  const patch = (p: Partial<Intent>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <TableRow
      ref={(el) => { if (target && el) el.scrollIntoView({ block: 'center' }); }}
      className={cn('hover:bg-transparent [&>td]:py-3', !draft.enabled && '[&>td:not(:first-child)]:opacity-60', target && 'bg-brand/5')}
    >
      <TableCell className="space-y-2 border-r bg-muted/30 align-top whitespace-normal">
        <Input className={cn(GHOST, 'font-semibold')} aria-label="Название интента" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        <Textarea rows={2} className={cn(GHOST, 'min-h-8 text-sm')} placeholder="Комментарий" aria-label="Комментарий" value={draft.comment} onChange={(e) => patch({ comment: e.target.value })} />
        <div className="flex justify-end px-1">
          <SaveIndicator state={status} compact />
        </div>
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        <EntitiesCell value={draft.entities} entities={entities} onChange={(e) => patch({ entities: e })} />
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        <PhrasesCell value={draft.phrases} onChange={(phrases) => patch({ phrases })} />
      </TableCell>
      <TableCell className="align-top">
        <Switch className="mt-1.5" checked={draft.enabled} onCheckedChange={(enabled) => patch({ enabled })} aria-label="Интент включён" />
      </TableCell>
      <TableCell className="align-top">
        <Button variant="ghost" size="icon" aria-label="Удалить интент" onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function IntentRowLoader({ id, onDelete }: { id: number; onDelete: () => void }) {
  // gcTime: 0 — строки инициализируются из ответа один раз, кэш не должен подсовывать устаревшие данные
  const { data } = useQuery({ queryKey: ['intent', id], queryFn: () => api.intents.get(id), gcTime: 0 });
  if (!data) return null;
  return <IntentRow intent={data} onDelete={onDelete} />;
}

export function IntentsTable({ scenarioId }: { scenarioId: number }) {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);
  const { data: items = [] } = useQuery({ queryKey: ['intents', 'scenario', scenarioId], queryFn: () => api.intents.listByScenario(scenarioId) });
  // Название интента уникально в рамках всего проекта, а не только сценария
  const { data: all = [] } = useQuery({ queryKey: ['intents', projectId], queryFn: () => api.intents.list(projectId) });

  const create = useMutation({
    mutationFn: (name: string) => api.intents.create(scenarioId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intents'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.intents.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intents'] }),
  });

  return (
    <Section title="Интенты" action={<SectionAction onClick={() => setCreating(true)}>Добавить интент</SectionAction>}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-72">Интент</TableHead>
            <TableHead className="w-72">Сущности</TableHead>
            <TableHead>Тренировочные фразы</TableHead>
            <TableHead className="w-24">Включён</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => (
            <IntentRowLoader key={i.id} id={i.id} onDelete={() => setDeleting({ id: i.id, name: i.name })} />
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-sm text-muted-foreground">Интентов пока нет</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        title="Новый интент"
        prefix="INT_"
        existingNames={all.map((i) => i.name)}
        onCreate={(name) => create.mutate(name)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Удалить интент «${deleting?.name ?? ''}»?`}
        description="Шаги сценариев, использующие этот интент, останутся без интента."
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </Section>
  );
}
