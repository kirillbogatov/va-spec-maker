import { useSearchParams } from 'react-router-dom';
import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import type { Intent, IntentVariant } from '@/lib/types';
import { EntitiesCell } from './EntitiesCell';
import { PhrasesCell } from './PhrasesCell';

const NONE = 'none';
const emptyVariant = (): IntentVariant => ({ key: crypto.randomUUID(), enabled: true, adjustment_id: null, examples: [], phrases: [], entities: [] });

const withKeys = (i: Intent): Intent => ({ ...i, variants: i.variants.map((v) => ({ ...v, key: crypto.randomUUID() })) });

const toPayload = (d: Intent): Omit<Intent, 'id' | 'project_id'> => {
  const { id: _id, project_id: _pid, ...rest } = d;
  return rest;
};

/** Интент занимает в таблице по строке на каждую вариацию (относительную регулировку); общие поля — в объединённой ячейке. */
function IntentRows({ intent, onDelete }: { intent: Intent; onDelete: () => void }) {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Intent>(() => withKeys(intent));
  const [params] = useSearchParams();
  const target = params.get('open') === String(intent.id);
  const { data: entities = [] } = useQuery({ queryKey: ['entities', projectId], queryFn: () => api.entities.list(projectId) });
  const { data: adjustments = [] } = useQuery({ queryKey: ['adjustments', projectId], queryFn: () => api.adjustments.list(projectId) });

  const status = useAutosave(draft, async (d) => {
    if (!d.name.trim()) return;
    await api.intents.save(intent.id, toPayload(d));
    qc.invalidateQueries({ queryKey: ['intents'] });
    qc.invalidateQueries({ queryKey: ['entities'] });
    qc.invalidateQueries({ queryKey: ['adjustments'] });
  });
  const patch = (p: Partial<Intent>) => setDraft((d) => ({ ...d, ...p }));
  const patchVariant = (i: number, p: Partial<IntentVariant>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v, j) => (j === i ? { ...v, ...p } : v)) }));

  const options = [{ value: NONE, label: NONE }, ...adjustments.map((a) => ({ value: String(a.id), label: a.name }))];
  const taken = new Set(draft.variants.map((v) => v.adjustment_id));
  const last = draft.variants.length - 1;

  return (
    <Fragment>
      {draft.variants.map((v, i) => (
        <TableRow
          key={v.key}
          ref={(el) => { if (target && i === 0 && el) el.scrollIntoView({ block: 'center' }); }}
          className={cn(
            'hover:bg-transparent [&>td]:py-3',
            !v.enabled && '[&>td:not(:first-child)]:opacity-60',
            target && 'bg-brand/5',
            i < last ? 'border-dashed' : 'border-b-2',
          )}
        >
          {i === 0 && (
            <TableCell rowSpan={draft.variants.length} className="space-y-2 border-r bg-muted/30 align-top whitespace-normal">
              <Input className={cn(GHOST, 'font-semibold')} aria-label="Название интента" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
              <Textarea rows={2} className={cn(GHOST, 'min-h-8 text-sm')} placeholder="Комментарий" aria-label="Комментарий" value={draft.comment} onChange={(e) => patch({ comment: e.target.value })} />
              <div className="flex items-center justify-between gap-2 px-1">
                <SectionAction onClick={() => setDraft((d) => ({ ...d, variants: [...d.variants, emptyVariant()] }))}>
                  Вариация
                </SectionAction>
                <div className="flex items-center gap-1">
                  <SaveIndicator state={status} compact />
                  <Button variant="ghost" size="icon" aria-label="Удалить интент" onClick={onDelete}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </TableCell>
          )}
          <TableCell className="align-top">
            <Select
              items={options}
              value={v.adjustment_id === null ? NONE : String(v.adjustment_id)}
              onValueChange={(val) => {
                const adjustment_id = val == null || val === NONE ? null : Number(val);
                patchVariant(i, { adjustment_id });
              }}
            >
              <SelectTrigger className={cn(GHOST, 'w-full')} aria-label="Относительная регулировка"><SelectValue /></SelectTrigger>
              <SelectContent>
                {options
                  .filter((o) => (o.value === NONE ? true : !taken.has(Number(o.value)) || Number(o.value) === v.adjustment_id))
                  .map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </TableCell>
          <TableCell className="align-top whitespace-normal">
            <EntitiesCell value={v.entities} entities={entities} onChange={(e) => patchVariant(i, { entities: e })} />
          </TableCell>
          <TableCell className="align-top whitespace-normal">
            <PhrasesCell value={v.phrases} onChange={(phrases) => patchVariant(i, { phrases })} />
          </TableCell>
          <TableCell className="align-top">
            <Switch className="mt-1.5" checked={v.enabled} onCheckedChange={(enabled) => patchVariant(i, { enabled })} aria-label="Вариация включена" />
          </TableCell>
          <TableCell className="align-top">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Удалить вариацию"
              disabled={draft.variants.length === 1}
              onClick={() => setDraft((d) => ({ ...d, variants: d.variants.filter((_, j) => j !== i) }))}
            >
              <Trash2 className="size-4" />
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </Fragment>
  );
}

function IntentRowsLoader({ id, onDelete }: { id: number; onDelete: () => void }) {
  // gcTime: 0 — строки инициализируются из ответа один раз, кэш не должен подсовывать устаревшие данные
  const { data } = useQuery({ queryKey: ['intent', id], queryFn: () => api.intents.get(id), gcTime: 0 });
  if (!data) return null;
  return <IntentRows intent={data} onDelete={onDelete} />;
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
            <TableHead className="w-56">Отн. регулировка</TableHead>
            <TableHead className="w-72">Сущности</TableHead>
            <TableHead>Тренировочные фразы</TableHead>
            <TableHead className="w-24">Включён</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => (
            <IntentRowsLoader key={i.id} id={i.id} onDelete={() => setDeleting({ id: i.id, name: i.name })} />
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-sm text-muted-foreground">Интентов пока нет</TableCell>
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
