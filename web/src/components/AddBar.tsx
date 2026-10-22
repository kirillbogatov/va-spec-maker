import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchSelect, type SearchOption } from '@/components/SearchSelect';

interface Props {
  /** Подпись кнопки создания, например «Интент». */
  createLabel: string;
  onCreate: () => void;
  creating?: boolean;
  /** Что можно подключить; пустой список скрывает вторую кнопку. */
  options: SearchOption[];
  onConnect: (id: number) => void;
  connectLabel: string;
}

/** Область добавления элементов в сценарий: две одинаковые кнопки — создать новый и подключить существующий. */
export function AddBar({ createLabel, onCreate, creating, options, onConnect, connectLabel }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="max-md:h-10" disabled={creating} onClick={onCreate}>
        <Plus className="size-4" /> {createLabel}
      </Button>
      {options.length > 0 && (
        <SearchSelect
          options={options}
          value={null}
          onChange={(v) => v != null && onConnect(Number(v))}
          label={connectLabel}
          className="h-9 rounded-lg border-border bg-background px-3.5 font-medium hover:bg-muted max-md:h-10"
          icon={<Plus className="size-4" />}
          placeholder="Подключить существующий"
        />
      )}
    </div>
  );
}
