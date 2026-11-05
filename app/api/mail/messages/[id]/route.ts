import { NextRequest, NextResponse } from 'next/server';
import { requireSession, unauthorized } from '@/lib/auth/require-session';
import { getMessage, getThreadMessages } from '@/lib/mail/queries';
import { deleteMessage, setMessageFlags } from '@/lib/mail/actions';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { id } = await params;
  const headers = { 'Cache-Control': 'no-store' };
  if (req.nextUrl.searchParams.get('thread') === '1') {
    const row = await getMessage(id, session.user.id);
    if (!row) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404, headers });
    const thread = await getThreadMessages(row.thread_id, session.user.id);
    return NextResponse.json({ message: row, thread }, { headers });
  }
  const row = await getMessage(id, session.user.id);
  if (!row) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404, headers });
  return NextResponse.json(row, { headers });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { id } = await params;
  const body = await req.json() as { seen?: boolean; flagged?: boolean };
  const ok = await setMessageFlags({
    messageId: id,
    userId: session.user.id,
    seen: body.seen,
    flagged: body.flagged,
  });
  if (!ok) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!session) return unauthorized();
  const { id } = await params;
  try {
    const result = await deleteMessage({ messageId: id, userId: session.user.id });
    if (!result) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Löschen fehlgeschlagen';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
