import type { ProjectSpec, ScenarioDoc } from './model';
import {
  entitiesTable, intentsTable, promptsTable, transitionsTable,
  type Cell, type TableDef,
} from './tables';

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

function section(spec: ProjectSpec, date: string | null, parts?: ScenarioDoc['parts']): string[] {
  const out: string[] = [`# ${spec.project.name}`];
  if (date) out.push(`_Спецификация от ${date}_`);
  if (spec.project.description) out.push(spec.project.description);

  out.push('## Интенты', table(intentsTable(spec)));
  out.push('## Сущности', table(entitiesTable(spec)));
  out.push('## Промпты', table(promptsTable(spec)));
  out.push('## Переходы между состояниями');
  if (!parts || parts.length === 1) out.push(table(transitionsTable(parts ? parts[0].transitions : spec.transitions)));
  else {
    for (const p of parts) {
      out.push(`### ${p.title}`);
      if (p.description.trim()) out.push(p.description);
      out.push(table(transitionsTable(p.transitions)));
    }
  }
  out.push('## Ошибки', table(transitionsTable(spec.errors)));
  return out;
}

export function renderMarkdown(spec: ProjectSpec, date: string): string {
  return section(spec, date).join('\n\n') + '\n';
}

/** Общие таблицы сценария один раз; вкладки — только подразделы State transitions. */
export function renderMarkdownScenario(doc: ScenarioDoc, date: string): string {
  return section(doc.spec, date, doc.parts).join('\n\n') + '\n';
}
