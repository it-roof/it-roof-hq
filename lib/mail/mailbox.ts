import { and, eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret, SecretDecryptError } from '@/lib/crypto/secret-box';
import { db } from '@/lib/db';
import { mailbox } from '@/lib/schema';
import type { MailboxPublic } from '@/lib/mail/types';

export type MailboxRow = typeof mailbox.$inferSelect;

export type MailboxCredentials = MailboxRow & { password: string };

function toPublic(row: MailboxRow): MailboxPublic {
  return {
    id: row.id,
    email: row.email,
    display_name: row.displayName,
    imap_host: row.imapHost,
    imap_port: row.imapPort,
    imap_secure: row.imapSecure,
    smtp_host: row.smtpHost,
    smtp_port: row.smtpPort,
    smtp_secure: row.smtpSecure,
    username: row.username,
    signature_html: row.signatureHtml,
    last_sync_at: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    last_sync_error: row.lastSyncError,
  };
}

export async function listMailboxes(userId: string): Promise<MailboxPublic[]> {
  const rows = await db.select().from(mailbox).where(eq(mailbox.userId, userId));
  return rows
    .sort((a, b) => a.email.localeCompare(b.email, 'de'))
    .map(toPublic);
}

export async function getMailboxForUser(id: string, userId: string): Promise<MailboxRow | null> {
  const [row] = await db
    .select()
    .from(mailbox)
    .where(and(eq(mailbox.id, id), eq(mailbox.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getMailboxCredentials(id: string, userId?: string): Promise<MailboxCredentials | null> {
  const [row] = await db
    .select()
    .from(mailbox)
    .where(userId ? and(eq(mailbox.id, id), eq(mailbox.userId, userId)) : eq(mailbox.id, id))
    .limit(1);
  if (!row) return null;
  return withDecryptedPassword(row);
}

export async function getMailboxCredentialsByEmail(email: string): Promise<MailboxCredentials | null> {
  const rows = await db.select().from(mailbox).where(eq(mailbox.email, email.trim().toLowerCase()));
  const row = rows.sort((a, b) => (b.lastSyncAt?.getTime() ?? 0) - (a.lastSyncAt?.getTime() ?? 0))[0];
  if (!row) return null;
  return withDecryptedPassword(row);
}

function withDecryptedPassword(row: MailboxRow): MailboxCredentials {
  try {
    return { ...row, password: decryptSecret(row.passwordEncrypted) };
  } catch (err) {
    if (err instanceof SecretDecryptError) throw err;
    throw new SecretDecryptError();
  }
}

export { toPublic as mailboxToPublic, encryptSecret };
