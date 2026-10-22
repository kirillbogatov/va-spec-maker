import { Trash2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ScenarioLink } from '@/lib/types';

// Общие стили модальных окон редактирования (интент, промпт, правило)

/** Строка добавления нового элемента: пунктирная рамка, плюс слева. */
export const ADD_ROW = 'h-8 w-full rounded-md border-dashed bg-transparent text-sm text-muted-foreground max-md:h-10 md:text-sm';

/** Кнопка «×» справа от строки списка. */
export const REMOVE_BTN = 'grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50 max-md:size-10';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** «интент», «промпт»: подставляется в заголовок. */
  noun: string;
  name: string;
  scenarios: ScenarioLink[];
  /** Что ещё сломается при удалении из проекта. */
  removeNote: string;
  onDisconnect: () => void;
  onRemove: () => void;
}

/** «Удалить»: выбор между «убрать из сценария» и «удалить из всего проекта». */
export function DeleteChoiceDialog({ open, onOpenChange, noun, name, scenarios, removeNote, onDisconnect, onRemove }: Props) {
  const pick = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-5 sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>Удалить {noun} «{name}»</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <button
            type="button"
            className="grid gap-0.5 rounded-lg border p-3 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={pick(onDisconnect)}
          >
            <span className="flex items-center gap-2 font-medium"><Unlink className="size-4" /> Убрать из сценария</span>
            <span className="text-xs text-muted-foreground">Останется в проекте, его можно будет подключить снова.</span>
          </button>
          <button
            type="button"
            className="grid gap-0.5 rounded-lg border p-3 text-left outline-none hover:bg-destructive-bg focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={pick(onRemove)}
          >
            <span className="flex items-center gap-2 font-medium text-destructive"><Trash2 className="size-4" /> Удалить из всего проекта</span>
            <span className="text-xs text-muted-foreground">
              {scenarios.length > 1 ? `Пропадёт из сценариев: ${scenarios.map((s) => s.name).join(', ')}. ` : 'Безвозвратно. '}
              {removeNote}
            </span>
          </button>
        </div>
        <DialogFooter className="-mx-5 -mb-5 px-5 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
