import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { extractHeadings, MarkdownView } from './MarkdownView';

const render = (source: string) => renderToStaticMarkup(createElement(MarkdownView, { source }));

describe('export Markdown preview', () => {
  it('renders preconditions as a level-four heading and a real ordered list before the table', () => {
    const source = '### General query\n\nDescription\n\n#### Preconditions\n\n1. [DEP_POSITION] = driver\n2. User signed in\n\n| From | To |\n| --- | --- |\n| START | END |';
    const html = render(source);
    expect(html).toMatch(/<h4[^>]*>Preconditions<\/h4>/);
    expect(html).toMatch(/<ol[^>]*><li>\[DEP_POSITION\] = driver<\/li><li>User signed in<\/li><\/ol>/);
    expect(html).not.toContain('####');
    expect(html.indexOf('</ol>')).toBeLessThan(html.indexOf('<table'));
    expect(extractHeadings(source).map(({ text, level, count }) => ({ text, level, count }))).toEqual([
      { text: 'General query', level: 3, count: 0 },
      { text: 'Preconditions', level: 4, count: 3 },
    ]);
  });

  it('supports all six heading levels and ends paragraphs before numbered lists', () => {
    const html = render('# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six\nIntro\n3. **Third**\n4. Fourth\n- Bullet');
    for (let level = 1; level <= 6; level++) expect(html).toContain(`<h${level} `);
    expect(html).toContain('<p class="text-sm">Intro</p><ol');
    expect(html).toContain('start="3"');
    expect(html).toContain('<li><strong>Third</strong></li>');
    expect(html).toContain('<ul');
  });
});
