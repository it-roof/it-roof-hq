import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { mailbox, mailboxAttachment, mailboxFolder, mailboxMessage } from '@/lib/schema';
import { sanitizeMailHtml } from '@/lib/mail/sanitize';
import { parseAddressList } from '@/lib/mail/thread';
import type { MailFolder, MailMessageDetail, MailMessageListItem } from '@/lib/mail/types';

export async function listFolders(userId: string, mailboxId?: string | null): Promise<MailFolder[]> {
  const boxes = await db.select({ id: mailbox.id }).from(mailbox).where(
    mailboxId ? and(eq(mailbox.id, mailboxId), eq(mailbox.userId, userId)) : eq(mailbox.userId, userId),
  );
  const ids = boxes.map(b => b.id);
  if (!ids.length) return [];

  const folders = await db.select().from(mailboxFolder).where(inArray(mailboxFolder.mailboxId, ids));
  if (!folders.length) return [];

  const unreadRows = await db
    .select({
      folderId: mailboxMessage.folderId,
      unread: sql<number>`count(*) filter (where ${mailboxMessage.seen} = false)::int`,
    })
    .from(mailboxMessage)
    .where(inArray(mailboxMessage.folderId, folders.map(f => f.id)))
    .groupBy(mailboxMessage.folderId);
  const unread = new Map(unreadRows.map(r => [r.folderId, Number(r.unread)]));

  const roleOrder: Record<string, number> = {
    inbox: 0, drafts: 1, sent: 2, archive: 3, junk: 4, trash: 5, other: 6,
  };

  return folders
    .map(f => ({
      id: f.id,
      mailbox_id: f.mailboxId,
      imap_path: f.imapPath,
      name: f.name,
      role: f.role,
      unread: unread.get(f.id) ?? 0,
    }))
    .sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9) || a.name.localeCompare(b.name, 'de'));
}

export async function listMessages(opts: {
  userId: string;
  mailboxId?: string | null;
  folderId?: string | null;
  role?: string | null;
  q?: string | null;
  threaded?: boolean;
  limit?: number;
}): Promise<MailMessageListItem[]> {
  const boxes = await db
    .select({ id: mailbox.id, email: mailbox.email })
    .from(mailbox)
    .where(
      opts.mailboxId
        ? and(eq(mailbox.id, opts.mailboxId), eq(mailbox.userId, opts.userId))
        : eq(mailbox.userId, opts.userId),
    );
  if (!boxes.length) return [];
  const boxMap = new Map(boxes.map(b => [b.id, b.email]));

  const folders = await db
    .select()
    .from(mailboxFolder)
    .where(inArray(mailboxFolder.mailboxId, boxes.map(b => b.id)));
  const folderMap = new Map(folders.map(f => [f.id, f]));
  let folderIds = folders.map(f => f.id);
  if (opts.folderId) folderIds = folderIds.filter(id => id === opts.folderId);
  else if (opts.role) folderIds = folders.filter(f => f.role === opts.role).map(f => f.id);
  else folderIds = folders.filter(f => f.role === 'inbox').map(f => f.id);
  if (!folderIds.length) return [];

  // Gesendet/Entwürfe einzeln anzeigen — Threading würde mehrere Outbound-Mails
  // mit gleichem Verlauf zu einem Inbox-ähnlichen Eintrag zusammenziehen.
  const threaded = Boolean(opts.threaded) && opts.role !== 'sent' && opts.role !== 'drafts'
    && !folders.some(f => f.id === opts.folderId && (f.role === 'sent' || f.role === 'drafts'));

  const filters = [inArray(mailboxMessage.folderId, folderIds)];
  const q = opts.q?.trim();
  if (q) {
    const like = `%${q}%`;
    filters.push(or(
      ilike(mailboxMessage.subject, like),
      ilike(mailboxMessage.fromName, like),
      ilike(mailboxMessage.fromAddress, like),
      ilike(mailboxMessage.snippet, like),
      ilike(mailboxMessage.textBody, like),
    )!);
  }

  const rows = await db
    .select({
      id: mailboxMessage.id,
      mailboxId: mailboxMessage.mailboxId,
      folderId: mailboxMessage.folderId,
      threadId: mailboxMessage.threadId,
      fromName: mailboxMessage.fromName,
      fromAddress: mailboxMessage.fromAddress,
      toAddresses: mailboxMessage.toAddresses,
      subject: mailboxMessage.subject,
      date: mailboxMessage.date,
      seen: mailboxMessage.seen,
      flagged: mailboxMessage.flagged,
      draft: mailboxMessage.draft,
      snippet: mailboxMessage.snippet,
      hasAttachments: mailboxMessage.hasAttachments,
    })
    .from(mailboxMessage)
    .where(and(...filters))
    .orderBy(desc(mailboxMessage.date))
    .limit(threaded ? 400 : (opts.limit ?? 120));

  const mapped = rows.map(r => ({
    id: r.id,
    mailbox_id: r.mailboxId,
    mailbox_email: boxMap.get(r.mailboxId) ?? '',
    folder_id: r.folderId,
    folder_role: folderMap.get(r.folderId)?.role ?? 'other',
    thread_id: r.threadId,
    from_name: r.fromName,
    from_address: r.fromAddress,
    to_addresses: parseAddressList(r.toAddresses),
    subject: r.subject,
    date: r.date ? r.date.toISOString() : null,
    seen: r.seen,
    flagged: r.flagged,
    draft: r.draft,
    snippet: r.snippet,
    has_attachments: r.hasAttachments,
    thread_count: 1,
  }));

  if (!threaded) return mapped.slice(0, opts.limit ?? 120);

  const byThread = new Map<string, MailMessageListItem[]>();
  for (const m of mapped) {
    const list = byThread.get(m.thread_id) ?? [];
    list.push(m);
    byThread.set(m.thread_id, list);
  }
  return [...byThread.values()]
    .map(list => {
      const latest = list[0]!;
      return { ...latest, thread_count: list.length, seen: list.every(m => m.seen) };
    })
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, opts.limit ?? 120);
}

