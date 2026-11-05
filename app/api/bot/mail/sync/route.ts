import { NextRequest, NextResponse } from 'next/server';
import {
  auditBotMail,
  requireBotMailAuth,
} from '@/lib/bot/mail-auth';
import { syncAllMailboxes, syncMailbox } from '@/lib/mail/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/bot/mail/sync
 * Body optional: { "mailbox_id": "…" }
 * Ohne mailbox_id → alle Postfächer des Bot-Users.
 */
export async function POST(req: NextRequest) {
  const auth = await requireBotMailAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as { mailbox_id?: string };

  try {
    if (body.mailbox_id) {
      const result = await syncMailbox(body.mailbox_id, auth.userId);
      await auditBotMail(
        auth,
        'bot.mail.sync_one',
        { mailbox_id: body.mailbox_id, ...result },
        body.mailbox_id,
      );
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await syncAllMailboxes(auth.userId);
    await auditBotMail(auth, 'bot.mail.sync_all', result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync fehlgeschlagen';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
