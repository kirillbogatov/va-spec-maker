import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ADD_ROW, DeleteChoiceDialog, REMOVE_BTN } from '@/components/DeleteChoiceDialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AddBar } from '@/components/AddBar';
import { Textarea } from '@/components/ui/textarea';
import { SaveNote } from '@/components/SaveIndicator';
import { TypeToken } from '@/components/TypeToken';
import { useProjectId } from '@/hooks/project';
import { useAutosave } from '@/hooks/useAutosave';
import { api } from '@/lib/api';
import { cn, uniqueName } from '@/lib/utils';
import type { Prompt, PromptListItem } from '@/lib/types';

type Draft = Omit<Prompt, 'id' | 'project_id'>;

/** Промпт: имя жетоном, ответы ассистента — редактируемый текст с авто-высотой. */
function PromptRow({ prompt, link, startRenaming, onDisconnect, onRemove }: { prompt: Prompt; link: PromptListItem; startRenaming: boolean; onDisconnect: () => void; onRemove: () => void }) {
  const qc = useQueryClient();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    name: prompt.name,
    full_answers: prompt.full_answers,
  });
  const [open, setOpen] = useState(startRenaming);
  const status = useAutosave(draft, async (d) => {
    if (!d.name.trim()) return;
    await api.prompts.save(prompt.id, { ...d, full_answers: d.full_answers.filter((a) => a.trim()) });
    qc.invalidateQueries({ queryKey: ['prompts'] });
  });
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  // Всегда есть хотя бы одно поле ввода
  const answers = draft.full_answers.length ? draft.full_answers : [''];
  const setAnswer = (i: number, v: string) => patch({ full_answers: answers.map((a, j) => (j === i ? v : a)) });

  const filled = draft.full_answers.filter((a) => a.trim());

  return (
    <div role="button" tabIndex={0} onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) setOpen(true); }} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); } }} className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t px-4 py-2 outline-none first:border-t-0 hover:bg-muted/60 focus-visible:bg-muted/60 md:grid-cols-[230px_minmax(0,1fr)]">
      <span className="col-start-1 row-start-1 min-w-0">
        <TypeToken kind="prompt" className="text-[12.5px]">{draft.name}</TypeToken>
        {link.scenarios.length > 1 && <span className="mt-0.5 block text-xs text-faint">также в: {link.scenarios.map((s) => s.name).join(', ')}</span>}
      </span>
      <span className="col-span-1 row-start-2 flex min-w-0 text-sm text-muted-foreground md:col-span-1 md:col-start-2 md:row-start-1">
        {filled.length === 0 ? (
          <span className="text-warning">Нет ответа</span>
        ) : (
          <>
            <span className="truncate">{filled[0]}</span>
            {filled.length > 1 && <span className="shrink-0 whitespace-pre text-faint"> · ещё {filled.length - 1}</span>}
          </>
        )}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col gap-0 overflow-hidden p-5 sm:max-w-xl"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            (document.activeElement as HTMLElement | null)?.blur();
            setOpen(false);
          }
        }}
      >
          <DialogHeader className="shrink-0 pb-4 pr-8">
            <DialogTitle className="font-mono text-[15px]">Промпт {draft.name.trim() || 'без названия'}</DialogTitle>
          </DialogHeader>
          <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Название
              <Input
                autoFocus={startRenaming}
                onFocus={(e) => startRenaming && e.target.select()}
                className="h-8 rounded-md bg-background font-mono text-[12.5px] max-md:h-10 md:text-[12.5px]"
                aria-label="Название промпта"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Ответ ассистента</span>
              <div className="grid gap-1.5">
                {answers.map((a, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <Textarea
                      rows={1}
                      className="field-sizing-content min-h-8 resize-none rounded-md bg-background px-2 py-1 text-sm leading-6 max-md:min-h-10 md:text-sm"
                      aria-label={answers.length > 1 ? `Ответ ассистента ${i + 1}` : 'Ответ ассистента'}
                      placeholder="Устанавливаю температуру на Х градусов"
                      value={a}
                      onChange={(e) => setAnswer(i, e.target.value)}
                      onBlur={() => !a.trim() && answers.length > 1 && patch({ full_answers: answers.filter((_, j) => j !== i) })}
                    />
                    {answers.length > 1 && (
                      <button type="button" className={REMOVE_BTN} aria-label="Удалить вариант ответа" onClick={() => patch({ full_answers: answers.filter((_, j) => j !== i) })}>
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className={cn(ADD_ROW, 'inline-flex items-center gap-2 border px-2.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50')}
                  disabled={!answers[answers.length - 1].trim()}
                  onClick={() => patch({ full_answers: [...answers, ''] })}
                >
                  <Plus className="size-3.5 shrink-0" /> вариант ответа
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 -mx-5 -mb-5 mt-4 px-5 sm:items-center sm:justify-between">
            <SaveNote state={status} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmRemove(true)}>
                <Trash2 className="size-4" /> Удалить
              </Button>
              <Button onClick={() => setOpen(false)}>Готово</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeleteChoiceDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        noun="промпт"
        name={draft.name}
        scenarios={link.scenarios}
        removeNote="Привязка к состояниям будет сброшена."
        onDisconnect={() => { setOpen(false); onDisconnect(); }}
        onRemove={() => { setOpen(false); onRemove(); }}
      />
    </div>
  );
}

function PromptRowLoader({ link, startRenaming, onDisconnect, onRemove }: { link: PromptListItem; startRenaming: boolean; onDisconnect: () => void; onRemove: () => void }) {
  // gcTime: 0 — строка инициализируется из ответа один раз, кэш не должен подсовывать устаревшие данные
  const { data } = useQuery({ queryKey: ['prompt', link.id], queryFn: () => api.prompts.get(link.id), gcTime: 0 });
  if (!data) return <div className="min-h-12 border-t first:border-t-0" />;
  return <PromptRow prompt={data} link={link} startRenaming={startRenaming} onDisconnect={onDisconnect} onRemove={onRemove} />;
}

export function PromptsTable({ scenarioId }: { scenarioId: number }) {
  const projectId = useProjectId();
  const qc = useQueryClient();
  // Только что созданный промпт: его название редактируется сразу
  const [fresh, setFresh] = useState<number | null>(null);
  const { data: items = [], isSuccess } = useQuery({ queryKey: ['prompts', 'scenario', scenarioId], queryFn: () => api.prompts.listByScenario(scenarioId) });
  // Название промпта уникально в рамках всего проекта, а не только сценария
  const { data: all = [] } = useQuery({ queryKey: ['prompts', projectId], queryFn: () => api.prompts.list(projectId) });

  const refresh = () => qc.invalidateQueries({ queryKey: ['prompts'] });
  const onError = (e: Error) => toast.error(e.message);
  const create = useMutation({
    mutationFn: (n: string) => api.prompts.create(scenarioId, n),
    onSuccess: (c) => { setFresh(c.id); refresh(); },
    onError,
  });
  const connect = useMutation({ mutationFn: (id: number) => api.prompts.connect(scenarioId, id), onSuccess: refresh, onError });
  const disconnect = useMutation({ mutationFn: (id: number) => api.prompts.disconnect(scenarioId, id), onSuccess: refresh, onError });
  const remove = useMutation({ mutationFn: (id: number) => api.prompts.remove(id), onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ['scenario'] }); }, onError });
  const free = all.filter((p) => !items.some((x) => x.id === p.id)).map((p) => ({ value: String(p.id), label: p.name, hint: p.hint }));

  return (
    <div className="grid gap-4">
      <AddBar
        createLabel="Промпт"
        onCreate={() => create.mutate(uniqueName('Новый промпт', all.map((p) => p.name)))}
        creating={create.isPending}
        options={free}
        onConnect={(id) => connect.mutate(id)}
        connectLabel="Подключить существующий промпт"
      />
      <section className="overflow-hidden rounded-xl border bg-card" aria-label="Промпты сценария">
        <div className="hidden gap-x-3 px-4 py-2 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[230px_minmax(0,1fr)]">
          <span>Промпт</span>
          <span>Ответ ассистента</span>
                  </div>
        {items.map((p) => (
          <PromptRowLoader key={p.id} link={p} startRenaming={p.id === fresh} onDisconnect={() => disconnect.mutate(p.id)} onRemove={() => remove.mutate(p.id)} />
        ))}
        {isSuccess && items.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Промптов пока нет. Промпт — ответ ассистента: нажмите «Промпт» выше или подключите существующий и привяжите к состоянию сценария.</p>
        )}
      </section>
    </div>
  );
}
