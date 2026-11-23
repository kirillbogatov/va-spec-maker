import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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
import { MarkdownView, type MarkdownLineDiff } from '@/components/MarkdownView';

type DiffRow = { left?: string; right?: string; kind: 'same' | 'removed' | 'added' };
type SpecSection = { key: string; start: number; source: string; lineDiff: MarkdownLineDiff[] };
type AlignedSection = { left: SpecSection | null; right: SpecSection | null };

const sectionHeading = /^(#{1,2})\s+(.+)$/;

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

function splitSpecSections(source: string, lineDiff: MarkdownLineDiff[]): SpecSection[] {
  const lines = source.replace(/\r/g, '').split('\n');
  const headings = lines.flatMap((line, index) => {
    const match = sectionHeading.exec(line);
    if (!match) return [];
    const title = match[2].replace(/\*\*|`/g, '').replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1').trim().toLocaleLowerCase();
    return [{ index, key: `${match[1].length}:${title}` }];
  });
  if (!headings.length) return [{ key: '0:document', start: 0, source: lines.join('\n'), lineDiff }];

  const sections: SpecSection[] = [];
  if (headings[0].index > 0) {
    sections.push({ key: '0:preamble', start: 0, source: lines.slice(0, headings[0].index).join('\n'), lineDiff: lineDiff.slice(0, headings[0].index) });
  }
  headings.forEach((heading, index) => {
    const end = headings[index + 1]?.index ?? lines.length;
    sections.push({ key: heading.key, start: heading.index, source: lines.slice(heading.index, end).join('\n'), lineDiff: lineDiff.slice(heading.index, end) });
  });
  return sections;
}

function alignSpecSections(left: SpecSection[], right: SpecSection[]): AlignedSection[] {
  const width = right.length + 1;
  const lcs = new Uint32Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      const cell = i * width + j;
      lcs[cell] = left[i].key === right[j].key
        ? lcs[(i + 1) * width + j + 1] + 1
        : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const aligned: AlignedSection[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i].key === right[j].key) aligned.push({ left: left[i++], right: right[j++] });
    else if (i < left.length && (j >= right.length || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) aligned.push({ left: left[i++], right: null });
    else aligned.push({ left: null, right: right[j++] });
  }
  return aligned;
}

export function ScenarioBranchActions({ scenario, projectId, children }: {
  scenario: Scenario;
  projectId: number;
  children: (menuItems: ReactNode) => ReactNode;
}) {
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
  const compareBranch = branches.find((branch) => String(branch.id) === compareBranchId);
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
  const lineDiff = useMemo(() => {
    if (!sourcePreview.data || !targetPreview.data) return null;
    const left: MarkdownLineDiff[] = [];
    const right: MarkdownLineDiff[] = [];
    for (const row of diffLines(sourcePreview.data, targetPreview.data)) {
      if (row.left !== undefined) left.push(row.kind === 'removed' ? 'removed' : undefined);
      if (row.right !== undefined) right.push(row.kind === 'added' ? 'added' : undefined);
    }
    return { left, right };
  }, [sourcePreview.data, targetPreview.data]);
  const alignedSections = useMemo(() => {
    if (!sourcePreview.data || !targetPreview.data || !lineDiff) return [];
    return alignSpecSections(
      splitSpecSections(sourcePreview.data, lineDiff.left),
      splitSpecSections(targetPreview.data, lineDiff.right),
    );
  }, [sourcePreview.data, targetPreview.data, lineDiff]);
  const changedSections = useMemo(
    () => alignedSections.filter(({ left, right }) => !left || !right || left.source !== right.source),
    [alignedSections],
  );

  return <>
    {children(<>
    <DropdownMenuItem className="min-h-9" disabled={(project?.branch_count ?? 1) <= 1} onClick={() => { setCopyOpen(true); setCopyBranchId(''); setCopyTargetId(''); }}>
      <Copy className="size-4" /> Скопировать в ветку
    </DropdownMenuItem>
    <DropdownMenuItem className="min-h-9" disabled={(project?.branch_count ?? 1) <= 1} onClick={() => { setCompareOpen(true); setCompareBranchId(''); setCompareTargetId(''); }}>
      <GitCompareArrows className="size-4" /> Сравнить версии
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    </>)}

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
      <DialogContent className="max-h-[92vh] w-[min(98vw,110rem)] max-w-none gap-3 overflow-hidden sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Сравнение спецификаций</DialogTitle>
          <DialogDescription>Текущая ветка: {project?.branch_name ?? 'main'}</DialogDescription>
        </DialogHeader>
        {branchesQuery.isError && <p role="alert" className="text-sm text-destructive">Не удалось загрузить ветки: {branchesQuery.error.message}</p>}
        {!branchesQuery.isLoading && branches.length === 0 && <p className="text-sm text-muted-foreground">В проекте нет других веток.</p>}
        <div className="flex flex-wrap items-end gap-4">
        {branches.length > 0 && <label className="grid w-full max-w-xs gap-1.5 text-sm font-medium">Сравнить с веткой
          <Select value={compareBranchId} onValueChange={(value) => { setCompareBranchId(value ?? ''); setCompareTargetId(''); }}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Выберите ветку">{branches.find((branch) => String(branch.id) === compareBranchId)?.branch_name ?? 'main'}</SelectValue></SelectTrigger>
            <SelectContent alignItemWithTrigger={false} sideOffset={12}>{branches.map((branch) => <SelectItem key={branch.id} value={String(branch.id)}>{branch.branch_name ?? 'main'}</SelectItem>)}</SelectContent>
          </Select>
        </label>}
        {compareBranchId && <label className="grid w-full max-w-xs gap-1.5 text-sm font-medium">Сценарий в выбранной ветке
          <Select value={compareTargetId} onValueChange={(value) => setCompareTargetId(value ?? '')}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Выберите сценарий">{compareTarget?.name}</SelectValue></SelectTrigger>
            <SelectContent alignItemWithTrigger={false} sideOffset={12}>{compareScenarios.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
        </label>}
        </div>
        <div className="min-w-0 max-h-[68vh] overflow-auto rounded-lg border">
          <div className="grid min-w-[72rem] grid-cols-2 divide-x">
            <div className="sticky top-0 z-20 col-span-2 grid grid-cols-2 divide-x bg-muted shadow-sm">
              <div className="px-3 py-2 text-sm font-semibold">Текущая ветка · {project?.branch_name ?? 'main'}<span className="block font-normal text-muted-foreground">{scenario.name}</span></div>
              <div className="px-3 py-2 text-sm font-semibold">Ветка сравнения · {compareBranch?.branch_name ?? 'Выберите ветку'}<span className="block font-normal text-muted-foreground">{compareTarget?.name ?? 'Выберите сценарий'}</span></div>
            </div>
          {sourcePreview.isLoading || (compareTargetId && targetPreview.isLoading) ? <p role="status" className="col-span-2 p-4 text-sm text-muted-foreground">Загрузка спецификаций…</p> : null}
          {(sourcePreview.error || targetPreview.error) && <p role="alert" className="col-span-2 p-4 text-sm text-destructive">Не удалось загрузить спецификацию: {(sourcePreview.error ?? targetPreview.error as Error).message}</p>}
          {!compareTargetId && compareBranchId && !compareScenariosQuery.isLoading && <p className="col-span-2 p-4 text-sm text-muted-foreground">{compareScenarios.length ? 'Выберите сценарий для сравнения.' : 'В этой ветке нет сценариев для сравнения.'}</p>}
          {sourcePreview.data && targetPreview.data && changedSections.length === 0 && <p role="status" className="col-span-2 p-6 text-center text-sm text-muted-foreground">Различий между спецификациями нет</p>}
          {sourcePreview.data && targetPreview.data && lineDiff && <>
            {changedSections.map(({ left, right }, index) => {
              const rowKey = `${left?.key ?? 'missing'}:${right?.key ?? 'missing'}:${index}`;
              return <Fragment key={rowKey}>
                {left ? <section data-spec-pane="current" data-section-key={left.key} className="min-w-0 border-b p-3 sm:p-4">
                  <article className="mx-auto min-w-0 max-w-[1123px] rounded-lg border bg-card px-5 py-6 shadow-sm sm:px-8 sm:py-8 md:px-[40px]">
                    <MarkdownView source={left.source} lineDiff={left.lineDiff} headingIdPrefix="compare-current" lineOffset={left.start} />
                  </article>
                </section> : <section data-spec-pane="current" data-section-key={right!.key} className="min-w-0 border-b p-3 sm:p-4">
                  <div className="flex h-full min-h-24 items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">Раздела нет в текущей ветке</div>
                </section>}
                {right ? <section data-spec-pane="comparison" data-section-key={right.key} className="min-w-0 border-b p-3 sm:p-4">
                  <article className="mx-auto min-w-0 max-w-[1123px] rounded-lg border bg-card px-5 py-6 shadow-sm sm:px-8 sm:py-8 md:px-[40px]">
                    <MarkdownView source={right.source} lineDiff={right.lineDiff} headingIdPrefix="compare-comparison" lineOffset={right.start} />
                  </article>
                </section> : <section data-spec-pane="comparison" data-section-key={left!.key} className="min-w-0 border-b p-3 sm:p-4">
                  <div className="flex h-full min-h-24 items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">Раздела нет в ветке сравнения</div>
                </section>}
              </Fragment>;
            })}
          </>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
