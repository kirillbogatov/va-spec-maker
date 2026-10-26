import { useQuery } from '@tanstack/react-query';
import { MarkdownView } from '@/components/MarkdownView';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { useIntentMode } from '@/lib/intentMode';
import { useSpecLang } from '@/lib/specLang';

/** Как сценарий будет выглядеть в экспортируемом документе. Показывает последние сохранённые данные. */
export function ScenarioPreview({ scenarioId, version }: { scenarioId: number; version: unknown }) {
  const projectId = useProjectId();
  const lang = useSpecLang(projectId);
  const mode = useIntentMode(projectId);
  const { data, isLoading, error } = useQuery({
    queryKey: ['preview', scenarioId, version, lang, mode],
    queryFn: () => api.preview(scenarioId, lang, mode),
    gcTime: 0,
  });

  return (
    <div className="min-w-0 space-y-3">
      {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {error && <p className="text-sm text-destructive">Не удалось построить предпросмотр: {(error as Error).message}</p>}
      {data && (
        <article className="mx-auto min-w-0 max-w-[1123px] rounded-lg border bg-card px-5 py-6 shadow-sm sm:px-8 sm:py-8 md:px-[40px]">
          <MarkdownView source={data} />
        </article>
      )}
    </div>
  );
}
