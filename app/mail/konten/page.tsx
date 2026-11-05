'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DashboardShell } from '@/components/demo/dashboard-shell';
import { MailAccountDialog } from '@/components/mail/mail-account-dialog';
import type { MailboxPublic } from '@/lib/mail/types';
import { PlusIcon } from 'lucide-react';

export default function MailAccountsPage() {
  const [boxes, setBoxes] = useState<MailboxPublic[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<MailboxPublic | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/mail/accounts');
    const data = await r.json();
    setBoxes(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function remove(id: string) {
    if (!confirm('Konto wirklich entfernen? Die lokale Kopie der Mails wird gelöscht.')) return;
    setBusyId(id);
    await fetch(`/api/mail/accounts/${id}`, { method: 'DELETE' });
    setBusyId(null);
    await load();
  }

  async function sync(id: string) {
    setBusyId(id);
    await fetch(`/api/mail/accounts/${id}/sync`, { method: 'POST' });
    setBusyId(null);
    await load();
  }

  return (
    <DashboardShell title="Konten">
      <div className="mx-auto w-full max-w-xl px-4 md:max-w-5xl lg:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">IMAP-Postfächer für dich</p>
          <Button
            size="icon"
            className="size-9 rounded-full"
            onClick={() => { setEdit(null); setOpen(true); }}
            aria-label="Konto hinzufügen"
          >
            <PlusIcon className="size-4" />
          </Button>
        </div>
        {boxes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch kein Konto. Über + verbindest du IMAP/SMTP.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl ring-1 ring-foreground/10">
            {boxes.map(b => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.display_name || b.email}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{b.email} · {b.imap_host}</p>
                  {b.last_sync_error && <p className="text-sm text-danger">{b.last_sync_error}</p>}
                  {b.last_sync_at && (
                    <p className="text-[11px] text-muted-foreground">
                      Zuletzt: {new Date(b.last_sync_at).toLocaleString('de-DE')}
                    </p>
                  )}
                </div>
                <Button size="sm" variant="outline" disabled={busyId === b.id} onClick={() => void sync(b.id)}>
                  {busyId === b.id ? '…' : 'Sync'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEdit(b); setOpen(true); }}>Bearbeiten</Button>
                <Button size="sm" variant="danger" disabled={busyId === b.id} onClick={() => void remove(b.id)}>
                  Entfernen
                </Button>
              </li>
            ))}
          </ul>
        )}
        <MailAccountDialog
          open={open}
          initial={edit}
          onClose={() => { setOpen(false); setEdit(null); }}
          onSaved={() => void load()}
        />
      </div>
    </DashboardShell>
  );
}
