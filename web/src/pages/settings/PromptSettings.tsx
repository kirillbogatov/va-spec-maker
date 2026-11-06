import { Switch } from '@/components/ui/switch';
import { usePromptSettings, useSavePromptSettings } from '@/lib/promptSettings';

export function PromptSettings({ projectId }: { projectId: number }) {
  const query = usePromptSettings(projectId);
  const save = useSavePromptSettings(projectId);
  return <section className="rounded-xl border bg-card p-4 text-card-foreground">
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-semibold">Разделять краткие и полные ответы</span>
        <span className="mt-1 block text-[13px] text-muted-foreground">При выключении все варианты объединяются в «Ответ ассистента». При включении объединённые ответы становятся полными; краткие можно добавить отдельно.</span>
      </span>
      <Switch aria-label="Разделять краткие и полные ответы" checked={query.data?.splitAnswers ?? false} disabled={!query.isSuccess || save.isPending} onCheckedChange={v => save.mutate(v)} />
    </label>
    {query.isError && <p role="alert" className="mt-3 text-sm text-destructive">Не удалось загрузить настройку. <button type="button" className="underline" onClick={() => void query.refetch()}>Повторить</button></p>}
  </section>;
}
