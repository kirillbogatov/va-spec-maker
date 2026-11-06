import { useRef, useState } from 'react';
import { Input } from './ui/input';
import { cn } from '@/lib/utils';

/** Редактирование на месте: Enter/уход из поля сохраняет, Escape отменяет. */
export function EditableDictionaryValue({ value, values, onChange, label = 'синоним', className }: {
  value: string; values: string[]; onChange: (next: string) => void; label?: string; className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const done = useRef(false);
  const next = draft?.trim() ?? '';
  const error = !next ? 'Введите значение' : next !== value && values.includes(next) ? 'Такое значение уже есть' : '';
  const commit = () => {
    if (done.current || error) return;
    done.current = true;
    setDraft(null);
    if (next !== value) onChange(next);
  };
  return draft === null ? (
    <button type="button" aria-label={`Редактировать ${label} ${value}`} title="Нажмите, чтобы изменить"
      className={cn('min-h-8 min-w-0 flex-1 rounded-md text-left text-sm break-words outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring', className)}
      onClick={() => { done.current = false; setDraft(value); }}>{value}</button>
  ) : (
    <span className="min-w-0 flex-1">
      <Input autoFocus aria-label={`Изменить ${label} ${value}`} aria-invalid={!!error} value={draft}
        className="h-8 bg-card dark:bg-card" onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); done.current = true; setDraft(null); }
        }} />
      {error && <span role="alert" className="block text-xs text-destructive">{error}</span>}
    </span>
  );
}
