import { NextRequest, NextResponse } from 'next/server';
import { getLeadsDb } from '@/lib/leads/db';
import { campaign, campaignContact, campaignLead, campaignStep } from '@/lib/leads/schema';
import { emptyToNull, nowIso, requireString } from '@/lib/leads/http';
import { desc, eq, ilike, sql } from 'drizzle-orm';
import { requireSession, unauthorized } from '@/lib/auth/require-session';

export async function GET(req: NextRequest) {
  if (!(await requireSession())) return unauthorized();
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const db = getLeadsDb();

  const rows = await db
    .select({
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      created_at: campaign.createdAt,
      channel: campaign.channel,
      step_count: sql<number>`count(distinct ${campaignStep.id})::int`,
      lead_count: sql<number>`count(distinct ${campaignLead.id})::int`,
      contact_count: sql<number>`count(distinct ${campaignContact.id})::int`,
      active_count: sql<number>`count(distinct ${campaignLead.id}) filter (where ${campaignLead.status} <> 'done')::int`,
      done_count: sql<number>`count(distinct ${campaignLead.id}) filter (where ${campaignLead.status} = 'done')::int`,
    })
    .from(campaign)
    .leftJoin(campaignStep, eq(campaignStep.campaignId, campaign.id))
    .leftJoin(campaignLead, eq(campaignLead.campaignId, campaign.id))
    .leftJoin(campaignContact, eq(campaignContact.campaignId, campaign.id))
    .where(q ? ilike(campaign.name, `%${q}%`) : undefined)
    .groupBy(campaign.id)
    .orderBy(desc(campaign.createdAt));

  return NextResponse.json({ campaigns: rows });
}

export async function POST(req: NextRequest) {
  if (!(await requireSession())) return unauthorized();
  try {
    const body = await req.json();
    const name = requireString(body.name, 'name');
    const db = getLeadsDb();
    const [row] = await db
      .insert(campaign)
      .values({
        name,
        description: emptyToNull(body.description),
        channel: 'email',
        createdAt: nowIso(),
      })
      .returning();
    return NextResponse.json({ ok: true, campaign: row }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Fehler' }, { status: 400 });
  }
}
