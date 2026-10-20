import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';

export function ExportMenu({ scenarioId }: { scenarioId: number }) {
  const projectId = useProjectId();
  const scenario = (format: 'md' | 'docx') => api.exportFile(`/api/scenarios/${scenarioId}/export?format=${format}`, `scenario.${format}`);
  const project = (format: 'md' | 'docx') => api.exportFile(`/api/projects/${projectId}/export?format=${format}`, `project.${format}`);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Download className="size-4" /> Экспорт
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => scenario('md')}>Сценарий — Markdown (.md)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => scenario('docx')}>Сценарий — Word (.docx)</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => project('md')}>Весь проект — Markdown (.md)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => project('docx')}>Весь проект — Word (.docx)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
