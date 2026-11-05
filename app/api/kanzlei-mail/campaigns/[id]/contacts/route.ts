import { NextRequest, NextResponse } from 'next/server';
import { requireKanzleiMailToken } from '@/lib/auth/require-kanzlei-mail-token';
import { resolveCampaignId } from '@/lib/leads/campaign-channel';
import { getLeadsDb } from '@/lib/leads/db';
import { EMAIL_CAMPAIGN_NAME, isMailStatus, parseMailStatus } from '@/lib/leads/mail-status';
import { listCampaignContacts } from '@/lib/leads/scout-queries';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const auth = requireKanzleiMailToken(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const db = getLeadsDb();
    const camp = await resolveCampaignId(db, id);
    if (!camp) return NextResponse.json({ error: 'Kampagne nicht gefunden' }, { status: 404 });
    if (camp.channel !== 'email' || camp.name !== EMAIL_CAMPAIGN_NAME) {
      return NextResponse.json({ error: 'Kampagne ist keine Kanzlei-Mail-Kampagne' }, { status: 400 });
    }

    const rawStatus = req.nextUrl.searchParams.get('status');
    if (rawStatus && !isMailStatus(rawStatus)) {
      throw new Error('status ungültig');
    }
    const status = rawStatus ? parseMailStatus(rawStatus) : null;

    const contacts = await listCampaignContacts(db, camp.id, status);
    return NextResponse.json({
      campaign: { id: camp.id, name: camp.name, channel: camp.channel },
      contacts,
      meta: { returned: contacts.length },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Fehler' }, { status: 400 });
  }
}
