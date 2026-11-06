import JSZip from 'jszip';
import { expect, it } from 'vitest';
import { renderMarkdown } from '../src/export/markdown';
import { renderDocx } from '../src/export/docx';
import type { ProjectSpec } from '../src/export/model';

it.each([0, 1, 2])('formats lists with %i values consistently in Markdown and Word', async (count) => {
  const values = ['FIRST_VALUE', 'SECOND_VALUE'].slice(0, count);
  const spec: ProjectSpec = {
    project: { id: 1, name: 'P', description: '' },
    intents: [{ name: 'INT_TEST', phrases: values, patterns: values, keywords: values.map((value) => [value]),
      entities: values.map((name) => ({ name, required: false })) }],
    entities: [{ name: 'ENT_TEST', type: 'string', range_min: '', range_max: '', multiple_values: false,
      values: values.map((value) => ({ value, synonyms: ['synonym'] })) }],
    prompts: [{ name: 'PRM_TEST', full_answers: values }],
    dependencies: [{ scenario: 'S', name: 'DEP_TEST', type: 'enum', values }],
    transitions: [],
    parts: [{ title: 'Main', description: '', preconditions: values,
      transitions: [{ state: 'START', next_states: 'END', intent: 'INT_TEST', request_params: '',
        condition: values.join('\n'), system_action: '', prompt: null }] }],
  };
  for (const lang of ['ru', 'en'] as const) for (const intentMode of ['both', 'keywords'] as const) {
    spec.intentMode = intentMode;
    const md = renderMarkdown(spec, '', lang);
    const zip = await JSZip.loadAsync(await (await renderDocx(spec, '', lang)).arrayBuffer());
    const xml = await zip.file('word/document.xml')!.async('string');
    if (count < 2) {
      expect(md).not.toMatch(/(?:^|[|>] )1\. /m);
      expect(xml).not.toContain('<w:numPr>');
      expect(xml).not.toContain('<w:ind');
      expect(xml).not.toContain('<w:tab/>');
      if (count === 1) {
        expect(md).toContain('| **FIRST_VALUE:** "synonym" |');
        expect(md).toContain('| [FIRST_VALUE] |');
        expect(md).toMatch(/#### (?:Предусловия|Preconditions)\n\nFIRST_VALUE\n/);
        expect(xml.replace(/<[^>]+>/g, '')).toContain('FIRST_VALUE:');
        expect(xml).toContain('<w:b/>');
      }
    } else {
      expect(md).toContain('1. FIRST_VALUE<br>2. SECOND_VALUE');
      expect(md).toContain('1. **FIRST_VALUE:** "synonym"<br>2. **SECOND_VALUE:** "synonym"');
      expect(md).toContain('1. FIRST_VALUE\n2. SECOND_VALUE');
      expect(xml).toContain('<w:numPr>');
      expect(xml).toContain('<w:tabs>');
    }
  }
});
