import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ScenarioListItem } from '@/lib/types';

/** Сценарии проекта и название сценария по id. */
export function useScenarioGroups(projectId: number) {
  const { data: scenarios = [] } = useQuery<ScenarioListItem[]>({ queryKey: ['scenarios', projectId], queryFn: () => api.scenarios.list(projectId) });
  const nameOf = (sid: number | null | undefined) => scenarios.find((s) => s.id === sid)?.name ?? null;
  return { scenarios, nameOf };
}
