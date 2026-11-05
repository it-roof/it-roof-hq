import { NextRequest, NextResponse } from 'next/server';
import { requireSession, unauthorized } from '@/lib/auth/require-session';
import { listMessages } from '@/lib/mail/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const sp = req.nextUrl.searchParams;
  const messages = await listMessages({
    userId: session.user.id,
    mailboxId: sp.get('mailbox_id'),
    folderId: sp.get('folder_id'),
    role: sp.get('role'),
    q: sp.get('q'),
    threaded: sp.get('threaded') !== '0',
    limit: Number(sp.get('limit')) || 120,
  });
  return NextResponse.json(messages, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
