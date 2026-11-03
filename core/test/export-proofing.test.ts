import JSZip from 'jszip';
import { expect, it } from 'vitest';
import { renderTableDocx as renderTable } from '../src/export/docx';

it('exports language-specific proofing without disabling spelling for ordinary mixed text', async () => {
  const text = 'Включить child lock для [DEP_CHILDLOCK] и ST_READY.';
  const blob = await renderTable('State transitions', {
    head: ['From state', 'Условия'], widths: [50, 50],
    rows: [{ cells: [{ text: [text] }, { text: ['Проверить дверь'] }] }],
  });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const runs = [...xml.matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map((m) => m[1]);
  const containing = (text: string) => runs.find((run) => run.includes('>' + text + '</w:t>'))!;
  expect(containing('From state')).toContain('w:lang w:val="en-US"');
  expect(containing('Условия')).toContain('w:lang w:val="ru-RU"');
  expect(containing('Включить ')).toContain('w:lang w:val="ru-RU"');
  expect(containing('child lock ')).toContain('w:lang w:val="en-US"');
  expect(containing('child lock ')).not.toContain('<w:noProof/>');
  expect(containing('[DEP_CHILDLOCK]')).toContain('<w:noProof/>');
  expect(containing('ST_READY')).toContain('<w:noProof/>');
  const paragraphs = [...xml.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map((m) =>
    [...m[1].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join(''));
  expect(paragraphs).toContain(text);
});
