/** Supplementary text stays outside the selected label and wraps within the popup. */
export function OptionHint({ text }: { text?: string }) {
  if (!text?.trim()) return null;
  return <span data-slot="option-hint" className="mt-0.5 block max-w-[min(30rem,75vw)] whitespace-pre-line break-words text-xs font-normal leading-relaxed text-muted-foreground">{text.trim()}</span>;
}
