import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SaveIndicator } from '@/components/SaveIndicator';
import { useAutosave } from '@/hooks/useAutosave';
import { api } from '@/lib/api';
import type { ChangelogRow } from '@/lib/types';
import { cn, GHOST } from '@/lib/utils';
import { AddButton, Card, HEAD, ROW } from './Card';

const COLS = 'md:grid-cols-[minmax(0,145px)_minmax(0,180px)_minmax(0,180px)_minmax(0,1fr)_32px]';
const FIELD = cn(GHOST, 'h-8 w-full rounded-md border px-2.5 text-sm max-md:h-10 md:-ml-2.5 md:w-[calc(100%+0.625rem)]');

type Row = ChangelogRow & { key: string };

/** Журнал изменений, который ведут вручную: задача, автор и описание; сохраняется автоматически. */
export function ScenarioChangelog({ scenarioId }: { scenarioId: number }) {
  const { data, isSuccess } = useQuery({ queryKey: ['changelog', scenarioId], queryFn: () => api.scenarios.changelog(scenarioId) });
  return isSuccess ? <Editor scenarioId={scenarioId} initial={data} /> : <Card title="История изменений"><p className="text-sm text-muted-foreground">Загружаю…</p></Card>;
}

function Editor({ scenarioId, initial }: { scenarioId: number; initial: ChangelogRow[] }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>(() => initial.map((r) => ({ ...r, key: crypto.randomUUID() })));
  const status = useAutosave(rows, async (v) => {
    const saved = await api.scenarios.saveChangelog(scenarioId, v.map(({ key: _key, ...r }) => r));
    qc.setQueryData(['changelog', scenarioId], saved);
  });
  const patch = (key: string, p: Partial<ChangelogRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const add = () => setRows((rs) => [...rs, { key: crypto.randomUUID(), date: '', task: '', author: '', description: '' }]);

  return (
    <Card flush title="История изменений" action={<><SaveIndicator state={status} compact /><AddButton onClick={add}>Добавить</AddButton></>}>
      <div className={cn(ROW, HEAD, COLS)}>
        <span>Дата</span>
        <span>Задача</span>
        <span>Автор</span>
        <span>Описание изменений</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={r.key} className={cn(ROW, COLS, 'md:items-start')}>
          <Input type="date" className={cn(FIELD, 'min-w-0')} aria-label={`Дата, строка ${i + 1}`} value={r.date ?? ''} onChange={(e) => patch(r.key, { date: e.target.value })} />
          <Input className={FIELD} value={r.task} aria-label={`Задача, строка ${i + 1}`} onChange={(e) => patch(r.key, { task: e.target.value })} />
          <Input className={FIELD} value={r.author} aria-label={`Автор, строка ${i + 1}`} onChange={(e) => patch(r.key, { author: e.target.value })} />
          <Textarea
            rows={1}
            className={cn(FIELD, 'field-sizing-content h-auto min-h-8 resize-none py-1.5')}
            value={r.description}

            aria-label={`Описание изменений, строка ${i + 1}`}
            onChange={(e) => patch(r.key, { description: e.target.value })}
          />
          <Button variant="ghost" size="icon" className="max-md:size-10 max-md:justify-self-end" aria-label={`Удалить строку ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      {rows.length === 0 && <p className="border-t px-4 py-4 text-sm text-muted-foreground">Записей пока нет</p>}
    </Card>
  );
}
