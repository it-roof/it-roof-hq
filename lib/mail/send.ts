import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mailboxFolder, mailboxMessage } from '@/lib/schema';
import { getMailboxCredentials, type MailboxCredentials } from '@/lib/mail/mailbox';
import { folderRole, withImap } from '@/lib/mail/imap';
import { buildOutgoingBodies } from '@/lib/mail/compose-body';
import {
  formatMessageId,
  messageIdFromRaw,
  messageIdVariants,
  snippetFrom,
  stringifyAddressList,
  threadIdFromHeaders,
} from '@/lib/mail/thread';

type Addr = { name?: string | null; address: string };

function toComposerAddr(a: Addr) {
  return a.name ? { name: a.name, address: a.address } : a.address;
}

async function ensureSentFolder(creds: MailboxCredentials) {
  const rows = await db
    .select()
    .from(mailboxFolder)
    .where(and(eq(mailboxFolder.mailboxId, creds.id), eq(mailboxFolder.role, 'sent')));
  const real = rows.find(f => !f.imapPath.startsWith('__local_'));
  if (real) return real;

  try {
    const fromImap = await withImap(creds, async client => {
      const listed = await client.list();
      for (const box of listed) {
        if (box.flags.has('\\Noselect') || box.flags.has('\\NonExistent')) continue;
        const role = folderRole(box.path, box.specialUse, box.name);
        if (role !== 'sent') continue;
        const existing = (await db
          .select()
          .from(mailboxFolder)
          .where(and(eq(mailboxFolder.mailboxId, creds.id), eq(mailboxFolder.imapPath, box.path))))[0];
        if (existing) {
          if (existing.role !== 'sent') {
            await db.update(mailboxFolder).set({ role: 'sent', name: box.name || existing.name }).where(eq(mailboxFolder.id, existing.id));
          }
          return { ...existing, role: 'sent' };
        }
        try {
          const [created] = await db
            .insert(mailboxFolder)
            .values({
              mailboxId: creds.id,
              imapPath: box.path,
              name: box.name || 'Gesendet',
              role: 'sent',
            })
            .returning();
          return created!;
        } catch {
          const [row] = await db
            .select()
            .from(mailboxFolder)
            .where(and(eq(mailboxFolder.mailboxId, creds.id), eq(mailboxFolder.imapPath, box.path)))
            .limit(1);
          if (row) return row;
        }
      }
      return null;
    });
    if (fromImap) return fromImap;
  } catch {
    // lokale Gesendet-Kopie reicht, IMAP folgt beim Sync
  }

  if (rows[0]) return rows[0];
  const [created] = await db
    .insert(mailboxFolder)
    .values({
      mailboxId: creds.id,
      imapPath: '__local_sent__',
      name: 'Gesendet',
      role: 'sent',
    })
    .returning();
  return created!;
}

async function appendToImapSent(
  creds: MailboxCredentials,
  folderPath: string,
  raw: Buffer,
): Promise<number | null> {
  return withImap(creds, async client => {
    const tryAppend = async (path: string) => {
      const appended = await client.append(path, raw, ['\\Seen']);
      if (appended && typeof appended === 'object' && 'uid' in appended && appended.uid != null) {
        return Number(appended.uid);
      }
      return null;
    };

    try {
      return await tryAppend(folderPath);
    } catch {
      try {
        await client.mailboxCreate(folderPath);
      } catch {
        // existiert schon oder Server erlaubt kein CREATE
      }
      try {
        return await tryAppend(folderPath);
      } catch {
        const listed = await client.list();
        for (const box of listed) {
          if (box.flags.has('\\Noselect') || box.flags.has('\\NonExistent')) continue;
          if (folderRole(box.path, box.specialUse, box.name) !== 'sent') continue;
          if (box.path === folderPath) continue;
          try {
            return await tryAppend(box.path);
          } catch {
            // nächsten Sent-Pfad versuchen
          }
        }
        throw new Error(`IMAP APPEND nach ${folderPath} fehlgeschlagen`);
      }
    }
  });
}

