import { useQuery } from '@tanstack/react-query';
import { MarkdownView } from '@/components/MarkdownView';
import { Section } from '@/components/Section';
import { api } from '@/lib/api';

/** Как сценарий будет выглядеть в экспортируемом документе. Показывает последние сохранённые данные. */
export function ScenarioPreview({ scenarioId, version }: { scenarioId: number; version: unknown }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['preview', scenarioId, version],
    queryFn: () => api.preview(scenarioId),
    gcTime: 0,
  });
  return (
    <Section title="Предпросмотр документа">
      {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {error && <p className="text-sm text-destructive">Не удалось построить предпросмотр: {(error as Error).message}</p>}
      {data && <MarkdownView source={data} />}
    </Section>
  );
}
