import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';

export function ExportMenu({ scenarioId }: { scenarioId: number }) {
  const projectId = useProjectId();
  // Ответ с Content-Disposition: attachment — браузер скачивает файл, страница не уходит
  const go = (url: string) => {
    window.location.href = url;
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Download className="size-4" /> Экспорт
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => go(api.exportUrl(scenarioId, 'md'))}>Сценарий — Markdown (.md)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => go(api.exportUrl(scenarioId, 'docx'))}>Сценарий — Word (.docx)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go(api.projectExportUrl(projectId, 'md'))}>Весь проект — Markdown (.md)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => go(api.projectExportUrl(projectId, 'docx'))}>Весь проект — Word (.docx)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => go(api.backupUrl)}>Резервная копия базы (.db)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
