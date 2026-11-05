import MailComposer from 'nodemailer/lib/mail-composer';
import { simpleParser, type AddressObject } from 'mailparser';
import { SecretDecryptError } from '@/lib/crypto/secret-box';
import { folderRole, withImap } from '@/lib/mail/imap';
import {
  getMailboxCredentialsByEmail,
  type MailboxCredentials,
} from '@/lib/mail/mailbox';
import {
  formatMessageId,
  messageIdFromRaw,
  normalizeMessageId,
  parseAddressField,
  threadIdFromHeaders,
} from '@/lib/mail/thread';

export const INBOX_WATCH_KONTEN = {
  hello: 'hello@it-roof.com',
  jason: 'jason.kleuster@it-roof.com',
} as const;

export type InboxWatchKonto = keyof typeof INBOX_WATCH_KONTEN;

export const INBOX_OPEN_OPTIONS = { readOnly: true } as const;

export const PEEK_FETCH_QUERY = {
  uid: true,
  flags: true,
  envelope: true,
  source: true,
} as const;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SEARCH = 500;
const TEXT_LIMIT = 4000;

export class InboxWatchError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'InboxWatchError';
  }
}

export type InboxWatchMail = {
  id: string;
  konto: InboxWatchKonto;
  von: string;
  an: string;
  cc: string;
  betreff: string;
  datum: string;
  ungelesen: boolean;
  thread_id: string;
  anhaenge: string[];
  text: string;
};

export type InboxWatchCursor = {
  d: string;
  k: InboxWatchKonto;
  u: number;
};

export type InboxWatchClient = {
  list: () => Promise<ListedBox[]>;
  mailboxOpen: (path: string, options?: { readOnly?: boolean }) => Promise<unknown>;
  search: (
    query: { since?: Date; header?: Record<string, string> },
    options?: { uid?: boolean },
  ) => Promise<number[] | false>;
  fetch: (
    range: number[] | string | number,
    query: Record<string, unknown>,
    options?: { uid?: boolean },
  ) => AsyncIterable<Fetched>;
  append: (
    path: string,
    content: Buffer | string,
    flags?: string[],
  ) => Promise<false | { uid?: number | null }>;
};

export type InboxWatchRuntime = {
  getCreds: (konto: InboxWatchKonto) => Promise<MailboxCredentials | null>;
  withImap: <T>(box: MailboxCredentials, fn: (client: InboxWatchClient) => Promise<T>) => Promise<T>;
};

const defaultRuntime: InboxWatchRuntime = {
  getCreds: (konto) => getMailboxCredentialsByEmail(INBOX_WATCH_KONTEN[konto]),
  withImap: withImap as InboxWatchRuntime['withImap'],
};

type ListedBox = {
  path: string;
  name?: string;
  specialUse?: string | string[] | null;
  flags?: Set<string>;
};

type Fetched = {
  uid?: number;
  flags?: Set<string> | string[];
  envelope?: {
    date?: Date | string;
    subject?: string;
    messageId?: string;
    inReplyTo?: string;
    from?: { name?: string; address?: string }[];
    to?: { name?: string; address?: string }[];
    cc?: { name?: string; address?: string }[];
  };
  source?: Buffer;
};

type Candidate = {
  konto: InboxWatchKonto;
  uid: number;
  date: Date;
  seen: boolean;
  envelope: Fetched['envelope'];
};

