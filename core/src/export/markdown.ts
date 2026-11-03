import type { ProjectSpec, ScenarioDoc } from './model';
import {
  dependenciesTable, entitiesTable, intentsTable, promptsTable, transitionsTable,
  changelogTable, type Cell, type TableDef,
} from './tables';
import { STRINGS, type SpecLang } from './i18n';

const esc = (s: string) => s.replace(/\|/g, '\\|');

function cell(c: Cell | null): string {
  if (!c) return '';
  if ('text' in c) return c.text.map(esc).join('<br>');
  if ('list' in c) return [...(c.lead ? [esc(c.lead)] : []), ...c.list.map((t, i) => `${i + 1}. ${esc(t)}`)].join('<br>');
  return c.bullets.map((b, i) => `${c.numbered ? `${i + 1}.` : '•'} **${esc(b.bold)}**${b.text ? ` ${esc(b.text)}` : ''}`).join('<br>');
}

function table({ head, rows }: TableDef): string {
  return [
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    // Объединённая первая ячейка в Markdown невозможна — повторяем её значение в строках-продолжениях.
    ...rows.map((r, n) => {
      let k = n;
      while (k > 0 && rows[k].cells[0] === null) k--;
      return `| ${r.cells.map((c, i) => cell(i === 0 && c === null ? rows[k].cells[0] : c)).join(' | ')} |`;
    }),
  ].join('\n');
}

function section(spec: ProjectSpec, _date: string | null, lang: SpecLang, parts?: ScenarioDoc['parts'], changelog: ScenarioDoc['changelog'] = spec.changelog ?? []): string[] {
  const t = STRINGS[lang];
  const out: string[] = [`# ${spec.project.name}`];
  if (spec.project.description) out.push(spec.project.description);
  if (changelog.length) out.push(`## ${t.changelog}`, table(changelogTable(changelog, lang, !parts)));

  out.push(`## ${t.intents}`, table(intentsTable(spec, lang)));
  if (spec.entities.length) out.push(`## ${t.entities}`, table(entitiesTable(spec, lang)));
  if (spec.dependencies.length) out.push(`## ${t.dependencies}`, table(dependenciesTable(spec, lang)));
  out.push(`## ${t.prompts}`, table(promptsTable(spec, lang)));
  out.push(`## ${t.transitions}`);
  const transitionParts = parts ?? spec.parts;
  if (!transitionParts?.length) out.push(table(transitionsTable(spec.transitions, lang)));
  else {
    for (const p of transitionParts) {
      out.push(`### ${p.scenario ? `${p.scenario} · ` : ''}${p.title}`);
      if (p.description.trim()) out.push(p.description);
      const conditions = [...(p.preconditions ?? []), ...(p.precondition ?? '').split(/\r?\n/)].filter((line) => line.trim());
      if (conditions.length) {
        out.push(`#### ${t.preconditions}`, ...(p.precond_mode === 'any' && conditions.length > 1 ? [t.anyPreconditions] : []),
          conditions.map((line, index) => `${index + 1}. ${esc(line)}`).join('\n'));
      }
      out.push(table(transitionsTable(p.transitions, lang)));
    }
  }
  return out;
}

export function renderMarkdown(spec: ProjectSpec, date: string, lang: SpecLang = 'ru'): string {
  return section(spec, date, lang).join('\n\n') + '\n';
}

/** Общие таблицы сценария один раз; вкладки — только подразделы State transitions. */
export function renderMarkdownScenario(doc: ScenarioDoc, date: string, lang: SpecLang = 'ru'): string {
  return section(doc.spec, date, lang, doc.parts, doc.changelog).join('\n\n') + '\n';
}
