import { ImportFilePicker } from '@/components/ImportFilePicker';
import { IMPORT_ACCEPT, IMPORT_TYPES, readScenarioFile } from '@/lib/scenarioDocument';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';

export function ImportScenarioDialog({ open, onOpenChange, projectId, onDone }: {
  open: boolean; onOpenChange: (open: boolean) => void; projectId: number; onDone: (id: number) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [dump, setDump] = useState<unknown>(null);
  const [scenarios, setScenarios] = useState<{ id: number; name: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const reset = () => { setDump(null); setScenarios([]); setSelected(''); setFile(null); };
  const close = (value: boolean) => { if (!busy && !reading) { if (!value) reset(); onOpenChange(value); } };
  return <Dialog open={open} onOpenChange={close}>
    <DialogContent>
      <DialogHeader><DialogTitle>Импорт сценария</DialogTitle></DialogHeader>
      <form className="min-w-0 space-y-4" onSubmit={async e => {
        e.preventDefault();
        if (!dump || !selected || busy) return;
        setBusy(true);
        try {
          const result = await api.scenarios.import(projectId, dump, Number(selected));
          onDone(result.id); toast.success('Сценарий импортирован'); reset(); onOpenChange(false);
        } catch (error) { toast.error((error as Error).message); }
        finally { setBusy(false); }
      }}>
        <ImportFilePicker accept={IMPORT_ACCEPT} types={IMPORT_TYPES} file={file} disabled={busy || reading} onChange={async file => {
            reset(); setFile(file);
            if (!file) return;
            setReading(true);
            try {
              const result = await readScenarioFile(file);
              const data = result.dump;

              const rows = data?.tables?.scenarios;
              if (data?.version !== 1 || !Array.isArray(rows) || !rows.length || rows.some(r => !Number.isSafeInteger(r?.id) || typeof r?.name !== 'string')) throw new Error('В файле нет сценариев. Выберите экспорт проекта или спецификацию.');
              setDump(data); setScenarios(rows); setSelected(String(rows[0].id));
            } catch (error) { toast.error((error as Error).message); }
            finally { setReading(false); }
          }} />
        {scenarios.length > 1 && <label className="block space-y-2 text-sm">
          <span>Сценарий</span>
          <select className="h-10 w-full rounded-md border bg-background px-3 text-sm md:h-9" value={selected} disabled={busy || reading} onChange={e => setSelected(e.target.value)}>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy || reading} onClick={() => close(false)}>Отмена</Button>
          <Button type="submit" disabled={!dump || !selected || busy || reading}>{reading ? 'Чтение…' : busy ? 'Импорт…' : 'Импортировать'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
