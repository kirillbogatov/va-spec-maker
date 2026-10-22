import { useState } from 'react';
import { X } from 'lucide-react';
import { splitTags } from '@/lib/parse';

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  /** true — запятая завершает тег; false — только Enter/потеря фокуса (для вопросов с запятыми) */
  commaSplit?: boolean;
}

export function TagInput({ value, onChange, placeholder, commaSplit = true }: Props) {
  const [text, setText] = useState('');
  const commit = (raw: string) => {
    const add = commaSplit ? splitTags(raw) : raw.trim() ? [raw.trim()] : [];
    if (add.length) onChange([...value, ...add]);
    setText('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 hover:bg-muted focus-within:border-ring focus-within:bg-background">
      {value.map((t, i) => (
        <span key={`${t}-${i}`} className="inline-flex min-h-7 items-center gap-1 rounded-md bg-secondary pl-2 pr-0.5 text-[13px] text-secondary-foreground">
          {t}
          <button
            type="button"
            aria-label={`Удалить ${t}`}
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input spellCheck={false}
        className="min-h-7 min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
        value={text}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => {
          const t = e.target.value;
          if (commaSplit && t.includes(',')) commit(t);
          else setText(t);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(text);
          } else if (e.key === 'Backspace' && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(text)}
      />
    </div>
  );
}
