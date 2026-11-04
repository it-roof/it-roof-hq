'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FileTextIcon,
  InboxIcon,
  MailIcon,
  MessageCircleIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  ScrollTextIcon,
  SearchIcon,
  TimerIcon,
  type LucideIcon,
} from 'lucide-react';
import { ConfirmDelete } from '@/components/leads/confirm-delete';
import { SaveForm } from '@/components/save-form';
import {
  CAMPAIGN_STEP_TYPES,
  campaignStepMeta,
  delayLabel,
  normalizeCampaignStepType,
  stepTemplateStatus,
  stepUsesSubject,
  stepUsesTemplate,
  type CampaignStepType,
} from '@/lib/leads/campaign-steps';
import { TemplateEditorFields } from '@/components/leads/template-field';
import { LinkedInCampaignPanel } from '@/components/leads/linkedin-campaign-panel';
import { cn } from '@/lib/utils';
import {
  splitHeaderY,
  splitLeftPad,
  splitLeftPadEnd,
  splitRightPad,
} from '@/lib/page-layout';

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  created_at: string | null;
  channel?: string;
  step_count: number;
  contact_count?: number;
};

type Step = {
  id: string;
  campaignId: string;
  stepOrder: number;
  type: string;
  delayDays: number;
  subjectTemplate: string | null;
  bodyTemplate: string | null;
};

const STEP_ICONS: Record<string, LucideIcon> = {
  email: MailIcon,
  email_reminder: MailIcon,
  letter: ScrollTextIcon,
  call: PhoneIcon,
  linkedin: MessageCircleIcon,
  wait: TimerIcon,
};

