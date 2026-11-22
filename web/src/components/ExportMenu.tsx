import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { useIntentMode } from '@/lib/intentMode';
import { useSpecLang } from '@/lib/specLang';

/** Кнопка с вариантами экспорта сценария и проекта. */
export function ExportMenu({ scenarioId, onExported }: { scenarioId: number; onExported?: () => void }) {
  const projectId = useProjectId();
  const lang = useSpecLang(projectId);
  const mode = useIntentMode(projectId);
  const scenario = (format: 'md' | 'docx') => api.exportFile(`/api/scenarios/${scenarioId}/export?format=${format}&lang=${lang}&intentMode=${mode}`, `scenario.${format}`).then(() => onExported?.());
  const project = (format: 'md' | 'docx') => api.exportFile(`/api/projects/${projectId}/export?format=${format}&lang=${lang}&intentMode=${mode}`, `project.${format}`).then(() => onExported?.());
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" className="max-md:size-10" aria-label="Экспорт" title="Экспорт" />}>
        <Download className="size-4" />
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
