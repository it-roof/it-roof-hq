import { NextRequest, NextResponse } from 'next/server';
import {
  auditBotMail,
  requireBotMailAuth,
} from '@/lib/bot/mail-auth';
import { getAttachment } from '@/lib/mail/queries';

export const runtime = 'nodejs';
export const maxDuration = 30;

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * GET /api/bot/mail/attachments/:id
 * Liefert Metadaten + Base64-Inhalt (Größenlimit).
 * Query: ?meta=1 → nur Metadaten ohne Inhalt.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireBotMailAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const metaOnly = req.nextUrl.searchParams.get('meta') === '1';
  const att = await getAttachment(id, auth.userId);
  if (!att) {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  }

  const maxBytes = Math.min(
    Math.max(Number(process.env.MAIL_BOT_MAX_ATTACHMENT_BYTES) || DEFAULT_MAX_BYTES, 64_000),
    10 * 1024 * 1024,
  );

  const base = {
    id: att.id,
    filename: att.filename,
    content_type: att.contentType,
    size: att.size,
  };

  if (metaOnly) {
    await auditBotMail(auth, 'bot.mail.attachment_meta', base, id);
    return NextResponse.json({ attachment: base });
  }

  if (!att.contentBase64) {
    return NextResponse.json(
      { error: 'Inhalt nicht verfügbar — zuerst Sync' },
      { status: 404 },
    );
  }

  if (att.size > maxBytes) {
    await auditBotMail(
      auth,
      'bot.mail.attachment_too_large',
      { ...base, max_bytes: maxBytes },
      id,
    );
    return NextResponse.json(
      {
        error: 'Anhang zu groß für Bot-API',
        attachment: base,
        max_bytes: maxBytes,
      },
      { status: 413 },
    );
  }

  await auditBotMail(auth, 'bot.mail.attachment_get', base, id);
  return NextResponse.json({
    attachment: {
      ...base,
      content_base64: att.contentBase64,
    },
  });
}