export async function sendMail(opts: {
  mailboxId: string;
  userId: string;
  to: Addr[];
  cc?: Addr[];
  subject: string;
  text: string;
  isHtml?: boolean;
  inReplyTo?: string | null;
  references?: string | null;
  draftId?: string | null;
}) {
  const creds = await getMailboxCredentials(opts.mailboxId, opts.userId);
  if (!creds) throw new Error('Postfach nicht gefunden');
  if (!opts.to.length) throw new Error('Empfänger fehlt');

  const { html: htmlBody, text: textBody } = buildOutgoingBodies({
    text: opts.text,
    isHtml: opts.isHtml,
    signatureHtml: creds.signatureHtml,
  });

  const mailOpts = {
    from: creds.displayName ? { name: creds.displayName, address: creds.email } : creds.email,
    to: opts.to.map(toComposerAddr),
    cc: opts.cc?.length ? opts.cc.map(toComposerAddr) : undefined,
    subject: opts.subject,
    text: textBody,
    html: htmlBody,
    inReplyTo: opts.inReplyTo ?? undefined,
    references: opts.references ?? undefined,
    date: new Date(),
  };

  const raw: Buffer = await new MailComposer(mailOpts).compile().build();
  const messageId = messageIdFromRaw(raw);

  const transporter = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure: creds.smtpSecure || creds.smtpPort === 465,
    auth: { user: creds.username, pass: creds.password },
    requireTLS: !creds.smtpSecure && creds.smtpPort !== 465,
  });

  const envelopeTo = [
    ...opts.to.map(a => a.address),
    ...(opts.cc ?? []).map(a => a.address),
  ];
  const info = await transporter.sendMail({
    envelope: { from: creds.email, to: envelopeTo },
    raw,
  });

  const storedMessageId = messageId ?? formatMessageId(typeof info.messageId === 'string' ? info.messageId : null);
  const sentFolder = await ensureSentFolder(creds);

  let uid: number | null = null;
  if (sentFolder && !sentFolder.imapPath.startsWith('__local_')) {
    try {
      uid = await appendToImapSent(creds, sentFolder.imapPath, raw);
    } catch {
      // SMTP ist raus — lokale Gesendet-Kopie trotzdem speichern
    }
  }

  if (sentFolder) {
    const values = {
      mailboxId: creds.id,
      folderId: sentFolder.id,
      uid,
      messageIdHeader: storedMessageId,
      inReplyTo: formatMessageId(opts.inReplyTo) ?? opts.inReplyTo ?? null,
      referencesHeader: opts.references ?? null,
      threadId: threadIdFromHeaders(storedMessageId, opts.inReplyTo, opts.references),
      fromName: creds.displayName,
      fromAddress: creds.email,
      toAddresses: stringifyAddressList(opts.to),
      ccAddresses: stringifyAddressList(opts.cc),
      subject: opts.subject || '(Kein Betreff)',
      date: new Date(),
      seen: true,
      flagged: false,
      draft: false,
      answered: false,
      snippet: snippetFrom(textBody, htmlBody ?? null),
      textBody,
      htmlBody: htmlBody ?? null,
      hasAttachments: false,
      size: raw.length,
    };

    const variants = storedMessageId ? messageIdVariants(storedMessageId) : [];
    const existing = variants.length
      ? (await db
          .select({ id: mailboxMessage.id })
          .from(mailboxMessage)
          .where(and(
            eq(mailboxMessage.folderId, sentFolder.id),
            inArray(mailboxMessage.messageIdHeader, variants),
          ))
          .limit(1))[0]
      : undefined;

    try {
      if (existing) {
        await db.update(mailboxMessage).set({
          ...values,
          updatedAt: new Date(),
        }).where(eq(mailboxMessage.id, existing.id));
      } else {
        await db.insert(mailboxMessage).values(values);
      }
    } catch {
      // UID-Kollision mit parallel laufendem Sync — Mail liegt schon in Gesendet
    }
  }

  if (opts.draftId) {
    await db.delete(mailboxMessage).where(and(
      eq(mailboxMessage.id, opts.draftId),
      eq(mailboxMessage.mailboxId, creds.id),
    ));
  }

  return { messageId: storedMessageId ?? (info.messageId as string | undefined) };
}

export async function saveDraft(opts: {
  mailboxId: string;
  userId: string;
  draftId?: string | null;
  to: Addr[];
  cc?: Addr[];
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string | null;
}) {
  const creds = await getMailboxCredentials(opts.mailboxId, opts.userId);
  if (!creds) throw new Error('Postfach nicht gefunden');

  let drafts = (await db
    .select()
    .from(mailboxFolder)
    .where(and(eq(mailboxFolder.mailboxId, creds.id), eq(mailboxFolder.role, 'drafts'))))[0];

  if (!drafts) {
    const [created] = await db
      .insert(mailboxFolder)
      .values({
        mailboxId: creds.id,
        imapPath: '__local_drafts__',
        name: 'Entwürfe',
        role: 'drafts',
      })
      .returning();
    drafts = created!;
  }

  const values = {
    mailboxId: creds.id,
    folderId: drafts.id,
    uid: null as number | null,
    messageIdHeader: null as string | null,
    inReplyTo: formatMessageId(opts.inReplyTo) ?? opts.inReplyTo ?? null,
    referencesHeader: opts.references ?? null,
    threadId: threadIdFromHeaders(null, opts.inReplyTo ?? null, opts.references ?? null),
    fromName: creds.displayName,
    fromAddress: creds.email,
    toAddresses: stringifyAddressList(opts.to),
    ccAddresses: stringifyAddressList(opts.cc),
    subject: opts.subject || '(Kein Betreff)',
    date: new Date(),
    seen: true,
    flagged: false,
    draft: true,
    answered: false,
    snippet: opts.text.slice(0, 180) || null,
    textBody: opts.text,
    htmlBody: null as string | null,
    hasAttachments: false,
    size: opts.text.length,
    updatedAt: new Date(),
  };

  if (opts.draftId) {
    const [row] = await db
      .update(mailboxMessage)
      .set(values)
      .where(and(eq(mailboxMessage.id, opts.draftId), eq(mailboxMessage.mailboxId, creds.id)))
      .returning({ id: mailboxMessage.id });
    if (row) return row;
  }

  const [row] = await db.insert(mailboxMessage).values(values).returning({ id: mailboxMessage.id });
  return row!;
}
