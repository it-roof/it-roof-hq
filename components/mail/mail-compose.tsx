'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SaveForm } from '@/components/save-form';
import { previewOutgoingHtml } from '@/lib/mail/compose-body';
import type { MailboxPublic, MailMessageDetail } from '@/lib/mail/types';

type Mode = 'new' | 'reply' | 'replyAll' | 'forward' | 'draft';

type Props = {
  open: boolean;
  mode: Mode;
  mailboxes: MailboxPublic[];
  mailboxId: string;
  source?: MailMessageDetail | null;
  onClose: () => void;
  onSent: () => void;
};

function quote(source: MailMessageDetail) {
  const who = source.from_name || source.from_address || '';
  const body = source.text_body
    || (source.html_body ? source.html_body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
  return `\n\nAm ${source.date ? new Date(source.date).toLocaleString('de-DE') : ''} schrieb ${who}:\n${body.split('\n').map(l => `> ${l}`).join('\n')}`;
}

export function MailCompose({ open, mode, mailboxes, mailboxId, source, onClose, onSent }: Props) {
  const [boxId, setBoxId] = useState(mailboxId);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [isHtml, setIsHtml] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBoxId(mailboxId || mailboxes[0]?.id || '');
    setDraftId(mode === 'draft' ? source?.id ?? null : null);
    if (!source || mode === 'new') {
      setTo('');
      setCc('');
      setSubject('');
      setText('');
      return;
    }
    if (mode === 'draft') {
      setTo(source.to_addresses.map(a => a.address).join(', '));
      setCc(source.cc_addresses.map(a => a.address).join(', '));
      setSubject(source.subject ?? '');
      setText(source.text_body ?? '');
      return;
    }
    const from = source.from_address ?? '';
    const me = (mailboxes.find(b => b.id === (mailboxId || mailboxes[0]?.id))?.email ?? '').toLowerCase();
    const others = [...source.to_addresses, ...source.cc_addresses]
      .map(a => a.address)
      .filter(a => {
        const addr = a.toLowerCase();
        return addr && addr !== from.toLowerCase() && addr !== me;
      });
    if (mode === 'reply') {
      setTo(from);
      setCc('');
    } else if (mode === 'replyAll') {
      setTo(from);
      setCc(others.join(', '));
    } else {
      setTo('');
      setCc('');
    }
    const subj = source.subject ?? '';
    const prefix = mode === 'forward' ? 'WG: ' : 'Re: ';
    setSubject(subj.toLowerCase().startsWith(prefix.toLowerCase()) ? subj : `${prefix}${subj}`);
    setText(quote(source));
  }, [open, mode, source, mailboxId, mailboxes]);

  const title = mode === 'forward' ? 'Weiterleiten' : mode === 'new' ? 'Neue Nachricht' : mode === 'draft' ? 'Entwurf' : 'Antworten';
  const selectedBox = mailboxes.find(b => b.id === boxId) ?? mailboxes[0];
  const previewHtml = previewOutgoingHtml({
    text,
    isHtml,
    signatureHtml: selectedBox?.signature_html,
  });

  async function send() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mailbox_id: boxId,
          to,
          cc,
          subject,
          text,
          is_html: isHtml,
          in_reply_to: mode === 'reply' || mode === 'replyAll' || mode === 'draft' ? source?.message_id_header ?? null : null,
          references: mode === 'forward' || mode === 'new' || !source
            ? null
            : [source.message_id_header, source.in_reply_to].filter(Boolean).join(' '),
          draft_id: draftId,
        }),
      });
      const data = await r.json().catch(() => null) as { error?: string } | null;
      if (!r.ok) {
        setError(data?.error || 'Senden fehlgeschlagen');
        return;
      }
      onSent();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/mail/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mailbox_id: boxId,
          draft_id: draftId,
          to,
          cc,
          subject,
          text,
          in_reply_to: source?.message_id_header ?? null,
        }),
      });
      const data = await r.json().catch(() => null) as { error?: string; id?: string } | null;
      if (!r.ok) {
        setError(data?.error || 'Entwurf fehlgeschlagen');
        return;
      }
      if (data?.id) setDraftId(data.id);
      onSent();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <SaveForm onSave={send} textareaEnter="mod" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          {mailboxes.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label>Von</Label>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                value={boxId}
                onChange={e => setBoxId(e.target.value)}
              >
                {mailboxes.map(b => (
                  <option key={b.id} value={b.id}>{b.display_name || b.email}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mail-to">An</Label>
            <Input id="mail-to" value={to} onChange={e => setTo(e.target.value)} placeholder="name@firma.de" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mail-cc">Cc</Label>
            <Input id="mail-cc" value={cc} onChange={e => setCc(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mail-subj">Betreff</Label>
            <Input id="mail-subj" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={isHtml} onChange={e => setIsHtml(e.target.checked)} />
              HTML-Modus
            </label>
            {isHtml && (
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={showPreview} onChange={e => setShowPreview(e.target.checked)} />
                Vorschau
              </label>
            )}
          </div>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={isHtml ? '<p>Nachricht...</p>' : 'Nachricht...'}
            className={`min-h-36 ${isHtml ? 'font-mono text-xs' : 'text-sm'}`}
          />
          {showPreview && isHtml && (
            <div className="flex flex-col gap-1.5">
              <Label>Vorschau (inkl. Signatur, wie gesendet)</Label>
              <iframe
                title="HTML-Vorschau"
                sandbox="allow-same-origin"
                srcDoc={previewHtml}
                className="min-h-48 w-full rounded-md border border-input bg-background"
              />
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </SaveForm>
        <DialogFooter className="shrink-0 px-0 pt-3">
          <Button type="button" variant="outline" onClick={() => void saveDraft()} disabled={saving}>
            Entwurf
          </Button>
          <Button type="submit" disabled={saving || !to.trim()} onClick={send}>
            {saving ? 'Senden…' : 'Senden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
