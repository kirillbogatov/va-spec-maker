import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SectionAction } from '@/components/Section';
import { TagInput } from '@/components/TagInput';
import { GHOST } from '@/lib/utils';
import { parseBulkValues } from '@/lib/parse';
import type { EntityValue } from '@/lib/types';

/** Значения сущности с синонимами: раскрывается под строкой таблицы. */
export function EntityValues({ values, onChange }: { values: EntityValue[]; onChange: (v: EntityValue[]) => void }) {
  const [bulk, setBulk] = useState<string | null>(null);
  const patchValue = (i: number, p: Partial<EntityValue>) => onChange(values.map((v, j) => (j === i ? { ...v, ...p } : v)));

  return (
    <div className="max-w-4xl rounded-sm border bg-card px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Значения</h3>
        <div className="flex items-center gap-4">
          <SectionAction onClick={() => setBulk('')}>Массовая вставка</SectionAction>
          <SectionAction onClick={() => onChange([...values, { value: '', synonyms: [] }])}>Добавить значение</SectionAction>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-64">Значение (канонический вид)</TableHead>
            <TableHead>Синонимы</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {values.map((v, i) => (
            <TableRow key={i}>
              <TableCell>
                <Input className={GHOST} value={v.value} onChange={(e) => patchValue(i, { value: e.target.value })} aria-label={`Значение ${i + 1}`} />
              </TableCell>
              <TableCell>
                <TagInput value={v.synonyms} onChange={(synonyms) => patchValue(i, { synonyms })} placeholder="Синоним, Enter" />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" aria-label="Удалить значение" onClick={() => onChange(values.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {values.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="px-3 text-sm text-muted-foreground">Значений пока нет</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={bulk !== null} onOpenChange={(o) => !o && setBulk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Массовая вставка значений</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Одна строка — одно значение: <code>значение: синоним1, синоним2</code></p>
          <Textarea rows={8} value={bulk ?? ''} onChange={(e) => setBulk(e.target.value)} />
          <DialogFooter>
            <Button
              onClick={() => {
                onChange([...values, ...parseBulkValues(bulk ?? '')]);
                setBulk(null);
              }}
            >
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
