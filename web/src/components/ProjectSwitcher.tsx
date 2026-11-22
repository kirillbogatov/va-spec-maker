import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, GitBranch, MoreHorizontal, Plus, Copy, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useProject } from '@/hooks/project';
import { api } from '@/lib/api';

type Action = 'add' | 'clone' | 'rename' | null;

export function ProjectSwitcher() {
  const { project } = useProject();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [action, setAction] = useState<Action>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const { data: branches = [] } = useQuery({
    queryKey: ['project-branches', project?.id],
    queryFn: () => api.projects.branches(project!.id),
    enabled: !!project,
  });
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['project-branches'] });
    await qc.invalidateQueries({ queryKey: ['projects'] });
  };
  const edit = useMutation({
    mutationFn: () => action === 'rename'
      ? api.projects.renameBranch(project!.id, project!.id, name.trim())
      : action === 'clone'
        ? api.projects.cloneBranch(project!.id, name.trim())
        : api.projects.addBranch(project!.id, name.trim()),
    onSuccess: (branch) => {
      void refresh();
      setAction(null);
      if (branch.id !== project!.id) navigate(location.pathname.replace(`/p/${project!.id}`, `/p/${branch.id}`));
    },
  });
  const remove = useMutation({
    mutationFn: () => api.projects.removeBranch(project!.id, project!.id),
    onSuccess: async () => {
      const next = branches.find((branch) => branch.id !== project!.id);
      await refresh();
      if (next) navigate(location.pathname.replace(`/p/${project!.id}`, `/p/${next.id}`));
    },
    onError: (error) => toast.error(error.message),
  });
  useEffect(() => {
    if (action) {
      const base = project?.branch_name === 'main' ? 'ветка' : (project?.branch_name ?? 'ветка');
      setName(action === 'rename' ? currentBranch : action === 'clone' ? `${base} копия` : 'новая ветка');
      edit.reset();
    }
  }, [action, project?.branch_name]);

  const currentBranch = project?.branch_name ?? 'main';
  const duplicate = branches.some((branch) => branch.id !== project?.id && branch.branch_name?.toLocaleLowerCase() === name.trim().toLocaleLowerCase());

  return (
    <>
      <div className="flex min-w-0 items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger render={<button type="button" aria-label={`Сменить ветку: ${currentBranch}`} className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-background px-2.5 text-left text-sm font-medium hover:bg-muted" />}>
            <GitBranch aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{currentBranch}</span>
            <ChevronDown aria-hidden className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56 max-w-[min(36rem,95vw)]">
            {branches.map((branch) => (
              <DropdownMenuItem key={branch.id} onClick={() => navigate(location.pathname.replace(`/p/${project!.id}`, `/p/${branch.id}`))}>
                <GitBranch className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 whitespace-normal break-words">{branch.branch_name ?? 'main'}</span>
                {branch.id === project?.id && <Check className="size-4 text-brand" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon" className="size-8 shrink-0" aria-label="Действия с ветками" />}>
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="min-h-9" onClick={() => setAction('add')}><Plus className="size-4" /> Добавить ветку</DropdownMenuItem>
            <DropdownMenuItem className="min-h-9" onClick={() => setAction('clone')}><Copy className="size-4" /> Клонировать ветку</DropdownMenuItem>
            <DropdownMenuItem className="min-h-9" onClick={() => setAction('rename')}><Pencil className="size-4" /> Переименовать выбранную ветку</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-9" variant="destructive" disabled={branches.length <= 1} onClick={() => setDeleting(true)}><Trash2 className="size-4" /> Удалить выбранную ветку</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog open={action !== null} onOpenChange={(open) => !edit.isPending && !open && setAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{action === 'clone' ? 'Клонировать ветку' : action === 'rename' ? 'Переименовать ветку' : 'Добавить ветку'}</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (!duplicate && name.trim()) edit.mutate(); }}>
            <label className="grid gap-1.5 text-sm font-medium">Название ветки
              <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} aria-invalid={duplicate} disabled={edit.isPending} />
            </label>
            {duplicate && <p role="alert" className="text-sm text-destructive">Ветка с таким названием уже существует.</p>}
            {edit.isError && <p role="alert" className="text-sm text-destructive">{edit.error.message}</p>}
            <DialogFooter><Button type="submit" disabled={!name.trim() || duplicate || edit.isPending}>{edit.isPending ? action === 'rename' ? 'Сохранение…' : 'Создание…' : action === 'clone' ? 'Клонировать' : action === 'rename' ? 'Сохранить' : 'Создать'}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={deleting} onOpenChange={setDeleting}
        title={`Удалить ветку «${currentBranch}»?`}
        description="Все данные этой ветки будут удалены без возможности восстановления. Остальные ветки проекта сохранятся."
        onConfirm={() => remove.mutate()} />
    </>
  );
}
