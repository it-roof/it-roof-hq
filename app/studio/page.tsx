'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DashboardShell } from '@/components/demo/dashboard-shell';
import { cn } from '@/lib/utils';
import {
  DEFAULT_IMAGE_SIZE,
  parseJobOptions,
  STUDIO_IMAGE_SIZES,
  type StudioImageSize,
} from '@/lib/studio/config';
import {
  STUDIO_KIND_META,
  finalKindFor,
  formatUsd,
  type StudioJobKind,
} from '@/lib/studio/kinds';
import {
  ChevronDownIcon,
  ClapperboardIcon,
  ImageIcon,
  XIcon,
} from 'lucide-react';

type KindMeta = {
  label: string;
  media: 'image' | 'video';
  tier: 'draft' | 'final' | 'single';
  estimated_cents: number;
  model_set: boolean;
};

type Stats = {
  ready: boolean;
  missing: string[];
  spent_cents: number;
  budget_cents: number;
  public_base: boolean;
  month: string;
  kinds: Record<StudioJobKind, KindMeta>;
};

type Asset = {
  id: string;
  jobId: string;
  variantIndex: number;
  seed: number;
  media: 'image' | 'video';
  storageKey: string | null;
  createdAt: string | null;
};

type Job = {
  id: string;
  kind: StudioJobKind;
  prompt: string;
  seed: number;
  variantCount: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  estimatedCents: number;
  actualCents: number;
  error: string | null;
  providerState: string | null;
  createdAt: string | null;
  assets: Asset[];
};

type Mode = 'image' | 'video';
type GalleryFilter = 'all' | 'image' | 'video';

const STATUS: Record<Job['status'], string> = {
  queued: 'In der Warteschlange',
  running: 'Wird erzeugt',
  succeeded: 'Fertig',
  failed: 'Fehlgeschlagen',
  cancelled: 'Abgebrochen',
};

const MODES: { id: Mode; title: string; hint: string }[] = [
  {
    id: 'image',
    title: 'Bild',
    hint: 'Aus Text, optional mit einem bestehenden Bild als Vorlage.',
  },
  {
    id: 'video',
    title: 'Video',
    hint: 'Zuerst ein kurzer Entwurf. Wenn er stimmt, als Final nachrendern.',
  },
];

function kindForMode(mode: Mode): StudioJobKind {
  return mode === 'video' ? 'video_draft' : 'image';
}

function mediaUrl(key: string) {
  return `/api/studio/media/${key}`;
}

function kindBadge(kind: StudioJobKind) {
  if (kind === 'video_draft') return 'Entwurf';
  if (kind === 'video_final') return 'Final';
  return 'Bild';
}

function jobSizeLabel(job: Job) {
  if (job.kind !== 'image') return null;
  return parseJobOptions(job.providerState).size ?? DEFAULT_IMAGE_SIZE;
}