export async function getMessage(id: string, userId: string): Promise<MailMessageDetail | null> {
  const [row] = await db
    .select({
      msg: mailboxMessage,
      folderRole: mailboxFolder.role,
      mailboxEmail: mailbox.email,
      mailboxUser: mailbox.userId,
    })
    .from(mailboxMessage)
    .innerJoin(mailboxFolder, eq(mailboxFolder.id, mailboxMessage.folderId))
    .innerJoin(mailbox, eq(mailbox.id, mailboxMessage.mailboxId))
    .where(eq(mailboxMessage.id, id))
    .limit(1);
  if (!row || row.mailboxUser !== userId) return null;

  const attachments = await db
    .select({
      id: mailboxAttachment.id,
      filename: mailboxAttachment.filename,
      contentType: mailboxAttachment.contentType,
      size: mailboxAttachment.size,
    })
    .from(mailboxAttachment)
    .where(eq(mailboxAttachment.messageId, id));

  const m = row.msg;
  return {
    id: m.id,
    mailbox_id: m.mailboxId,
    mailbox_email: row.mailboxEmail,
    folder_id: m.folderId,
    folder_role: row.folderRole,
    thread_id: m.threadId,
    from_name: m.fromName,
    from_address: m.fromAddress,
    to_addresses: parseAddressList(m.toAddresses),
    cc_addresses: parseAddressList(m.ccAddresses),
    subject: m.subject,
    date: m.date ? m.date.toISOString() : null,
    seen: m.seen,
    flagged: m.flagged,
    draft: m.draft,
    snippet: m.snippet,
    has_attachments: m.hasAttachments,
    thread_count: 1,
    text_body: m.textBody,
    html_body: m.htmlBody ? sanitizeMailHtml(m.htmlBody) : null,
    message_id_header: m.messageIdHeader,
    in_reply_to: m.inReplyTo,
    attachments: attachments.map(a => ({
      id: a.id,
      filename: a.filename,
      content_type: a.contentType,
      size: a.size,
    })),
  };
}

export async function getThreadMessages(threadId: string, userId: string): Promise<MailMessageListItem[]> {
  const boxes = await db.select({ id: mailbox.id, email: mailbox.email }).from(mailbox).where(eq(mailbox.userId, userId));
  if (!boxes.length) return [];
  const boxMap = new Map(boxes.map(b => [b.id, b.email]));
  const folders = await db.select().from(mailboxFolder).where(inArray(mailboxFolder.mailboxId, boxes.map(b => b.id)));
  const folderMap = new Map(folders.map(f => [f.id, f]));
  const rows = await db
    .select()
    .from(mailboxMessage)
    .where(and(eq(mailboxMessage.threadId, threadId), inArray(mailboxMessage.mailboxId, boxes.map(b => b.id))))
    .orderBy(desc(mailboxMessage.date));
  return rows.map(r => ({
    id: r.id,
    mailbox_id: r.mailboxId,
    mailbox_email: boxMap.get(r.mailboxId) ?? '',
    folder_id: r.folderId,
    folder_role: folderMap.get(r.folderId)?.role ?? 'other',
    thread_id: r.threadId,
    from_name: r.fromName,
    from_address: r.fromAddress,
    to_addresses: parseAddressList(r.toAddresses),
    subject: r.subject,
    date: r.date ? r.date.toISOString() : null,
    seen: r.seen,
    flagged: r.flagged,
    draft: r.draft,
    snippet: r.snippet,
    has_attachments: r.hasAttachments,
    thread_count: 1,
  }));
}

export async function getAttachment(id: string, userId: string) {
  const [row] = await db
    .select({
      att: mailboxAttachment,
      userId: mailbox.userId,
    })
    .from(mailboxAttachment)
    .innerJoin(mailboxMessage, eq(mailboxMessage.id, mailboxAttachment.messageId))
    .innerJoin(mailbox, eq(mailbox.id, mailboxMessage.mailboxId))
    .where(eq(mailboxAttachment.id, id))
    .limit(1);
  if (!row || row.userId !== userId) return null;
  return row.att;
}
