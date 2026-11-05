import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MailboxCredentials } from './mailbox';
import {
  appendInboxWatchDraft,
  clipQuotedHistory,
  encodeCursor,
  findDraftsPath,
  htmlToPlainText,
  inboxWatchText,
  INBOX_OPEN_OPTIONS,
  INBOX_WATCH_KONTEN,
  InboxWatchError,
  listInboxWatch,
  parseKontenQuery,
  PEEK_FETCH_QUERY,
  type InboxWatchClient,
  type InboxWatchRuntime,
} from './inbox-watch';

function mime(headers: string, body: string) {
  return Buffer.from(`${headers}\r\n\r\n${body}`, 'utf8');
}

function fakeCreds(email: string): MailboxCredentials {
  return {
    id: email.startsWith('hello') ? 'id-hello' : 'id-jason',
    userId: 'user-test',
    email,
    displayName: null,
    imapHost: 'imap.example.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
    username: email,
    passwordEncrypted: 'v1.test.test.test',
    signatureHtml: null,
    lastSyncAt: null,
    lastSyncError: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    password: 'test-imap-password',
  };
}

type Stored = {
  uid: number;
  date: Date;
  flags: Set<string>;
  source: Buffer;
  envelope: {
    date: Date;
    subject: string;
    messageId: string;
    inReplyTo?: string;
    from: { name?: string; address?: string }[];
    to: { name?: string; address?: string }[];
    cc: { name?: string; address?: string }[];
  };
};

function createMockImap(opts: {
  folders?: Array<{ path: string; name?: string; specialUse?: string | null; flags?: Set<string> }>;
  inbox?: Stored[];
  sent?: Stored[];
  onFlagAdd?: () => void;
  onFlagRemove?: () => void;
}) {
  const opens: Array<{ path: string; options?: { readOnly?: boolean } }> = [];
  const fetches: Array<{ uids: unknown; query: Record<string, unknown> }> = [];
  const appends: Array<{ path: string; raw: Buffer | string; flags?: string[] }> = [];
  let selected = 'INBOX';

  const byFolder = () => (selected.toLowerCase().includes('sent') || selected.toLowerCase().includes('gesendet')
    ? (opts.sent ?? [])
    : (opts.inbox ?? []));

  const client: InboxWatchClient = {
    list: async () => opts.folders ?? [
      { path: 'INBOX', name: 'INBOX', specialUse: '\\Inbox', flags: new Set() },
      { path: 'INBOX.Sent', name: 'Gesendet', specialUse: '\\Sent', flags: new Set() },
      { path: 'INBOX.Drafts', name: 'Entwürfe', specialUse: '\\Drafts', flags: new Set() },
    ],
    mailboxOpen: async (path: string, options?: { readOnly?: boolean }) => {
      selected = path;
      opens.push({ path, options });
      return {} as never;
    },
    search: async () => byFolder().map((m) => m.uid),
    fetch: (uids: number[] | string | number, query: Record<string, unknown>) => {
      fetches.push({ uids, query });
      const wanted = new Set((Array.isArray(uids) ? uids : [uids]).map(Number));
      const list = byFolder().filter((m) => wanted.has(m.uid));
      return {
        async *[Symbol.asyncIterator]() {
          for (const msg of list) {
            yield {
              uid: msg.uid,
              flags: msg.flags,
              envelope: msg.envelope,
              source: query.source ? msg.source : undefined,
            };
          }
        },
      };
    },
    append: async (path: string, raw: Buffer | string, flags?: string[]) => {
      appends.push({ path, raw, flags });
      return { uid: 99 };
    },
  };
  const withFlagTraps = client as InboxWatchClient & {
    messageFlagsAdd: () => Promise<void>;
    messageFlagsRemove: () => Promise<void>;
  };
  withFlagTraps.messageFlagsAdd = async () => {
    opts.onFlagAdd?.();
    throw new Error('Flags dürfen nicht geändert werden');
  };
  withFlagTraps.messageFlagsRemove = async () => {
    opts.onFlagRemove?.();
    throw new Error('Flags dürfen nicht geändert werden');
  };

  return { client, opens, fetches, appends };
}

