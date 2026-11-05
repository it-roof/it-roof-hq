import { NextRequest, NextResponse } from 'next/server';
import { requireBotMailAuth } from '@/lib/bot/mail-auth';

export const runtime = 'nodejs';

/**
 * GET /api/bot/mail — Tool-Katalog für den Agenten (Capabilities).
 */
export async function GET(req: NextRequest) {
  const auth = await requireBotMailAuth(req);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    agent: 'it-roof-mail-bot',
    user: auth.userEmail,
    allow_send: auth.allowSend,
    max_body_chars: auth.maxBodyChars,
    tools: [
      {
        name: 'list_mailboxes',
        method: 'GET',
        path: '/api/bot/mail/mailboxes',
        description: 'Alle IMAP/SMTP-Postfächer des Bot-Users auflisten',
      },
      {
        name: 'list_folders',
        method: 'GET',
        path: '/api/bot/mail/folders',
        query: ['mailbox_id?'],
        description: 'Ordner inkl. Unread-Zähler',
      },
      {
        name: 'search_messages',
        method: 'GET',
        path: '/api/bot/mail/messages',
        query: ['mailbox_id?', 'folder_id?', 'role?', 'q?', 'limit?', 'threaded?'],
        description: 'Mails suchen/listen (Metadaten + Snippet)',
      },
      {
        name: 'get_message',
        method: 'GET',
        path: '/api/bot/mail/messages/:id',
        query: ['thread?=1|full'],
        description: 'Mail lesen (Plaintext); optional Thread',
      },
      {
        name: 'patch_message',
        method: 'PATCH',
        path: '/api/bot/mail/messages/:id',
        body: {
          seen: 'boolean?',
          flagged: 'boolean?',
          folder_id: 'uuid?',
          move_to: 'archive|trash|inbox|junk?',
        },
        description: 'Gelesen/Markiert setzen oder verschieben',
      },
      {
        name: 'delete_message',
        method: 'DELETE',
        path: '/api/bot/mail/messages/:id',
        description: 'In Papierkorb; nochmals aus Papierkorb = endgültig',
      },
      {
        name: 'create_draft_or_send',
        method: 'POST',
        path: '/api/bot/mail/drafts',
        body: {
          mailbox_id: 'uuid',
          to: 'string|string[]',
          cc: 'string|string[]?',
          subject: 'string',
          text: 'string',
          send: 'boolean? (nur wenn allow_send)',
        },
        description: 'Entwurf speichern oder senden',
      },
      {
        name: 'sync',
        method: 'POST',
        path: '/api/bot/mail/sync',
        body: { mailbox_id: 'uuid?' },
        description: 'IMAP-Sync anstoßen',
      },
      {
        name: 'get_attachment',
        method: 'GET',
        path: '/api/bot/mail/attachments/:id',
        query: ['meta?=1'],
        description: 'Anhang-Metadaten oder Base64-Inhalt (Größenlimit)',
      },
    ],
  });
}
