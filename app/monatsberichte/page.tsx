'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DashboardShell } from '@/components/demo/dashboard-shell';
import { TimeEntryRow } from '@/components/time-entry-row';
import { useTimer } from '@/lib/timer-context';
import { type TimeEntry, fmtHms } from '@/lib/time-entry-utils';
import { type TrackerProject } from '@/lib/types';

type ReportProject = {
  project_id: string;
  name: string;
  firma: string;
  total_seconds: number;
  entries: TimeEntry[];
};

type Report = {
  month: string;
  summary: {
    total_seconds: number;
    entry_count: number;
    project_count: number;
  };
  projects: ReportProject[];
};

const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y!, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_DE[(m ?? 1) - 1] ?? key} ${y}`;
}

export default function MonatsberichtePage() {
  const { activeEntryId, pending, startTask, stopTask } = useTimer();
  const [month, setMonth] = useState(currentMonthKey);
  const [data, setData] = useState<Report | null>(null);
  const [projects, setProjects] = useState<TrackerProject[]>([]);
  const [loading, setLoading] = useState(true);
  const opLock = useRef(false);

  const load = useCallback(async (m: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const r = await fetch(`/api/monatsberichte?month=${encodeURIComponent(m)}`);
      if (!r.ok) {
        if (!opts?.silent) setData(null);
        return;
      }
      const json = (await r.json()) as Report;
      setData(json);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(month);
  }, [month, load]);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((list: TrackerProject[]) => setProjects(Array.isArray(list) ? list : []));
  }, []);

  async function playEntry(entry: TimeEntry) {
    if (pending || opLock.current) return;
    opLock.current = true;
    try {
      await startTask(entry.task_id, entry.title, true);
      await load(month, { silent: true });
    } finally {
      opLock.current = false;
    }
  }

  async function stopRunning() {
    if (pending || opLock.current) return;
    opLock.current = true;
    try {
      await stopTask();
      await load(month, { silent: true });
    } finally {
      opLock.current = false;
    }
  }

  async function deleteEntry(entry: TimeEntry) {
    if (entry.legacy || pending || opLock.current) return;
    opLock.current = true;
    try {
      const wasRunning = entry.id === activeEntryId;
      const r = await fetch(`/api/time-entries/${entry.id}`, { method: 'DELETE' });
      if (!r.ok) return;
      if (wasRunning) await stopTask({ localOnly: true });
      await load(month, { silent: true });
    } finally {
      opLock.current = false;
    }
  }

  function onPatched() {
    void load(month, { silent: true });
  }

  const summary = data?.summary;

  return (
    <DashboardShell title="Monatsberichte">
      <div className="px-4 lg:px-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Zeiterfassung nach Projekt</p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              aria-label="Vorheriger Monat"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <span className="min-w-[9.5rem] text-center font-mono text-[12px] tracking-wide">
              {monthLabel(month)}
            </span>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              aria-label="Nächster Monat"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-12 w-full rounded-lg" />
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : !data || !summary ? (
          <p className="py-4 text-sm text-muted-foreground">Bericht konnte nicht geladen werden.</p>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap gap-x-5 gap-y-1 border-b border-border/60 pb-4 font-mono text-[12px] tracking-wide text-muted-foreground">
              <span>
                <span className="text-foreground">{fmtHms(summary.total_seconds)}</span>
                {' '}gesamt
              </span>
              <span>
                <span className="text-foreground">{summary.entry_count}</span>
                {' '}Einträge
              </span>
              <span>
                <span className="text-foreground">{summary.project_count}</span>
                {' '}Projekte
              </span>
            </div>

            {data.projects.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Keine Zeiteinträge in {monthLabel(month)}.
              </p>
            ) : (
              <div className="flex flex-col gap-8">
                {data.projects.map((p) => (
                  <section key={p.project_id}>
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold tracking-tight">{p.name}</h2>
                        {p.firma ? (
                          <p className="mt-0.5 font-mono text-[11px] tracking-wide text-muted-foreground">
                            {p.firma}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                        {fmtHms(p.total_seconds)}
                      </span>
                    </div>
                    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                      <div className="divide-y divide-border/60 bg-card">
                        {p.entries.map((entry) => (
                          <TimeEntryRow
                            key={entry.id}
                            entry={entry}
                            projects={projects}
                            running={activeEntryId === entry.id}
                            showDate
                            onPatched={onPatched}
                            onSplitDone={onPatched}
                            onPlay={playEntry}
                            onStop={stopRunning}
                            onDelete={deleteEntry}
                          />
                        ))}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
