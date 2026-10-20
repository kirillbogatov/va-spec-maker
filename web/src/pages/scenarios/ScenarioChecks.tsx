import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Analysis } from '@/lib/states';
import type { IntentListItem, PromptListItem, Step } from '@/lib/types';
import type { ScenarioTab } from './ScenarioForm';

export interface Check { level: 'error' | 'warn' | 'info'; text: string; tab: ScenarioTab }

/** Проверка готовности сценария перед экспортом. Замечания по вкладкам помечаются именем вкладки, если их несколько. */
export function buildChecks(p: {
  description: string; parts: { name: string; steps: Step[]; analysis: Analysis }[]; intents: IntentListItem[]; prompts: PromptListItem[];
}): Check[] {
  const out: Check[] = [];
  if (!p.description.trim()) out.push({ level: 'warn', text: 'Не заполнено описание сценария', tab: 'general' });
  if (p.intents.length === 0) out.push({ level: 'warn', text: 'У сценария нет интентов', tab: 'intents' });
  for (const i of p.intents) {
    if (i.enabled && i.phrase_count === 0) out.push({ level: 'error', text: `Интент «${i.name}» включён, но в нём нет фраз`, tab: 'intents' });
  }
  for (const pr of p.prompts) {
    if (!pr.has_answer) out.push({ level: 'warn', text: `Промпт «${pr.name}»: не заполнен полный ответ`, tab: 'prompts' });
    if (pr.step_count === 0) out.push({ level: 'info', text: `Промпт «${pr.name}» нигде не используется в таблицах`, tab: 'prompts' });
  }
  const usedIntents = new Set(p.parts.flatMap((x) => x.steps.map((s) => s.intent_id)));
  for (const i of p.intents) {
    if (!usedIntents.has(i.id)) out.push({ level: 'info', text: `Интент «${i.name}» не используется в сценарной логике`, tab: 'logic' });
  }
  for (const part of p.parts) {
    const at = (level: Check['level'], text: string) =>
      out.push({ level, text: p.parts.length > 1 ? `[${part.name}] ${text}` : text, tab: 'logic' });
    const { analysis } = part;
    if (!part.steps.some((s) => s.kind === 'transition')) at('error', 'В таблице переходов нет ни одной строки');
    for (const d of analysis.dangling) at('warn', `У состояния «${d}» нет исходящих переходов (если оно не конечное, добавьте их)`);
    for (const u of analysis.unreachable) at('warn', `Состояние «${u}» недостижимо: на него никто не ссылается`);
    const rows = [...analysis.issues.values()].flat();
    const empty = rows.filter((r) => r.text === 'Не заполнено состояние').length;
    if (empty) at('error', `Строк без состояния: ${empty}`);
    for (const name of analysis.stateIssues.keys()) at('warn', `У состояния «${name}» не выбран ответ ассистента`);
    const clashes = rows.filter((r) => r.text.startsWith('Те же условия')).length;
    if (clashes) at('error', `Переходов с повторяющимися условиями: ${clashes}`);
    const shadowing = rows.filter((r) => r.text.startsWith('Переход без условий стоит не последним')).length;
    if (shadowing) at('warn', `Переходов без условий, перекрывающих следующие: ${shadowing}`);
  }
  const order = { error: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

const ICON = {
  error: <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />,
  warn: <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />,
  info: <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />,
};

export function ScenarioChecks({ scenarioId, checks }: { scenarioId: number; checks: Check[] }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const problems = checks.filter((c) => c.level !== 'info').length;
  const hasErrors = checks.some((c) => c.level === 'error');
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className={cn(hasErrors && 'border-destructive/50 text-destructive')}>
        {problems === 0 ? <CheckCircle2 className="size-4 text-emerald-600" /> : <ClipboardCheck className="size-4" />}
        {problems === 0 ? 'Готов к экспорту' : `Проверка: ${problems}`}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Готовность сценария</DialogTitle>
          </DialogHeader>
          {checks.length === 0 ? (
            <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-emerald-600" /> Замечаний нет — сценарий можно экспортировать.</p>
          ) : (
            <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
              {checks.map((c, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setOpen(false);
                      navigate(`/scenarios/${scenarioId}/${c.tab}`);
                    }}
                  >
                    {ICON[c.level]}
                    <span>{c.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
