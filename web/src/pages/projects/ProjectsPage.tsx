import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, FolderOpen, MoreHorizontal, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import type { ProjectListItem } from '@/lib/types';

const plural = (n: number) => {
  const m = n % 100;
  const k = n % 10;
  const word = m > 10 && m < 15 ? 'сценариев' : k === 1 ? 'сценарий' : k >= 2 && k <= 4 ? 'сценария' : 'сценариев';
  return `${n} ${word}`;
};

const formatDate = (s: string) => new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

function ProjectDialog({ project, open, onOpenChange, onSubmit }: {
  project: ProjectListItem | null; open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (name: string, description: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [seen, setSeen] = useState<string>('');
  const key = `${open}:${project?.id ?? 'new'}`;
  if (open && seen !== key) {
    setSeen(key);
    setName(project?.name ?? '');
    setDescription(project?.description ?? '');
  }
  const valid = name.trim().length > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? 'Переименовать проект' : 'Новый проект'}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSubmit(name.trim(), description);
            onOpenChange(false);
          }}
        >
          <Input autoFocus placeholder="Название" aria-label="Название проекта" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea rows={3} placeholder="Описание (необязательно)" aria-label="Описание проекта" value={description} onChange={(e) => setDescription(e.target.value)} />
          <DialogFooter>
            <Button type="submit" disabled={!valid}>{project ? 'Сохранить' : 'Создать'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<{ project: ProjectListItem | null } | null>(null);
  const [deleting, setDeleting] = useState<ProjectListItem | null>(null);
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list });
  const refresh = () => qc.invalidateQueries({ queryKey: ['projects'] });

  const save = useMutation({
    mutationFn: ({ project, name, description }: { project: ProjectListItem | null; name: string; description: string }) =>
      project ? api.projects.rename(project.id, { name, description }) : api.projects.create(name, description),
    onSuccess: refresh,
  });
  const remove = useMutation({ mutationFn: (id: number) => api.projects.remove(id), onSuccess: refresh });
  const duplicate = useMutation({ mutationFn: (id: number) => api.projects.duplicate(id), onSuccess: refresh });

  const exportJson = async (p: ProjectListItem) => {
    const dump = await api.projects.dump(p.id);
    downloadBlob(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }), `${p.name}.json`);
  };
  const importFile = async (file: File) => {
    try {
      const r = await api.projects.import(JSON.parse(await file.text()));
      await refresh();
      toast.success(`Проект «${r.name}» импортирован`);
    } catch (e) {
      toast.error(e instanceof SyntaxError ? 'Файл не является корректным JSON' : (e as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg bg-brand text-sm font-bold text-white">V</span>
            VA Spec Maker
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Проекты</h1>
            <p className="mt-1 text-muted-foreground">Спецификации голосовых ассистентов. Данные хранятся в вашем браузере.</p>
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importFile(f); }} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="size-4" /> Импорт</Button>
            <Button onClick={() => setDialog({ project: null })}><Plus className="size-4" /> Новый проект</Button>
          </div>
        </div>

        {!isLoading && projects.length === 0 && (
          <div className="grid place-items-center rounded-xl border border-dashed bg-background px-6 py-20 text-center">
            <FolderOpen className="mb-3 size-10 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Проектов пока нет</h2>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">Создайте первый проект или импортируйте файл.</p>
            <Button onClick={() => setDialog({ project: null })}><Plus className="size-4" /> Новый проект</Button>
          </div>
        )}

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id} className="group relative rounded-xl border bg-background transition-colors hover:border-brand/40">
              <button type="button" onClick={() => navigate(`/p/${p.id}/scenarios`)} className="block w-full rounded-xl p-5 text-left">
                <h2 className="truncate pr-8 text-base font-semibold">{p.name}</h2>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">{p.description || 'Без описания'}</p>
                <p className="mt-4 text-xs text-muted-foreground">{plural(p.scenario_count)} · {formatDate(p.created_at)}</p>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="absolute right-2 top-2" aria-label={`Действия с проектом ${p.name}`} />}>
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDialog({ project: p })}><Pencil className="size-4" /> Переименовать</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => duplicate.mutate(p.id)}><Copy className="size-4" /> Дублировать</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportJson(p)}><Download className="size-4" /> Экспорт (.json)</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDeleting(p)}><Trash2 className="size-4" /> Удалить</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      </main>

      <ProjectDialog
        project={dialog?.project ?? null}
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        onSubmit={(name, description) => dialog && save.mutate({ project: dialog.project, name, description })}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Удалить проект «${deleting?.name ?? ''}»?`}
        description="Все сценарии, интенты, сущности и промпты проекта будут удалены без возможности восстановления. Перед удалением можно сделать экспорт в JSON."
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
