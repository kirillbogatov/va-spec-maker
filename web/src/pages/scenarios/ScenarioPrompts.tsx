import { PromptsTable } from '../prompts/PromptsTable';

export function ScenarioPrompts({ scenarioId }: { scenarioId: number }) {
  return <PromptsTable scenarioId={scenarioId} />;
}
