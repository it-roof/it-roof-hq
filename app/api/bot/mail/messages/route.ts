import { NextRequest, NextResponse } from 'next/server';
import {
  auditBotMail,
  requireBotMailAuth,
} from '@/lib/bot/mail-auth';
import { toBotListItem } from '@/lib/bot/mail-format';
import { listMessages } from '@/lib/mail/queries';

export const runtime = 'nodejs';

const MAX_LIMIT = 50;

/** GET /api/bot/mail/messages?mailbox_id=&folder_id=&role=&q=&limit= */
export async function GET(req: NextRequest) {
  const auth = await requireBotMailAuth(req);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const limitRaw = Number(sp.get('limit')) || 25;
  const limit = Math.min(Math.max(limitRaw, 1), MAX_LIMIT);

  const messages = await listMessages({
    userId: auth.userId,
    mailboxId: sp.get('mailbox_id'),
    folderId: sp.get('folder_id'),
    role: sp.get('role'),
    q: sp.get('q'),
    threaded: sp.get('threaded') !== '0',
    limit,
  });

  await auditBotMail(auth, 'bot.mail.list_messages', {
    mailbox_id: sp.get('mailbox_id'),
    folder_id: sp.get('folder_id'),
    role: sp.get('role'),
    q: sp.get('q') ? '[set]' : null,
    count: messages.length,
    limit,
  });

  return NextResponse.json({
    messages: messages.map(toBotListItem),
  });
}
