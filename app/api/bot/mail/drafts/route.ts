import { NextRequest, NextResponse } from 'next/server';
import {
  auditBotMail,
  botForbidden,
  requireBotMailAuth,
} from '@/lib/bot/mail-auth';
import { saveDraft, sendMail } from '@/lib/mail/send';
import { SecretDecryptError } from '@/lib/crypto/secret-box';
import { parseAddressField } from '@/lib/mail/thread';

export const runtime = 'nodejs';
export const maxDuration = 30;

type Body = {
  mailbox_id?: string;
  draft_id?: string | null;
  to?: unknown;
  cc?: unknown;
  subject?: string;
  text?: string;
  in_reply_to?: string | null;
  references?: string | null;
  /** Nur wenn MAIL_BOT_ALLOW_SEND=true */
  send?: boolean;
};

/**
 * POST /api/bot/mail/drafts
 * Default: Entwurf speichern. send:true nur mit MAIL_BOT_ALLOW_SEND=true.
 */
export async function POST(req: NextRequest) {
  const auth = await requireBotMailAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.mailbox_id) {
    return NextResponse.json({ error: 'mailbox_id fehlt' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text : '';
  if (text.length > auth.maxBodyChars) {
    return NextResponse.json(
      { error: `text zu lang (max ${auth.maxBodyChars})` },
      { status: 400 },
    );
  }

  const to = parseAddressField(body.to);
  const cc = parseAddressField(body.cc);
  const subject = typeof body.subject === 'string' ? body.subject : '';
  const wantSend = body.send === true;

  if (wantSend && !auth.allowSend) {
    return botForbidden('Senden ist für den Mail-Bot deaktiviert');
  }

  try {
    if (wantSend) {
      const result = await sendMail({
        mailboxId: body.mailbox_id,
        userId: auth.userId,
        to,
        cc,
        subject,
        text,
        isHtml: false,
        inReplyTo: body.in_reply_to ?? null,
        references: body.references ?? null,
        draftId: body.draft_id ?? null,
      });
      await auditBotMail(
        auth,
        'bot.mail.send',
        {
          mailbox_id: body.mailbox_id,
          to_count: to.length,
          cc_count: cc.length,
        },
        result.messageId,
      );
      return NextResponse.json({
        ok: true,
        sent: true,
        message_id: result.messageId,
      });
    }

    const row = await saveDraft({
      mailboxId: body.mailbox_id,
      userId: auth.userId,
      draftId: body.draft_id,
      to,
      cc,
      subject,
      text,
      inReplyTo: body.in_reply_to,
      references: body.references,
    });
    await auditBotMail(
      auth,
      'bot.mail.draft',
      { mailbox_id: body.mailbox_id },
      row.id,
    );
    return NextResponse.json({ ok: true, sent: false, id: row.id });
  } catch (err) {
    if (err instanceof SecretDecryptError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Fehlgeschlagen';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
