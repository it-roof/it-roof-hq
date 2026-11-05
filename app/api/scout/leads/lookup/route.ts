import { NextRequest, NextResponse } from 'next/server';
import { requireScoutToken } from '@/lib/auth/require-scout-token';
import { getLeadsDb } from '@/lib/leads/db';
import {
  contactsWithCampaigns,
  findScoutLead,
  publicLead,
} from '@/lib/leads/scout-queries';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = requireScoutToken(req);
  if (!auth.ok) return auth.response;

  const domain = req.nextUrl.searchParams.get('domain');
  const companyName = req.nextUrl.searchParams.get('company_name')
    ?? req.nextUrl.searchParams.get('companyName');
  if (!domain && !companyName) {
    return NextResponse.json({ error: 'domain oder company_name erforderlich' }, { status: 400 });
  }

  const db = getLeadsDb();
  const row = await findScoutLead(db, { domain, companyName });
  if (!row) {
    return NextResponse.json({ lead: null, contacts: [] });
  }
  const contacts = await contactsWithCampaigns(db, row.id);
  return NextResponse.json({
    lead: publicLead(row),
    contacts,
  });
}
