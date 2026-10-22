import { ChevronDown, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';

/** Главная кнопка «Экспорт .docx» и меню с остальными форматами. */
export function ExportMenu({ scenarioId }: { scenarioId: number }) {
  const projectId = useProjectId();
  const scenario = (format: 'md' | 'docx') => api.exportFile(`/api/scenarios/${scenarioId}/export?format=${format}`, `scenario.${format}`);
  const project = (format: 'md' | 'docx') => api.exportFile(`/api/projects/${projectId}/export?format=${format}`, `project.${format}`);
  return (
    <div className="flex">
      <Button className="rounded-r-none max-md:h-10" onClick={() => scenario('docx')}>
        <Download className="size-4" /> Экспорт<span className="max-sm:hidden"> .docx</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button aria-label="Другие форматы экспорта" className="rounded-l-none border-l-primary-foreground/25 px-2 max-md:h-10 max-md:w-10" />}>
          <ChevronDown className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => scenario('md')}>Сценарий — Markdown (.md)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => scenario('docx')}>Сценарий — Word (.docx)</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => project('md')}>Весь проект — Markdown (.md)</DropdownMenuItem>
          <DropdownMenuItem onClick={() => project('docx')}>Весь проект — Word (.docx)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
