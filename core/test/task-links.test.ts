import JSZip from 'jszip';
import { expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';
import { normalizeTaskLinks, parseTextLinks } from '../src/text-links';

const url = 'https://jira.e-kama.com/browse/CHM-3757';
const task = `[CHM-3757](${url})`;

it.each([
  [url, task],
  ['jira.e-kama.com/browse/CHM-3757', task],
  [`${url}/?focusedCommentId=42#comment-42`, `[CHM-3757](${url}/?focusedCommentId=42#comment-42)`],
  [`${url}?filter=$&`, `[CHM-3757](${url}?filter=$&)`],
  ['https://jira.example.com/browse/ABC%2D42', '[ABC-42](https://jira.example.com/browse/ABC%2D42)'],
  ['https://example.com/browse/ABC-42', '[https://example.com/browse/ABC-42](https://example.com/browse/ABC-42)'],
  ['https://jira.example.com/projects', '[https://jira.example.com/projects](https://jira.example.com/projects)'],
  [`[Своя подпись](${url})`, `[Своя подпись](${url})`],
  ['CHM-3757', 'CHM-3757'],
  ['javascript:alert(1)', 'javascript:alert(1)'],
  ['https://', 'https://'],
])('normalizes a task URL without changing explicit labels: %s', (input, expected) => {
  expect(normalizeTaskLinks(input)).toBe(expected);
  expect(normalizeTaskLinks(expected)).toBe(expected);
});

it('preserves line breaks when converting several pasted tasks', () => {
  expect(normalizeTaskLinks(`${url}\r\nPlain task\n${url}`)).toBe(`${task}\r\nPlain task\n${task}`);
});

it('keeps multiple labels, surrounding text, and URL parentheses', () => {
  expect(parseTextLinks(`Fix ${task} and [details](https://example.com/a_(b)).`)).toEqual([
    { text: 'Fix ' }, { text: 'CHM-3757', url }, { text: ' and ' },
    { text: 'details', url: 'https://example.com/a_(b)' }, { text: '.' },
  ]);
});

it('keeps ordinary tasks, incomplete links and non-web targets as plain text', () => {
  for (const value of ['CHM-3757', '[draft](https://', '[bad](javascript:alert(1))', '[bad](file:///C:/file)', '[bad](https://)']) {
    expect(parseTextLinks(value)).toEqual([{ text: value }]);
  }
});

it('persists Task markup and exports real hyperlinks for scenario and project', async () => {
  const db = await openDb();
  try {
    const app = createApp(db);
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await app.handle({ method, url: path, body });
      expect(response.status).toBeLessThan(400);
      return response.body as any;
    };
    const project = await call('POST', '/api/projects', { name: 'Links' });
    const scenario = await call('POST', `/api/projects/${project.id}/scenarios`, { name: 'Links' });
    await call('PUT', `/api/scenarios/${scenario.id}/changelog`, {
      rows: [{ task, author: 'Author', description: 'Change' }, { task: 'CHM-PLAIN', author: '', description: '' }],
    });
    const saved = await call('GET', `/api/scenarios/${scenario.id}/changelog`);
    expect(JSON.stringify(saved)).toContain(task);
    expect(await call('GET', `/api/scenarios/${scenario.id}/preview`)).toContain(task);
    for (const route of [`/api/scenarios/${scenario.id}`, `/api/projects/${project.id}`]) {
      expect(await call('GET', route + '/export?format=md')).toContain(task);
      const blob = await call('GET', route + '/export?format=docx') as Blob;
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await zip.file('word/document.xml')!.async('string');
      const rels = await zip.file('word/_rels/document.xml.rels')!.async('string');
      expect(xml).toMatch(/<w:hyperlink[^>]*>[\s\S]*?>CHM-3757<\/w:t>[\s\S]*?<\/w:hyperlink>/);
      expect(xml).not.toContain('[CHM-3757]');
      expect(xml).toContain('CHM-PLAIN');
      expect(rels).toContain(`Target="${url}"`);
      expect(rels).toContain('TargetMode="External"');
    }
  } finally { db.close(); }
});
