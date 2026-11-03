/** Group repeated equality checks, preserving the condition mode and comparison operators. */
export function groupConditions(lines: string[], mode: string = 'all'): string[] {
  const out: string[] = [];
  const groups = new Map<string, { index: number; values: string[] }>();
  for (const line of lines) {
    const match = /^(\[[^\]]+\] = )(.+)$/.exec(line);
    if (!match) { if (!out.includes(line)) out.push(line); continue; }
    const [, prefix, value] = match;
    let group = groups.get(prefix);
    if (!group) { group = { index: out.length, values: [] }; groups.set(prefix, group); out.push(''); }
    if (!group.values.includes(value)) group.values.push(value);
    out[group.index] = prefix + group.values.join(mode === 'any' ? ' OR ' : ' AND ');
  }
  return out;
}
