import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  connectPlaceholder?: string;
  compact?: boolean;
}

/** Область добавления элементов в сценарий: две одинаковые кнопки — создать новый и подключить существующий. */
export function AddBar({ createLabel, onCreate, creating, options, onConnect, connectLabel, connectPlaceholder = 'Добавить из справочника', compact = true }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className={cn('max-md:h-10', compact && 'h-10 gap-1.5 px-2.5 text-[13px] md:h-8')} disabled={creating} onClick={onCreate}>
        <Plus className={compact ? "size-3.5" : "size-4"} /> {createLabel}
      </Button>
      {options.length > 0 && (
        <SearchSelect
          options={options}
          value={null}
          onChange={(v) => v != null && onConnect(Number(v))}
          label={connectLabel}
          showChevron={false}
          className={cn('h-9 rounded-lg border-border bg-background px-3.5 font-medium hover:bg-muted max-md:h-10', compact && 'h-10 gap-1.5 px-2.5 text-[13px] md:h-8')}
          placeholder={connectPlaceholder}
        />
      )}
    </div>
  );
}
