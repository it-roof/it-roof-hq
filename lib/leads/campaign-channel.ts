import { eq, inArray } from 'drizzle-orm';
import { getLeadsDb } from '@/lib/leads/db';
import { campaign } from '@/lib/leads/schema';
import {
  LINKEDIN_CAMPAIGN_NAME,
  LINKEDIN_CAMPAIGN_NAME_LEGACY,
  LINKEDIN_CAMPAIGN_SLUG,
  LINKEDIN_STATUSES,
  isLinkedInStatus,
  type LinkedInStatus,
} from '@/lib/leads/linkedin-status';
import {
  EMAIL_CAMPAIGN_NAME,
  EMAIL_CAMPAIGN_SLUG,
  MAIL_STATUSES,
  isMailStatus,
  usesCampaignLead,
  type MailStatus,
} from '@/lib/leads/mail-status';

export { usesCampaignLead };

export const CAMPAIGN_CHANNELS = ['email', 'linkedin'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];
export type CampaignContactStatus = LinkedInStatus | MailStatus;

export function isCampaignChannel(value: string): value is CampaignChannel {
  return (CAMPAIGN_CHANNELS as readonly string[]).includes(value);
}

export function isCampaignContactStatus(value: string): value is CampaignContactStatus {
  return isLinkedInStatus(value) || isMailStatus(value);
}

export function parseCampaignContactStatus(value: unknown): CampaignContactStatus {
  const v = String(value ?? '').trim();
  if (!isCampaignContactStatus(v)) {
    throw new Error(
      `status muss einer von ${[...LINKEDIN_STATUSES, ...MAIL_STATUSES].join(', ')} sein`,
    );
  }
  return v;
}

export function assertStatusMatchesChannel(status: string, channel: string) {
  if (channel === 'linkedin' && !status.startsWith('li_')) {
    throw new Error('linkedin-Kampagne erlaubt nur li_* Status');
  }
  if (channel === 'email' && !status.startsWith('mail_')) {
    throw new Error('email-Kampagne erlaubt nur mail_* Status');
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_RE.test(value);
}

export async function resolveCampaignId(
  db: ReturnType<typeof getLeadsDb>,
  idOrSlug: string,
) {
  const raw = idOrSlug.trim();
  if (!raw) return null;
  if (isUuid(raw)) {
    const [row] = await db
      .select({ id: campaign.id, channel: campaign.channel, name: campaign.name })
      .from(campaign)
      .where(eq(campaign.id, raw))
      .limit(1);
    return row ?? null;
  }
  if (raw === LINKEDIN_CAMPAIGN_SLUG) {
    const [row] = await db
      .select({ id: campaign.id, channel: campaign.channel, name: campaign.name })
      .from(campaign)
      .where(inArray(campaign.name, [LINKEDIN_CAMPAIGN_NAME, LINKEDIN_CAMPAIGN_NAME_LEGACY]))
      .limit(1);
    return row ?? null;
  }
  if (raw === EMAIL_CAMPAIGN_SLUG) {
    const [row] = await db
      .select({ id: campaign.id, channel: campaign.channel, name: campaign.name })
      .from(campaign)
      .where(eq(campaign.name, EMAIL_CAMPAIGN_NAME))
      .limit(1);
    return row ?? null;
  }
  return null;
}

export async function assertEmailCampaign(
  db: ReturnType<typeof getLeadsDb>,
  campaignId: string,
) {
  const [row] = await db
    .select({ channel: campaign.channel, name: campaign.name })
    .from(campaign)
    .where(eq(campaign.id, campaignId))
    .limit(1);
  if (!row) return;
  if (!usesCampaignLead(row)) {
    throw new Error(
      row.channel === 'linkedin'
        ? 'LinkedIn-Kampagnen werden über Kontakte geführt, nicht über campaign_lead'
        : 'Diese E-Mail-Kampagne wird über Kontakte geführt, nicht über campaign_lead',
    );
  }
}
