import { useId, type ComponentProps } from 'react';
import { parseTextLinks } from '@va/core';
import { Input } from '@/components/ui/input';
import { MarkdownInline } from '@/components/MarkdownView';

/** Храним обычный текст или Markdown, рядом показываем ссылку с её подписью. */
export function TaskInput({ value, ...props }: Omit<ComponentProps<typeof Input>, 'value'> & { value: string }) {
  const hintId = useId();
  const hasLink = parseTextLinks(value).some((part) => part.url);
  return (
    <div className="min-w-0">
      <Input {...props} value={value} placeholder="[текст](https://…)" aria-describedby={hintId} />
      <span id={hintId} className="sr-only">Название задачи или ссылка в формате [текст](https://адрес).</span>
      {hasLink && <div className="mt-1 px-2.5 text-sm [overflow-wrap:anywhere]"><MarkdownInline text={value} /></div>}
    </div>
  );
}
