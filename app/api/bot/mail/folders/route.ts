import { NextRequest, NextResponse } from 'next/server';
import {
  auditBotMail,
  requireBotMailAuth,
} from '@/lib/bot/mail-auth';
import { listFolders } from '@/lib/mail/queries';

export const runtime = 'nodejs';

/** GET /api/bot/mail/folders?mailbox_id= */
export async function GET(req: NextRequest) {
  const auth = await requireBotMailAuth(req);
  if (auth instanceof NextResponse) return auth;

  const mailboxId = req.nextUrl.searchParams.get('mailbox_id');
  const folders = await listFolders(auth.userId, mailboxId);
  await auditBotMail(auth, 'bot.mail.list_folders', {
    mailbox_id: mailboxId,
    count: folders.length,
  });

  return NextResponse.json({
    folders: folders.map((f) => ({
      id: f.id,
      mailbox_id: f.mailbox_id,
      name: f.name,
      role: f.role,
      unread: f.unread,
    })),
  });
}