export function parseKontenQuery(raw: string | null | undefined): InboxWatchKonto[] | null {
  if (raw == null || !raw.trim()) return ['hello', 'jason'];
  const parts = raw.split(/[,|]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const out: InboxWatchKonto[] = [];
  for (const part of parts) {
    if (part !== 'hello' && part !== 'jason') return null;
    if (!out.includes(part)) out.push(part);
  }
  return out.length ? out : ['hello', 'jason'];
}

export function parseLimit(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

export function parseSince(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function encodeCursor(cursor: InboxWatchCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function parseCursor(raw: string | null | undefined): InboxWatchCursor | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<InboxWatchCursor>;
    if ((parsed.k !== 'hello' && parsed.k !== 'jason') || typeof parsed.u !== 'number' || !parsed.d) {
      return null;
    }
    const d = new Date(parsed.d);
    if (Number.isNaN(d.getTime())) return null;
    return { d: d.toISOString(), k: parsed.k, u: parsed.u };
  } catch {
    return null;
  }
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<img[^>]+alt=["']([^"']*)["'][^>]*>/gi, '[$1]')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function clipQuotedHistory(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('>')) break;
    if (/^on .+ wrote:$/i.test(t)) break;
    if (/^am .+ schrieb .+:?$/i.test(t)) break;
    if (/^-{2,}\s*original message/i.test(t)) break;
    if (/^-{2,}\s*ursprüngliche nachricht/i.test(t)) break;
    if (out.some((l) => l.trim()) && /^_{8,}$/.test(t)) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

export function inboxWatchText(plain: string | null | undefined, html: string | null | undefined): string {
  const raw = (plain && plain.trim()) || (html ? htmlToPlainText(html) : '');
  const clipped = clipQuotedHistory(raw);
  return clipped.length > TEXT_LIMIT ? clipped.slice(0, TEXT_LIMIT) : clipped;
}

export function findDraftsPath(listed: ListedBox[]): string | null {
  const selectable = listed.filter((box) => {
    const flags = box.flags ?? new Set<string>();
    return !flags.has('\\Noselect') && !flags.has('\\NonExistent');
  });
  const special = selectable.find((box) => {
    const specialUse = Array.isArray(box.specialUse) ? box.specialUse.join(' ') : (box.specialUse ?? '');
    return specialUse.includes('\\Drafts');
  });
  if (special) return special.path;
  const named = selectable.find((box) => folderRole(box.path, box.specialUse, box.name) === 'drafts');
  return named?.path ?? null;
}

function findSentPath(listed: ListedBox[]): string | null {
  const selectable = listed.filter((box) => {
    const flags = box.flags ?? new Set<string>();
    return !flags.has('\\Noselect') && !flags.has('\\NonExistent');
  });
  return selectable.find((box) => folderRole(box.path, box.specialUse, box.name) === 'sent')?.path ?? null;
}

function isSeen(flags: Set<string> | string[] | undefined): boolean {
  const set = flags instanceof Set ? flags : new Set(flags ?? []);
  return set.has('\\Seen') || set.has('Seen') || set.has('\\seen');
}

function formatAddrs(list: { name?: string | null; address?: string | null }[] | undefined): string {
  if (!list?.length) return '';
  return list
    .filter((a) => a.address)
    .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address!))
    .join(', ');
}

function addrsFromParser(obj: AddressObject | AddressObject[] | undefined) {
  const list = !obj ? [] : Array.isArray(obj) ? obj : [obj];
  const out: { name: string | null; address: string }[] = [];
  for (const item of list) {
    for (const v of item.value ?? []) {
      if (v.address) out.push({ name: v.name || null, address: v.address });
    }
  }
  return out;
}

function afterCursor(item: Candidate, cursor: InboxWatchCursor): boolean {
  const cursorDate = new Date(cursor.d).getTime();
  const itemDate = item.date.getTime();
  if (itemDate !== cursorDate) return itemDate < cursorDate;
  if (item.uid !== cursor.u) return item.uid < cursor.u;
  return item.konto > cursor.k;
}

function sortCandidates(a: Candidate, b: Candidate) {
  const dateDiff = b.date.getTime() - a.date.getTime();
  if (dateDiff) return dateDiff;
  if (b.uid !== a.uid) return b.uid - a.uid;
  return a.konto.localeCompare(b.konto);
}

async function collectUids(client: InboxWatchClient, since: Date): Promise<number[]> {
  const searched = await client.search({ since }, { uid: true });
  return (Array.isArray(searched) ? searched : [])
    .map((u) => Number(u))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)
    .slice(0, MAX_SEARCH);
}

async function fetchPeek(client: InboxWatchClient, uids: number[], query: Record<string, unknown>): Promise<Fetched[]> {
  if (!uids.length) return [];
  const out: Fetched[] = [];
  for await (const msg of client.fetch(uids, query, { uid: true })) {
    out.push(msg as Fetched);
  }
  return out;
}

