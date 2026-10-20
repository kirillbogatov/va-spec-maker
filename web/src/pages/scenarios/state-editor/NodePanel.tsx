import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FieldLabel } from '@/components/Section';
import { cn, GHOST } from '@/lib/utils';
import type { StateInfo, PromptListItem } from '@/lib/types';
import { OptionSelect } from '../StepsTable';

interface Props {
  name: string;
  info: StateInfo | undefined;
  prompts: PromptListItem[];
  onPatchInfo: (p: Partial<StateInfo>) => void;
  isEntry: boolean;
  /** Имя входного состояния: зафиксировано. */
  entryName: string;
  onRename: (to: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Редактор узла: имя, описание, ответ ассистента, действие системы. */
export function NodePanel({ name, info, prompts, onPatchInfo, isEntry, entryName, onRename, onRemove, onClose }: Props) {
  const [value, setValue] = useState(name);
  const promptOptions = [{ value: 'none', label: '— не выбран —' }, ...prompts.map((p) => ({ value: String(p.id), label: p.name }))];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Состояние{isEntry && <span className="ml-2 text-xs font-normal text-brand">вход</span>}</h3>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="Удалить состояние" onClick={onRemove}><Trash2 className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Закрыть панель" onClick={onClose}><X className="size-4" /></Button>
        </div>
      </div>
      <div>
        <FieldLabel>Имя</FieldLabel>
        <Input
          className={cn(GHOST, 'font-mono')} value={value} readOnly={isEntry} title={isEntry ? `Входное состояние всегда называется ${entryName}` : undefined} aria-label="Имя состояния"
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => { onRename(value); setValue(name); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </div>
      <div>
        <FieldLabel>Описание (выводится на схеме)</FieldLabel>
        <Textarea rows={1} className={cn(GHOST, 'field-sizing-content min-h-9')} value={info?.description ?? ''} onChange={(e) => onPatchInfo({ description: e.target.value })} aria-label="Описание состояния" />
      </div>
      <div>
        <FieldLabel>Ответ ассистента (при переходе в состояние)</FieldLabel>
        <OptionSelect options={promptOptions} value={info?.prompt_id ?? null} onChange={(prompt_id) => onPatchInfo({ prompt_id })} label="Ответ ассистента" />
      </div>
      <div>
        <FieldLabel>Действие системы (при переходе в состояние)</FieldLabel>
        <Textarea rows={1} className={cn(GHOST, 'field-sizing-content min-h-9')} value={info?.system_action ?? ''} onChange={(e) => onPatchInfo({ system_action: e.target.value })} aria-label="Действие системы" />
      </div>
    </div>
  );
}
