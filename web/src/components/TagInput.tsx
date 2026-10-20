import { useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
    <div className="flex flex-wrap items-center gap-1 rounded-none border border-transparent px-2 py-1 hover:bg-muted focus-within:border-ring focus-within:bg-background">
      {value.map((t, i) => (
        <Badge key={`${t}-${i}`} variant="secondary" className="gap-1 font-normal">
          {t}
          <button type="button" aria-label={`Удалить ${t}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <input
        className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none"
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
