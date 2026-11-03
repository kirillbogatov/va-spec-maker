export interface TextLinkPart { text: string; url?: string }

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
