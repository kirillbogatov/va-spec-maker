import { SettingsLayout } from './SettingsLayout';
import { useProjectId } from '@/hooks/project';
import { useTheme } from '@/lib/theme';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { INTENT_MODES, useIntentMode, writeIntentMode } from '@/lib/intentMode';
import { useNormalize, writeNormalize } from '@/lib/normalize';
import { SPEC_LANGS, useSpecLang, writeSpecLang } from '@/lib/specLang';
import { PREFIX_FIELDS, usePrefixes, writePrefix } from '@/lib/prefixes';

/** Настройки проекта: с чего начинается название нового интента, сущности, промпта, зависимости и сценария. */
export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const normalize = useNormalize(projectId);
  const specLang = useSpecLang(projectId);
  const intentMode = useIntentMode(projectId);
  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-xl font-semibold tracking-tight mb-6">Настройки</h1>
        <SettingsLayout>
          <section>
            <div className="min-w-0 space-y-4">
              <div className="rounded-xl border bg-card p-4 text-card-foreground">
                <h3 id="interface-theme-label" className="text-sm font-semibold">Тема интерфейса</h3>
                <div role="radiogroup" aria-labelledby="interface-theme-label" className="mt-3 grid grid-cols-1 sm:grid-cols-3 rounded-lg border p-0.5 sm:inline-grid">
                  {([
                    { value: 'light', label: 'Светлая' },
                    { value: 'dark', label: 'Темная' },
                    { value: 'system', label: 'Системная' },
                  ] as const).map((option) => (
                    <label key={option.value} className="relative min-w-0 cursor-pointer">
                      <input type="radio" name="interface-theme" value={option.value} checked={theme === option.value} onChange={() => setTheme(option.value)} className="peer sr-only" />
                      <span className="flex min-h-10 items-center justify-center whitespace-nowrap rounded-md px-2.5 text-sm text-muted-foreground transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background sm:px-4">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>
          <section>
            <div className="min-w-0 space-y-4">
              <div className="rounded-xl border bg-card p-4 text-card-foreground">
                <h3 className="text-sm font-semibold">Как описывать интенты</h3>
                <div role="radiogroup" aria-label="Как описывать интенты" className="mt-4 flex flex-col gap-1">
                  {INTENT_MODES.map((m) => (
                    <label key={m.value} className="flex min-h-9 cursor-pointer items-start gap-3 py-1.5 text-sm max-md:min-h-11">
                      <input
                        type="radio"
                        name="intent-mode"
                        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
                        checked={intentMode === m.value}
                        onChange={() => writeIntentMode(projectId, m.value)}
                      />
                      <span>
                        <span className="block">{m.label}</span>
                        <span className="block text-[13px] text-muted-foreground">{m.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4 text-card-foreground">
                <label className="flex items-center justify-between gap-4">
                  <span>
                    <span className="block text-sm font-semibold">Нормализовать слова</span>
                    <span className="mt-1 block text-[13px] text-muted-foreground">
                      Тренировочные фразы и значения сущностей приводятся к начальной форме: «заказать» и «заказал» считаются одним словом.
                      Влияет на поиск дубликатов и распознавание сущностей во фразах.
                    </span>
                  </span>
                  <Switch checked={normalize} onCheckedChange={(v) => writeNormalize(projectId, v)} aria-label="Нормализовать слова" />
                </label>
              </div>
            </div>
          </section>
          <section>
            <div className="min-w-0 space-y-4">
              <div className="rounded-xl border bg-card p-4 text-card-foreground">
                <h3 className="text-sm font-semibold">Префиксы элементов</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">Подставляются в поле при создании нового объекта.</p>
                <div className="mt-4 flex flex-col gap-3">
                  {PREFIX_FIELDS.map((f) => (
                    <label key={f.key} className="grid gap-1.5 text-sm lg:grid-cols-[8rem_minmax(0,1fr)] lg:items-center lg:gap-3">
                      <span className="min-w-0">{f.label}</span>
                      <Input
                        className="rounded-md bg-background font-mono"
                        value={prefixes[f.key]}
                        spellCheck={false}
                        autoComplete="off"
                        onChange={(e) => writePrefix(projectId, f.key, e.target.value.replace(/\s/g, ''))}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-4 text-card-foreground">
                <h3 className="text-sm font-semibold">Язык спецификаций</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  На этом языке будут заголовки, названия колонок и служебные слова в предпросмотре и экспорте. Всё, что введено вами, остаётся как есть.
                </p>
                <div role="radiogroup" aria-label="Язык спецификаций" className="mt-4 inline-flex rounded-lg border p-0.5">
                  {SPEC_LANGS.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      role="radio"
                      aria-checked={specLang === l.value}
                      onClick={() => writeSpecLang(projectId, l.value)}
                      className={`rounded-md px-4 py-1.5 text-sm transition-colors max-md:min-h-10 ${specLang === l.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </SettingsLayout>
      </div>
    </div>
  );
}
