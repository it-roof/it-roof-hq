import { NextRequest, NextResponse } from 'next/server';
import {
  auditBotMail,
  requireBotMailAuth,
} from '@/lib/bot/mail-auth';
import { toBotListItem, toBotMessage } from '@/lib/bot/mail-format';
import {
  deleteMessage,
  moveMessage,
  moveMessageByRole,
  setMessageFlags,
} from '@/lib/mail/actions';
import { getMessage, getThreadMessages } from '@/lib/mail/queries';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/bot/mail/messages/:id
 * ?thread=1 → Nachricht + Thread (Bodies nur für die Hauptnachricht + Thread-Items als Liste)
 * ?thread=full → alle Thread-Mails mit body_text
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireBotMailAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const mode = req.nextUrl.searchParams.get('thread');

  const row = await getMessage(id, auth.userId);
  if (!row) {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  }

  const message = toBotMessage(row, auth.maxBodyChars);

  if (mode === 'full') {
    const threadRows = await getThreadMessages(row.thread_id, auth.userId);
    const thread = [];
    for (const item of [...threadRows].reverse()) {
      const detail = await getMessage(item.id, auth.userId);
      if (detail) thread.push(toBotMessage(detail, auth.maxBodyChars));
    }
    await auditBotMail(
      auth,
      'bot.mail.get_thread_full',
      { thread_id: row.thread_id, count: thread.length },
      id,
    );
    return NextResponse.json({ message, thread });
  }

  if (mode === '1' || mode === 'true') {
    const thread = (await getThreadMessages(row.thread_id, auth.userId)).map(
      toBotListItem,
    );
    await auditBotMail(
      auth,
      'bot.mail.get_thread',
      { thread_id: row.thread_id, count: thread.length },
      id,
    );
    return NextResponse.json({ message, thread });
  }

  await auditBotMail(auth, 'bot.mail.get_message', undefined, id);
  return NextResponse.json({ message });
}

type PatchBody = {
  seen?: boolean;
  flagged?: boolean;
  /** Zielordner-ID (gleiches Postfach) */
  folder_id?: string;
  /** Convenience: archive | trash | inbox | junk */
  move_to?: 'archive' | 'trash' | 'inbox' | 'junk';
};

/**
 * PATCH /api/bot/mail/messages/:id
 * Flags setzen und/oder verschieben.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireBotMailAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'JSON-Body erforderlich' }, { status: 400 });
  }

  const hasFlags = body.seen != null || body.flagged != null;
  const hasMove = Boolean(body.folder_id || body.move_to);
  if (!hasFlags && !hasMove) {
    return NextResponse.json(
      { error: 'seen, flagged, folder_id oder move_to erforderlich' },
      { status: 400 },
    );
  }

  try {
    if (hasFlags) {
      const ok = await setMessageFlags({
        messageId: id,
        userId: auth.userId,
        seen: body.seen,
        flagged: body.flagged,
      });
      if (!ok) {
        return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
      }
    }

    let moveResult: unknown = null;
    if (body.move_to) {
      moveResult = await moveMessageByRole({
        messageId: id,
        userId: auth.userId,
        role: body.move_to,
      });
      if (!moveResult) {
        return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
      }
    } else if (body.folder_id) {
      moveResult = await moveMessage({
        messageId: id,
        userId: auth.userId,
        targetFolderId: body.folder_id,
      });
      if (!moveResult) {
        return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
      }
    }

    await auditBotMail(
      auth,
      'bot.mail.patch_message',
      {
        seen: body.seen ?? null,
        flagged: body.flagged ?? null,
        folder_id: body.folder_id ?? null,
        move_to: body.move_to ?? null,
        move: moveResult,
      },
      id,
    );

    const updated = await getMessage(id, auth.userId);
    return NextResponse.json({
      ok: true,
      message: updated ? toBotMessage(updated, auth.maxBodyChars) : null,
      move: moveResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Patch fehlgeschlagen';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * DELETE /api/bot/mail/messages/:id
 * → Papierkorb; nochmal aus Papierkorb = endgültig.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireBotMailAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  try {
    const result = await deleteMessage({
      messageId: id,
      userId: auth.userId,
    });
    if (!result) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
    }
    await auditBotMail(
      auth,
      result.permanent ? 'bot.mail.delete_permanent' : 'bot.mail.delete_trash',
      result,
      id,
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Löschen fehlgeschlagen';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
