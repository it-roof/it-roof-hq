import { NextRequest, NextResponse } from 'next/server';
import { requireInboxWatchToken } from '@/lib/auth/require-inbox-watch-token';
import { SecretDecryptError } from '@/lib/crypto/secret-box';
import {
  InboxWatchError,
  listInboxWatch,
  parseCursor,
  parseKontenQuery,
  parseLimit,
  parseSince,
} from '@/lib/mail/inbox-watch';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const auth = requireInboxWatchToken(req);
  if (!auth.ok) return auth.response;

  const since = parseSince(req.nextUrl.searchParams.get('since'));
  if (!since) {
    return NextResponse.json({ error: 'since muss ein ISO-Datum sein' }, { status: 400 });
  }
  const konten = parseKontenQuery(req.nextUrl.searchParams.get('konto'));
  if (!konten) {
    return NextResponse.json({ error: 'Ungültiges Konto' }, { status: 400 });
  }
  const cursorRaw = req.nextUrl.searchParams.get('cursor');
  const cursor = cursorRaw ? parseCursor(cursorRaw) : null;
  if (cursorRaw && !cursor) {
    return NextResponse.json({ error: 'Ungültiger Cursor' }, { status: 400 });
  }

  try {
    const result = await listInboxWatch({
      since,
      konten,
      limit: parseLimit(req.nextUrl.searchParams.get('limit')),
      cursor,
    });
    return NextResponse.json(result);
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
