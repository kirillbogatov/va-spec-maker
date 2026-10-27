import { useRef } from 'react';
import { Download, MoreHorizontal, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

/** Меню «…» над списком справочника: импорт из файла и экспорт в файл. */
export function TransferMenu({ accept, format, onImport, onExport }: {
  accept: string;
  /** Название формата для подписей, например «CSV». */
  format: string;
  onImport: (file: File) => void | Promise<void>;
  onExport: () => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void onImport(f);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-10 md:size-8" aria-label="Импорт и экспорт" />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Импорт из {format}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void onExport()}>
            <Download className="size-4" /> Экспорт в {format}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
