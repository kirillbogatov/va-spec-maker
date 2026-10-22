import { useProjectId } from '@/hooks/project';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useNormalize, writeNormalize } from '@/lib/normalize';
import { PREFIX_FIELDS, usePrefixes, writePrefix } from '@/lib/prefixes';

/** Настройки проекта: с чего начинается название нового интента, сущности, промпта, зависимости и сценария. */
export function SettingsPage() {
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const normalize = useNormalize(projectId);
  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="mx-auto max-w-xl">
        <h1 className="text-xl font-semibold tracking-tight">Настройки</h1>
        <section className="mt-6 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold">Префиксы названий</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">Подставляются в поле при создании нового объекта. Пустое поле — без префикса.</p>
          <div className="mt-4 flex flex-col gap-3">
            {PREFIX_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0">{f.label}</span>
                <Input
                  className="font-mono"
                  value={prefixes[f.key]}
                  placeholder={f.hint}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => writePrefix(projectId, f.key, e.target.value.replace(/\s/g, ''))}
                />
              </label>
            ))}
          </div>
        </section>
        <section className="mt-4 rounded-xl border bg-card p-4">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold">Нормализовать слова</span>
              <span className="mt-1 block text-[13px] text-muted-foreground">
                Слова тренировочных фраз и значений сущностей приводятся к начальной форме (основе): «заказать» и «заказал» считаются одним словом.
                Влияет на поиск дубликатов фраз и распознавание сущностей во фразах.
              </span>
            </span>
            <Switch checked={normalize} onCheckedChange={(v) => writeNormalize(projectId, v)} aria-label="Нормализовать слова" />
          </label>
        </section>
      </div>
    </div>
  );
}
