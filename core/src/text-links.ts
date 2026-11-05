export interface TextLinkPart { text: string; url?: string }

/** Ссылка в поле задачи: Jira получает подпись из последнего сегмента пути. Готовые подписи сохраняются. */
export function normalizeTaskLinks(value: string): string {
  return value.split(/(\r?\n)/).map((line) => {
    const candidate = line.trim();
    if (!/^(?:https?:\/\/|jira[.-])\S+$/i.test(candidate)) return line;
    try {
      const url = new URL(/^jira[.-]/i.test(candidate) ? `https://${candidate}` : candidate);
      if (!['http:', 'https:'].includes(url.protocol)) return line;
      const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) ?? '');
      const ticket = /^jira(?:[.-]|$)/i.test(url.hostname) && /^[a-z][a-z0-9_]*-\d+$/i.test(last) ? last : null;
      return line.replace(candidate, () => `[${ticket ?? candidate}](${url.href})`);
    } catch {
      return line;
    }
  }).join('');
}

/** Ссылки Markdown с подписью; остальной текст сохраняется без преобразований. */
export function parseTextLinks(value: string): TextLinkPart[] {
  const parts: TextLinkPart[] = [];
  const pattern = /\[([^\]\r\n]+)\]\((https?:\/\/[^\s<>()]+(?:\([^\s<>()]*\)[^\s<>()]*)*)\)/g;
  let end = 0;
  for (const match of value.matchAll(pattern)) {
    try { new URL(match[2]); } catch { continue; }
    if (match.index! > end) parts.push({ text: value.slice(end, match.index) });
    parts.push({ text: match[1], url: match[2] });
    end = match.index! + match[0].length;
  }
  if (end < value.length) parts.push({ text: value.slice(end) });
  return parts.length ? parts : [{ text: value }];
}
