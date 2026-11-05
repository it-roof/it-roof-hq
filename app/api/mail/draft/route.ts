import { NextRequest, NextResponse } from 'next/server';
import { requireInboxWatchToken } from '@/lib/auth/require-inbox-watch-token';
import { SecretDecryptError } from '@/lib/crypto/secret-box';
import {
  appendInboxWatchDraft,
  InboxWatchError,
  parseKontenQuery,
} from '@/lib/mail/inbox-watch';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const auth = requireInboxWatchToken(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as {
    konto?: string;
    thread_id?: string | null;
    in_reply_to?: string | null;
    an?: unknown;
    betreff?: string;
    text?: string;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 });
  }

  const konten = parseKontenQuery(body.konto ?? '');
  if (!konten || konten.length !== 1 || body.konto == null || !String(body.konto).trim()) {
    return NextResponse.json({ error: 'Ungültiges Konto' }, { status: 400 });
  }
  if (!body.betreff?.trim() || typeof body.text !== 'string') {
    return NextResponse.json({ error: 'betreff und text sind erforderlich' }, { status: 400 });
  }

  try {
    const result = await appendInboxWatchDraft({
      konto: konten[0]!,
      an: body.an,
      betreff: body.betreff,
      text: body.text,
      thread_id: body.thread_id,
      in_reply_to: body.in_reply_to,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof InboxWatchError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof SecretDecryptError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Postfach nicht erreichbar' }, { status: 502 });
  }
}
