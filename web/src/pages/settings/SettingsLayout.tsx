import { useState, type ReactNode } from 'react';

const SECTIONS = [
  { id: 'appearance', label: 'Внешний вид' },
  { id: 'nlu', label: 'Интенты и NLU' },
  { id: 'spec', label: 'Спецификации' },
] as const;

export function SettingsLayout({ children }: { children: ReactNode[] }) {
  const [active, setActive] = useState(0);
  return (
    <div className="grid min-h-96 grid-cols-[7.5rem_1px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[12rem_1px_minmax(0,1fr)] sm:gap-x-6">
      <div role="tablist" aria-label="Разделы настроек" aria-orientation="vertical" className="flex min-w-0 flex-col gap-1" onKeyDown={(event) => {
        let next = active;
        if (event.key === 'ArrowDown') next = (active + 1) % SECTIONS.length;
        else if (event.key === 'ArrowUp') next = (active + SECTIONS.length - 1) % SECTIONS.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = SECTIONS.length - 1;
        else return;
        event.preventDefault();
        setActive(next);
        document.getElementById(`settings-tab-${SECTIONS[next].id}`)?.focus();
      }}>
        {SECTIONS.map((section, index) => (
          <button key={section.id} id={`settings-tab-${section.id}`} type="button" role="tab"
            aria-selected={active === index} aria-controls={`settings-panel-${section.id}`} tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            className={`min-h-11 rounded-md px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${active === index ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            {section.label}
          </button>
        ))}
      </div>
      <div role="separator" aria-orientation="vertical" className="bg-border" />
      <div className="min-w-0">
        {SECTIONS.map((section, index) => (
          <div key={section.id} id={`settings-panel-${section.id}`} role="tabpanel" aria-labelledby={`settings-tab-${section.id}`} hidden={active !== index} tabIndex={0}
            className="min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {children[index]}
          </div>
        ))}
      </div>
    </div>
  );
}
