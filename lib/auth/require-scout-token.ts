import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

const WINDOW_MS = 60_000;
const MAX_HITS = 60;
const hits = new Map<string, number[]>();

function clientIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  return (req.headers.get('x-real-ip') ?? 'unknown').slice(0, 128);
}

function allowRate(ip: string) {
  const now = Date.now();
  const prev = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (prev.length >= MAX_HITS) {
    hits.set(ip, prev);
    return false;
  }
  prev.push(now);
  hits.set(ip, prev);
  return true;
}

function tokenMatches(rawToken: string, expectedHex: string) {
  if (!/^[0-9a-f]{64}$/i.test(expectedHex)) return false;
  const actual = createHash('sha256').update(rawToken, 'utf8').digest();
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function scoutUnauthorized() {
  return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
}

export function scoutRateLimited() {
  return NextResponse.json({ error: 'Zu viele Anfragen' }, { status: 429 });
}

/** Bearer gegen SCOUT_API_TOKEN_SHA256 (Hex-SHA-256). Token wird nicht geloggt. */
export function requireScoutToken(req: Request): { ok: true } | { ok: false; response: NextResponse } {
  const ip = clientIp(req);
  if (!allowRate(ip)) return { ok: false, response: scoutRateLimited() };

  const header = req.headers.get('authorization') ?? '';
  const raw = /^Bearer\s+(\S+)/i.exec(header)?.[1] ?? '';
  const expected = (process.env.SCOUT_API_TOKEN_SHA256 ?? '').trim();
  if (!raw || !expected || !tokenMatches(raw, expected)) {
    return { ok: false, response: scoutUnauthorized() };
  }
  return { ok: true };
}
