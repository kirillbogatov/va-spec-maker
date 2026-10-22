import { Trash2, TriangleAlert } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Combobox } from '@base-ui/react/combobox';
import { AddButton, Card, HEAD, ROW } from './Card';
import { TagInput } from '@/components/TagInput';
import { cn, GHOST } from '@/lib/utils';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import type { Dependency, EntityListItem } from '@/lib/types';

interface Props {
  dependencies: Dependency[];
  entities: EntityListItem[];
  /** Принимает функцию-обновление, чтобы асинхронная подстановка значений сущности не затирала свежие правки. */
  onChange: (update: (deps: Dependency[]) => Dependency[]) => void;
}

const COLS = 'md:grid-cols-[minmax(0,260px)_minmax(0,1fr)_32px]';

/** Название зависимости: свободный ввод с подсказками из справочника. */
function NameCombobox({ value, names, onType, onPick }: { value: string; names: string[]; onType: (v: string) => void; onPick: (v: string) => void }) {
  return (
    <Combobox.Root
      items={names}
      value={null}
      inputValue={value}
      openOnInputClick
      onInputValueChange={(v, details) => { if (details.reason === 'input-change') onType(v); }}
      onValueChange={(v: string | null) => { if (v) onPick(v); }}
    >
      <Combobox.Input
        spellCheck={false}
        aria-label="Название зависимости"
        placeholder="Выберите или введите название"
        className={cn(GHOST, 'h-8 w-full rounded-md border px-2.5 text-sm outline-none placeholder:text-muted-foreground max-md:h-10 md:-ml-2.5 md:w-[calc(100%+0.625rem)]')}
      />
      {names.length > 0 && (
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} align="start" className="isolate z-50">
            <Combobox.Popup className="max-h-(--available-height) w-max min-w-(--anchor-width) max-w-[min(36rem,95vw)] origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 empty:hidden">
              <Combobox.List className="max-h-72 overflow-y-auto p-1">
                {(n: string) => (
                  <Combobox.Item key={n} value={n} className="flex w-full cursor-default items-center rounded-md px-2 py-1 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground">
                    {n}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      )}
    </Combobox.Root>
  );
}

export function DependenciesTable({ dependencies, entities, onChange }: Props) {
  const projectId = useProjectId();
  const { data: dictionary = [] } = useQuery({ queryKey: ['dependency-dictionary', projectId], queryFn: () => api.dependencyDictionary.list(projectId) });

  const patch = (ref: string, p: Partial<Dependency>) =>
    onChange((deps) => deps.map((d) => (d.ref === ref ? { ...d, ...p } : d)));
  const add = () =>
    onChange((deps) => [...deps, { ref: crypto.randomUUID(), entity_id: null, name: '', type: 'enum', options: [] }]);

  /** Выбрав запись справочника, подставляем её значения как варианты списка. */
  const pick = (ref: string, name: string) => {
    const d = dictionary.find((x) => x.name === name);
    if (d) patch(ref, { entity_id: null, name: d.name, type: d.values.length ? 'enum' : 'string', options: d.values });
  };

  return (
    <Card flush title="Внешние зависимости" action={<AddButton onClick={add}>Добавить</AddButton>}>
      <div className={cn(ROW, HEAD, COLS)}>
        <span>Зависимость</span>
        <span>Значения</span>
        <span />
      </div>
      {dependencies.map((d) => (
        <div key={d.ref} className={cn(ROW, COLS, 'md:items-start')}>
          <NameCombobox
            value={d.name || (d.entity_id !== null ? entities.find((e) => e.id === d.entity_id)?.name ?? '' : '')}
            names={dictionary.map((x) => x.name)}
            onType={(name) => patch(d.ref, { name, entity_id: null })}
            onPick={(name) => pick(d.ref, name)}
          />
          <div>
            {d.type === 'bool' ? (
              <p className="pt-1.5 text-sm text-muted-foreground">true / false</p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                {d.options.length === 0 && (
                  <span className="ml-2 inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-medium text-warning">
                    <TriangleAlert className="size-3" /> Не выбрано ни одного значения
                  </span>
                )}
                <div className="min-w-32 flex-1">
                  <TagInput value={d.options} onChange={(options) => patch(d.ref, { options, type: 'enum' })} placeholder="Вариант" />
                </div>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" className="max-md:size-10 max-md:justify-self-end" aria-label="Удалить зависимость" onClick={() => onChange((deps) => deps.filter((x) => x.ref !== d.ref))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      {dependencies.length === 0 && <p className="border-t px-4 py-4 text-sm text-muted-foreground">Внешних зависимостей пока нет. Добавьте параметры, от которых зависит запуск сценария.</p>}
    </Card>
  );
}
