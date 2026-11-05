import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { DictionaryDependency } from '@/lib/types';
import type { ValueRename } from '@/lib/dependencyEdits';

export interface DependencyDraft { name: string; description: string; values: string[]; value_renames: ValueRename[] }

export function DependencyEditor({ initial, existing, onClose, onSave }: {
  initial: { name: string; description: string; values: string[] };
  existing: DictionaryDependency | null;
  onClose: () => void;
  onSave: (draft: DependencyDraft) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [values, setValues] = useState(() => initial.values.map((value) => ({ key: crypto.randomUUID(), original: value, value })));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cleanValues = values.map((v) => v.value.trim()).filter(Boolean);
  const duplicate = new Set(cleanValues).size !== cleanValues.length;
  const changed = name.trim() !== initial.name || description !== initial.description || JSON.stringify(cleanValues) !== JSON.stringify(initial.values);
  const draft: DependencyDraft = { name: name.trim(), description, values: cleanValues,
    value_renames: values.filter((v) => v.original && v.value.trim() && v.original !== v.value.trim()).map((v) => ({ from: v.original, to: v.value.trim() })),
  };
  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await onSave(draft); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить зависимость'); }
    finally { setBusy(false); }
  };
  return <>
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-5 sm:max-w-xl" onKeyDown={(e) => { if (busy && e.key === 'Escape') e.preventDefault(); }}>
        <DialogHeader className="shrink-0 pb-4 pr-8"><DialogTitle>{existing ? `Зависимость ${initial.name}` : 'Новая зависимость'}</DialogTitle></DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => {
          e.preventDefault();
          if (busy || !draft.name || duplicate) return;
          if (!changed && existing) { onClose(); return; }
          if (existing) setConfirm(true); else void save();
        }}>
          <fieldset disabled={busy} className="-mx-1 min-h-0 space-y-4 overflow-y-auto px-1">
            <label className="grid gap-1 text-xs text-muted-foreground">Название<Input autoFocus aria-label="Название зависимости" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">Описание<Textarea rows={3} aria-label="Описание зависимости" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground">Возможные значения</span>
              {values.map((v, i) => <div key={v.key} className="flex items-center gap-1">
                <Input aria-label={`Значение ${i + 1}`} value={v.value} onChange={(e) => setValues((current) => current.map((x) => x.key === v.key ? { ...x, value: e.target.value } : x))} />
                <Button type="button" variant="ghost" size="icon" aria-label={`Удалить значение ${i + 1}`} onClick={() => setValues((current) => current.filter((x) => x.key !== v.key))}><X className="size-4" /></Button>
              </div>)}
              <Button type="button" variant="outline" size="action" onClick={() => setValues((current) => [...current, { key: crypto.randomUUID(), original: '', value: '' }])}><Plus className="size-4" /> Значение</Button>
              {duplicate && <p role="alert" className="text-sm text-destructive">Значения не должны повторяться.</p>}
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </fieldset>
          <DialogFooter className="shrink-0 -mx-5 -mb-5 mt-4 px-5">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Отмена</Button>
            <Button type="submit" disabled={busy || !name.trim() || duplicate}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Изменить зависимость?" confirmLabel="Сохранить изменения"
      description="Изменения затронут все сценарии, в которых используется эта зависимость."
      onConfirm={() => void save()} />
  </>;
}
