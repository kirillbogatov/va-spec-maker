import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export type SortValue = string | number | boolean;
interface Sorting { key: string; direction: 'ascending' | 'descending' }
const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

export function sortByColumn<T>(rows: T[], sorting: Sorting | null, value: (row: T, key: string) => SortValue): T[] {
  if (!sorting) return rows;
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const left = value(a.row, sorting.key), right = value(b.row, sorting.key);
    const compared = typeof left === 'string' || typeof right === 'string' ? collator.compare(String(left), String(right)) : Number(left) - Number(right);
    return (sorting.direction === 'ascending' ? compared : -compared) || a.index - b.index;
  }).map(({ row }) => row);
}

export function useColumnSort() {
  const [sorting, setSorting] = useState<Sorting | null>(null);
  return {
    sorting,
    toggle: (key: string) => setSorting((current) => current?.key !== key ? { key, direction: 'ascending' } : current.direction === 'ascending' ? { key, direction: 'descending' } : null),
    rows: <T,>(rows: T[], value: (row: T, key: string) => SortValue) => sortByColumn(rows, sorting, value),
  };
}

export function SortHeader({ column, sort, children }: { column: string; sort: ReturnType<typeof useColumnSort>; children: ReactNode }) {
  const direction = sort.sorting?.key === column ? sort.sorting.direction : 'none';
  const Icon = direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowUpDown;
  return <span role="columnheader" aria-sort={direction} className="min-w-0">
    <button type="button" className="inline-flex min-h-8 max-w-full items-center gap-1 rounded px-1 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onClick={() => sort.toggle(column)} aria-label={`Сортировать: ${children}`}>
      <span className="min-w-0">{children}</span><Icon className="size-3 shrink-0" />
    </button>
  </span>;
}
