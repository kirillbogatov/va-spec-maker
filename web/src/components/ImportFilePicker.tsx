import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ImportFilePicker({ accept, types, file, disabled, onChange }: {
  accept: string; types: string; file: File | null; disabled?: boolean; onChange: (file: File | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">{types}</p>
    <Button type="button" variant="outline" className="h-12 w-full border-2 text-base" disabled={disabled} onClick={() => input.current?.click()}><Upload className="size-5" /> Выбрать файл</Button>
    <p className="break-all text-sm text-muted-foreground" role="status">{file?.name ?? 'Файл не выбран'}</p>
    <input ref={input} type="file" accept={accept} className="sr-only" aria-label="Файл для импорта" disabled={disabled} onChange={e => { onChange(e.target.files?.[0] ?? null); e.target.value=''; }} />
  </div>;
}
