import { NextRequest, NextResponse } from 'next/server';
import {
  auditBotMail,
  requireBotMailAuth,
} from '@/lib/bot/mail-auth';
import { listMailboxes } from '@/lib/mail/mailbox';

export const runtime = 'nodejs';

/** GET /api/bot/mail/mailboxes — Postfächer des Bot-Users */
export async function GET(req: NextRequest) {
  const auth = await requireBotMailAuth(req);
  if (auth instanceof NextResponse) return auth;

  const rows = await listMailboxes(auth.userId);
  await auditBotMail(auth, 'bot.mail.list_mailboxes', { count: rows.length });

  return NextResponse.json({
    mailboxes: rows.map((b) => ({
      id: b.id,
      email: b.email,
      display_name: b.display_name,
      last_sync_at: b.last_sync_at,
      last_sync_error: b.last_sync_error,
    })),
  });
}
