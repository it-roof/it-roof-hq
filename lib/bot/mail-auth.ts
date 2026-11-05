import { createHash, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { writeAudit } from '@/lib/auth/audit';
import { getClientIp } from '@/lib/auth/login-rate-limit';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { checkBotRateLimit } from '@/lib/bot/mail-rate-limit';

export type BotMailAuth = {
  userId: string;
  userEmail: string;
  allowSend: boolean;
  maxBodyChars: number;
  ip: string;
};

function safeEqual(a: string, b: string) {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

function readBearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization')?.trim() ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function botUnauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function botForbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function botTooMany() {
  return NextResponse.json({ error: 'Rate limit' }, { status: 429 });
}

export function botMisconfigured() {
  return NextResponse.json(
    { error: 'Mail-Bot-API ist nicht konfiguriert' },
    { status: 503 },
  );
}

/**
 * Bearer-Token Auth für Grok/Mail-Bot.
 * Env:
 * - MAIL_BOT_TOKEN (required)
 * - MAIL_BOT_USER_EMAIL (default grokbot@it-roof.com)
 * - MAIL_BOT_ALLOW_SEND (default false)
 * - MAIL_BOT_MAX_BODY_CHARS (default 20000)
 */
export async function requireBotMailAuth(
  req: NextRequest,
): Promise<BotMailAuth | NextResponse> {
  const expected = process.env.MAIL_BOT_TOKEN?.trim() ?? '';
  if (!expected || expected.length < 32) {
    return botMisconfigured();
  }

  const token = readBearer(req);
  if (!token || !safeEqual(token, expected)) {
    const ip = await getClientIp().catch(() => 'unknown');
    await writeAudit({
      action: 'bot.mail.auth_failed',
      resource: 'bot_mail',
      meta: { ip },
      userId: null,
      userEmail: null,
    });
    return botUnauthorized();
  }

  const ip = await getClientIp().catch(() => 'unknown');
  const limited = checkBotRateLimit(ip);
  if (!limited.ok) return botTooMany();

  const email = (
    process.env.MAIL_BOT_USER_EMAIL?.trim() || 'grokbot@it-roof.com'
  ).toLowerCase();

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user?.id) {
    return NextResponse.json(
      { error: `Bot-User ${email} nicht gefunden` },
      { status: 503 },
    );
  }

  const allowSend = process.env.MAIL_BOT_ALLOW_SEND === 'true';
  const maxBodyChars = Math.min(
    Math.max(Number(process.env.MAIL_BOT_MAX_BODY_CHARS) || 20_000, 1_000),
    100_000,
  );

  return {
    userId: user.id,
    userEmail: user.email ?? email,
    allowSend,
    maxBodyChars,
    ip,
  };
}

export async function auditBotMail(
  auth: BotMailAuth,
  action: string,
  meta?: Record<string, unknown>,
  resourceId?: string,
) {
  await writeAudit({
    action,
    resource: 'bot_mail',
    resourceId,
    meta: { ...meta, ip: auth.ip },
    userId: auth.userId,
    userEmail: auth.userEmail,
  });
}
