import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchSelect, type SearchOption } from '@/components/SearchSelect';

export function CreateScenarioDialog({ open, onOpenChange, templates = false, prefix, existingNames, sources, initialName, initialSource, onCreate }: {
  open: boolean; onOpenChange: (open: boolean) => void; templates?: boolean; prefix: string;
  existingNames: string[]; sources: SearchOption[]; initialName?: string; initialSource?: number;
  onCreate: (name: string, sourceId?: number) => Promise<unknown>;
}) {
  const [name, setName] = useState(prefix);
  const [source, setSource] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (open) { setName(initialName ?? prefix); setSource(initialSource == null ? null : String(initialSource)); setError(''); }
  }, [open, prefix, initialName, initialSource]);
  const duplicate = existingNames.some(n => n.trim().toLowerCase() === name.trim().toLowerCase());
  const invalid = !name.trim() || name.trim() === prefix.trim() || duplicate;
  return <Dialog open={open} onOpenChange={o => !pending && onOpenChange(o)}>
    <DialogContent>
      <DialogHeader><DialogTitle>{templates ? 'Новый шаблон сценария' : 'Новый сценарий'}</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={async e => {
        e.preventDefault();
        if (invalid || pending) return;
        setPending(true); setError('');
        try { await onCreate(name.trim(), source == null ? undefined : Number(source)); onOpenChange(false); }
        catch (e) { setError(e instanceof Error ? e.message : 'Не удалось создать. Повторите попытку.'); }
        finally { setPending(false); }
      }}>
        <label className="grid gap-1 text-sm">Название
          <Input autoFocus aria-label="Название" placeholder="Название" value={name}
            onChange={e => setName(e.target.value)} aria-invalid={duplicate} disabled={pending} />
        </label>
        {duplicate && <p role="alert" className="text-sm text-destructive">Элемент с таким названием уже существует</p>}
        {sources.length > 0 && <div className="grid gap-1 text-sm">
          <span>{templates ? 'На основе сценария или шаблона' : 'Шаблон сценария'}</span>
          <SearchSelect label={templates ? 'Исходный сценарий или шаблон' : 'Шаблон сценария'} value={source}
            options={[{ value: '', label: templates ? 'Без исходного сценария' : 'Без шаблона' }, ...sources]}
            onChange={v => !pending && setSource(v || null)} placeholder={templates ? 'Без исходного сценария' : 'Без шаблона'} />
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="submit" disabled={invalid || pending}>{pending ? 'Создание…' : 'Создать'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
