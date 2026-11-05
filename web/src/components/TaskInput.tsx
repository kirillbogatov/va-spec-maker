import { useId, useRef, useState, type ComponentProps } from 'react';
import { normalizeTaskLinks, parseTextLinks } from '@va/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MarkdownInline } from '@/components/MarkdownView';
import { cn } from '@/lib/utils';

/** Вставленный URL становится ссылкой; адрес и подпись можно отредактировать. */
export function TaskInput({ value, onValueChange, onBlur, onPaste, onFocus, ...props }: Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & { value: string; onValueChange: (value: string) => void }) {
  const hintId = useId();
  const container = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const normalized = normalizeTaskLinks(value);
  const hasLink = parseTextLinks(normalized).some((part) => part.url);
  return (
    <div ref={container} className="min-w-0">
      {hasLink && !editing ? (
        <div className={cn('relative min-h-8 min-w-0 rounded-md border border-transparent px-2.5 py-1 text-base transition-colors md:text-sm', props.className)}>
          <Button variant="ghost" className="absolute inset-0 h-full w-full rounded-md hover:bg-transparent dark:hover:bg-transparent" aria-label="Редактировать задачу" aria-describedby={hintId} disabled={props.disabled || props.readOnly} onClick={() => setEditing(true)} />
          <div className="pointer-events-none relative min-w-0 [overflow-wrap:anywhere] [&_a]:pointer-events-auto"><MarkdownInline text={normalized} /></div>
        </div>
      ) : (
        <Input
          {...props}
          autoFocus={editing}
          value={value}
          placeholder="Номер задачи или ссылка"
          aria-describedby={hintId}
          onChange={(e) => onValueChange(e.target.value)}
          onFocus={(e) => { setEditing(true); onFocus?.(e); }}
          onBlur={(e) => {
            if (normalized !== value) onValueChange(normalized);
            setEditing(false);
            onBlur?.(e);
          }}
          onPaste={(e) => {
            onPaste?.(e);
            if (e.defaultPrevented) return;
            const input = e.currentTarget;
            const next = value.slice(0, input.selectionStart ?? value.length) + e.clipboardData.getData('text/plain') + value.slice(input.selectionEnd ?? value.length);
            const link = normalizeTaskLinks(next);
            if (link !== next) {
              e.preventDefault();
              onValueChange(link);
              setEditing(false);
              requestAnimationFrame(() => container.current?.querySelector('a')?.focus());
            }
          }}
        />
      )}
      <span id={hintId} className="sr-only">Название задачи или веб-ссылка. Jira-ссылка автоматически сокращается до номера задачи. Для своей подписи используйте [текст](https://адрес).</span>
    </div>
  );
}
