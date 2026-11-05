'use client';

import { useEffect, useState, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { DashboardShell } from '@/components/demo/dashboard-shell';
import { WeekStrip } from '@/components/week-strip';
import { TaskSection } from '@/components/task-section';
import { DoneAccordion } from '@/components/done-accordion';
import NewTaskSheet from '@/components/new-task-sheet';
import { type Task } from '@/lib/types';
import { useTaskMutations } from '@/lib/use-task-mutations';
import { PlusIcon } from 'lucide-react';

const now = new Date();
const today = now.toISOString().slice(0, 10);
const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetDate, setSheetDate] = useState<string | undefined>(undefined);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/tasks');
    setTasks(await r.json());
    setLoading(false);
  }, []);

  const { doneTask, deleteTask, saveTitle } = useTaskMutations(setTasks);

  useEffect(() => { load(); }, [load]);

  async function reopenTask(id: string) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    });
    await load();
  }

  const heute = tasks.filter(t => t.geplant === today);
  const sharedProps = { onDone: doneTask, onSaveTitle: saveTitle, onDelete: deleteTask };

  const selectedDayLabel = (() => {
    if (!selectedDay || selectedDay === today) return null;
    const d = new Date(selectedDay + 'T12:00:00');
    return `${DAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS_SHORT[d.getMonth()]}`;
  })();

  return (
    <DashboardShell title="Heute">
      <div className="px-4 lg:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <Button
            size="icon"
            className="size-9 rounded-full"
            onClick={() => { setSheetDate(today); setSheetOpen(true); }}
            aria-label="Neue Aufgabe"
          >
            <PlusIcon className="size-4" />
          </Button>
        </div>

        {loading ? (
          <div className="mt-4 flex flex-col gap-3">
            {[80, 60, 70].map(w => (
              <Skeleton key={w} className="h-10 rounded-xl" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <>
            <WeekStrip
              tasks={tasks}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              onNewTask={(date) => { setSheetDate(date); setSheetOpen(true); }}
            />

            {selectedDayLabel && (
              <TaskSection
                label={selectedDayLabel}
                tasks={tasks.filter(t => t.geplant === selectedDay)}
                {...sharedProps}
              />
            )}

            <TaskSection
              label="Heute"
              tasks={heute}
              emptyText="Keine Aufgaben für heute."
              {...sharedProps}
            />

            <DoneAccordion onReopen={reopenTask} />
          </>
        )}
      </div>

      <NewTaskSheet
        open={sheetOpen}
        defaultDate={sheetDate}
        onClose={() => setSheetOpen(false)}
        onCreated={load}
      />
    </DashboardShell>
  );
}
