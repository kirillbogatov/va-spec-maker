import { useMemo } from 'react';
import { globalIssues } from '@/lib/states';
import type { Dependency, EntityListItem, IntentListItem, Step } from '@/lib/types';
import { StepsTable } from './StepsTable';

interface Props {
  /** Только глобальные строки вкладки. */
  steps: Step[];
  /** Глобальные интенты сценария. */
  intents: IntentListItem[];
  dependencies: Dependency[];
  entities: EntityListItem[];
  /** Состояния схемы вкладки: подсказки для «Следующее состояние» и проверка целей. */
  states: string[];
  onChange: (steps: Step[]) => void;
}

/** Переходы глобальных интентов: срабатывают из любого состояния вкладки. */
export function GlobalTransitions({ steps, intents, dependencies, entities, states, onChange }: Props) {
  const issues = useMemo(() => globalIssues(steps, states), [steps, states]);
  return (
    <section aria-label="Глобальные переходы" className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">Глобальные переходы</h3>
        <p className="text-sm text-muted-foreground">Срабатывают из любого состояния по глобальным интентам. Интент становится глобальным на вкладке «Интенты».</p>
      </div>
      <StepsTable
        kind="global"
        title="Глобальные переходы"
        steps={steps}
        intents={intents}
        prompts={[]}
        dependencies={dependencies}
        entities={entities}
        allStates={states}
        issues={issues}
        onChange={onChange}
      />
    </section>
  );
}
