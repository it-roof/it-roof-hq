import { NextRequest, NextResponse } from 'next/server';
import { requireScoutToken } from '@/lib/auth/require-scout-token';

export const runtime = 'nodejs';

function notFound(req: NextRequest) {
  const auth = requireScoutToken(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
