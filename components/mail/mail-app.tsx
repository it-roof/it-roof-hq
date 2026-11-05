'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  ArchiveIcon,
  FileTextIcon,
  InboxIcon,
  MailIcon,
  PaperclipIcon,
  PenLineIcon,
  RefreshCwIcon,
  ReplyAllIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  Settings2Icon,
  StarIcon,
  Trash2Icon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { cn } from '@/lib/utils';
import type { MailboxPublic, MailFolder, MailMessageDetail, MailMessageListItem } from '@/lib/mail/types';
import { MailAccountDialog } from '@/components/mail/mail-account-dialog';
import { MailCompose } from '@/components/mail/mail-compose';

const ROLE_DE: Record<string, string> = {
  inbox: 'Posteingang',
  drafts: 'Entwürfe',
  sent: 'Gesendet',
  archive: 'Archiv',
  junk: 'Spam',
  trash: 'Papierkorb',
  other: 'Ordner',
};

const ROLE_ICON: Record<string, typeof InboxIcon> = {
  inbox: InboxIcon,
  drafts: FileTextIcon,
  sent: SendIcon,
  archive: ArchiveIcon,
  junk: MailIcon,
  trash: Trash2Icon,
};

const SYSTEM_ROLES = ['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash'] as const;

type ComposeState = {
  mode: 'new' | 'reply' | 'replyAll' | 'forward' | 'draft';
  source?: MailMessageDetail | null;
};

