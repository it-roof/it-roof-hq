import { NextResponse } from 'next/server';
import {
  bearerRateLimited,
  bearerUnauthorized,
  requireBearerToken,
} from '@/lib/auth/require-bearer-token';

export function scoutUnauthorized() {
  return bearerUnauthorized();
}

export function scoutRateLimited() {
  return bearerRateLimited();
}

/** Bearer gegen SCOUT_API_TOKEN_SHA256 (Hex-SHA-256). Token wird nicht geloggt. */
export function requireScoutToken(req: Request): { ok: true } | { ok: false; response: NextResponse } {
  return requireBearerToken(req, 'SCOUT_API_TOKEN_SHA256', 'scout');
}
