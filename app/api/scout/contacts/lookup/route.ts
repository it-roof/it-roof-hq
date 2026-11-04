import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireScoutToken } from '@/lib/auth/require-scout-token';
import { getLeadsDb } from '@/lib/leads/db';
import { lead } from '@/lib/leads/schema';
import { normalizeLinkedInUrl } from '@/lib/leads/normalize';
import {
  contactsWithCampaigns,
  findContactByLinkedIn,
  publicContact,
  publicLead,
} from '@/lib/leads/scout-queries';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = requireScoutToken(req);
  if (!auth.ok) return auth.response;

  const linkedin = req.nextUrl.searchParams.get('linkedin')
    ?? req.nextUrl.searchParams.get('linkedin_url');
  const linkedinNorm = normalizeLinkedInUrl(linkedin);
  if (!linkedinNorm) {
    return NextResponse.json({ error: 'linkedin erforderlich' }, { status: 400 });
  }

  const db = getLeadsDb();
  const row = await findContactByLinkedIn(db, linkedinNorm);
  if (!row) {
    return NextResponse.json({
      contact: null,
      linkedin_normalized: linkedinNorm,
    });
  }

  const [leadRow] = await db.select().from(lead).where(eq(lead.id, row.leadId)).limit(1);
  const matched = (await contactsWithCampaigns(db, row.leadId)).find((c) => c.id === row.id);

  return NextResponse.json({
    contact: matched ?? publicContact(row),
    lead: leadRow ? publicLead(leadRow) : null,
    linkedin_normalized: linkedinNorm,
  });
}
