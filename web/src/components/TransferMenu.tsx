import { useRef } from 'react';
import { Download, MoreHorizontal, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

/** Меню «…» над списком справочника: импорт из файла и экспорт в файлы нескольких форматов. */
export function TransferMenu({ accept, format, onImport, exports }: {
  accept: string;
  /** Название формата импорта для подписи, например «CSV». */
  format: string;
  onImport: (file: File) => void | Promise<void>;
  /** Форматы экспорта: подпись («CSV», «TXT», «DOCX») и выгрузка. */
  exports: { format: string; run: () => void | Promise<void> }[];
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
          <DropdownMenuSeparator />
          {exports.map((x) => (
            <DropdownMenuItem
              key={x.format}
              onClick={async () => {
                try {
                  await x.run();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Download className="size-4" /> Экспорт в {x.format}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
