'use client';

import { useEffect, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { DashboardShell } from '@/components/demo/dashboard-shell';
import { ProjektGroup } from '@/components/projekt-group';
import { TimeTrackingView } from '@/components/time-tracking-view';
import { DoneAccordion } from '@/components/done-accordion';
import { type Task } from '@/lib/types';
import { useTimer } from '@/lib/timer-context';
import { useTaskMutations } from '@/lib/use-task-mutations';
import NewTaskSheet from '@/components/new-task-sheet';
import { ClockIcon, ListTodoIcon, PlusIcon } from 'lucide-react';

const PRIO_DE: Record<string, string> = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig' };
const VIEW_KEY = 'cherry-os-aufgaben-view';
type AufgabenView = 'aufgaben' | 'zeit';

export default function AufgabenPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activePrio, setActivePrio] = useState<string>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [view, setView] = useState<AufgabenView>('aufgaben');

  const { userId } = useTimer();
  const { doneTask, deleteTask, saveTitle } = useTaskMutations(setTasks);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const r = await fetch('/api/tasks');
    const data = await r.json();
    setTasks(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const key = userId ? `cherry-os-aufgaben-view:${userId}` : VIEW_KEY;
    const stored = localStorage.getItem(key) ?? localStorage.getItem(VIEW_KEY);
    if (stored === 'zeit' || stored === 'aufgaben') setView(stored);
  }, [userId]);

  async function reopenTask(id: string) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    await load({ silent: true });
  }

  function changeView(next: string) {
    const v = next === 'zeit' ? 'zeit' : 'aufgaben';
    setView(v);
    if (userId) localStorage.setItem(`cherry-os-aufgaben-view:${userId}`, v);
    else localStorage.setItem(VIEW_KEY, v);
  }

  let filtered = tasks;
  if (activePrio !== 'all') filtered = filtered.filter(t => t.prio === activePrio);
  if (search) filtered = filtered.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.firma.toLowerCase().includes(search.toLowerCase()) ||
    t.projekt.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, { firma: string; tasks: Task[] }>>((acc, t) => {
    const k = t.projekt || 'Kein Projekt';
    if (!acc[k]) acc[k] = { firma: t.firma || '', tasks: [] };
    acc[k].tasks.push(t);
    return acc;
  }, {});

  const sharedProps = { onDone: doneTask, onSaveTitle: saveTitle, onDelete: deleteTask };

  return (
    <DashboardShell title="Aufgaben">
      <div className="px-4 lg:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {view === 'zeit' ? 'Zeiterfassung' : `${tasks.length} offen`}
          </p>
          <Button
            size="icon"
            className="size-9 rounded-full"
            onClick={() => setSheetOpen(true)}
            aria-label="Neue Aufgabe"
          >
            <PlusIcon className="size-4" />
          </Button>
        </div>

        <Tabs value={view} onValueChange={changeView} className="mb-5">
          <TabsList className="h-10 w-full max-w-md">
            <TabsTrigger value="aufgaben" className="flex-1 gap-1.5 px-3 text-[13px]">
              <ListTodoIcon className="size-3.5" />
              Aufgaben
            </TabsTrigger>
            <TabsTrigger value="zeit" className="flex-1 gap-1.5 px-3 text-[13px]">
              <ClockIcon className="size-3.5" />
              Zeiterfassung
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {view === 'zeit' ? (
          loading && tasks.length === 0 ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-20 rounded-xl" />
              {[80, 60, 70].map(w => <Skeleton key={w} className="h-14 rounded-xl" style={{ width: `${w}%` }} />)}
            </div>
          ) : (
            <TimeTrackingView tasks={tasks} onCreated={() => void load({ silent: true })} />
          )
        ) : (
          <>
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Suchen…" className="mb-4 h-10" />

            <div className="mb-6 flex flex-wrap gap-1.5">
              {(['all', 'high', 'medium', 'low'] as const).map(p => {
                const activeClass =
                  p === 'high'   ? 'bg-danger text-danger-foreground border-danger' :
                  p === 'medium' ? 'bg-warning text-warning-foreground border-warning' :
                  p === 'low'    ? 'bg-muted text-foreground border-border' :
                                   'bg-primary text-primary-foreground border-primary';
                return (
                  <button
                    key={p}
                    onClick={() => setActivePrio(p)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-mono font-medium tracking-wide transition-all duration-150 ${
                      activePrio === p
                        ? activeClass
                        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                    }`}
                  >
                    {p === 'all' ? 'Alle' : PRIO_DE[p]}
                  </button>
                );
              })}
            </div>

            {loading ? (
              <div className="flex flex-col gap-3">
                {[80, 60, 70].map(w => <Skeleton key={w} className="h-14 rounded-xl" style={{ width: `${w}%` }} />)}
              </div>
            ) : (
              <>
                {Object.keys(grouped).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine offenen Aufgaben.</p>
                ) : (
                  Object.entries(grouped)
                    .sort(([a, { tasks: at }], [b, { tasks: bt }]) => {
                      const aH = at.some(t => t.prio === 'high') ? 0 : 1;
                      const bH = bt.some(t => t.prio === 'high') ? 0 : 1;
                      return aH !== bH ? aH - bH : a.localeCompare(b, 'de');
                    })
                    .map(([projekt, { firma, tasks: ts }]) => (
                      <ProjektGroup key={projekt} projekt={projekt} firma={firma} tasks={ts} {...sharedProps} />
                    ))
                )}
                <div className="mt-8">
                  <DoneAccordion onReopen={reopenTask} />
                </div>
              </>
            )}
          </>
        )}
      </div>

      <NewTaskSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onCreated={load} />
    </DashboardShell>
  );
}
