import { NextResponse } from 'next/server';
import { requireBearerToken } from '@/lib/auth/require-bearer-token';

/** Bearer gegen KANZLEI_MAIL_API_TOKEN_SHA256 (Hex-SHA-256). Token wird nicht geloggt. */
export function requireKanzleiMailToken(
  req: Request,
): { ok: true } | { ok: false; response: NextResponse } {
  return requireBearerToken(req, 'KANZLEI_MAIL_API_TOKEN_SHA256', 'kanzlei-mail');
}
