import type { ReactNode } from 'react';
import { DEMO_SHELL_NOTE } from '@/lib/bot/docs-copy';

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 font-mono text-[12px] leading-relaxed">
      {children}
    </pre>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-8 text-base font-semibold tracking-tight">{children}</h2>;
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm text-muted-foreground">{children}</p>;
}

export function BotApiDocs() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 lg:px-6">
      <p className="text-sm text-muted-foreground">{DEMO_SHELL_NOTE}</p>

      <H2>Authentifizierung</H2>
      <P>Alle Requests brauchen einen Bearer-Token (kein Session-Cookie).</P>
      <div className="mt-3">
        <Code>{`Authorization: Bearer <MAIL_BOT_TOKEN>`}</Code>
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Token mindestens 32 Zeichen (`MAIL_BOT_TOKEN`)</li>
        <li>Timing-safe Vergleich, Rate-Limit, Audit-Log</li>
        <li>
          Läuft als User{' '}
          <code className="rounded bg-muted px-1 font-mono text-[12px]">
            MAIL_BOT_USER_EMAIL
          </code>{' '}
          (Default <code className="rounded bg-muted px-1 font-mono text-[12px]">grokbot@it-roof.com</code>)
        </li>
      </ul>

      <H2>Environment</H2>
      <div className="mt-3 overflow-x-auto rounded-lg ring-1 ring-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Variable</th>
              <th className="px-3 py-2">Default</th>
              <th className="px-3 py-2">Bedeutung</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[
              ['MAIL_BOT_TOKEN', '—', 'Bearer-Secret (pflicht, ≥32)'],
              ['MAIL_BOT_USER_EMAIL', 'grokbot@it-roof.com', 'User der Postfächer'],
              ['MAIL_BOT_ALLOW_SEND', 'false', 'Echtes Senden erlauben'],
              ['MAIL_BOT_MAX_BODY_CHARS', '20000', 'Max. Body-Länge'],
              ['MAIL_BOT_MAX_ATTACHMENT_BYTES', '2 MB', 'Max. Anhang-Download'],
              ['MAIL_BOT_RATE_LIMIT_PER_MIN', '120', 'Requests / IP / Minute'],
            ].map(([k, d, m]) => (
              <tr key={k}>
                <td className="px-3 py-2 font-mono text-[12px]">{k}</td>
                <td className="px-3 py-2 text-muted-foreground">{d}</td>
                <td className="px-3 py-2 text-muted-foreground">{m}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2>Setup</H2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>User Grokbot anlegen (Seed)</li>
        <li>Als Grokbot IMAP/SMTP-Konten unter Inbox → Konten einrichten</li>
        <li>
          <code className="rounded bg-muted px-1 font-mono text-[12px]">MAIL_BOT_TOKEN</code> setzen
        </li>
      </ol>
      <P>Der Bot sieht nur die Postfächer dieses Users.</P>

      <H2>Endpoints</H2>
      <div className="mt-3 space-y-4">
        {[
          ['GET', '/api/bot/mail', 'Tool-Katalog / Capabilities'],
          ['GET', '/api/bot/mail/mailboxes', 'Postfächer auflisten'],
          ['GET', '/api/bot/mail/folders?mailbox_id=', 'Ordner + Unread'],
          [
            'GET',
            '/api/bot/mail/messages',
            'Suchen/Listen — Query: mailbox_id, folder_id, role, q, limit, threaded',
          ],
          [
            'GET',
            '/api/bot/mail/messages/:id',
            'Lesen — ?thread=1 oder ?thread=full (Plaintext-Body)',
          ],
          [
            'PATCH',
            '/api/bot/mail/messages/:id',
            'seen / flagged / folder_id / move_to (archive|trash|inbox|junk)',
          ],
          ['DELETE', '/api/bot/mail/messages/:id', 'Papierkorb; erneut = endgültig'],
          ['POST', '/api/bot/mail/drafts', 'Entwurf oder senden (wenn erlaubt)'],
          ['POST', '/api/bot/mail/sync', 'IMAP-Sync (optional mailbox_id)'],
          ['GET', '/api/bot/mail/attachments/:id', 'Anhang — ?meta=1 oder Base64'],
        ].map(([method, path, desc]) => (
          <div key={`${method}-${path}`} className="rounded-lg ring-1 ring-border px-3 py-2.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-[11px] font-semibold tracking-wide text-primary">
                {method}
              </span>
              <code className="font-mono text-[12px]">{path}</code>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
          </div>
        ))}
      </div>

      <H2>Beispiel: Patch</H2>
      <div className="mt-3">
        <Code>{`PATCH /api/bot/mail/messages/:id
{
  "seen": true,
  "flagged": false,
  "move_to": "archive"
}`}</Code>
      </div>

      <H2>Beispiel: Entwurf</H2>
      <div className="mt-3">
        <Code>{`POST /api/bot/mail/drafts
{
  "mailbox_id": "…",
  "to": ["kunde@example.de"],
  "subject": "Re: …",
  "text": "…",
  "send": false
}`}</Code>
      </div>

      <H2>Agent-Flow</H2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>POST /sync (optional)</li>
        <li>GET /messages?role=inbox&amp;q=…</li>
        <li>GET /messages/:id?thread=full</li>
        <li>POST /drafts</li>
        <li>PATCH → seen / archive</li>
        <li>bei Bedarf DELETE</li>
      </ol>

      <H2>Security</H2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Nur Bearer-Token</li>
        <li>Senden default aus</li>
        <li>Bodies nur Plaintext, gekürzt</li>
        <li>Anhänge mit Größenlimit</li>
        <li>Nur Postfächer des Bot-Users</li>
      </ul>
    </div>
  );
}