async function listCandidates(
  konto: InboxWatchKonto,
  since: Date,
  runtime: InboxWatchRuntime,
): Promise<Candidate[]> {
  const creds = await runtime.getCreds(konto);
  if (!creds) return [];
  try {
    return await runtime.withImap(creds, async (client) => {
      await client.mailboxOpen('INBOX', INBOX_OPEN_OPTIONS);
      const uids = await collectUids(client, since);
      const fetched = await fetchPeek(client, uids, {
        uid: true,
        flags: true,
        envelope: true,
      });
      const rows: Candidate[] = [];
      for (const msg of fetched) {
        const uid = Number(msg.uid);
        if (!Number.isFinite(uid)) continue;
        const dateRaw = msg.envelope?.date;
        const date = dateRaw instanceof Date ? dateRaw : dateRaw ? new Date(dateRaw) : null;
        if (!date || Number.isNaN(date.getTime()) || date < since) continue;
        rows.push({
          konto,
          uid,
          date,
          seen: isSeen(msg.flags),
          envelope: msg.envelope,
        });
      }
      return rows;
    });
  } catch (err) {
    if (err instanceof InboxWatchError || err instanceof SecretDecryptError) throw err;
    throw new InboxWatchError(502, 'Postfach nicht erreichbar');
  }
}

async function loadSources(
  groups: Map<InboxWatchKonto, number[]>,
  runtime: InboxWatchRuntime,
): Promise<Map<string, Fetched>> {
  const out = new Map<string, Fetched>();
  for (const [konto, uids] of groups) {
    if (!uids.length) continue;
    const creds = await runtime.getCreds(konto);
    if (!creds) continue;
    try {
      await runtime.withImap(creds, async (client) => {
        await client.mailboxOpen('INBOX', INBOX_OPEN_OPTIONS);
        const fetched = await fetchPeek(client, uids, PEEK_FETCH_QUERY);
        for (const msg of fetched) {
          const uid = Number(msg.uid);
          if (Number.isFinite(uid)) out.set(`${konto}:${uid}`, msg);
        }
      });
    } catch (err) {
      if (err instanceof InboxWatchError || err instanceof SecretDecryptError) throw err;
      throw new InboxWatchError(502, 'Postfach nicht erreichbar');
    }
  }
  return out;
}

export async function listInboxWatch(
  opts: {
    since: Date;
    konten: InboxWatchKonto[];
    limit: number;
    cursor: InboxWatchCursor | null;
  },
  runtime: InboxWatchRuntime = defaultRuntime,
): Promise<{ mails: InboxWatchMail[]; next_cursor: string | null }> {
  const found: InboxWatchKonto[] = [];
  for (const konto of opts.konten) {
    if (await runtime.getCreds(konto)) found.push(konto);
  }
  if (!found.length) {
    throw new InboxWatchError(404, 'Konto nicht gefunden');
  }

  const candidates: Candidate[] = [];
  for (const konto of found) {
    candidates.push(...await listCandidates(konto, opts.since, runtime));
  }
  candidates.sort(sortCandidates);
  const after = opts.cursor
    ? candidates.filter((item) => afterCursor(item, opts.cursor!))
    : candidates;
  const page = after.slice(0, opts.limit);
  const hasMore = after.length > opts.limit;

  const groups = new Map<InboxWatchKonto, number[]>();
  for (const item of page) {
    const list = groups.get(item.konto) ?? [];
    list.push(item.uid);
    groups.set(item.konto, list);
  }
  const sources = await loadSources(groups, runtime);

  const mails: InboxWatchMail[] = [];
  for (const item of page) {
    const fetched = sources.get(`${item.konto}:${item.uid}`);
    let von = formatAddrs(item.envelope?.from);
    let an = formatAddrs(item.envelope?.to);
    let cc = formatAddrs(item.envelope?.cc);
    let betreff = item.envelope?.subject ?? '';
    let threadId = threadIdFromHeaders(
      item.envelope?.messageId ?? null,
      item.envelope?.inReplyTo ?? null,
      null,
    );
    let anhaenge: string[] = [];
    let text = '';
    if (fetched?.source) {
      try {
        const parsed = await simpleParser(fetched.source);
        const from = addrsFromParser(parsed.from);
        const to = addrsFromParser(parsed.to);
        const parsedCc = addrsFromParser(parsed.cc);
        if (from.length) von = formatAddrs(from);
        if (to.length) an = formatAddrs(to);
        cc = formatAddrs(parsedCc);
        betreff = parsed.subject ?? betreff;
        const messageId = formatMessageId(parsed.messageId ?? fetched.envelope?.messageId ?? null);
        const inReplyTo = formatMessageId(parsed.inReplyTo) ?? parsed.inReplyTo ?? null;
        const references = Array.isArray(parsed.references)
          ? parsed.references.join(' ')
          : (parsed.references ?? null);
        threadId = threadIdFromHeaders(messageId, inReplyTo, references);
        anhaenge = (parsed.attachments ?? [])
          .filter((a) => !a.related && a.filename)
          .map((a) => a.filename!)
          .slice(0, 20);
        const html = typeof parsed.html === 'string' ? parsed.html : null;
        text = inboxWatchText(parsed.text, html);
      } catch {
        text = '';
      }
    }
    mails.push({
      id: `${item.konto}:${item.uid}`,
      konto: item.konto,
      von,
      an,
      cc,
      betreff,
      datum: item.date.toISOString(),
      ungelesen: !item.seen,
      thread_id: threadId,
      anhaenge,
      text,
    });
  }

  const last = page[page.length - 1];
  return {
    mails,
    next_cursor: hasMore && last
      ? encodeCursor({ d: last.date.toISOString(), k: last.konto, u: last.uid })
      : null,
  };
}

