import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateDialog } from '@/components/CreateDialog';
import { SaveIndicator } from '@/components/SaveIndicator';
import { Section, SectionAction } from '@/components/Section';
import { TagInput } from '@/components/TagInput';
import { useProjectId } from '@/hooks/project';
import { useAutosave } from '@/hooks/useAutosave';
import { api } from '@/lib/api';
import { cn, GHOST } from '@/lib/utils';
import type { Prompt } from '@/lib/types';

type Draft = Omit<Prompt, 'id' | 'project_id'>;

function PromptRow({ prompt, onDelete }: { prompt: Prompt; onDelete: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>({
    name: prompt.name,
    full_answers: prompt.full_answers,
    short_answers: prompt.short_answers,
  });
  const status = useAutosave(draft, async (d) => {
    if (!d.name.trim()) return;
    await api.prompts.save(prompt.id, d);
    qc.invalidateQueries({ queryKey: ['prompts'] });
  });
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <TableRow>
      <TableCell className="align-top">
        <Input className={cn(GHOST, 'font-medium')} aria-label="Название промпта" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
      </TableCell>
      <TableCell className="align-top">
        <TagInput commaSplit={false} value={draft.full_answers} onChange={(full_answers) => patch({ full_answers })} placeholder="Устанавливаю температуру на Х градусов" />
      </TableCell>
      <TableCell className="align-top">
        <TagInput commaSplit={false} value={draft.short_answers} onChange={(short_answers) => patch({ short_answers })} placeholder="Хорошо" />
      </TableCell>
      <TableCell className="align-top">
        <div className="flex items-center gap-1 pt-1">
          <SaveIndicator state={status} compact />
          <Button variant="ghost" size="icon" aria-label="Удалить промпт" onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function PromptRowLoader({ id, onDelete }: { id: number; onDelete: () => void }) {
  // gcTime: 0 — строка инициализируется из ответа один раз, кэш не должен подсовывать устаревшие данные
  const { data } = useQuery({ queryKey: ['prompt', id], queryFn: () => api.prompts.get(id), gcTime: 0 });
  if (!data) return null;
  return <PromptRow prompt={data} onDelete={onDelete} />;
}

export function PromptsTable({ scenarioId }: { scenarioId: number }) {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<{ id: number; name: string } | null>(null);
  const { data: items = [] } = useQuery({ queryKey: ['prompts', 'scenario', scenarioId], queryFn: () => api.prompts.listByScenario(scenarioId) });
  // Название промпта уникально в рамках всего проекта, а не только сценария
  const { data: all = [] } = useQuery({ queryKey: ['prompts', projectId], queryFn: () => api.prompts.list(projectId) });

  const create = useMutation({
    mutationFn: (name: string) => api.prompts.create(scenarioId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prompts'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.prompts.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prompts'] }),
  });

  return (
    <Section title="Промпты" action={<SectionAction onClick={() => setCreating(true)}>Добавить промпт</SectionAction>}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-56">Название</TableHead>
            <TableHead>Полный ответ</TableHead>
            <TableHead className="w-72">Краткий ответ</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <PromptRowLoader key={p.id} id={p.id} onDelete={() => setDeleting({ id: p.id, name: p.name })} />
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-sm text-muted-foreground">Промптов пока нет. Промпт — ответ ассистента: добавьте его и привяжите к строке сценарной логики</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <CreateDialog open={creating} onOpenChange={setCreating} title="Новый промпт" prefix="PRM_" existingNames={all.map((p) => p.name)} onCreate={(n) => create.mutate(n)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Удалить промпт «${deleting?.name ?? ''}»?`}
        description="Строки таблиц, использующие этот промпт, останутся без промпта."
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </Section>
  );
}
