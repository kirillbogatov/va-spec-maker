import { SortHeader, useColumnSort } from '@/components/ColumnSort';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TaskInput } from '@/components/TaskInput';
import { Textarea } from '@/components/ui/textarea';
import { SaveIndicator } from '@/components/SaveIndicator';
import { useAutosave } from '@/hooks/useAutosave';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import { downloadBlob } from '@/lib/download';
import type { ChangelogRow } from '@/lib/types';
import { cn, GHOST } from '@/lib/utils';
import { AddButton, Card, ROW } from './Card';

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
  const sort = useColumnSort();
  const [rows, setRows] = useState<Row[]>(() => initial.map((r) => ({ ...r, key: crypto.randomUUID() })));
  const baseline = useRef(initial);
  const savedRows = useRef(rows);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [conflict, setConflict] = useState<{ current: ChangelogRow[] | null } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => {
    if (conflict || rows !== savedRows.current || JSON.stringify(initial) === JSON.stringify(baseline.current)) return;
    baseline.current = initial;
    const next = initial.map((r) => ({ ...r, key: crypto.randomUUID() }));
    savedRows.current = next;
    setRows(next);
    setResetKey((key) => key + 1);
  }, [initial]);
  const save = async (v: Row[]) => {
    try {
      baseline.current = await api.scenarios.saveChangelog(scenarioId, v.map(({ date, task, author, description }) => ({ date, task, author, description })), baseline.current);
      savedRows.current = v;
      qc.setQueryData(['changelog', scenarioId], baseline.current);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'edit_conflict') setConflict(e.details as { current: ChangelogRow[] | null });
      throw e;
    }
  };
  const status = useAutosave(rows, save, { enabled: !conflict && !resolving, resetKey });
  const resolve = async (keep: boolean) => {
    if (!conflict?.current) return;
    setResolving(true);
    try {
      if (keep) {
        baseline.current = conflict.current;
        await save(rows);
      } else {
        baseline.current = await api.scenarios.changelog(scenarioId);
        const next = baseline.current.map((r) => ({ ...r, key: crypto.randomUUID() }));
        savedRows.current = next;
        setRows(next);
      }
      setConflict(null);
      if (!keep || rowsRef.current === savedRows.current) setResetKey((key) => key + 1);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResolving(false);
    }
  };
  const patch = (key: string, p: Partial<ChangelogRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const add = () => setRows((rs) => [...rs, { key: crypto.randomUUID(), date: '', task: '', author: '', description: '' }]);

  return (
    <Card flush title="История изменений" action={<><SaveIndicator state={status} compact /><AddButton onClick={add}>Добавить</AddButton></>}>
      {conflict && <div role="alert" className="border-b bg-muted px-4 py-3">
        <p className="font-medium">История изменений обновлена в другой вкладке</p>
        <p className="mt-1 text-sm">Автосохранение приостановлено. Ваши строки остаются в редакторе.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {conflict.current && <>
            <Button variant="outline" disabled={resolving} onClick={() => void resolve(false)}>Загрузить сохранённую версию</Button>
            <Button disabled={resolving} onClick={() => void resolve(true)}>Сохранить мои строки поверх</Button>
          </>}
          <Button variant="outline" onClick={() => downloadBlob(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }), 'История изменений — черновик.json')}>Скачать строки</Button>
        </div>
      </div>}
      <div className={cn(ROW, COLS, 'flex flex-wrap items-center border-t-0 py-1 text-xs font-medium text-muted-foreground md:grid')}>
        <SortHeader column="date" sort={sort}>Дата</SortHeader>
        <SortHeader column="task" sort={sort}>Задача</SortHeader>
        <SortHeader column="author" sort={sort}>Автор</SortHeader>
        <SortHeader column="description" sort={sort}>Описание изменений</SortHeader>
        <span />
      </div>
      {sort.rows(rows, (row, column) => row[column as 'date' | 'task' | 'author' | 'description'] ?? '').map((r, i) => (
        <div key={r.key} className={cn(ROW, COLS, 'md:items-start')}>
          <Input type="date" className={cn(FIELD, 'min-w-0')} aria-label={`Дата, строка ${i + 1}`} value={r.date ?? ''} onChange={(e) => patch(r.key, { date: e.target.value })} />
          <TaskInput className={FIELD} value={r.task} aria-label={`Задача, строка ${i + 1}`} onChange={(e) => patch(r.key, { task: e.target.value })} />
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