export default function StudioPage() {
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<Mode>('image');
  const [variants, setVariants] = useState(1);
  const [imageSize, setImageSize] = useState<StudioImageSize>(DEFAULT_IMAGE_SIZE);
  const [seed, setSeed] = useState('');
  const [sending, setSending] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<{ job: Job; asset: Asset } | null>(null);
  const [reference, setReference] = useState<{ id: string; label: string } | null>(null);
  const [filter, setFilter] = useState<GalleryFilter>('all');

  const kind = kindForMode(mode);

  const load = useCallback(async () => {
    const [sRes, jRes] = await Promise.all([
      fetch('/api/studio/stats'),
      fetch('/api/studio/jobs'),
    ]);
    setStats(await sRes.json());
    setJobs(await jRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(async () => {
      await fetch('/api/studio/tick', { method: 'POST' });
      await load();
    }, 4000);
    return () => clearInterval(t);
  }, [load]);

  const estimate = (stats?.kinds[kind]?.estimated_cents ?? 0) * variants;
  const wouldExceed =
    estimate > 0 && stats != null && stats.spent_cents + estimate > stats.budget_cents;
  const canSubmit =
    Boolean(prompt.trim()) && !sending && !wouldExceed && Boolean(stats?.ready);

  const queue = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  const failed = jobs.filter((j) => j.status === 'failed');
  const gallery = useMemo(() => {
    const items: { job: Job; asset: Asset }[] = [];
    for (const job of jobs) {
      for (const asset of job.assets ?? []) items.push({ job, asset });
    }
    return items.sort((a, b) => (b.asset.createdAt ?? '').localeCompare(a.asset.createdAt ?? ''));
  }, [jobs]);

  const visibleGallery = gallery.filter(({ asset }) => {
    if (filter === 'all') return true;
    return asset.media === filter;
  });

  const refThumb = reference
    ? gallery.find((g) => g.asset.id === reference.id)?.asset
    : null;

  const placeholder =
    mode === 'video'
      ? 'Szene, Bewegung, Kamera… z. B. eine Person geht durch einen hellen Flur, Kamera folgt langsam.'
      : reference
        ? 'Was soll am Vorlagebild geändert werden?'
        : 'Beschreibe das Bild. Je konkreter, desto besser.';

  const submitLabel = sending
    ? 'Startet…'
    : mode === 'video'
      ? `Entwurf starten · ${formatUsd(estimate)}`
      : `Bild erzeugen · ${formatUsd(estimate)}`;

  async function submit() {
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    const r = await fetch('/api/studio/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        prompt: prompt.trim(),
        variant_count: variants,
        seed: seed.trim() === '' ? null : Number(seed),
        size: mode === 'image' ? imageSize : undefined,
        parent_asset_id: mode === 'image' ? reference?.id ?? null : null,
      }),
    });
    const body = await r.json();
    setSending(false);
    if (!r.ok) {
      setError(body.error ?? 'Auftrag fehlgeschlagen.');
      return;
    }
    if (typeof body.seed === 'number') setSeed(String(body.seed));
    setReference(null);
    await load();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  function useAsReference(job: Job, asset: Asset) {
    setMode('image');
    setReference({ id: asset.id, label: job.prompt.slice(0, 72) });
    setActive(null);
    setTimeout(() => promptRef.current?.focus(), 50);
  }

  async function finalize(asset: Asset) {
    setFinalizing(true);
    setError(null);
    const r = await fetch(`/api/studio/assets/${asset.id}/finalize`, { method: 'POST' });
    const body = await r.json();
    setFinalizing(false);
    if (!r.ok) {
      setError(body.error ?? 'Nachrendern fehlgeschlagen.');
      return;
    }
    setActive(null);
    await load();
  }

  async function retry(id: string) {
    await fetch(`/api/studio/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retry' }),
    });
    await load();
  }

  function selectMode(next: Mode) {
    setMode(next);
    if (next === 'video') setReference(null);
  }

  return (
    <DashboardShell title="Studio" fullHeight>
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 md:px-6">
        <p className="font-mono text-xs tracking-wide text-muted-foreground">
          Links beschreiben, rechts Ergebnisse und Warteschlange.
        </p>
        {stats && (
          <p className="text-sm tabular-nums text-muted-foreground">
            {stats.month}: {formatUsd(stats.spent_cents)} von {formatUsd(stats.budget_cents)}
          </p>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="shrink-0 border-b px-4 py-6 md:px-8 lg:w-[400px] xl:w-[440px] lg:overflow-y-auto lg:border-b-0 lg:border-r pb-8 lg:pb-10">
          {stats && !stats.ready && (
            <Alert className="mb-6">
              <AlertTitle>Noch nicht verbunden</AlertTitle>
              <AlertDescription>
                Trage den BytePlus-API-Key als BYTEPLUS_API_KEY in .env.local ein und starte den Server neu.
              </AlertDescription>
            </Alert>
          )}
        <section className="mb-8">
          <p className="text-sm font-medium mb-2">1. Was willst du erzeugen?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => selectMode(m.id)}
                className={cn(
                  'text-left rounded-xl border px-4 py-3 transition-colors',
                  mode === m.id
                    ? 'border-foreground bg-muted/60'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
                )}
              >
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  {m.id === 'image' ? <ImageIcon className="size-4" /> : <ClapperboardIcon className="size-4" />}
                  {m.title}
                </p>
                <p className="text-xs mt-1 leading-relaxed">{m.hint}</p>
                <p className="text-xs tabular-nums mt-2 text-foreground">
                  {stats ? `ca. ${formatUsd(stats.kinds[kindForMode(m.id)].estimated_cents)}` : '—'}
                </p>
              </button>
            ))}
          </div>
          {mode === 'video' && stats && !stats.public_base && (
            <p className="text-xs text-muted-foreground mt-2">
              Entwürfe gehen sofort. Finales Nachrendern braucht später eine öffentliche Adresse (STUDIO_PUBLIC_BASE_URL).
            </p>
          )}
        </section>

        <section className="mb-8">
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <Label htmlFor="studio-prompt" className="text-sm font-medium">
              2. Beschreiben
            </Label>
            <span className="text-xs text-muted-foreground">⌘ + Enter sendet</span>
          </div>
          <Textarea
            ref={promptRef}
            id="studio-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="min-h-32 text-base"
          />

          {reference && (
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
              {refThumb?.storageKey && (
                <img
                  src={mediaUrl(refThumb.storageKey)}
                  alt=""
                  className="size-10 rounded-md object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Vorlage aktiv</p>
                <p className="text-xs text-muted-foreground truncate">{reference.label}</p>
              </div>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => setReference(null)} aria-label="Vorlage entfernen">
                <XIcon className="size-4" />
              </Button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Varianten</Label>
              <div className="flex gap-1">
                {[1, 2, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setVariants(n)}
                    className={cn(
                      'h-8 min-w-8 px-2 rounded-md text-sm border',
                      variants === n
                        ? 'bg-foreground text-background border-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'image' && (
              <div className="flex flex-col gap-2">
                <Label className="text-sm">Auflösung</Label>
                <div className="flex gap-1">
                  {STUDIO_IMAGE_SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setImageSize(s)}
                      className={cn(
                        'h-8 min-w-8 px-2 rounded-md text-sm border',
                        imageSize === s
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Collapsible className="flex-1 min-w-[160px]">
              <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                Erweitert
                <ChevronDownIcon className="size-3.5" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <Label htmlFor="studio-seed" className="text-sm">Seed</Label>
                <Input
                  id="studio-seed"
                  inputMode="numeric"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value.replace(/[^\d-]/g, ''))}
                  placeholder="zufällig"
                  className="mt-1.5 h-9"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Optional. Gleicher Seed wiederholt ein Ergebnis nur bei gleichem Modell und gleicher Auflösung.
                </p>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {wouldExceed
                ? 'Das würde das Monatsbudget überschreiten.'
                : mode === 'video'
                  ? 'Als Nächstes: Entwurf prüfen, dann als Final nachrendern.'
                  : reference
                    ? 'Das neue Bild baut auf der Vorlage auf.'
                    : 'Danach kannst du das Bild als Vorlage weiterbearbeiten.'}
            </p>
            <Button className="h-10 w-full" onClick={submit} disabled={!canSubmit}>
              {sending && <Spinner data-icon="inline-start" />}
              {submitLabel}
            </Button>
          </div>
          {error && (
            <Alert variant="destructive" className="mt-3">
              <AlertTitle>Nicht geklappt</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </section>
        </aside>

        <section className="min-h-0 flex-1 px-4 py-6 md:px-8 lg:overflow-y-auto pb-8 lg:pb-10">
          <div className="mb-8">
            <h2 className="text-sm font-medium mb-3">Warteschlange</h2>
            {queue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine laufenden Aufträge.</p>
            ) : (
              <Card size="sm">
                <CardContent className="flex flex-col gap-3">
                  {queue.map((j) => (
                    <div key={j.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm truncate">{j.prompt}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {STUDIO_KIND_META[j.kind].label} · {j.variantCount}×
                          {j.kind === 'image' ? ` · ${jobSizeLabel(j)}` : ''}
                        </p>
                      </div>
                      <Badge variant="secondary" className="flex-shrink-0 gap-1">
                        {j.status === 'running' && <Spinner className="size-3" />}
                        {STATUS[j.status]}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

      {failed.length > 0 && (
        <div className="mb-8 flex flex-col gap-2">
          {failed.map((j) => (
            <Alert key={j.id} className="pr-24">
              <AlertTitle>Auftrag fehlgeschlagen</AlertTitle>
              <AlertDescription>{j.error || 'Unbekannter Fehler.'}</AlertDescription>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => retry(j.id)}
              >
                Nochmal
              </Button>
            </Alert>
          ))}
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-medium">Ergebnisse</h2>
          {gallery.length > 0 && (
            <Tabs value={filter} onValueChange={(v) => setFilter(v as GalleryFilter)}>
              <TabsList>
                <TabsTrigger value="all">Alle</TabsTrigger>
                <TabsTrigger value="image">Bilder</TabsTrigger>
                <TabsTrigger value="video">Videos</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
          </div>
        ) : gallery.length === 0 ? (
          <Empty className="border border-dashed py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ImageIcon />
              </EmptyMedia>
              <EmptyTitle>Noch keine Ergebnisse</EmptyTitle>
              <EmptyDescription>
                Links Bild oder Video beschreiben und starten. Fertige Clips und Bilder erscheinen hier rechts.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : visibleGallery.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Treffer in diesem Filter.</p>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            {visibleGallery.map(({ job, asset }) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setActive({ job, asset })}
                className="text-left group"
              >
                <div className="relative aspect-square rounded-xl overflow-hidden bg-muted ring-1 ring-foreground/10">
                  {asset.storageKey && asset.media === 'image' ? (
                    <img src={mediaUrl(asset.storageKey)} alt="" className="size-full object-cover" />
                  ) : asset.storageKey && asset.media === 'video' ? (
                    <video src={mediaUrl(asset.storageKey)} className="size-full object-cover" muted playsInline />
                  ) : (
                    <div className="size-full flex items-center justify-center text-muted-foreground">
                      <Spinner />
                    </div>
                  )}
                  <Badge variant="secondary" className="absolute left-2 bottom-2">
                    {kindBadge(job.kind)}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{job.prompt}</p>
              </button>
            ))}
          </div>
        )}
      </div>
        </section>
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-lg">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>{STUDIO_KIND_META[active.job.kind].label}</DialogTitle>
                <DialogDescription>
                  {kindBadge(active.job.kind)}
                  {jobSizeLabel(active.job) ? ` · ${jobSizeLabel(active.job)}` : ''}
                  {' · '}
                  {formatUsd(active.job.actualCents || active.job.estimatedCents)}
                </DialogDescription>
              </DialogHeader>
              {active.asset.storageKey && active.asset.media === 'image' && (
                <img src={mediaUrl(active.asset.storageKey)} alt="" className="rounded-lg w-full" />
              )}
              {active.asset.storageKey && active.asset.media === 'video' && (
                <video src={mediaUrl(active.asset.storageKey)} className="rounded-lg w-full" controls playsInline />
              )}
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{active.job.prompt}</p>
              <DialogFooter className="flex-col sm:flex-col gap-2">
                {active.asset.media === 'image' && (
                  <Button variant="outline" className="w-full" onClick={() => useAsReference(active.job, active.asset)}>
                    Als Vorlage weiterbearbeiten
                  </Button>
                )}
                {finalKindFor(active.job.kind) && (
                  <div className="w-full flex flex-col gap-1.5">
                    <Button className="w-full" onClick={() => finalize(active.asset)} disabled={finalizing}>
                      {finalizing && <Spinner data-icon="inline-start" />}
                      Als Final nachrendern
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Nimmt diesen Entwurf als Referenz. Nicht denselben Prompt nochmal teuer rechnen.
                    </p>
                  </div>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </DashboardShell>
  );
}
