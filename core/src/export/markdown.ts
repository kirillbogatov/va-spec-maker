import type { ProjectSpec, ScenarioDoc } from './model';
import {
  entitiesTable, intentsTable, promptsTable, transitionsTable,
  changelogTable, type Cell, type TableDef,
} from './tables';
import { STRINGS, type SpecLang } from './i18n';

const esc = (s: string) => s.replace(/\|/g, '\\|');

function cell(c: Cell | null): string {
  if (!c) return '';
  if ('text' in c) return c.text.map(esc).join('<br>');
  if ('list' in c) return c.list.map((t, i) => `${i + 1}. ${esc(t)}`).join('<br>');
  return c.bullets.map((b) => `• **${esc(b.bold)}**${b.text ? ` ${esc(b.text)}` : ''}`).join('<br>');
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

function section(spec: ProjectSpec, date: string | null, lang: SpecLang, parts?: ScenarioDoc['parts'], changelog: ScenarioDoc['changelog'] = []): string[] {
  const t = STRINGS[lang];
  const out: string[] = [`# ${spec.project.name}`];
  if (date) out.push(`_${t.specFrom(date)}_`);
  if (spec.project.description) out.push(spec.project.description);
  if (changelog.length) out.push(`## ${t.changelog}`, table(changelogTable(changelog, lang)));

  out.push(`## ${t.intents}`, table(intentsTable(spec, lang)));
  out.push(`## ${t.entities}`, table(entitiesTable(spec, lang)));
  out.push(`## ${t.prompts}`, table(promptsTable(spec, lang)));
  out.push(`## ${t.transitions}`);
  if (!parts || parts.length === 1) out.push(table(transitionsTable(parts ? parts[0].transitions : spec.transitions, lang)));
  else {
    for (const p of parts) {
      out.push(`### ${p.title}`);
      if (p.description.trim()) out.push(p.description);
      out.push(table(transitionsTable(p.transitions, lang)));
    }
  }
  out.push(`## ${t.errors}`, table(transitionsTable(spec.errors, lang)));
  return out;
}

export function renderMarkdown(spec: ProjectSpec, date: string, lang: SpecLang = 'ru'): string {
  return section(spec, date, lang).join('\n\n') + '\n';
}

/** Общие таблицы сценария один раз; вкладки — только подразделы State transitions. */
export function renderMarkdownScenario(doc: ScenarioDoc, date: string, lang: SpecLang = 'ru'): string {
  return section(doc.spec, date, lang, doc.parts, doc.changelog).join('\n\n') + '\n';
}
