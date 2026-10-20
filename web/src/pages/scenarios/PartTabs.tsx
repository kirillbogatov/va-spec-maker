import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn, GHOST } from '@/lib/utils';
import type { ScenarioPart } from '@/lib/types';

interface TabsProps {
  parts: ScenarioPart[];
  activeKey: string;
  onSelect: (key: string) => void;
  onAdd?: () => void;
}

/** Вкладки подсценариев: у каждой свои состояния и переходы. Название и описание правятся в панели справа. */
export function PartTabs({ parts, activeKey, onSelect, onAdd }: TabsProps) {
  const active = parts.find((p) => p.key === activeKey) ?? parts[0];
  return (
    <div role="tablist" aria-label="Вкладки сценария" className="mb-4 flex flex-wrap items-center gap-1 border-b">
      {parts.map((p) => (
        <button
          key={p.key}
          type="button"
          role="tab"
          aria-selected={p.key === active.key}
          onClick={() => onSelect(p.key!)}
          className={cn(
            '-mb-px max-w-60 truncate border-b-2 px-3 py-1.5 text-sm font-medium',
            p.key === active.key ? 'border-brand text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {p.name.trim() || 'Без названия'}
        </button>
      ))}
      {onAdd && (
        <Button variant="ghost" size="icon" className="size-7" aria-label="Добавить вкладку" title="Добавить вкладку" onClick={onAdd}>
          <Plus className="size-4" />
        </Button>
      )}
    </div>
  );
}

interface PanelProps {
  part: ScenarioPart;
  canRemove: boolean;
  onChange: (patch: Partial<Pick<ScenarioPart, 'name' | 'description'>>) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Свойства вкладки — показываются справа от схемы по клику на вкладку. */
export function PartPanel({ part, canRemove, onChange, onRemove, onClose }: PanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Вкладка</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Удалить вкладку"
            title={canRemove ? 'Удалить вкладку' : 'Нельзя удалить единственную вкладку'}
            disabled={!canRemove}
            onClick={onRemove}
          >
            <Trash2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Закрыть" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <Input
        className={cn(GHOST, 'h-9 font-medium')}
        value={part.name}
        onChange={(e) => onChange({ name: e.target.value })}
        aria-label="Название вкладки"
        placeholder="Название вкладки — подзаголовок в State transitions"
      />
      <Textarea
        rows={3}
        className={cn(GHOST, 'min-h-16')}
        value={part.description}
        onChange={(e) => onChange({ description: e.target.value })}
        aria-label="Описание вкладки"
        placeholder="Описание сценария этой вкладки"
      />
    </div>
  );
}
