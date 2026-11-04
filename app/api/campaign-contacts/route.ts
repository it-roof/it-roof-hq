import { NextRequest, NextResponse } from 'next/server';
import { requireSession, unauthorized } from '@/lib/auth/require-session';
import { getLeadsDb } from '@/lib/leads/db';
import { isLinkedInStatus } from '@/lib/leads/linkedin-status';
import { listCampaignContacts } from '@/lib/leads/scout-queries';

export async function GET(req: NextRequest) {
  if (!(await requireSession())) return unauthorized();
  const campaignId = (req.nextUrl.searchParams.get('campaign_id') ?? '').trim();
  if (!campaignId) {
    return NextResponse.json({ error: 'campaign_id erforderlich' }, { status: 400 });
  }
  const rawStatus = (req.nextUrl.searchParams.get('status') ?? '').trim();
  if (rawStatus && !isLinkedInStatus(rawStatus)) {
    return NextResponse.json({ error: 'status ungültig' }, { status: 400 });
  }

  const db = getLeadsDb();
  const contacts = await listCampaignContacts(
    db,
    campaignId,
    rawStatus && isLinkedInStatus(rawStatus) ? rawStatus : null,
  );
  return NextResponse.json({
    contacts,
    meta: { returned: contacts.length },
  });
}
