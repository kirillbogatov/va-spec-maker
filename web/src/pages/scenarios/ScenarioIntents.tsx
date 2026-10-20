import { IntentsTable } from '../intents/IntentsTable';

export function ScenarioIntents({ scenarioId }: { scenarioId: number }) {
  return <IntentsTable scenarioId={scenarioId} />;
}
