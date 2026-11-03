import { TextRun } from 'docx';

/** Язык задаётся фрагментам текста, чтобы смешанные русские и английские строки проверялись корректно. */
export function proofedRuns(text: string, font: string, size: number, bold?: boolean, style?: string): TextRun[] {
  const result: TextRun[] = [];
  const lines = text.split('\n');
  for (const [lineIndex, line] of lines.entries()) {
    const segments: { text: string; language: string; noProof: boolean }[] = [];
    const tokens = line.match(/\[[^\]\r\n]+\]|https?:\/\/\S+|[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+|[\p{Script=Cyrillic}\u0300-\u036f]+|[A-Za-z]+|./gu) ?? [''];
    for (const token of tokens) {
      const previous = segments.at(-1);
      const noProof = /^\[|^https?:\/\/|^[A-Za-z][A-Za-z0-9]*_/.test(token);
      const language = /\p{Script=Cyrillic}/u.test(token) ? 'ru-RU'
        : /[A-Za-z]/.test(token) ? 'en-US' : previous?.language ?? 'en-US';
      if (previous && previous.language === language && previous.noProof === noProof) previous.text += token;
      else segments.push({ text: token, language, noProof });
    }
    segments.forEach((segment, index) => result.push(new TextRun({
      text: segment.text, font, size, bold, style,
      language: { value: segment.language },
      noProof: segment.noProof,
      break: lineIndex > 0 && index === 0 ? 1 : undefined,
    })));
  }
  return result;
}
