import type { MailMessageDetail, MailMessageListItem } from '@/lib/mail/types';

export type BotMailAddress = {
  name: string | null;
  address: string;
};

export type BotMailListItem = {
  id: string;
  thread_id: string;
  mailbox_id: string;
  mailbox: string;
  folder_id: string;
  folder: string;
  date: string | null;
  from: BotMailAddress;
  to: BotMailAddress[];
  subject: string | null;
  snippet: string | null;
  flags: {
    seen: boolean;
    flagged: boolean;
    draft: boolean;
  };
  has_attachments: boolean;
  thread_count: number;
};

export type BotMailMessage = BotMailListItem & {
  cc: BotMailAddress[];
  body_text: string;
  body_truncated: boolean;
  message_id: string | null;
  in_reply_to: string | null;
  attachments: Array<{
    id: string;
    filename: string | null;
    content_type: string | null;
    size: number;
  }>;
};

function htmlToPlainRough(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function truncateBody(text: string, maxChars: number): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, maxChars)}\n\n[… gekürzt]`, truncated: true };
}

export function bodyTextForBot(
  textBody: string | null | undefined,
  htmlBody: string | null | undefined,
  maxChars: number,
): { text: string; truncated: boolean } {
  const raw =
    (textBody?.trim() || '') ||
    (htmlBody ? htmlToPlainRough(htmlBody) : '');
  return truncateBody(raw, maxChars);
}

export function toBotListItem(m: MailMessageListItem): BotMailListItem {
  return {
    id: m.id,
    thread_id: m.thread_id,
    mailbox_id: m.mailbox_id,
    mailbox: m.mailbox_email,
    folder_id: m.folder_id,
    folder: m.folder_role,
    date: m.date,
    from: {
      name: m.from_name,
      address: m.from_address ?? '',
    },
    to: m.to_addresses,
    subject: m.subject,
    snippet: m.snippet,
    flags: {
      seen: m.seen,
      flagged: m.flagged,
      draft: m.draft,
    },
    has_attachments: m.has_attachments,
    thread_count: m.thread_count,
  };
}

export function toBotMessage(
  m: MailMessageDetail,
  maxChars: number,
): BotMailMessage {
  const body = bodyTextForBot(m.text_body, m.html_body, maxChars);
  return {
    ...toBotListItem(m),
    cc: m.cc_addresses,
    body_text: body.text,
    body_truncated: body.truncated,
    message_id: m.message_id_header,
    in_reply_to: m.in_reply_to,
    attachments: m.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      content_type: a.content_type,
      size: a.size,
    })),
  };
}
