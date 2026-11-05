import { NextRequest, NextResponse } from 'next/server';
import { requireScoutToken } from '@/lib/auth/require-scout-token';
import { botCatchResponse } from '@/lib/leads/bot-error';
import { resolveCampaignId } from '@/lib/leads/campaign-channel';
import { getLeadsDb } from '@/lib/leads/db';
import { isLinkedInStatus, parseLinkedInStatus } from '@/lib/leads/linkedin-status';
import { listCampaignContacts } from '@/lib/leads/scout-queries';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = requireScoutToken(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const db = getLeadsDb();
    const camp = await resolveCampaignId(db, id, 'linkedin');
    if (!camp) return NextResponse.json({ error: 'Kampagne nicht gefunden' }, { status: 404 });

    const rawStatus = req.nextUrl.searchParams.get('status');
    if (rawStatus && !isLinkedInStatus(rawStatus)) {
      throw new Error('status ungültig');
    }
    const status = rawStatus ? parseLinkedInStatus(rawStatus) : null;

    const contacts = await listCampaignContacts(db, camp.id, status);
    return NextResponse.json({
      campaign: { id: camp.id, name: camp.name, channel: camp.channel },
      contacts,
      meta: { returned: contacts.length },
    });
  } catch (e) {
    return botCatchResponse(e, 'scout.campaigns.contacts');
  }
}
