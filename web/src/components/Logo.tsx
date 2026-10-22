import { cn } from '@/lib/utils';

/** Знак сервиса: лист спецификации со срезанным углом и звуковой волной. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-brand" />
      <path d="M10 6h8.5L24 11.5V24a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" className="fill-primary-foreground" />
      <path d="M12.5 14.5v5M16 12.5v9M19.5 15v4" className="stroke-brand" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
