import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, LayoutGrid } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProject } from '@/hooks/project';
import { api } from '@/lib/api';

/** Название текущего проекта; по клику — список проектов и переход ко всем проектам. */
export function ProjectSwitcher() {
  const { project } = useProject();
  const navigate = useNavigate();
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" aria-label="Сменить проект" className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 text-left text-sm font-medium hover:bg-muted" />}
      >
        <span className="truncate">{project?.name}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} onClick={() => navigate(`/p/${p.id}/scenarios`)}>
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            {p.id === project?.id && <Check className="size-4 text-brand" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/')}>
          <LayoutGrid className="size-4" /> Все проекты
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
