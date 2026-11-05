import { NextResponse } from 'next/server';

export function pgErrorCode(e: unknown): string | null {
  let cur: unknown = e;
  for (let i = 0; i < 6 && cur && typeof cur === 'object'; i += 1) {
    const rec = cur as { code?: unknown; cause?: unknown };
    if (typeof rec.code === 'string' && /^[0-9A-Z]{5}$/.test(rec.code)) {
      return rec.code;
    }
    cur = rec.cause;
  }
  return null;
}

export function botCatchResponse(e: unknown, logLabel: string): NextResponse {
  const code = pgErrorCode(e);
  if (code) {
    console.error(logLabel, code);
    if (code === '23505') {
      return NextResponse.json({ error: 'Konflikt' }, { status: 409 });
    }
    if (code === '23502' || code === '23503' || code === '23514' || code === 'P0001') {
      return NextResponse.json({ error: 'Ungültige Daten' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 });
  }
  if (e instanceof Error) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  console.error(logLabel, 'unknown');
  return NextResponse.json({ error: 'Serverfehler' }, { status: 500 });
}
