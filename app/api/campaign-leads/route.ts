import { NextRequest, NextResponse } from 'next/server';
import { getLeadsDb } from '@/lib/leads/db';
import { campaignLead, campaignStep, lead, campaign } from '@/lib/leads/schema';
import { emptyToNull, nowIso, requireString } from '@/lib/leads/http';
import { pageMeta, pageOffset, parseLimit, parsePage } from '@/lib/leads/pagination';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { requireSession, unauthorized } from '@/lib/auth/require-session';
import { assertEmailCampaign } from '@/lib/leads/campaign-channel';

export async function GET(req: NextRequest) {
  if (!(await requireSession())) return unauthorized();
  const campaignId = req.nextUrl.searchParams.get('campaign_id');
  const leadId = req.nextUrl.searchParams.get('lead_id');
  const status = req.nextUrl.searchParams.get('status');
  const idsOnly = req.nextUrl.searchParams.get('ids_only') === '1';
  const db = getLeadsDb();

  const filters = [];
  if (campaignId) filters.push(eq(campaignLead.campaignId, campaignId));
  if (leadId) filters.push(eq(campaignLead.leadId, leadId));
  if (status) filters.push(eq(campaignLead.status, status));
  const where = filters.length ? and(...filters) : undefined;

  if (idsOnly) {
    if (!campaignId) {
      return NextResponse.json({ error: 'campaign_id erforderlich' }, { status: 400 });
    }
    const rows = await db
      .select({ id: campaignLead.id, lead_id: campaignLead.leadId })
      .from(campaignLead)
      .where(eq(campaignLead.campaignId, campaignId));
    return NextResponse.json({
      lead_ids: rows.map((r) => r.lead_id),
      assignments: rows,
      total: rows.length,
    });
  }

  const page = parsePage(req.nextUrl.searchParams.get('page'));
  const limit = parseLimit(req.nextUrl.searchParams.get('limit'));

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(campaignLead)
    .where(where);

  const paging = pageMeta(countRow?.total ?? 0, page, limit);

  const rows = await db
    .select({
      id: campaignLead.id,
      campaign_id: campaignLead.campaignId,
      lead_id: campaignLead.leadId,
      current_step_id: campaignLead.currentStepId,
      status: campaignLead.status,
      last_action_at: campaignLead.lastActionAt,
      created_at: campaignLead.createdAt,
      campaign_name: campaign.name,
      company_name: lead.companyName,
    })
    .from(campaignLead)
    .leftJoin(campaign, eq(campaign.id, campaignLead.campaignId))
    .leftJoin(lead, eq(lead.id, campaignLead.leadId))
    .where(where)
    .orderBy(desc(campaignLead.createdAt))
    .limit(paging.limit)
    .offset(pageOffset(paging.page, paging.limit));

  return NextResponse.json({
    campaign_leads: rows,
    meta: { ...paging, returned: rows.length },
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireSession())) return unauthorized();
  try {
    const body = await req.json();
    const campaignId = requireString(body.campaign_id ?? body.campaignId, 'campaign_id');
    const leadId = requireString(body.lead_id ?? body.leadId, 'lead_id');
    const status = (body.status ?? 'active').trim() || 'active';

    const db = getLeadsDb();
    await assertEmailCampaign(db, campaignId);

    const [blockedLead] = await db
      .select({ id: lead.id, emailOutreachBlocked: lead.emailOutreachBlocked })
      .from(lead)
      .where(eq(lead.id, leadId))
      .limit(1);
    if (!blockedLead) {
      return NextResponse.json({ error: 'lead_id unbekannt' }, { status: 400 });
    }
    if (blockedLead.emailOutreachBlocked) {
      return NextResponse.json(
        { error: 'Lead ist für E-Mail-Kampagnen gesperrt' },
        { status: 400 },
      );
    }

    let currentStepId = emptyToNull(body.current_step_id ?? body.currentStepId);
    if (!currentStepId) {
      const [firstStep] = await db
        .select({ id: campaignStep.id })
        .from(campaignStep)
        .where(eq(campaignStep.campaignId, campaignId))
        .orderBy(asc(campaignStep.stepOrder))
        .limit(1);
      currentStepId = firstStep?.id ?? null;
    }

    const [row] = await db
      .insert(campaignLead)
      .values({
        campaignId,
        leadId,
        currentStepId,
        status,
        lastActionAt: emptyToNull(body.last_action_at ?? body.lastActionAt),
        createdAt: nowIso(),
      })
      .returning();

    return NextResponse.json({ ok: true, campaign_lead: row }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Fehler' }, { status: 400 });
  }
}
