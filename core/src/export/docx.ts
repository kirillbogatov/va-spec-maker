import {
  AlignmentType, BorderStyle, Document, TableLayoutType, Packer, PageOrientation, Paragraph, Table, TableCell, TableRow,
  TextRun, VerticalMergeType, WidthType,
} from 'docx';
import type { ProjectSpec, ScenarioDoc } from './model';
import {
  entitiesTable, intentsTable, promptsTable, transitionsTable,
  type Cell, type TableDef,
} from './tables';
import { STRINGS, type SpecLang } from './i18n';

// Оформление повторяет эталонный документ L3: альбомная A4, Arial, таблицы с чёрными рамками, жирная шапка.
const FONT = 'Arial';
const BODY = 22; // 11 pt
const CELL = 22; // 11 pt
const PAGE_W = 16838;
const MARGIN = 720;
const TEXT_W = PAGE_W - MARGIN * 2;

type Block = Paragraph | Table;

const run = (text: string, opts: { bold?: boolean; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: opts.size ?? BODY, bold: opts.bold });

const heading = (text: string) =>
  new Paragraph({ children: [run(text, { size: 32 })], spacing: { before: 240, after: 160 }, keepNext: true });

const line = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const borders = { top: line, bottom: line, left: line, right: line };

function cellParagraphs(c: Cell | null, bold = false): Paragraph[] {
  const t = (s: string) => run(s, { bold, size: CELL });
  if (!c) return [new Paragraph({ children: [] })];
  if ('text' in c) return c.text.length ? c.text.map((s) => new Paragraph({ children: [t(s)] })) : [new Paragraph({ children: [] })];
  if ('list' in c) {
    if (!c.list.length) return [new Paragraph({ children: [] })];
    return c.list.map(
      (s, i) =>
        new Paragraph({
          children: [t(`${i + 1}.\t${s}`)],
          indent: { left: 360, hanging: 360 },
          tabStops: [{ type: 'left', position: 360 }],
        }),
    );
  }
  if (!c.bullets.length) return [new Paragraph({ children: [] })];
  return c.bullets.map(
    (b) =>
      new Paragraph({
        children: [run(b.bold, { bold: true, size: CELL }), ...(b.text ? [run(` ${b.text}`, { size: CELL })] : [])],
        bullet: { level: 0 },
      }),
  );
}

function tableBlock({ head, widths, rows }: TableDef): Table {
  const cols = widths.map((w) => Math.round((TEXT_W * w) / 100));
  const mkCell = (children: Paragraph[], i: number, extra: Record<string, unknown> = {}) =>
    new TableCell({
      children,
      borders,
      width: { size: cols[i], type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      ...extra,
    });

  const headRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: head.map((h, i) => mkCell([new Paragraph({ children: [run(h, { bold: true, size: CELL })] })], i)),
  });
  const body = rows.map(
    (r) =>
      new TableRow({
        cantSplit: true,
        children: r.cells.map((c, i) => {
          if (i === 0 && r.span0 && r.span0 > 1) {
            return mkCell(cellParagraphs(c), i, { verticalMerge: VerticalMergeType.RESTART });
          }
          if (i === 0 && c === null) return mkCell(cellParagraphs(null), i, { verticalMerge: VerticalMergeType.CONTINUE });
          return mkCell(cellParagraphs(c), i);
        }),
      }),
  );
  return new Table({
    width: { size: TEXT_W, type: WidthType.DXA },
    columnWidths: cols,
    layout: TableLayoutType.FIXED,
    rows: [headRow, ...body],
  });
}

const gap = () => new Paragraph({ children: [], spacing: { after: 120 } });

const subheading = (text: string) =>
  new Paragraph({ children: [run(text, { size: 28, bold: true })], spacing: { before: 160, after: 100 }, keepNext: true });

function sectionBlocks(spec: ProjectSpec, lang: SpecLang, parts?: ScenarioDoc['parts']): Block[] {
  const t = STRINGS[lang];
  const transitions: Block[] =
    !parts || parts.length === 1
      ? [tableBlock(transitionsTable(parts ? parts[0].transitions : spec.transitions, lang))]
      : parts.flatMap((p): Block[] => [
          subheading(p.title),
          ...(p.description.trim() ? [new Paragraph({ children: [run(p.description)], spacing: { after: 120 } })] : []),
          tableBlock(transitionsTable(p.transitions, lang)),
          gap(),
        ]);
  return [
    heading(t.intents), tableBlock(intentsTable(spec, lang)), gap(),
    heading(t.entities), tableBlock(entitiesTable(spec, lang)), gap(),
    heading(t.prompts), tableBlock(promptsTable(spec, lang)), gap(),
    heading(t.transitions), ...transitions, gap(),
    heading(t.errors), tableBlock(transitionsTable(spec.errors, lang)),
  ];
}

export const renderDocx = (spec: ProjectSpec, _date: string, lang: SpecLang = 'ru'): Promise<Blob> => pack(sectionBlocks(spec, lang), spec.project.name);

/** Общие таблицы сценария один раз; вкладки — только подразделы State transitions. */
export function renderDocxScenario(doc: ScenarioDoc, name: string, lang: SpecLang = 'ru'): Promise<Blob> {
  const description = doc.spec.project.description.trim();
  return pack([...(description ? [new Paragraph({ children: [run(description)], spacing: { after: 120 } })] : []), ...sectionBlocks(doc.spec, lang, doc.parts)], name);
}

/** Одна таблица с заголовком: выгрузка справочника. */
export const renderTableDocx = (title: string, table: TableDef): Promise<Blob> => pack([heading(title), tableBlock(table)], title);

async function pack(c: Block[], name: string): Promise<Blob> {
  const doc = new Document({
    title: name,
    styles: { default: { document: { run: { font: FONT, size: BODY }, paragraph: { alignment: AlignmentType.LEFT } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
          },
        },
        children: c,
      },
    ],
  });
  return Packer.toBlob(doc);
}
