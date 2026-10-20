import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { parsePhrases } from '@/lib/parse';
import { cn, GHOST } from '@/lib/utils';

const COLLAPSED = 5;

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
}

/** Тренировочные фразы вариации: поле добавления (Enter / вставка нескольких строк) и список, свёрнутый после 5 строк. */
export function PhrasesCell({ value, onChange }: Props) {
  const [text, setText] = useState('');
  const [all, setAll] = useState(false);
  const add = (raw: string) => {
    const items = parsePhrases(raw);
    if (items.length) onChange([...value, ...items]);
    setText('');
  };
  const shown = all ? value : value.slice(0, COLLAPSED);

  return (
    <div className="space-y-2">
      <Input
        className={cn(GHOST, 'h-8 border-b-border/60')}
        aria-label="Добавить тренировочную фразу"
        placeholder="Фраза или паттерн — Enter, чтобы добавить"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          if (/\r?\n/.test(pasted)) {
            e.preventDefault();
            add(pasted);
          }
        }}
      />
      {shown.length > 0 && (
      <ul className="divide-y divide-border/60 rounded-md bg-muted/40">
        {shown.map((p, i) => (
          <li key={i} className="group flex items-start gap-2 px-2.5 py-1.5 hover:bg-muted">
            <span className="flex-1 break-words font-mono text-[13px] leading-5">{p}</span>
            <button
              type="button"
              aria-label="Удалить фразу"
              className="mt-0.5 text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      )}
      {value.length > COLLAPSED && (
        <button type="button" className="px-2 text-xs text-brand hover:underline" onClick={() => setAll(!all)}>
          {all ? 'Свернуть' : `Показать все (${value.length})`}
        </button>
      )}
    </div>
  );
}
