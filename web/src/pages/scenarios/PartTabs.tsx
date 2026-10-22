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

/** Вкладки подсценариев: у каждой свои состояния и переходы. Одна вкладка без кнопки «+» не показывается. */
export function PartTabs({ parts, activeKey, onSelect, onAdd }: TabsProps) {
  const active = parts.find((p) => p.key === activeKey) ?? parts[0];
  if (parts.length <= 1 && !onAdd) return null;
  return (
    <div role="tablist" aria-label="Вкладки сценария" className="flex flex-wrap items-center gap-1">
      {parts.length > 1 && parts.map((p) => (
        <button
          key={p.key}
          type="button"
          role="tab"
          aria-selected={p.key === active.key}
          onClick={() => onSelect(p.key!)}
          className={cn(
            'inline-flex min-h-8 max-w-48 items-center truncate rounded-md px-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring',
            p.key === active.key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {p.name.trim() || 'Без названия'}
        </button>
      ))}
      {onAdd && (
        <Button variant="ghost" size="sm" aria-label="Добавить вкладку" title="Добавить вкладку (подсценарий)" onClick={onAdd}>
          <Plus className="size-4" /> {parts.length > 1 ? '' : 'Подсценарий'}
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
