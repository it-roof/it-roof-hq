import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MailboxCredentials } from './mailbox';
import {
  appendInboxWatchDraft,
  clipQuotedHistory,
  encodeCursor,
  findDraftsPath,
  HEADER_PEEK_QUERY,
  htmlToPlainText,
  inboxWatchText,
  INBOX_OPEN_OPTIONS,
  INBOX_WATCH_KONTEN,
  InboxWatchError,
  listInboxWatch,
  parseKontenQuery,
  PEEK_FETCH_QUERY,
  replySubject,
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
  internalDate?: Date;
  flags: Set<string>;
  source: Buffer;
  references?: string;
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
  const searches: Array<{ folder: string; query: { since?: Date; header?: Record<string, string> } }> = [];
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
    search: async (query) => {
      searches.push({ folder: selected, query });
      const folder = byFolder();
      if (query.header) {
        const [field, value] = Object.entries(query.header)[0] ?? [];
        if (!field || value == null) return [];
        const needle = String(value).replace(/^<|>$/g, '').toLowerCase();
        const key = field.toLowerCase();
        return folder.filter((m) => {
          const messageId = (m.envelope.messageId ?? '').replace(/^<|>$/g, '').toLowerCase();
          const refs = `${m.references ?? ''} ${m.envelope.inReplyTo ?? ''}`.toLowerCase();
          if (key === 'message-id') return messageId === needle || messageId.includes(needle);
          if (key === 'references') return refs.includes(needle);
          return false;
        }).map((m) => m.uid);
      }
      return folder.map((m) => m.uid);
    },
    fetch: (uids: number[] | string | number, query: Record<string, unknown>) => {
      fetches.push({ uids, query });
      const wanted = new Set((Array.isArray(uids) ? uids : [uids]).map(Number));
      const list = byFolder().filter((m) => wanted.has(m.uid));
      return {
        async *[Symbol.asyncIterator]() {
          for (const msg of list) {
            const headerLines = [
              `Message-ID: ${msg.envelope.messageId}`,
              msg.envelope.inReplyTo ? `In-Reply-To: ${msg.envelope.inReplyTo}` : '',
              msg.references ? `References: ${msg.references}` : '',
            ].filter(Boolean);
            yield {
              uid: msg.uid,
              flags: msg.flags,
              envelope: msg.envelope,
              internalDate: msg.internalDate ?? msg.date,
              source: query.source ? msg.source : undefined,
              headers: query.headers ? Buffer.from(headerLines.join('\r\n'), 'utf8') : undefined,
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

  return { client, opens, fetches, searches, appends };
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

  it('entfernt style, script und head samt Inhalt', () => {
    const html = [
      '<html><head><title>Interner Titel</title>',
      '<style>body { color: red; } .hidden { display:none }</style>',
      '</head><body>',
      '<script>window.secret = "nicht-im-text";</script>',
      '<p>Sichtbarer Absatz</p>',
      '</body></html>',
    ].join('');
    const text = htmlToPlainText(html);
    assert.equal(text.includes('Sichtbarer Absatz'), true);
    assert.equal(text.includes('Interner Titel'), false);
    assert.equal(text.includes('color: red'), false);
    assert.equal(text.includes('window.secret'), false);
    assert.equal(text.includes('nicht-im-text'), false);
  });

  it('schneidet Outlook-Zitatblöcke ab', () => {
    assert.equal(
      clipQuotedHistory(
        'Kurze Antwort an Max\n\nVon: Max Muster <max@example.com>\nGesendet: Montag, 2. Januar 2026 09:11\nAn: Bot <bot@example.com>\nBetreff: Alte Frage\n\nAlter Verlauf',
      ),
      'Kurze Antwort an Max',
    );
    assert.equal(
      clipQuotedHistory(
        'Short reply\n\nFrom: Max Muster <max@example.com>\nSent: Monday, 2 January 2026 09:11\nTo: Bot <bot@example.com>\nSubject: Old question\n\nOld thread',
      ),
      'Short reply',
    );
    assert.equal(
      clipQuotedHistory(
        'Neue Zeile\n-----Ursprüngliche Nachricht-----\nVon: Max Muster <max@example.com>\nGesendet: Montag, 2. Januar 2026 09:11\n\nAlter Text',
      ),
      'Neue Zeile',
    );
  });

  it('stellt Re: voran, außer bei Re:/AW:', () => {
    assert.equal(replySubject('Frage zum Angebot'), 'Re: Frage zum Angebot');
    assert.equal(replySubject('re: schon da'), 're: schon da');
    assert.equal(replySubject('RE: Groß'), 'RE: Groß');
    assert.equal(replySubject('AW: Deutsch'), 'AW: Deutsch');
    assert.equal(replySubject('aw: klein'), 'aw: klein');
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
    const mk = (uid: number, iso: string, extra: Partial<Stored> = {}): Stored => ({
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
      ...extra,
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

  it('filtert since über internalDate, nicht über Date-Header', async () => {
    const mk = (uid: number, headerIso: string, internalIso: string): Stored => ({
      uid,
      date: new Date(headerIso),
      internalDate: new Date(internalIso),
      flags: new Set(),
      source: mime(
        `From: a@example.com\r\nTo: b@example.com\r\nSubject: S${uid}\r\nMessage-ID: <${uid}@example.com>\r\nDate: ${new Date(headerIso).toUTCString()}`,
        `body ${uid}`,
      ),
      envelope: {
        date: new Date(headerIso),
        subject: `S${uid}`,
        messageId: `<${uid}@example.com>`,
        from: [{ address: 'a@example.com' }],
        to: [{ address: 'b@example.com' }],
        cc: [],
      },
    });
    const mock = createMockImap({
      inbox: [
        mk(10, '2026-01-03T12:00:00.000Z', '2026-01-01T08:00:00.000Z'),
        mk(11, '2025-12-01T12:00:00.000Z', '2026-01-03T08:00:00.000Z'),
      ],
    });
    const result = await listInboxWatch({
      since: new Date('2026-01-02T00:00:00.000Z'),
      konten: ['hello'],
      limit: 10,
      cursor: null,
    }, runtimeFor(mock.client));
    assert.deepEqual(result.mails.map((m) => m.id), ['hello:11']);
    assert.equal(result.mails[0]!.datum, '2026-01-03T08:00:00.000Z');
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
        references: '<root@example.com>',
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
      betreff: 'Frage',
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
    const extras: Stored[] = [2, 3, 5, 6, 7].map((uid) => ({
      uid,
      date: new Date('2026-01-01T09:00:00.000Z'),
      flags: new Set(),
      source: mime(`From: other@example.com\r\nTo: bot@example.com\r\nSubject: Andere\r\nMessage-ID: <other-${uid}@example.com>\r\nDate: Wed, 01 Jan 2026 09:00:00 +0000`, 'andere'),
      envelope: {
        date: new Date('2026-01-01T09:00:00.000Z'),
        subject: 'Andere',
        messageId: `<other-${uid}@example.com>`,
        from: [{ address: 'other@example.com' }],
        to: [{ address: 'bot@example.com' }],
        cc: [],
      },
    }));
    const original: Stored = {
      uid: 4,
      date: new Date('2026-01-01T10:00:00.000Z'),
      flags: new Set(),
      source: mime(
        [
          'From: Ada <ada@example.com>',
          'To: Bot <bot@example.com>',
          'Subject: Frage',
          'Message-ID: <orig@example.com>',
          'References: <root@example.com>',
          'Date: Wed, 01 Jan 2026 10:00:00 +0000',
        ].join('\r\n'),
        'Original',
      ),
      references: '<root@example.com>',
      envelope: {
        date: new Date('2026-01-01T10:00:00.000Z'),
        subject: 'Frage',
        messageId: '<orig@example.com>',
        inReplyTo: '<root@example.com>',
        from: [{ address: 'ada@example.com' }],
        to: [{ address: 'bot@example.com' }],
        cc: [],
      },
    };
    const mock = createMockImap({ inbox: [...extras, original] });
    await appendInboxWatchDraft({
      konto: 'hello',
      an: 'ada@example.com',
      betreff: 'Frage',
      text: 'Antworttext',
      thread_id: 'root@example.com',
    }, runtimeFor(mock.client));
    const raw = mock.appends[0]!.raw.toString('utf8');
    assert.match(raw, /In-Reply-To:.*<orig@example.com>/i);
    assert.match(raw, /References:/i);
    assert.match(raw, /Subject: Re: Frage/);
    assert.ok(!mock.appends[0]!.flags?.includes('\\Seen'));
    assert.ok(!mock.appends[0]!.flags?.includes('\\Deleted'));
    assert.ok(mock.searches.some((s) => s.query.header && Object.keys(s.query.header).some((k) => k.toLowerCase() === 'message-id')));
    assert.ok(mock.searches.some((s) => s.query.header && Object.keys(s.query.header).some((k) => k.toLowerCase() === 'references')));
    const replyFetches = mock.fetches.filter((f) => Array.isArray(f.uids) && (f.uids as number[]).includes(4));
    assert.ok(replyFetches.length > 0);
    assert.ok(replyFetches.every((f) => f.query.source !== true && f.query.headers));
    const fetchedUids = replyFetches.flatMap((f) => Array.isArray(f.uids) ? f.uids as number[] : []);
    assert.ok(!fetchedUids.includes(2));
    assert.ok(!fetchedUids.includes(7));
    assert.ok(!('source' in HEADER_PEEK_QUERY));
  });

  it('nimmt UID nur aus INBOX, nicht aus Gesendet', async () => {
    const inboxMail: Stored = {
      uid: 3,
      date: new Date('2026-01-01T10:00:00.000Z'),
      flags: new Set(),
      source: mime('From: inbox@example.com\r\nTo: bot@example.com\r\nSubject: Inbox\r\nMessage-ID: <inbox-only@example.com>\r\nDate: Wed, 01 Jan 2026 10:00:00 +0000', 'inbox'),
      references: '<root-inbox@example.com>',
      envelope: {
        date: new Date('2026-01-01T10:00:00.000Z'),
        subject: 'Inbox',
        messageId: '<inbox-only@example.com>',
        from: [{ address: 'inbox@example.com' }],
        to: [{ address: 'bot@example.com' }],
        cc: [],
      },
    };
    const sentMail: Stored = {
      uid: 3,
      date: new Date('2026-01-01T11:00:00.000Z'),
      flags: new Set(),
      source: mime('From: sent@example.com\r\nTo: kunde@example.com\r\nSubject: Gesendet\r\nMessage-ID: <sent-fremd@example.com>\r\nDate: Wed, 01 Jan 2026 11:00:00 +0000', 'sent'),
      references: '<root-sent@example.com>',
      envelope: {
        date: new Date('2026-01-01T11:00:00.000Z'),
        subject: 'Gesendet',
        messageId: '<sent-fremd@example.com>',
        from: [{ address: 'sent@example.com' }],
        to: [{ address: 'kunde@example.com' }],
        cc: [],
      },
    };
    const sameUid = createMockImap({ inbox: [inboxMail], sent: [sentMail] });
    await appendInboxWatchDraft({
      konto: 'hello',
      an: 'inbox@example.com',
      betreff: 'AW: schon da',
      text: 'ok',
      in_reply_to: 'hello:3',
    }, runtimeFor(sameUid.client));
    const used = sameUid.appends[0]!.raw.toString('utf8');
    assert.match(used, /In-Reply-To:.*<inbox-only@example.com>/i);
    assert.doesNotMatch(used, /sent-fremd@example.com/i);
    assert.match(used, /Subject: AW: schon da/);
    assert.ok(sameUid.opens.every((o) => o.path === 'INBOX' || o.path.includes('Draft')));

    const missingUid = createMockImap({ inbox: [], sent: [{ ...sentMail, uid: 9 }] });
    await assert.rejects(
      () => appendInboxWatchDraft({
        konto: 'hello',
        an: 'kunde@example.com',
        betreff: 'Frage',
        text: 'ok',
        in_reply_to: '9',
      }, runtimeFor(missingUid.client)),
      (err: unknown) => err instanceof InboxWatchError && err.status === 404,
    );
    assert.equal(missingUid.appends.length, 0);
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
