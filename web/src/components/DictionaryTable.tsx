import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateDialog } from '@/components/CreateDialog';
import { Section, SectionAction } from '@/components/Section';
import { SaveIndicator } from '@/components/SaveIndicator';
import { useAutosave } from '@/hooks/useAutosave';
import { cn, GHOST } from '@/lib/utils';

export interface DictItem {
  id: number;
  name: string;
  description?: string;
  used_by: { id: number; name: string; scenario_id?: number | null }[];
}

export interface DictColumn<T> {
  header: string;
  className?: string;
  cell: (draft: T, patch: (p: Partial<T>) => void) => ReactNode;
}

interface Props<T extends DictItem> {
  title: string;
  items: T[];
  nameHeader?: string;
  /** Колонка «Описание» (по умолчанию есть). */
  withDescription?: boolean;
  columns?: DictColumn<T>[];
  /** Развёрнутая под строкой область (например, значения сущности). */
  expand?: { render: (draft: T, patch: (p: Partial<T>) => void) => ReactNode };
  emptyText: string;
  createTitle: string;
  createPrefix?: string;
  deleteTitle: (d: T) => string;
  deleteDescription?: (d: T) => string | undefined;
  onCreate: (name: string) => void;
  onSave: (draft: T) => Promise<unknown>;
  onRemove: (item: T) => void;
}

/** Справочник одной таблицей: все элементы и все их атрибуты видны сразу, правка — прямо в ячейках с автосохранением. */
export function DictionaryTable<T extends DictItem>(p: Props<T>) {
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [params] = useSearchParams();
  const focus = Number(params.get('focus')) || null;
  const t = q.trim().toLowerCase();
  const rows = t ? p.items.filter((i) => i.name.toLowerCase().includes(t) || (i.description ?? '').toLowerCase().includes(t)) : p.items;
  const colCount = 2 + (p.withDescription === false ? 0 : 1) + (p.columns?.length ?? 0) + 1 +(p.expand ? 1 : 0);

  return (
    <div className="h-full overflow-y-auto bg-page p-4">
      <Section
        title={p.title}
        action={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Фильтр" aria-label="Фильтр" className="h-8 w-56 pl-7" />
            </div>
            <SectionAction onClick={() => setCreating(true)}>Добавить</SectionAction>
          </>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              {p.expand && <TableHead className="w-8" />}
              <TableHead className="w-64">{p.nameHeader ?? 'Название'}</TableHead>
              {p.withDescription !== false && <TableHead>Описание</TableHead>}
              {p.columns?.map((c) => (
                <TableHead key={c.header} className={c.className}>{c.header}</TableHead>
              ))}
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((item) => (
              <DictRow key={item.id} item={item} p={p} colCount={colCount} focused={item.id === focus} />
            ))}
            {p.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={colCount} className="px-3 text-sm text-muted-foreground">{p.emptyText}</TableCell>
              </TableRow>
            )}
            {p.items.length > 0 && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={colCount} className="px-3 text-sm text-muted-foreground">Ничего не найдено</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Section>
      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        title={p.createTitle}
        prefix={p.createPrefix}
        existingNames={p.items.map((i) => i.name)}
        onCreate={(n) => p.onCreate(n)}
      />
    </div>
  );
}

function DictRow<T extends DictItem>({ item, p, colCount, focused }: { item: T; p: Props<T>; colCount: number; focused: boolean }) {
  const [draft, setDraft] = useState<T>(item);
  const [open, setOpen] = useState(focused && !!p.expand);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLTableRowElement>(null);
  const patch = (x: Partial<T>) => setDraft((d) => ({ ...d, ...x }));
  const status = useAutosave(draft, async (d) => {
    if (!d.name.trim()) return;
    await p.onSave(d);
  });
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'center' });
  }, [focused]);

  return (
    <Fragment>
      <TableRow ref={ref} className={cn('align-top', focused && 'bg-brand/5')}>
        {p.expand && (
          <TableCell className="px-1">
            <Button variant="ghost" size="icon" aria-label={open ? 'Свернуть' : 'Развернуть'} onClick={() => setOpen((o) => !o)}>
              <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
            </Button>
          </TableCell>
        )}
        <TableCell>
          <Input className={cn(GHOST, 'font-medium')} value={draft.name} onChange={(e) => patch({ name: e.target.value } as Partial<T>)} aria-label="Название" />
        </TableCell>
        {p.withDescription !== false && (
          <TableCell>
            <Input
              className={GHOST}
              placeholder="Добавьте описание"
              aria-label="Описание"
              value={draft.description ?? ''}
              onChange={(e) => patch({ description: e.target.value } as Partial<T>)}
            />
          </TableCell>
        )}
        {p.columns?.map((c) => (
          <TableCell key={c.header}>{c.cell(draft, patch)}</TableCell>
        ))}
        <TableCell>
          <span className="flex items-center justify-end gap-1">
            <SaveIndicator state={status} compact />
            <Button variant="ghost" size="icon" aria-label="Удалить" onClick={() => setConfirm(true)}>
              <Trash2 className="size-4" />
            </Button>
          </span>
        </TableCell>
      </TableRow>
      {p.expand && open && (
        <TableRow className="hover:bg-transparent">
          <TableCell />
          <TableCell colSpan={colCount - 1} className="pb-4">{p.expand.render(draft, patch)}</TableCell>
        </TableRow>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={p.deleteTitle(item)}
        description={p.deleteDescription?.(item)}
        onConfirm={() => p.onRemove(item)}
      />
    </Fragment>
  );
}