function runtimeFor(client: InboxWatchClient, emails: Partial<Record<'hello' | 'jason', string>> = {
  hello: INBOX_WATCH_KONTEN.hello,
}): InboxWatchRuntime {
  return {
    getCreds: async (konto) => {
      const email = emails[konto];
      return email ? fakeCreds(email) : null;
    },
    withImap: async (_box, fn) => fn(client),
  };
}

describe('Konto-Allowlist', () => {
  it('mappt nur hello und jason', () => {
    assert.deepEqual(parseKontenQuery(null), ['hello', 'jason']);
    assert.deepEqual(parseKontenQuery('hello'), ['hello']);
    assert.deepEqual(parseKontenQuery('jason'), ['jason']);
    assert.deepEqual(parseKontenQuery('hello|jason'), ['hello', 'jason']);
    assert.equal(parseKontenQuery('other'), null);
    assert.equal(parseKontenQuery('hello@it-roof.com'), null);
    assert.equal(INBOX_WATCH_KONTEN.hello, 'hello@it-roof.com');
    assert.equal(INBOX_WATCH_KONTEN.jason, 'jason.kleuster@it-roof.com');
  });
});

describe('Text', () => {
  it('nimmt Plain, sonst HTML, schneidet Zitate und kürzt auf 4000', () => {
    assert.equal(htmlToPlainText('<p>Hallo<br>Welt</p>'), 'Hallo\nWelt');
    const quoted = inboxWatchText(
      'Antwort\n\nOn Mon, Ada wrote:\n> alt\n',
      null,
    );
    assert.equal(quoted, 'Antwort');
    assert.equal(clipQuotedHistory('x\n-----Original Message-----\nalt'), 'x');
    const long = 'a'.repeat(5000);
    assert.equal(inboxWatchText(long, null).length, 4000);
  });
});

describe('findDraftsPath', () => {
  it('nimmt SPECIAL-USE \\Drafts vor Namens-Fallback', () => {
    assert.equal(findDraftsPath([
      { path: 'INBOX', specialUse: '\\Inbox', flags: new Set() },
      { path: 'Other/Drafts', name: 'Drafts', flags: new Set() },
      { path: 'INBOX.Entwuerfe', name: 'Entwürfe', specialUse: '\\Drafts', flags: new Set() },
    ]), 'INBOX.Entwuerfe');
    assert.equal(findDraftsPath([
      { path: 'INBOX', flags: new Set() },
      { path: 'Entwürfe', name: 'Entwürfe', flags: new Set() },
    ]), 'Entwürfe');
    assert.equal(findDraftsPath([
      { path: 'INBOX', flags: new Set() },
      { path: 'Drafts', name: 'Drafts', flags: new Set() },
    ]), 'Drafts');
  });
});