function parseReplyUid(inReplyTo: string | null | undefined, konto: InboxWatchKonto): number | null {
  if (!inReplyTo?.trim()) return null;
  const scoped = /^(hello|jason):(\d+)$/i.exec(inReplyTo.trim());
  if (scoped) {
    if (scoped[1]!.toLowerCase() !== konto) return null;
    return Number(scoped[2]);
  }
  if (/^\d+$/.test(inReplyTo.trim())) return Number(inReplyTo.trim());
  return null;
}

async function searchMessageId(client: InboxWatchClient, rawId: string): Promise<number | null> {
  const formatted = formatMessageId(rawId);
  const normalized = normalizeMessageId(rawId);
  const values = [formatted, normalized, rawId.trim()].filter((v, i, all): v is string => Boolean(v) && all.indexOf(v) === i);
  for (const value of values) {
    const found = await client.search({ header: { 'message-id': value } }, { uid: true });
    const uid = (Array.isArray(found) ? found : []).map(Number).find((n) => Number.isFinite(n));
    if (uid != null) return uid;
  }
  return null;
}

async function loadReplyTarget(
  client: InboxWatchClient,
  opts: { konto: InboxWatchKonto; threadId?: string | null; inReplyTo?: string | null },
): Promise<{ messageId: string; references: string } | null> {
  const listed = await client.list();
  const folders = ['INBOX', findSentPath(listed)].filter((p): p is string => Boolean(p));
  const wantUid = parseReplyUid(opts.inReplyTo, opts.konto);
  const wantMessageId = wantUid == null ? formatMessageId(opts.inReplyTo) ?? opts.inReplyTo?.trim() ?? null : null;
  const wantThread = normalizeMessageId(opts.threadId) ?? opts.threadId?.trim() ?? null;

  const threadHits: { date: number; messageId: string; references: string }[] = [];

  for (const folder of folders) {
    await client.mailboxOpen(folder, INBOX_OPEN_OPTIONS);
    let uids: number[] = [];
    if (wantUid != null) {
      uids = [wantUid];
    } else if (wantMessageId) {
      const uid = await searchMessageId(client, wantMessageId);
      if (uid != null) uids = [uid];
    }
    if (!uids.length) {
      uids = await collectUids(client, new Date(Date.now() - 180 * 24 * 60 * 60 * 1000));
    }
    const fetched = await fetchPeek(client, uids, PEEK_FETCH_QUERY);
    for (const msg of fetched) {
      if (!msg.source) continue;
      let messageId = formatMessageId(msg.envelope?.messageId ?? null);
      let inReplyTo = formatMessageId(msg.envelope?.inReplyTo ?? null);
      let references: string | null = null;
      try {
        const parsed = await simpleParser(msg.source);
        messageId = formatMessageId(parsed.messageId ?? msg.envelope?.messageId ?? null) ?? messageId;
        inReplyTo = formatMessageId(parsed.inReplyTo) ?? parsed.inReplyTo ?? inReplyTo;
        references = Array.isArray(parsed.references)
          ? parsed.references.join(' ')
          : (parsed.references ?? null);
      } catch {
        // Envelope reicht
      }
      if (!messageId) continue;
      const threadId = threadIdFromHeaders(messageId, inReplyTo, references);
      const uid = Number(msg.uid);
      const matchesUid = wantUid != null && uid === wantUid;
      const matchesId = Boolean(
        wantMessageId && normalizeMessageId(messageId) === normalizeMessageId(wantMessageId),
      );
      const matchesThread = Boolean(
        wantThread && (threadId === wantThread || normalizeMessageId(messageId) === wantThread),
      );
      if (!matchesUid && !matchesId && !matchesThread) continue;
      const refs = [references, messageId].filter(Boolean).join(' ').trim();
      if (matchesUid || matchesId) {
        return { messageId, references: refs };
      }
      const dateRaw = msg.envelope?.date;
      const date = dateRaw instanceof Date ? dateRaw.getTime() : dateRaw ? new Date(dateRaw).getTime() : 0;
      threadHits.push({ date, messageId, references: refs });
    }
  }
  threadHits.sort((a, b) => b.date - a.date);
  const best = threadHits[0];
  return best ? { messageId: best.messageId, references: best.references } : null;
}

