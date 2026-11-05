import { NextRequest, NextResponse } from 'next/server';
import { requireKanzleiMailToken } from '@/lib/auth/require-kanzlei-mail-token';

export const runtime = 'nodejs';

function notFound(req: NextRequest) {
  const auth = requireKanzleiMailToken(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
}

export const GET = notFound;
export const POST = notFound;