function stepIcon(type: string) {
  return STEP_ICONS[type] ?? TimerIcon;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function CampaignsTab() {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [reordering, setReordering] = useState(false);

  const [campaignOpen, setCampaignOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [savingCampaign, setSavingCampaign] = useState(false);

  const [stepOpen, setStepOpen] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepType, setStepType] = useState<CampaignStepType>('email');
  const [stepDelay, setStepDelay] = useState('0');
  const [stepSubject, setStepSubject] = useState('');
  const [stepBody, setStepBody] = useState('');
  const [savingStep, setSavingStep] = useState(false);

  async function load(opts?: { preferId?: string | null; silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    const [campsRes, stepsRes] = await Promise.all([
      fetch('/api/campaigns'),
      fetch('/api/campaign-steps'),
    ]);
    const campsData = await campsRes.json();
    const stepsData = await stepsRes.json();
    const nextRows: Campaign[] = campsData.campaigns ?? [];
    setRows(nextRows);
    setSteps(stepsData.steps ?? []);
    setLoading(false);

    setSelectedId((prev) => {
      if (opts?.preferId && nextRows.some((c) => c.id === opts.preferId)) return opts.preferId;
      if (prev && nextRows.some((c) => c.id === prev)) return prev;
      return nextRows[0]?.id ?? null;
    });
  }

  useEffect(() => {
    load();
  }, []);

  const stepsByCampaign = useMemo(() => {
    const map = new Map<string, Step[]>();
    for (const s of steps) {
      const list = map.get(s.campaignId) ?? [];
      list.push(s);
      map.set(s.campaignId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.stepOrder - b.stepOrder);
    }
    return map;
  }, [steps]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q)
        || (c.description ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  const selected = rows.find((c) => c.id === selectedId) ?? null;
  const selectedSteps = selected ? (stepsByCampaign.get(selected.id) ?? []) : [];
  const selectedIsLinkedIn = selected?.channel === 'linkedin';
  function openCreateCampaign() {
    setEditingCampaignId(null);
    setName('');
    setDescription('');
    setCampaignOpen(true);
  }

  function openEditCampaign(c: Campaign) {
    setEditingCampaignId(c.id);
    setName(c.name);
    setDescription(c.description ?? '');
    setCampaignOpen(true);
  }

  async function saveCampaign() {
    if (!name.trim() || savingCampaign) return;
    setSavingCampaign(true);
    const isNew = !editingCampaignId;
    const res = await fetch(
      editingCampaignId ? `/api/campaigns/${editingCampaignId}` : '/api/campaigns',
      {
        method: editingCampaignId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      },
    );
    const data = await res.json();
    setSavingCampaign(false);
    setCampaignOpen(false);
    await load({ preferId: isNew ? data.campaign?.id : editingCampaignId, silent: true });
  }

  async function removeCampaign(id: string) {
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    await load({ silent: true });
  }

  function openCreateStep() {
    if (!selected) return;
    setEditingStepId(null);
    setStepType('email');
    setStepDelay('');
    setStepSubject('');
    setStepBody('');
    setStepOpen(true);
  }

  function openEditStep(s: Step) {
    setEditingStepId(s.id);
    setStepType(normalizeCampaignStepType(s.type));
    setStepDelay(s.delayDays > 0 ? String(s.delayDays) : '');
    setStepSubject(s.subjectTemplate ?? '');
    setStepBody(s.bodyTemplate ?? '');
    setStepOpen(true);
  }

  async function saveStep() {
    if (!selected || savingStep) return;
    setSavingStep(true);
    const existing = stepsByCampaign.get(selected.id) ?? [];
    const stepOrder = editingStepId
      ? (existing.find((s) => s.id === editingStepId)?.stepOrder ?? existing.length + 1)
      : existing.length + 1;

    const withTemplate = stepUsesTemplate(stepType);
    const withSubject = withTemplate && stepUsesSubject(stepType);
    await fetch(
      editingStepId ? `/api/campaign-steps/${editingStepId}` : '/api/campaign-steps',
      {
        method: editingStepId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: selected.id,
          step_order: stepOrder,
          type: stepType,
          delay_days: Number(stepDelay) || 0,
          subject_template: withSubject ? stepSubject : null,
          body_template: withTemplate ? stepBody : null,
        }),
      },
    );
    setSavingStep(false);
    setStepOpen(false);
    await load({ preferId: selected.id, silent: true });
  }

  async function renumber(campaignId: string, ordered: Step[]) {
    await Promise.all(
      ordered.map((s, i) =>
        fetch(`/api/campaign-steps/${s.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step_order: i + 1 }),
        }),
      ),
    );
  }

  async function removeStep(id: string) {
    if (!selected) return;
    await fetch(`/api/campaign-steps/${id}`, { method: 'DELETE' });
    const remaining = selectedSteps.filter((s) => s.id !== id);
    if (remaining.length) await renumber(selected.id, remaining);
    await load({ preferId: selected.id, silent: true });
  }

  async function moveStep(index: number, direction: -1 | 1) {
    if (!selected || reordering) return;
    const list = [...selectedSteps];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;

    const [item] = list.splice(index, 1);
    list.splice(target, 0, item!);

    setReordering(true);
    setSteps((prev) => [
      ...prev.filter((s) => s.campaignId !== selected.id),
      ...list.map((s, i) => ({ ...s, stepOrder: i + 1 })),
    ]);
    await renumber(selected.id, list);
    setReordering(false);
    await load({ preferId: selected.id, silent: true });
  }

  const showMobileDetail = !!selected;

  // Einheitliche Spalten-Gutters (PageContainer ist bei full+fill randlos)
  const leftPad = splitLeftPad;
  const leftPadEnd = splitLeftPadEnd;
  const rightPad = splitRightPad;
  const headerY = splitHeaderY;

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* —— Liste —— */}
      <section
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          leftPad,
          leftPadEnd,
          showMobileDetail ? 'hidden lg:flex' : 'flex',
        )}
      >
        <header className={cn('flex shrink-0 items-start justify-between gap-3', headerY)}>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Kampagnen</h1>
            <p className="mt-1 font-mono text-xs tracking-wide text-muted-foreground">
              {rows.length === 0
                ? 'Noch keine Kampagnen'
                : `${rows.length} Kampagne${rows.length !== 1 ? 'n' : ''}`}
            </p>
          </div>
          <Button className="h-10 shrink-0 gap-2" onClick={openCreateCampaign}>
            <PlusIcon className="size-4" />
            Neu
          </Button>
        </header>

        {rows.length > 0 && (
          <div className="relative mb-3 shrink-0">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suchen…"
              className="h-10 pl-9"
            />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-full flex-col justify-center gap-3 py-10">
              <p className="max-w-sm text-sm text-muted-foreground">
                Lege eine Kampagne an und baue danach den Ablauf aus E-Mail, LinkedIn, Anruf oder Wartezeit.
              </p>
              <Button className="h-10 w-fit gap-2" onClick={openCreateCampaign}>
                <PlusIcon className="size-4" />
                Erste Kampagne
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground">Keine Treffer.</p>
          ) : (
            <Table className="[&_td:first-child]:pl-0 [&_th:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th:last-child]:pr-0">
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[11px] tracking-wide">Name</TableHead>
                  <TableHead className="hidden font-mono text-[11px] tracking-wide sm:table-cell">
                    Ablauf
                  </TableHead>
                  <TableHead className="font-mono text-[11px] tracking-wide text-right">
                    Schritte
                  </TableHead>
                  <TableHead className="hidden font-mono text-[11px] tracking-wide lg:table-cell">
                    Angelegt
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const list = stepsByCampaign.get(c.id) ?? [];
                  const active = selectedId === c.id;
                  return (
                    <TableRow
                      key={c.id}
                      data-state={active ? 'selected' : undefined}
                      className="cursor-pointer"
                      onClick={() => setSelectedId(c.id)}
                    >
                      <TableCell className="max-w-[220px]">
                        <span className="block truncate font-medium">{c.name}</span>
                        {c.description && (
                          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                            {c.description}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {c.channel === 'linkedin' ? (
                          <span className="text-[12px] text-muted-foreground">LinkedIn</span>
                        ) : list.length === 0 ? (
                          <span className="text-[12px] text-muted-foreground/70">—</span>
                        ) : (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            {list.slice(0, 4).map((s, i) => {
                              const Icon = stepIcon(s.type);
                              const { label } = campaignStepMeta(s.type);
                              return (
                                <span key={s.id} className="inline-flex items-center gap-1.5">
                                  {i > 0 && <span className="text-border">·</span>}
                                  <Icon className="size-3.5" aria-label={label} />
                                </span>
                              );
                            })}
                            {list.length > 4 && (
                              <span className="font-mono text-[11px]">+{list.length - 4}</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                        {c.channel === 'linkedin' ? (c.contact_count ?? 0) : list.length}
                      </TableCell>
                      <TableCell className="hidden font-mono text-[12px] text-muted-foreground lg:table-cell">
                        {formatDate(c.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {/* —— Detail —— */}
      <aside
        className={cn(
          'min-h-0 w-full shrink-0 flex-col border-border/60 lg:flex lg:border-l',
          'lg:w-[24rem] xl:w-[26rem]',
          rightPad,
          showMobileDetail ? 'flex flex-1' : 'hidden',
        )}
      >
        {selected ? (
          <>
            <header className={cn('flex shrink-0 items-start gap-2 border-b border-border/60', headerY)}>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0 lg:hidden"
                onClick={() => setSelectedId(null)}
                aria-label="Zurück"
              >
                <ArrowLeftIcon className="size-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold tracking-tight md:text-xl">
                  {selected.name}
                </h2>
                <p className="mt-1 font-mono text-xs tracking-wide text-muted-foreground">
                  {selectedIsLinkedIn
                    ? 'LinkedIn-Kampagne'
                    : selectedSteps.length === 0
                      ? 'Ablauf noch leer'
                      : `${selectedSteps.length} Schritt${selectedSteps.length !== 1 ? 'e' : ''}`}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 shrink-0"
                onClick={() => openEditCampaign(selected)}
              >
                <PencilIcon className="size-3.5" />
              </Button>
              <ConfirmDelete
                label={`„${selected.name}" inkl. Ablauf löschen?`}
                onConfirm={() => removeCampaign(selected.id)}
              />
            </header>

            {selected.description && (
              <p className="shrink-0 border-b border-border/60 py-3 text-sm text-muted-foreground">
                {selected.description}
              </p>
            )}

            {selectedIsLinkedIn ? (
              <LinkedInCampaignPanel key={selected.id} campaignId={selected.id} />
            ) : (
            <>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 py-2">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground">Ablauf</p>
              <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
                <Link href={`/leads/abarbeiten?campaign=${selected.id}`}>
                  <InboxIcon className="size-3.5" />
                  Abarbeiten
                </Link>
              </Button>
            </div>

            <div className="flex shrink-0 items-center justify-between py-3">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground">Schritte</p>
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={openCreateStep}>
                <PlusIcon className="size-3.5" />
                Schritt
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              {selectedSteps.length === 0 ? (
                <div className="flex h-full min-h-48 flex-col justify-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    Noch keine Schritte. Der Ablauf startet mit dem ersten Kontakt.
                  </p>
                  <Button className="h-9 w-fit gap-1.5" onClick={openCreateStep}>
                    <PlusIcon className="size-3.5" />
                    Ersten Schritt
                  </Button>
                </div>
              ) : (
                <ol className="space-y-0">
                  {selectedSteps.map((s, index) => {
                    const Icon = stepIcon(s.type);
                    const { label } = campaignStepMeta(s.type);
                    const isLast = index === selectedSteps.length - 1;
                    const templateStatus = stepTemplateStatus(
                      s.type,
                      s.subjectTemplate,
                      s.bodyTemplate,
                    );
                    return (
                      <li key={s.id} className="relative flex gap-3">
                        <div className="flex w-6 shrink-0 flex-col items-center">
                          <span className="flex size-6 items-center justify-center font-mono text-[11px] tabular-nums text-muted-foreground">
                            {index + 1}
                          </span>
                          {!isLast && <span className="mt-1 w-px flex-1 bg-border/70" />}
                        </div>
                        <div className={cn('min-w-0 flex-1 pb-5', isLast && 'pb-0')}>
                          <div className="flex items-start gap-2">
                            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium leading-none">{label}</p>
                              <p className="mt-1 text-[12px] text-muted-foreground">
                                {delayLabel(s.delayDays)}
                                {stepUsesTemplate(s.type) && (
                                  <>
                                    {' · '}
                                    {templateStatus === 'complete' ? (
                                      <span className="inline-flex items-center gap-1">
                                        <FileTextIcon className="inline size-3" />
                                        {stepUsesSubject(s.type)
                                          ? 'Betreff + Text'
                                          : 'Text'}
                                      </span>
                                    ) : templateStatus === 'partial' ? (
                                      <span className="text-warning">
                                        Vorlage unvollständig
                                      </span>
                                    ) : (
                                      <span className="text-warning">keine Vorlage</span>
                                    )}
                                  </>
                                )}
                              </p>
                            </div>
                            <div className="flex shrink-0">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                disabled={index === 0 || reordering}
                                onClick={() => moveStep(index, -1)}
                                aria-label="Nach oben"
                              >
                                <ChevronUpIcon className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                disabled={isLast || reordering}
                                onClick={() => moveStep(index, 1)}
                                aria-label="Nach unten"
                              >
                                <ChevronDownIcon className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => openEditStep(s)}
                              >
                                <PencilIcon className="size-3.5" />
                              </Button>
                              <ConfirmDelete
                                label={`„${index + 1}. ${label}" löschen?`}
                                onConfirm={() => removeStep(s.id)}
                              />
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
            </>
            )}
          </>
        ) : (
          <div className={cn('hidden h-full items-center justify-center lg:flex', headerY)}>
            <p className="text-sm text-muted-foreground">Kampagne in der Tabelle wählen</p>
          </div>
        )}
      </aside>

      {/* —— Dialoge —— */}
      <Dialog open={campaignOpen} onOpenChange={setCampaignOpen}>
        <DialogContent className="sm:max-w-md">
          <SaveForm onSave={saveCampaign}>
            <DialogHeader>
              <DialogTitle>
                {editingCampaignId ? 'Kampagne bearbeiten' : 'Neue Kampagne'}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="camp-name">Name</Label>
                <Input
                  id="camp-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="camp-desc">Beschreibung</Label>
                <Textarea
                  id="camp-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Optional"
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" className="h-10" onClick={() => setCampaignOpen(false)}>
                Abbrechen
              </Button>
              <Button
                type="submit"
                variant="success-solid"
                className="h-10"
                disabled={savingCampaign || !name.trim()}
              >
                {savingCampaign ? 'Speichern…' : 'Speichern'}
              </Button>
            </DialogFooter>
          </SaveForm>
        </DialogContent>
      </Dialog>

      <Dialog open={stepOpen} onOpenChange={setStepOpen}>
        <DialogContent
          className={cn(
            'flex flex-col gap-0 overflow-hidden p-0',
            stepUsesTemplate(stepType)
              ? 'h-[min(92vh,880px)] sm:max-w-4xl'
              : 'sm:max-w-lg',
          )}
        >
          <SaveForm
            onSave={saveStep}
            className="flex min-h-0 flex-1 flex-col"
          >
            <DialogHeader className="shrink-0 space-y-0 border-b px-6 py-4 pr-14">
              <DialogTitle>{editingStepId ? 'Schritt bearbeiten' : 'Schritt hinzufügen'}</DialogTitle>
            </DialogHeader>

            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col gap-6 px-6 py-5',
                stepUsesTemplate(stepType) ? 'overflow-hidden' : 'overflow-y-auto',
              )}
            >
              <div className="grid shrink-0 gap-5 sm:grid-cols-2 sm:gap-6">
                <div className="flex flex-col gap-1.5">
                  <Label>Aktion</Label>
                  <Select value={stepType} onValueChange={(v) => setStepType(v as CampaignStepType)}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMPAIGN_STEP_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="step-delay">
                    Wartezeit in Tagen
                    <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="step-delay"
                    type="number"
                    min={0}
                    value={stepDelay}
                    onChange={(e) => setStepDelay(e.target.value)}
                    className="h-10"
                    placeholder="0"
                  />
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Leer oder 0 = sofort · nur Anzeige
                  </p>
                </div>
              </div>

              {stepUsesTemplate(stepType) && (
                <div className="flex min-h-0 flex-1 flex-col gap-4 border-t border-border/60 pt-5">
                  <div className="shrink-0 space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {stepUsesSubject(stepType) ? 'E-Mail-Vorlage' : 'Text-Vorlage'}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {stepUsesSubject(stepType)
                        ? 'Besteht aus Betreff und Text'
                        : 'Text zum Kopieren beim Abarbeiten'}
                    </p>
                  </div>

                  <TemplateEditorFields
                    withSubject={stepUsesSubject(stepType)}
                    subject={stepSubject}
                    body={stepBody}
                    onSubjectChange={setStepSubject}
                    onBodyChange={setStepBody}
                  />
                </div>
              )}
            </div>

            <DialogFooter className="mx-0 mb-0 shrink-0 px-6 py-4">
              <Button type="button" variant="outline" className="h-10" onClick={() => setStepOpen(false)}>
                Abbrechen
              </Button>
              <Button type="submit" variant="success-solid" className="h-10" disabled={savingStep}>
                {savingStep ? 'Speichern…' : 'Speichern'}
              </Button>
            </DialogFooter>
          </SaveForm>
        </DialogContent>
      </Dialog>
    </div>
  );
}