describe('listInboxWatch PEEK', () => {
  it('liest per PEEK/EXAMINE und setzt \\Seen nicht', async () => {
    const flags = new Set<string>();
    let flagWrites = 0;
    const source = mime(
      [
        'From: Ada <ada@example.com>',
        'To: Bot <bot@example.com>',
        'Cc: cc@example.com',
        'Subject: Testbetreff',
        'Message-ID: <root@example.com>',
        'Date: Wed, 01 Jan 2026 10:00:00 +0000',
        'Content-Type: text/plain; charset=utf-8',
      ].join('\r\n'),
      'Hallo Welt\n\n> zitiert',
    );
    const mock = createMockImap({
      inbox: [{
        uid: 17,
        date: new Date('2026-01-01T10:00:00.000Z'),
        flags,
        source,
        envelope: {
          date: new Date('2026-01-01T10:00:00.000Z'),
          subject: 'Testbetreff',
          messageId: '<root@example.com>',
          from: [{ name: 'Ada', address: 'ada@example.com' }],
          to: [{ address: 'bot@example.com' }],
          cc: [{ address: 'cc@example.com' }],
        },
      }],
      onFlagAdd: () => { flagWrites += 1; },
      onFlagRemove: () => { flagWrites += 1; },
    });

    const result = await listInboxWatch({
      since: new Date('2026-01-01T00:00:00.000Z'),
      konten: ['hello'],
      limit: 20,
      cursor: null,
    }, runtimeFor(mock.client));

    assert.equal(result.mails.length, 1);
    assert.equal(result.mails[0]!.id, 'hello:17');
    assert.equal(result.mails[0]!.konto, 'hello');
    assert.equal(result.mails[0]!.ungelesen, true);
    assert.equal(result.mails[0]!.thread_id, 'root@example.com');
    assert.equal(result.mails[0]!.text, 'Hallo Welt');
    assert.equal(result.mails[0]!.von.includes('ada@example.com'), true);
    assert.equal(flags.has('\\Seen'), false);
    assert.equal(flagWrites, 0);
    assert.ok(mock.opens.every((o) => o.path === 'INBOX' && o.options?.readOnly === true));
    assert.deepEqual(INBOX_OPEN_OPTIONS, { readOnly: true });
    assert.equal(PEEK_FETCH_QUERY.source, true);
    assert.ok(mock.fetches.some((f) => f.query.source === true));
    assert.ok(mock.fetches.every((f) => f.query.markSeen !== true));
  });

  it('filtert since und paginiert mit Cursor', async () => {
    const mk = (uid: number, iso: string): Stored => ({
      uid,
      date: new Date(iso),
      flags: new Set(['\\Seen']),
      source: mime(`From: a@example.com\r\nTo: b@example.com\r\nSubject: S${uid}\r\nMessage-ID: <${uid}@example.com>\r\nDate: ${new Date(iso).toUTCString()}`, `body ${uid}`),
      envelope: {
        date: new Date(iso),
        subject: `S${uid}`,
        messageId: `<${uid}@example.com>`,
        from: [{ address: 'a@example.com' }],
        to: [{ address: 'b@example.com' }],
        cc: [],
      },
    });
    const mock = createMockImap({
      inbox: [
        mk(1, '2026-01-01T09:00:00.000Z'),
        mk(2, '2026-01-02T09:00:00.000Z'),
        mk(3, '2026-01-03T09:00:00.000Z'),
      ],
    });
    const first = await listInboxWatch({
      since: new Date('2026-01-02T00:00:00.000Z'),
      konten: ['hello'],
      limit: 1,
      cursor: null,
    }, runtimeFor(mock.client));
    assert.equal(first.mails.length, 1);
    assert.equal(first.mails[0]!.id, 'hello:3');
    assert.ok(first.next_cursor);
    const second = await listInboxWatch({
      since: new Date('2026-01-02T00:00:00.000Z'),
      konten: ['hello'],
      limit: 10,
      cursor: { d: '2026-01-03T09:00:00.000Z', k: 'hello', u: 3 },
    }, runtimeFor(mock.client));
    assert.equal(second.mails.map((m) => m.id).join(','), 'hello:2');
    assert.equal(second.next_cursor, null);
    assert.ok(encodeCursor({ d: '2026-01-03T09:00:00.000Z', k: 'hello', u: 3 }).length > 8);
  });

  it('404 wenn Allowlist-Konto fehlt', async () => {
    const mock = createMockImap({ inbox: [] });
    await assert.rejects(
      () => listInboxWatch({
        since: new Date('2026-01-01T00:00:00.000Z'),
        konten: ['hello'],
        limit: 10,
        cursor: null,
      }, {
        getCreds: async () => null,
        withImap: async (_box, fn) => fn(mock.client),
      }),
      (err: unknown) => err instanceof InboxWatchError && err.status === 404,
    );
  });
});

