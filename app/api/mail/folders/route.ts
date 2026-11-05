import { NextRequest, NextResponse } from 'next/server';
import { requireSession, unauthorized } from '@/lib/auth/require-session';
import { listFolders } from '@/lib/mail/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const mailboxId = req.nextUrl.searchParams.get('mailbox_id');
  const folders = await listFolders(session.user.id, mailboxId);
  return NextResponse.json(folders, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
