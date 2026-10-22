import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EntityTypeFields } from '@/components/EntityTypeFields';
import { Input } from '@/components/ui/input';
import { DEFAULT_KIND, rangeError, type EntityKind } from '@/lib/entityTypes';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onCreate: (name: string, kind?: EntityKind) => void;
  /** Показать выбор типа сущности и диапазона. */
  withType?: boolean;
  /** Уже занятые названия: совпадение (без учёта регистра) блокирует создание. */
  existingNames?: string[];
  /** Начало названия, которое подставляется в поле при открытии: INT_, PRM_… */
  prefix?: string;
}

export function CreateDialog({ open, onOpenChange, title, onCreate, withType = false, existingNames = [], prefix = '' }: Props) {
  const [name, setName] = useState(prefix);
  const [kind, setKind] = useState<EntityKind>(DEFAULT_KIND);
  useEffect(() => {
    if (open) {
      setName(prefix);
      setKind(DEFAULT_KIND);
    }
  }, [open, prefix]);
  const empty = !name.trim() || name.trim() === prefix.trim();
  const duplicate = existingNames.some((n) => n.trim().toLowerCase() === name.trim().toLowerCase());
  const invalid = withType && !!rangeError(kind);
  const submit = () => {
    if (empty || duplicate || invalid) return;
    onCreate(name.trim(), withType ? kind : undefined);
    setName(prefix);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input autoFocus onFocus={(e) => { const n = e.currentTarget.value.length; e.currentTarget.setSelectionRange(n, n); }} placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={duplicate} />
          {duplicate && <p role="alert" className="text-sm text-destructive">Элемент с таким названием уже существует</p>}
          {withType && <EntityTypeFields kind={kind} onChange={setKind} />}
          <DialogFooter>
            <Button type="submit" disabled={empty || duplicate || invalid}>
              Создать
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
