import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Поле без рамки: рамка и фон проявляются при наведении и фокусе (как на референсе). */
export const GHOST =
  'border-transparent bg-transparent shadow-none hover:bg-muted focus-visible:border-ring focus-visible:bg-background dark:bg-transparent dark:hover:bg-muted';

/** Поля диалога и инспектора: видимая рамка вместо «призрачного» стиля таблицы. */
export const FIELD = 'border-input bg-background shadow-xs hover:bg-background';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Первое свободное название вида «Новый интент», «Новый интент 2», … (без учёта регистра). */
export function uniqueName(base: string, taken: string[]) {
  const used = new Set(taken.map((n) => n.trim().toLowerCase()));
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} ${i}`;
  return name;
}