describe('appendInboxWatchDraft', () => {
  it('APPEND mit \\Draft und Reply-Headern, sendet nicht', async () => {
    const original = mime(
      [
        'From: Ada <ada@example.com>',
        'To: Bot <bot@example.com>',
        'Subject: Frage',
        'Message-ID: <orig@example.com>',
        'References: <root@example.com>',
        'Date: Wed, 01 Jan 2026 10:00:00 +0000',
      ].join('\r\n'),
      'Original',
    );
    const mock = createMockImap({
      inbox: [{
        uid: 17,
        date: new Date('2026-01-01T10:00:00.000Z'),
        flags: new Set(),
        source: original,
        envelope: {
          date: new Date('2026-01-01T10:00:00.000Z'),
          subject: 'Frage',
          messageId: '<orig@example.com>',
          inReplyTo: '<root@example.com>',
          from: [{ address: 'ada@example.com' }],
          to: [{ address: 'bot@example.com' }],
          cc: [],
        },
      }],
    });
    const sent: string[] = [];
    const result = await appendInboxWatchDraft({
      konto: 'hello',
      an: 'ada@example.com',
      betreff: 'Re: Frage',
      text: 'Antworttext',
      in_reply_to: 'hello:17',
    }, runtimeFor(mock.client));

    assert.equal(result.uid, 99);
    assert.ok(result.message_id);
    assert.equal(mock.appends.length, 1);
    assert.equal(mock.appends[0]!.path, 'INBOX.Drafts');
    assert.deepEqual(mock.appends[0]!.flags, ['\\Draft']);
    const raw = mock.appends[0]!.raw.toString('utf8');
    assert.match(raw, /In-Reply-To:.*<orig@example.com>/i);
    assert.match(raw, /References:[\s\S]*<root@example.com>[\s\S]*<orig@example.com>/i);
    assert.match(raw, /Subject: Re: Frage/);
    assert.equal(sent.length, 0);
    assert.ok(mock.opens.every((o) => o.path === 'INBOX' ? o.options?.readOnly === true : true));
  });

  it('setzt Reply-Header auch über thread_id', async () => {
    const original = mime(
      [
        'From: Ada <ada@example.com>',
        'To: Bot <bot@example.com>',
        'Subject: Frage',
        'Message-ID: <orig@example.com>',
        'References: <root@example.com>',
        'Date: Wed, 01 Jan 2026 10:00:00 +0000',
      ].join('\r\n'),
      'Original',
    );
    const mock = createMockImap({
      inbox: [{
        uid: 4,
        date: new Date('2026-01-01T10:00:00.000Z'),
        flags: new Set(),
        source: original,
        envelope: {
          date: new Date('2026-01-01T10:00:00.000Z'),
          subject: 'Frage',
          messageId: '<orig@example.com>',
          inReplyTo: '<root@example.com>',
          from: [{ address: 'ada@example.com' }],
          to: [{ address: 'bot@example.com' }],
          cc: [],
        },
      }],
    });
    await appendInboxWatchDraft({
      konto: 'hello',
      an: 'ada@example.com',
      betreff: 'Re: Frage',
      text: 'Antworttext',
      thread_id: 'root@example.com',
    }, runtimeFor(mock.client));
    const raw = mock.appends[0]!.raw.toString('utf8');
    assert.match(raw, /In-Reply-To:.*<orig@example.com>/i);
    assert.match(raw, /References:/i);
    assert.ok(!mock.appends[0]!.flags?.includes('\\Seen'));
    assert.ok(!mock.appends[0]!.flags?.includes('\\Deleted'));
  });

  it('nutzt Fallback Entwürfe ohne SPECIAL-USE', async () => {
    const original = mime(
      'From: a@example.com\r\nTo: b@example.com\r\nSubject: S\r\nMessage-ID: <x@example.com>\r\nDate: Wed, 01 Jan 2026 10:00:00 +0000',
      'hi',
    );
    const mock = createMockImap({
      folders: [
        { path: 'INBOX', name: 'INBOX', flags: new Set() },
        { path: 'Entwürfe', name: 'Entwürfe', flags: new Set() },
      ],
      inbox: [{
        uid: 1,
        date: new Date('2026-01-01T10:00:00.000Z'),
        flags: new Set(),
        source: original,
        envelope: {
          date: new Date('2026-01-01T10:00:00.000Z'),
          subject: 'S',
          messageId: '<x@example.com>',
          from: [{ address: 'a@example.com' }],
          to: [{ address: 'b@example.com' }],
          cc: [],
        },
      }],
    });
    await appendInboxWatchDraft({
      konto: 'hello',
      an: 'a@example.com',
      betreff: 'Re: S',
      text: 'ok',
      in_reply_to: '<x@example.com>',
    }, runtimeFor(mock.client));
    assert.equal(mock.appends[0]!.path, 'Entwürfe');
  });
});