export function MailApp() {
  const [boxes, setBoxes] = useState<MailboxPublic[]>([]);
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [messages, setMessages] = useState<MailMessageListItem[]>([]);
  const [mailboxId, setMailboxId] = useState<string>('all');
  const [folderId, setFolderId] = useState<string | null>(null);
  const [role, setRole] = useState<string>('inbox');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MailMessageDetail | null>(null);
  const [thread, setThread] = useState<MailMessageListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [compose, setCompose] = useState<ComposeState | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const loadBoxes = useCallback(async () => {
    const r = await fetch('/api/mail/accounts', { cache: 'no-store' });
    const data = await r.json();
    setBoxes(Array.isArray(data) ? data : []);
  }, []);

  const loadFolders = useCallback(async () => {
    const sp = new URLSearchParams();
    if (mailboxId !== 'all') sp.set('mailbox_id', mailboxId);
    const r = await fetch(`/api/mail/folders?${sp}`, { cache: 'no-store' });
    const data = await r.json();
    setFolders(Array.isArray(data) ? data : []);
  }, [mailboxId]);

  const loadMessages = useCallback(async (signal?: AbortSignal) => {
    const sp = new URLSearchParams();
    if (mailboxId !== 'all') sp.set('mailbox_id', mailboxId);
    if (folderId) sp.set('folder_id', folderId);
    else sp.set('role', role || 'inbox');
    if (qDebounced) sp.set('q', qDebounced);
    sp.set('threaded', role === 'sent' || role === 'drafts' ? '0' : '1');
    try {
      const r = await fetch(`/api/mail/messages?${sp}`, { cache: 'no-store', signal });
      if (signal?.aborted) return;
      const data = await r.json();
      if (signal?.aborted) return;
      setMessages(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setMessages([]);
      setLoading(false);
    }
  }, [mailboxId, folderId, role, qDebounced]);

  useEffect(() => { void loadBoxes(); }, [loadBoxes]);
  useEffect(() => { void loadFolders(); }, [loadFolders]);
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    void loadMessages(ac.signal);
    return () => ac.abort();
  }, [loadMessages]);

  useEffect(() => {
    const iv = setInterval(() => {
      void loadFolders();
      void loadMessages();
    }, 60_000);
    return () => clearInterval(iv);
  }, [loadFolders, loadMessages]);

  async function openMessage(id: string) {
    setSelectedId(id);
    const r = await fetch(`/api/mail/messages/${id}?thread=1`, { cache: 'no-store' });
    if (!r.ok) return;
    const data = await r.json() as { message?: MailMessageDetail; thread?: MailMessageListItem[] };
    if (data.message) {
      setDetail(data.message);
      setThread(data.thread ?? []);
      if (!data.message.seen) {
        void fetch(`/api/mail/messages/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seen: true }),
        }).then(() => {
          setMessages(ms => ms.map(m => m.id === id ? { ...m, seen: true } : m));
          setDetail(d => d && d.id === id ? { ...d, seen: true } : d);
          void loadFolders();
        });
      }
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const body = mailboxId === 'all' ? {} : { mailbox_id: mailboxId };
      await fetch('/api/mail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await loadBoxes();
      await loadFolders();
      await loadMessages();
    } finally {
      setSyncing(false);
    }
  }

  async function removeMessage(id: string) {
    const r = await fetch(`/api/mail/messages/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      const data = await r.json().catch(() => null) as { error?: string } | null;
      window.alert(data?.error || 'Löschen fehlgeschlagen');
      void loadMessages();
      return;
    }
    setMessages(ms => ms.filter(m => m.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
      setThread([]);
    }
    void loadFolders();
  }

  async function toggleFlag(id: string, flagged: boolean) {
    await fetch(`/api/mail/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flagged }),
    });
    setMessages(ms => ms.map(m => m.id === id ? { ...m, flagged } : m));
    setDetail(d => d && d.id === id ? { ...d, flagged } : d);
  }

  function selectFolder(next: { folderId?: string | null; role: string }) {
    setFolderId(next.folderId ?? null);
    setRole(next.role);
    setSelectedId(null);
    setDetail(null);
    setThread([]);
    setMessages([]);
    setLoading(true);
  }

  const groupedFolders = useMemo(() => {
    const source = mailboxId === 'all' ? folders : folders.filter(f => f.mailbox_id === mailboxId);
    const byRole = new Map<string, MailFolder>();
    const others: MailFolder[] = [];
    for (const f of source) {
      if ((SYSTEM_ROLES as readonly string[]).includes(f.role)) {
        const cur = byRole.get(f.role);
        if (!cur) {
          byRole.set(f.role, {
            ...f,
            id: `role:${f.role}`,
            name: ROLE_DE[f.role] ?? f.name,
            unread: f.unread,
          });
        } else {
          cur.unread += f.unread;
        }
      } else {
        others.push(f);
      }
    }
    return [
      ...SYSTEM_ROLES.map(r => byRole.get(r)).filter((f): f is MailFolder => Boolean(f)),
      ...others.sort((a, b) => a.name.localeCompare(b.name, 'de')),
    ];
  }, [folders, mailboxId]);

  if (!loading && boxes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <MailIcon className="size-10 text-muted-foreground" />
        <div>
          <p className="text-lg font-semibold">Kein Postfach verbunden</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Füge dein IMAP-Konto hinzu — wie in Apple Mail.
          </p>
        </div>
        <Button onClick={() => setAccountOpen(true)}>Konto hinzufügen</Button>
        <MailAccountDialog
          open={accountOpen}
          onClose={() => setAccountOpen(false)}
          onSaved={() => { void loadBoxes(); void syncNow(); }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 md:px-4">
        <select
          className="h-8 max-w-[14rem] rounded-lg border border-input bg-transparent px-2 text-sm"
          value={mailboxId}
          onChange={e => {
            setMailboxId(e.target.value);
            selectFolder({ role: 'inbox' });
          }}
        >
          <option value="all">Alle Postfächer</option>
          {boxes.map(b => (
            <option key={b.id} value={b.id}>{b.display_name || b.email}</option>
          ))}
        </select>
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Mails durchsuchen…"
            className="h-8 pl-7"
          />
        </div>
        <Button size="icon-sm" variant="ghost" title="Aktualisieren" disabled={syncing} onClick={() => void syncNow()}>
          <RefreshCwIcon className={cn('size-3.5', syncing && 'animate-spin')} />
        </Button>
        <Button size="icon-sm" variant="ghost" title="Konten" onClick={() => setAccountOpen(true)}>
          <Settings2Icon className="size-3.5" />
        </Button>
        <select
          className="h-8 max-w-[11rem] shrink-0 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={folderId ?? `role:${role}`}
          onChange={e => {
            const v = e.target.value;
            if (v.startsWith('role:')) selectFolder({ role: v.slice(5) });
            else {
              const f = groupedFolders.find(x => x.id === v);
              selectFolder({ folderId: v, role: f?.role ?? 'other' });
            }
          }}
        >
          {groupedFolders.map(f => (
            <option key={f.id} value={f.id.startsWith('role:') ? f.id : f.id}>
              {f.name}{f.unread > 0 ? ` (${f.unread})` : ''}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={() => setCompose({ mode: 'new' })}>
          <PenLineIcon className="size-3.5" />
          Neu
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-48 shrink-0 overflow-y-auto border-r border-border py-2 md:block">
          {groupedFolders.map(f => {
            const Icon = ROLE_ICON[f.role] ?? MailIcon;
            const active = f.id.startsWith('role:')
              ? !folderId && role === f.role
              : folderId === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  if (f.id.startsWith('role:')) selectFolder({ role: f.role });
                  else selectFolder({ folderId: f.id, role: f.role });
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                  active ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {f.unread > 0 && (
                  <span className="font-mono text-[11px] tabular-nums">{f.unread}</span>
                )}
              </button>
            );
          })}
        </nav>
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 min-w-0 flex-1">
        <ResizablePanel defaultSize="40%" minSize="20%" className={cn('min-h-0', detail && 'hidden md:block')}>
          <div className="h-full overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Laden…</p>
            ) : messages.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">Keine Nachrichten.</p>
            ) : (
              messages.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    if (m.draft) {
                      void fetch(`/api/mail/messages/${m.id}`).then(async r => {
                        if (!r.ok) return;
                        const d = await r.json() as MailMessageDetail;
                        if (d?.id) setCompose({ mode: 'draft', source: d });
                      });
                      return;
                    }
                    void openMessage(m.id);
                  }}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-b border-border/60 px-4 py-2.5 text-left',
                    selectedId === m.id && 'bg-muted',
                    !m.seen && 'bg-primary/5',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn('min-w-0 flex-1 truncate text-sm', !m.seen && 'font-semibold')}>
                      {role === 'sent' || m.folder_role === 'sent'
                        ? `An ${m.to_addresses.map(a => a.name || a.address).filter(Boolean).join(', ') || '—'}`
                        : (m.from_name || m.from_address || '(Unbekannt)')}
                    </span>
                    {m.has_attachments && <PaperclipIcon className="size-3 text-muted-foreground" />}
                    {m.flagged && <StarIcon className="size-3 text-warning" />}
                    {m.thread_count > 1 && (
                      <span className="font-mono text-[10px] text-muted-foreground">{m.thread_count}</span>
                    )}
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {m.date ? formatDistanceToNow(new Date(m.date), { addSuffix: true, locale: de }) : ''}
                    </span>
                  </div>
                  <p className={cn('truncate text-[13px]', !m.seen && 'font-medium')}>{m.subject || '(Kein Betreff)'}</p>
                  {m.snippet && <p className="truncate text-[12px] text-muted-foreground">{m.snippet}</p>}
                </button>
              ))
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle className="hidden md:flex" />
        <ResizablePanel defaultSize="50%" minSize="28%" className={cn('min-h-0', !detail && 'hidden md:block')}>
          {detail ? (
            <article className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-3 py-2">
                <Button size="sm" variant="ghost" className="md:hidden" onClick={() => { setDetail(null); setSelectedId(null); }}>
                  Zurück
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCompose({ mode: 'reply', source: detail })}>
                  <ReplyIcon className="size-3.5" /> Antworten
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCompose({ mode: 'replyAll', source: detail })}>
                  <ReplyAllIcon className="size-3.5" /> Allen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCompose({ mode: 'forward', source: detail })}>
                  Weiterleiten
                </Button>
                <Button size="icon-sm" variant="ghost" title="Markieren" onClick={() => void toggleFlag(detail.id, !detail.flagged)}>
                  <StarIcon className={cn('size-3.5', detail.flagged && 'fill-current text-warning')} />
                </Button>
                <Button size="icon-sm" variant="ghost" title="Löschen" onClick={() => void removeMessage(detail.id)}>
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <h2 className="text-lg font-semibold tracking-tight">{detail.subject || '(Kein Betreff)'}</h2>
                <p className="mt-1 text-sm">
                  <span className="font-medium">{detail.from_name || detail.from_address}</span>
                  {detail.from_address && detail.from_name && (
                    <span className="text-muted-foreground"> {detail.from_address}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  An {detail.to_addresses.map(a => a.address).join(', ') || '—'}
                  {detail.date ? ` · ${format(new Date(detail.date), 'PPp', { locale: de })}` : ''}
                  {mailboxId === 'all' && ` · ${detail.mailbox_email}`}
                </p>
                {thread.length > 1 && (
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">{thread.length} Nachrichten in diesem Verlauf</p>
                )}
                {detail.html_body ? (
                  <iframe
                    title="Nachricht"
                    sandbox=""
                    srcDoc={detail.html_body}
                    className="mt-4 min-h-[24rem] w-full rounded-md bg-background"
                  />
                ) : (
                  <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed">{detail.text_body || ''}</pre>
                )}
                {detail.attachments.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-1 border-t border-border pt-3">
                    {detail.attachments.map(a => (
                      <li key={a.id}>
                        <a
                          href={`/api/mail/attachments/${a.id}`}
                          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                        >
                          <PaperclipIcon className="size-3.5" />
                          {a.filename || 'Anhang'} ({Math.max(1, Math.round(a.size / 1024))} KB)
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          ) : (
            <div className="hidden h-full items-center justify-center text-sm text-muted-foreground md:flex">
              Nachricht auswählen
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
      </div>

      <MailAccountDialog
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        onSaved={() => { void loadBoxes(); void loadFolders(); void syncNow(); }}
      />
      {compose && (
        <MailCompose
          open
          mode={compose.mode}
          mailboxes={boxes}
          mailboxId={mailboxId === 'all' ? (boxes[0]?.id ?? '') : mailboxId}
          source={compose.source}
          onClose={() => setCompose(null)}
          onSent={() => {
            setFolderId(null);
            setSelectedId(null);
            setDetail(null);
            setThread([]);
            setRole('sent');
            void loadFolders();
            if (role === 'sent') void loadMessages();
          }}
        />
      )}
    </div>
  );
}
