import { eq } from 'drizzle-orm';
import { getLeadsDb } from '@/lib/leads/db';
import { campaign } from '@/lib/leads/schema';
import {
  LINKEDIN_CAMPAIGN_NAME,
  LINKEDIN_CAMPAIGN_SLUG,
} from '@/lib/leads/linkedin-status';

export const CAMPAIGN_CHANNELS = ['email', 'linkedin'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export function isCampaignChannel(value: string): value is CampaignChannel {
  return (CAMPAIGN_CHANNELS as readonly string[]).includes(value);
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
      .where(eq(campaign.name, LINKEDIN_CAMPAIGN_NAME))
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
  if (row?.channel === 'linkedin') {
    throw new Error(
      'LinkedIn-Kampagnen werden über Kontakte geführt, nicht über campaign_lead',
    );
  }
}
