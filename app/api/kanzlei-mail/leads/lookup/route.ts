import { NextRequest, NextResponse } from 'next/server';
import { requireKanzleiMailToken } from '@/lib/auth/require-kanzlei-mail-token';
import { botCatchResponse } from '@/lib/leads/bot-error';
import { getLeadsDb } from '@/lib/leads/db';
import { lookupContactFlags } from '@/lib/leads/kanzlei-mail';
import {
  contactsWithCampaigns,
  findScoutLead,
  publicLead,
} from '@/lib/leads/scout-queries';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = requireKanzleiMailToken(req);
  if (!auth.ok) return auth.response;

  try {
    const domain = req.nextUrl.searchParams.get('domain');
    const companyName = req.nextUrl.searchParams.get('company_name')
      ?? req.nextUrl.searchParams.get('companyName');
    if (!domain && !companyName) {
      return NextResponse.json({ error: 'domain oder company_name erforderlich' }, { status: 400 });
    }

    const db = getLeadsDb();
    const row = await findScoutLead(db, { domain, companyName });
    if (!row) {
      return NextResponse.json({
        lead: null,
        contacts: [],
        email_outreach_blocked: false,
        has_scout_contacts: false,
        has_linkedin_contacts: false,
      });
    }
    const contacts = await contactsWithCampaigns(db, row.id);
    return NextResponse.json({
      lead: publicLead(row),
      contacts,
      email_outreach_blocked: row.emailOutreachBlocked,
      ...lookupContactFlags(contacts),
    });
  } catch (e) {
    return botCatchResponse(e, 'kanzlei-mail.leads.lookup');
  }
}
