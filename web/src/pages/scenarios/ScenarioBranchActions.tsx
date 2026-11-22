import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, GitCompareArrows } from 'lucide-react';
import { toast } from 'sonner';
import type { Scenario } from '@/lib/types';
import { api } from '@/lib/api';
import { useIntentMode } from '@/lib/intentMode';
import { useSpecLang } from '@/lib/specLang';
import { useProject } from '@/hooks/project';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { waitForSaves } from '@/lib/saveStore';

type DiffRow = { left?: string; right?: string; kind: 'same' | 'removed' | 'added' };

function diffLines(leftText: string, rightText: string): DiffRow[] {
  const left = leftText.replace(/\r/g, '').split('\n');
  const right = rightText.replace(/\r/g, '').split('\n');
  const width = right.length + 1;
  const lcs = new Uint32Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      const cell = i * width + j;
      lcs[cell] = left[i] === right[j]
        ? lcs[(i + 1) * width + j + 1] + 1
        : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      rows.push({ left: left[i++], right: right[j++], kind: 'same' });
    } else if (i < left.length && (j >= right.length || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) {
      rows.push({ left: left[i++], kind: 'removed' });
    } else {
      rows.push({ right: right[j++], kind: 'added' });
    }
  }
  return rows;
}

export function ScenarioBranchActions({ scenario, projectId }: { scenario: Scenario; projectId: number }) {
  const qc = useQueryClient();
  const { project } = useProject();
  const [copyOpen, setCopyOpen] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [copyBranchId, setCopyBranchId] = useState('');
  const [copyTargetId, setCopyTargetId] = useState('');
  const [compareBranchId, setCompareBranchId] = useState('');
  const [compareTargetId, setCompareTargetId] = useState('');
  const specLang = useSpecLang(projectId);
  const intentMode = useIntentMode(projectId);
  const branchesQuery = useQuery({
    queryKey: ['project-branches', projectId],
    queryFn: () => api.projects.branches(projectId),
    enabled: copyOpen || compareOpen,
  });
  const branches = (branchesQuery.data ?? []).filter((branch) => branch.id !== projectId);
  const copyScenariosQuery = useQuery({
    queryKey: ['scenarios', Number(copyBranchId)],
    queryFn: () => api.scenarios.list(Number(copyBranchId)),
    enabled: copyOpen && !!copyBranchId,
  });
  const compareScenariosQuery = useQuery({
    queryKey: ['scenarios', Number(compareBranchId)],
    queryFn: () => api.scenarios.list(Number(compareBranchId)),
    enabled: compareOpen && !!compareBranchId,
  });
  const copyScenarios = copyScenariosQuery.data ?? [];
  const compareScenarios = compareScenariosQuery.data ?? [];
  const copyTarget = copyScenarios.find((item) => String(item.id) === copyTargetId);
  const compareTarget = compareScenarios.find((item) => String(item.id) === compareTargetId);

  useEffect(() => {
    if (!copyOpen || !branches.length || branches.some((branch) => String(branch.id) === copyBranchId)) return;
    setCopyBranchId(String(branches[0].id));
  }, [copyOpen, branches, copyBranchId]);
  useEffect(() => {
    if (!compareOpen || !branches.length || branches.some((branch) => String(branch.id) === compareBranchId)) return;
    setCompareBranchId(String(branches[0].id));
  }, [compareOpen, branches, compareBranchId]);
  useEffect(() => {
    if (!copyOpen || copyTargetId || !copyScenarios.length) return;
    const match = copyScenarios.find((item) => item.name === scenario.name);
    if (match) setCopyTargetId(String(match.id));
  }, [copyOpen, copyTargetId, copyScenarios, scenario.name]);
  useEffect(() => {
    if (!compareOpen || compareTargetId || !compareScenarios.length) return;
    const match = compareScenarios.find((item) => item.name === scenario.name);
    if (match) setCompareTargetId(String(match.id));
  }, [compareOpen, compareTargetId, compareScenarios, scenario.name]);

  const copyMutation = useMutation({
    mutationFn: async () => {
      await waitForSaves();
      return api.scenarios.copyToBranch(scenario.id, Number(copyTargetId));
    },
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ['scenarios', Number(copyBranchId)] });
      setCopyOpen(false);
      toast.success(`Сценарий «${result.name}» перезаписан в ветке «${branches.find((branch) => String(branch.id) === copyBranchId)?.branch_name ?? ''}»`);
    },
    onError: (error) => toast.error(error.message),
  });
  const sourcePreview = useQuery({
    queryKey: ['branch-compare-preview', scenario.id, specLang, intentMode],
    queryFn: () => api.preview(scenario.id, specLang, intentMode),
    enabled: compareOpen,
    refetchOnMount: 'always',
    gcTime: 0,
  });
  const targetPreview = useQuery({
    queryKey: ['branch-compare-preview', Number(compareTargetId), specLang, intentMode],
    queryFn: () => api.preview(Number(compareTargetId), specLang, intentMode),
    enabled: compareOpen && !!compareTargetId,
    refetchOnMount: 'always',
    gcTime: 0,
  });
  const diff = useMemo(() => sourcePreview.data && targetPreview.data ? diffLines(sourcePreview.data, targetPreview.data) : [], [sourcePreview.data, targetPreview.data]);

  return <>
    <DropdownMenuItem className="min-h-9" disabled={(project?.branch_count ?? 1) <= 1} onClick={() => { setCopyOpen(true); setCopyBranchId(''); setCopyTargetId(''); }}>
      <Copy className="size-4" /> Скопировать в ветку
    </DropdownMenuItem>
    <DropdownMenuItem className="min-h-9" disabled={(project?.branch_count ?? 1) <= 1} onClick={() => { setCompareOpen(true); setCompareBranchId(''); setCompareTargetId(''); }}>
      <GitCompareArrows className="size-4" /> Сравнить версии
    </DropdownMenuItem>
    <DropdownMenuSeparator />

    <Dialog open={copyOpen} onOpenChange={(open) => !copyMutation.isPending && setCopyOpen(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Скопировать сценарий в ветку</DialogTitle>
          <DialogDescription>Сценарий с таким же названием будет выбран автоматически. Если его нет, укажите сценарий, который нужно перезаписать.</DialogDescription>
        </DialogHeader>
        {branchesQuery.isError && <p role="alert" className="text-sm text-destructive">Не удалось загрузить ветки: {branchesQuery.error.message}</p>}
        {!branchesQuery.isLoading && branches.length === 0 && <p className="text-sm text-muted-foreground">В проекте нет других веток.</p>}
        {branches.length > 0 && <div className="grid gap-3">
          <label className="grid gap-1.5 text-sm font-medium">Ветка назначения
            <Select value={copyBranchId} onValueChange={(value) => { setCopyBranchId(value ?? ''); setCopyTargetId(''); }}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Выберите ветку" /></SelectTrigger>
              <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.branch_name ?? 'main'}</SelectItem>)}</SelectContent>
            </Select>
          </label>
          {copyBranchId && <label className="grid gap-1.5 text-sm font-medium">Сценарий для перезаписи
            <Select value={copyTargetId} onValueChange={(value) => setCopyTargetId(value ?? '')}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Выберите сценарий" /></SelectTrigger>
              <SelectContent>{copyScenarios.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent>
            </Select>
          </label>}
          {copyBranchId && !copyScenariosQuery.isLoading && copyScenarios.length === 0 && <p className="text-sm text-muted-foreground">В выбранной ветке нет сценариев для перезаписи.</p>}
          {copyTarget && <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">Содержимое «{copyTarget.name}» в выбранной ветке будет полностью заменено.</p>}
        </div>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setCopyOpen(false)}>Отмена</Button>
          <Button type="button" disabled={!copyTarget || copyScenariosQuery.isLoading || copyMutation.isPending} onClick={() => setConfirmCopy(true)}>Продолжить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={confirmCopy}
      onOpenChange={setConfirmCopy}
      title={`Перезаписать сценарий «${copyTarget?.name ?? ''}»?`}
      description={`Данные сценария в ветке «${branches.find((branch) => String(branch.id) === copyBranchId)?.branch_name ?? ''}» будут заменены данными текущей версии.`}
      confirmLabel="Перезаписать"
      onConfirm={() => copyMutation.mutate()}
    />

    <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
      <DialogContent className="max-h-[92vh] max-w-[min(96vw,90rem)] gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle>Сравнение спецификаций</DialogTitle>
          <DialogDescription>Удалённые строки выделены красным, добавленные — зелёным.</DialogDescription>
        </DialogHeader>
        {branchesQuery.isError && <p role="alert" className="text-sm text-destructive">Не удалось загрузить ветки: {branchesQuery.error.message}</p>}
        {!branchesQuery.isLoading && branches.length === 0 && <p className="text-sm text-muted-foreground">В проекте нет других веток.</p>}
        {branches.length > 0 && <label className="grid max-w-sm gap-1.5 text-sm font-medium">Сравнить с веткой
          <Select value={compareBranchId} onValueChange={(value) => { setCompareBranchId(value ?? ''); setCompareTargetId(''); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Выберите ветку" /></SelectTrigger>
            <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.branch_name ?? 'main'}</SelectItem>)}</SelectContent>
          </Select>
        </label>}
        {compareBranchId && <label className="grid max-w-sm gap-1.5 text-sm font-medium">Сценарий в выбранной ветке
          <Select value={compareTargetId} onValueChange={(value) => setCompareTargetId(value ?? '')}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Выберите сценарий" /></SelectTrigger>
            <SelectContent>{compareScenarios.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
        </label>}
        <div className="min-w-0 max-h-[68vh] overflow-auto rounded-lg border">
          <div className="grid min-w-[52rem] grid-cols-2 divide-x">
            <div className="sticky top-0 z-10 bg-muted px-3 py-2 text-sm font-semibold">Текущая версия · {scenario.name}</div>
            <div className="sticky top-0 z-10 bg-muted px-3 py-2 text-sm font-semibold">{compareTarget?.name ?? 'Другая версия'}</div>
          </div>
          {sourcePreview.isLoading || (compareTargetId && targetPreview.isLoading) ? <p role="status" className="p-4 text-sm text-muted-foreground">Загрузка спецификаций…</p> : null}
          {(sourcePreview.error || targetPreview.error) && <p role="alert" className="p-4 text-sm text-destructive">Не удалось загрузить спецификацию: {(sourcePreview.error ?? targetPreview.error as Error).message}</p>}
          {!compareTargetId && compareBranchId && !compareScenariosQuery.isLoading && <p className="p-4 text-sm text-muted-foreground">{compareScenarios.length ? 'Выберите сценарий для сравнения.' : 'В этой ветке нет сценариев для сравнения.'}</p>}
          {sourcePreview.data && targetPreview.data && <div className="grid min-w-[52rem] grid-cols-2 divide-x">
            {diff.map((row, index) => <div key={`${index}-${row.kind}`} className="contents">
              <pre className={`min-h-6 whitespace-pre-wrap break-words border-b px-2 py-1 font-mono text-xs ${row.kind === 'removed' ? 'bg-red-100 text-red-950 dark:bg-red-950/40 dark:text-red-100' : ''}`}>{row.left ?? ''}</pre>
              <pre className={`min-h-6 whitespace-pre-wrap break-words border-b px-2 py-1 font-mono text-xs ${row.kind === 'added' ? 'bg-green-100 text-green-950 dark:bg-green-950/40 dark:text-green-100' : ''}`}>{row.right ?? ''}</pre>
            </div>)}
          </div>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
