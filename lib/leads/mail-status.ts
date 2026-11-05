export const MAIL_STATUSES = [
  'mail_neu',
  'mail_entwurf',
  'mail_gesendet',
  'mail_geantwortet',
  'mail_nachfass',
  'mail_absage',
  'mail_zurueckgestellt',
] as const;

export type MailStatus = (typeof MAIL_STATUSES)[number];

export const EMAIL_CAMPAIGN_NAME = 'E-Mail KI-Schulung Kanzleien';
export const EMAIL_CAMPAIGN_SLUG = 'email-ki-schulung-kanzleien';

export function isMailStatus(value: string): value is MailStatus {
  return (MAIL_STATUSES as readonly string[]).includes(value);
}

export function usesCampaignLead(row: { channel?: string | null; name?: string | null }) {
  if (row.channel === 'linkedin') return false;
  if (row.name === EMAIL_CAMPAIGN_NAME) return false;
  return true;
}

export function parseMailStatus(value: unknown): MailStatus {
  const v = String(value ?? '').trim();
  if (!isMailStatus(v)) {
    throw new Error(`status muss einer von ${MAIL_STATUSES.join(', ')} sein`);
  }
  return v;
}
