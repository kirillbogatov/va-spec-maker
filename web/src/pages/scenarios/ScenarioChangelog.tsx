import { ResizableColumns } from '@/components/ResizableColumns';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
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
type ChangeLogRow = ChangelogRow & { key?: string };
import { cn, GHOST } from '@/lib/utils';
import { ROW } from './Card';
import { SortHeader, useColumnSort } from '@/components/ColumnSort';

const FIELD_LABEL = 'text-xs text-muted-foreground @min-[28rem]/changelog:sr-only';
const COLS = '@min-[28rem]/changelog:[grid-template-columns:var(--resizable-columns)]';

/** Таблица истории изменений, которую заполняют вручную: задача, автор, описание изменений. Сохраняется сама. */
function ChangeLogForm({ scenarioId, initial }: { scenarioId: number; initial: ChangeLogRow[] }) {
  const qc = useQueryClient();
  const sort = useColumnSort();
  const [rows, setRows] = useState<ChangeLogRow[]>(() => initial.map((r) => ({ ...r, key: crypto.randomUUID() })));
  const baseline = useRef(initial);
  const savedRows = useRef(rows);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [conflict, setConflict] = useState<{ current: ChangeLogRow[] | null } | null>(null);
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
  const save = async (v: ChangeLogRow[]) => {
    try {
      baseline.current = await api.scenarios.saveChangelog(scenarioId, v.map(({ date, task, author, description }) => ({ date, task, author, description })), baseline.current);
      savedRows.current = v;
      qc.setQueryData(['changelog', scenarioId], baseline.current);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'edit_conflict') setConflict(e.details as { current: ChangeLogRow[] | null });
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
  const patch = (i: number, p: Partial<ChangeLogRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="action" variant="outline"  onClick={() => {
          sort.reset();
          setRows((rs) => [{ key: crypto.randomUUID(), date: '', task: '', author: '', description: '' }, ...rs]);
        }}>
          <Plus className="size-4" /> Добавить
        </Button>
        <SaveIndicator state={status} compact />
      </div>
      <ResizableColumns storageKey="scenario-changelog" columns={['date', 'task', 'author', 'description']} className="min-w-0 overflow-hidden rounded-xl border bg-card" aria-label="История изменений сценария" initial="minmax(0,124px) minmax(0,1fr) minmax(0,1fr) minmax(0,1.5fr) 32px" trailing="32px">
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
        <div className={cn(ROW, COLS, 'flex flex-wrap items-center border-t-0 py-1 text-xs font-medium text-muted-foreground @min-[28rem]/changelog:grid')}>
          <SortHeader column="date" sort={sort}>Дата</SortHeader>
          <SortHeader column="task" sort={sort}>Задача</SortHeader>
          <SortHeader column="author" sort={sort}>Автор</SortHeader>
          <SortHeader column="description" sort={sort}>Описание изменений</SortHeader>
          <span />
        </div>
        {sort.rows(rows, (row, column) => row[column as 'date' | 'task' | 'author' | 'description'] ?? '').map((r) => { const i = rows.indexOf(r); return (
          <div key={r.key} className={cn(ROW, COLS, '@min-[28rem]/changelog:items-start')}>
            <label className="grid min-w-0 gap-1">
              <span className={FIELD_LABEL}>Дата</span>
              <Input type="date" className={cn(GHOST, 'min-w-0 rounded-md')} aria-label={`Дата, строка ${i + 1}`} value={r.date ?? ''} onChange={(e) => patch(i, { date: e.target.value })} />
            </label>
            <label className="grid min-w-0 gap-1">
              <span className={FIELD_LABEL}>Задача</span>
              <TaskInput className={cn(GHOST, 'rounded-md')} aria-label={`Задача, строка ${i + 1}`} value={r.task} onValueChange={(task) => patch(i, { task })} />
            </label>
            <label className="grid min-w-0 gap-1">
              <span className={FIELD_LABEL}>Автор</span>
              <Input className={cn(GHOST, 'rounded-md')} aria-label={`Автор, строка ${i + 1}`} value={r.author} onChange={(e) => patch(i, { author: e.target.value })} />
            </label>
            <label className="grid min-w-0 gap-1">
              <span className={FIELD_LABEL}>Описание изменений</span>
              <Textarea
                rows={1}
                className={cn(GHOST, 'min-h-8 resize-none rounded-md py-1 text-sm md:text-sm')}
                aria-label={`Описание изменений, строка ${i + 1}`}
                value={r.description}
                onChange={(e) => patch(i, { description: e.target.value })}
              />
            </label>
            <Button variant="ghost" size="icon" className="justify-self-end max-md:size-10" aria-label={`Удалить строку ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
              <X className="size-4" />
            </Button>
          </div>
        ); })}
        {rows.length === 0 && <p className="border-t px-4 py-4 text-sm text-muted-foreground">Записей пока нет</p>}
      </ResizableColumns>
    </div>
  );
}

/** Редактируемая история изменений сценария на отдельной вкладке. */
export function ScenarioChangelog({ scenarioId }: { scenarioId: number }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['changelog', scenarioId],
    queryFn: () => api.scenarios.changelog(scenarioId),
    refetchOnMount: 'always',
    gcTime: 0,
  });

  return (
    <div className="@container/changelog min-w-0">
      {isLoading && <p role="status" className="text-sm text-muted-foreground">Загрузка…</p>}
      {error && <div className="rounded-xl border bg-card px-4 py-3">
        <p role="alert" className="text-sm text-destructive">Не удалось загрузить историю: {(error as Error).message}</p>
        <Button variant="outline" className="mt-3" onClick={() => void refetch()}>Повторить</Button>
      </div>}
      {data && <ChangeLogForm scenarioId={scenarioId} initial={data} />}
    </div>
  );
}
