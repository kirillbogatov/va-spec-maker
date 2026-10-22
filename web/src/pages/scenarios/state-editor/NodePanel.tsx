import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TypeToken } from '@/components/TypeToken';
import { cn, FIELD } from '@/lib/utils';
import type { StateInfo, PromptListItem } from '@/lib/types';
import { DialogLabel, OptionSelect } from '../StepsTable';
import { PanelHeader, PanelRoot, PanelSection } from './PanelParts';

interface Props {
  name: string;
  info: StateInfo | undefined;
  prompts: PromptListItem[];
  onPatchInfo: (p: Partial<StateInfo>) => void;
  isEntry: boolean;
  isTerminal?: boolean;
  /** Имя входного состояния: зафиксировано. */
  entryName: string;
  onRename: (to: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Редактор узла: имя, описание, ответ ассистента, действие системы. */
export function NodePanel({ name, info, prompts, onPatchInfo, isEntry, isTerminal, entryName, onRename, onRemove, onClose }: Props) {
  const [value, setValue] = useState(name);
  const promptOptions = [{ value: 'none', label: '— не выбран —' }, ...prompts.map((p) => ({ value: String(p.id), label: p.name, hint: p.hint }))];
  return (
    <PanelRoot>
      <PanelHeader>
        <div className="flex items-center gap-2">
          <TypeToken kind="state" className="font-sans text-[11px] uppercase tracking-wide">Состояние</TypeToken>
          {isEntry ? <span className="text-[10px] font-semibold uppercase tracking-wide text-brand">Старт</span> : isTerminal ? <span className="text-[10px] font-semibold uppercase tracking-wide text-ent">Конец</span> : null}
        </div>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" aria-label="Удалить состояние" onClick={onRemove}><Trash2 className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Закрыть панель" onClick={onClose}><X className="size-4" /></Button>
        </div>
      </PanelHeader>
      <PanelSection title="Состояние">
        <div>
          <DialogLabel>Имя</DialogLabel>
          <Input
            className={cn(FIELD, 'font-mono')} value={value} readOnly={isEntry} title={isEntry ? `Входное состояние всегда называется ${entryName}` : undefined} aria-label="Имя состояния"
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => { onRename(value); setValue(name); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          />
        </div>
        <div>
          <DialogLabel>Описание (выводится на схеме)</DialogLabel>
          <Textarea rows={1} className={cn(FIELD, 'field-sizing-content min-h-9')} value={info?.description ?? ''} onChange={(e) => onPatchInfo({ description: e.target.value })} aria-label="Описание состояния" />
        </div>
      </PanelSection>
      <PanelSection title="При входе в состояние">
        <div>
          <DialogLabel>Ответ ассистента</DialogLabel>
          <OptionSelect options={promptOptions} value={info?.prompt_id ?? null} onChange={(prompt_id) => onPatchInfo({ prompt_id })} label="Ответ ассистента" className={FIELD} />
        </div>
        <div>
          <DialogLabel>Действие системы</DialogLabel>
          <Textarea rows={1} className={cn(FIELD, 'field-sizing-content min-h-9')} value={info?.system_action ?? ''} onChange={(e) => onPatchInfo({ system_action: e.target.value })} aria-label="Действие системы" />
        </div>
      </PanelSection>
    </PanelRoot>
  );
}
