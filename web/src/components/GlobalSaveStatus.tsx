import { useEffect } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useSaveSummary } from '@/lib/saveStore';

/** Общий статус автосохранения в шапке + предупреждение при закрытии вкладки с несохранёнными правками. */
export function GlobalSaveStatus() {
  const { saving, error } = useSaveSummary();
  const dirty = saving > 0 || error > 0;
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (error > 0)
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
        <AlertCircle className="size-3.5" /> Не сохранено ({error}) — проверьте поля
      </span>
    );
  if (saving > 0)
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Сохранение…
      </span>
    );
  return null;
}
