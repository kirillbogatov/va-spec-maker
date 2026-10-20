import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Поле без рамки: рамка и фон проявляются при наведении и фокусе (как на референсе). */
export const GHOST =
  'border-transparent border-b-border bg-transparent shadow-none hover:bg-muted focus-visible:border-ring focus-visible:bg-background dark:bg-transparent dark:hover:bg-muted';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
