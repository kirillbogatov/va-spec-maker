import { useState } from 'react';
import { toast } from 'sonner';
import { ImportFilePicker } from '@/components/ImportFilePicker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { IMPORT_ACCEPT, IMPORT_TYPES, readScenarioFile } from '@/lib/scenarioDocument';
import { api } from '@/lib/api';

export function ImportProjectDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const close = (value: boolean) => { if (!busy) { if (!value) setFile(null); onOpenChange(value); } };
  return <Dialog open={open} onOpenChange={close}><DialogContent>
    <DialogHeader><DialogTitle>Импорт проекта</DialogTitle></DialogHeader>
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault(); if (!file || busy) return; setBusy(true);
      try {
        const { dump } = await readScenarioFile(file);
        await api.projects.import(dump); onDone(); toast.success('Проект импортирован'); setFile(null); onOpenChange(false);
      } catch (error) { toast.error((error as Error).message); }
      finally { setBusy(false); }
    }}>
      <ImportFilePicker accept={IMPORT_ACCEPT} types={IMPORT_TYPES} file={file} disabled={busy} onChange={setFile} />
      <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => close(false)}>Отмена</Button><Button type="submit" disabled={!file || busy}>{busy ? 'Импорт…' : 'Импортировать'}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