export async function appendInboxWatchDraft(
  opts: {
    konto: InboxWatchKonto;
    an: unknown;
    betreff: string;
    text: string;
    thread_id?: string | null;
    in_reply_to?: string | null;
  },
  runtime: InboxWatchRuntime = defaultRuntime,
): Promise<{ uid: number | null; message_id: string | null }> {
  const to = parseAddressField(opts.an);
  if (!to.length) throw new InboxWatchError(400, 'Empfänger fehlt');
  if (!opts.thread_id?.trim() && !opts.in_reply_to?.trim()) {
    throw new InboxWatchError(400, 'thread_id oder in_reply_to ist erforderlich');
  }

  const creds = await runtime.getCreds(opts.konto);
  if (!creds) throw new InboxWatchError(404, 'Konto nicht gefunden');

  try {
    return await runtime.withImap(creds, async (client) => {
      const listed = await client.list();
      const draftsPath = findDraftsPath(listed);
      if (!draftsPath) throw new InboxWatchError(404, 'Kein Entwürfe-Ordner gefunden');

      const target = await loadReplyTarget(client, {
        konto: opts.konto,
        threadId: opts.thread_id,
        inReplyTo: opts.in_reply_to,
      });

      const replyIdLooksReal = Boolean(normalizeMessageId(opts.in_reply_to)?.includes('@'));
      let inReplyTo = target?.messageId ?? (replyIdLooksReal ? formatMessageId(opts.in_reply_to) : null);
      let references = target?.references ?? inReplyTo;
      if (!target && opts.thread_id?.trim() && !replyIdLooksReal) {
        throw new InboxWatchError(404, 'Ursprungsmail nicht gefunden');
      }
      if (!inReplyTo && replyIdLooksReal) {
        inReplyTo = formatMessageId(opts.in_reply_to);
        references = inReplyTo;
      }
      if (!inReplyTo) {
        throw new InboxWatchError(404, 'Ursprungsmail nicht gefunden');
      }

      const raw: Buffer = await new MailComposer({
        from: creds.displayName ? { name: creds.displayName, address: creds.email } : creds.email,
        to: to.map((a) => (a.name ? { name: a.name, address: a.address } : a.address)),
        subject: opts.betreff,
        text: opts.text,
        inReplyTo,
        references: references ?? undefined,
        date: new Date(),
      }).compile().build();

      const appended = await client.append(draftsPath, raw, ['\\Draft']);
      if (!appended) throw new InboxWatchError(502, 'Entwurf konnte nicht gespeichert werden');
      const uid = appended && typeof appended === 'object' && 'uid' in appended && appended.uid != null
        ? Number(appended.uid)
        : null;
      return {
        uid: uid != null && Number.isFinite(uid) ? uid : null,
        message_id: messageIdFromRaw(raw),
      };
    });
  } catch (err) {
    if (err instanceof InboxWatchError || err instanceof SecretDecryptError) throw err;
    throw new InboxWatchError(502, 'Postfach nicht erreichbar');
  }
}
