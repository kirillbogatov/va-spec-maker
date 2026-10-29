import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, FileText, FolderOpen, MoreHorizontal, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Logo } from '@/components/Logo';
import { UserMenu } from '@/components/UserMenu';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { api } from '@/lib/api';
import { readSpecLang } from '@/lib/specLang';
import { backupProject } from '@/lib/backup';
import { addDemo } from '@/lib/backend';
import type { ProjectListItem } from '@/lib/types';

/** «3 интента», «1 сущность»: склонение по последней цифре. */
const forms = (n: number, one: string, few: string, many: string) => {
  const m = n % 100;
  const k = n % 10;
  return `${n} ${m > 10 && m < 15 ? many : k === 1 ? one : k >= 2 && k <= 4 ? few : many}`;
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
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ project: ProjectListItem | null } | null>(null);
  const [deleting, setDeleting] = useState<ProjectListItem | null>(null);
  const [, bump] = useState(0);
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
    await backupProject(p);
    bump((n) => n + 1);
  };
  const exportDocx = (p: ProjectListItem) =>
    api.exportFile(`/api/projects/${p.id}/export?format=docx&lang=${readSpecLang(p.id)}`, `${p.name}.docx`).catch((e: Error) => toast.error(e.message));
  const fileRef = useRef<HTMLInputElement>(null);
  const importJson = async (file: File) => {
    try {
      const r = await api.projects.import(JSON.parse(await file.text()));
      await refresh();
      toast.success(`Проект «${r.name}» импортирован`);
    } catch (e) {
      toast.error(e instanceof SyntaxError ? 'Файл не похож на копию проекта (JSON)' : (e as Error).message);
    }
  };
  const loadDemo = async () => {
    await addDemo();
    await refresh();
    toast.success('Демо-проект добавлен');
  };
  return (
    <div className="min-h-screen bg-page">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Logo className="size-8" />
            VA Spec Maker
          </span>
          <UserMenu variant="header" />
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-balance text-3xl font-semibold tracking-tight">Проекты</h1>
          <Button variant="outline" className="h-10 sm:h-9" onClick={() => fileRef.current?.click()}><Upload className="size-4" /> Импорт из JSON</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Файл копии проекта"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importJson(f);
            }}
          />
        </div>

        {!isLoading && projects.length === 0 && (
          <div className="grid place-items-center rounded-xl border border-dashed bg-background px-6 py-16 text-center">
            <FolderOpen className="mb-3 size-10 text-muted-foreground" aria-hidden />
            <h2 className="text-balance text-lg font-semibold">Проектов пока нет</h2>
            <p className="mb-5 mt-1 max-w-md text-sm text-muted-foreground">Создайте пустой проект или посмотрите готовый пример «Умный дом».</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button className="h-10 sm:h-9" onClick={() => setDialog({ project: null })}><Plus className="size-4" /> Новый проект</Button>
              <Button variant="outline" className="h-10 sm:h-9" onClick={loadDemo}>Добавить демо</Button>
            </div>
          </div>
        )}

        {projects.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              return (
                <li key={p.id} className="group relative flex flex-col gap-3 rounded-xl border bg-background p-5 transition-[box-shadow,border-color] duration-300 ease-in-out hover:border-foreground/20 hover:shadow-md motion-reduce:transition-none">
                  <div className="flex items-start gap-2">
                    <h2 className="min-w-0 flex-1 text-balance pt-1 text-base font-semibold leading-snug">
                      <Link to={`/p/${p.id}/scenarios`} className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring">{p.name}</Link>
                    </h2>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative z-10 -mr-2 -mt-1 size-10 sm:size-9" aria-label={`Действия с проектом ${p.name}`} />}>
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="min-h-9" onClick={() => setDialog({ project: p })}><Pencil className="size-4" /> Переименовать</DropdownMenuItem>
                        <DropdownMenuItem className="min-h-9" onClick={() => duplicate.mutate(p.id)}><Copy className="size-4" /> Дублировать</DropdownMenuItem>
                        <DropdownMenuItem className="min-h-9" onClick={() => exportJson(p)}><Download className="size-4" /> Экспорт (.json)</DropdownMenuItem>
                        <DropdownMenuItem className="min-h-9" onClick={() => exportDocx(p)}><FileText className="size-4" /> Скачать .docx</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="min-h-9" variant="destructive" onClick={() => setDeleting(p)}><Trash2 className="size-4" /> Удалить</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">{p.description || 'Без описания'}</p>
                  <p className="text-[13px] tabular-nums text-muted-foreground">
                    {p.scenario_count ? forms(p.scenario_count, 'сценарий', 'сценария', 'сценариев') : 'Нет сценариев'}
                  </p>
                  <span className="mt-auto pt-1 text-xs text-muted-foreground">Создан {formatDate(p.created_at)}</span>
                </li>
              );
            })}
            <li className="relative min-h-52 rounded-xl border bg-background transition-[box-shadow,border-color] duration-300 ease-in-out hover:border-foreground/20 hover:shadow-md motion-reduce:transition-none">
              <button type="button" onClick={() => setDialog({ project: null })} className="flex size-full flex-col items-center justify-center gap-2 rounded-xl p-5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                <Plus className="size-8" aria-hidden />
                Добавить проект
              </button>
            </li>
          </ul>
        )}
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
