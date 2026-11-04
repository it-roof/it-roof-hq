import { NextRequest, NextResponse } from 'next/server';
import { getLeadsDb } from '@/lib/leads/db';
import { campaignLead, campaignLeadAction, campaignStep, lead } from '@/lib/leads/schema';
import { nowIso, requireString } from '@/lib/leads/http';
import { parseListBody, parseListParam } from '@/lib/leads/filter-params';
import { and, asc, eq, ilike, inArray, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { requireSession, unauthorized } from '@/lib/auth/require-session';
import { writeAudit } from '@/lib/auth/audit';
import { assertEmailCampaign } from '@/lib/leads/campaign-channel';

function leadFilters(opts: {
  cities?: string[];
  industries?: string[];
  searchQueryIds?: string[];
  status?: string;
  q?: string;
}) {
  const filters: SQL[] = [];
  const cities = opts.cities ?? [];
  const industries = opts.industries ?? [];
  const searchQueryIds = opts.searchQueryIds ?? [];
  if (opts.status && opts.status !== 'all') filters.push(eq(lead.status, opts.status));
  if (cities.length === 1) filters.push(eq(lead.city, cities[0]!));
  else if (cities.length > 1) filters.push(inArray(lead.city, cities));
  if (industries.length === 1) filters.push(eq(lead.industry, industries[0]!));
  else if (industries.length > 1) filters.push(inArray(lead.industry, industries));
  if (searchQueryIds.length === 1) filters.push(eq(lead.searchQueryId, searchQueryIds[0]!));
  else if (searchQueryIds.length > 1) filters.push(inArray(lead.searchQueryId, searchQueryIds));
  if (opts.q) {
    const pattern = `%${opts.q}%`;
    filters.push(
      or(
        ilike(lead.companyName, pattern),
        ilike(lead.city, pattern),
        ilike(lead.industry, pattern),
        ilike(lead.domain, pattern),
      )!,
    );
  }
  return filters;
}

export async function POST(req: NextRequest) {
  if (!(await requireSession())) return unauthorized();
  try {
    const body = await req.json();
    const campaignId = requireString(body.campaign_id ?? body.campaignId, 'campaign_id');
    const cities = [
      ...parseListBody(body.cities ?? body.city),
    ];
    const industries = [
      ...parseListBody(body.industries ?? body.industry),
    ];
    const searchQueryIds = [
      ...parseListBody(body.search_query_ids ?? body.search_query_id ?? body.searchQueryIds),
    ];
    const status =
      typeof body.status === 'string' && body.status.trim()
        ? body.status.trim()
        : 'all';
    const q = typeof body.q === 'string' ? body.q.trim() : '';
    const rawIds = Array.isArray(body.lead_ids ?? body.leadIds)
      ? (body.lead_ids ?? body.leadIds)
      : [];
    const leadIds = rawIds
      .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id: string) => id.trim());

    if (
      leadIds.length === 0
      && cities.length === 0
      && industries.length === 0
      && searchQueryIds.length === 0
      && status === 'all'
      && !q
    ) {
      return NextResponse.json(
        { error: 'lead_ids oder Filter (city / industry / search_query_id / status / q) erforderlich' },
        { status: 400 },
      );
    }

    const db = getLeadsDb();
    await assertEmailCampaign(db, campaignId);

    const [firstStep] = await db
      .select({ id: campaignStep.id })
      .from(campaignStep)
      .where(eq(campaignStep.campaignId, campaignId))
      .orderBy(asc(campaignStep.stepOrder))
      .limit(1);

    const existing = await db
      .select({ leadId: campaignLead.leadId })
      .from(campaignLead)
      .where(eq(campaignLead.campaignId, campaignId));
    const existingIds = existing.map((r) => r.leadId);

    let candidates: { id: string }[];

    if (leadIds.length > 0) {
      candidates = await db
        .select({ id: lead.id })
        .from(lead)
        .where(inArray(lead.id, leadIds));
    } else {
      const filters = leadFilters({ cities, industries, searchQueryIds, status, q });
      if (existingIds.length) filters.push(notInArray(lead.id, existingIds));

      candidates = await db
        .select({ id: lead.id })
        .from(lead)
        .where(and(...filters));
    }

    const toInsert = candidates.filter((c) => !existingIds.includes(c.id));
    if (toInsert.length === 0) {
      return NextResponse.json({
        ok: true,
        inserted: 0,
        skipped: candidates.length,
        already_in_campaign: existingIds.length,
      });
    }

    const actedAt = nowIso();
    const rows = await db
      .insert(campaignLead)
      .values(
        toInsert.map((c) => ({
          campaignId,
          leadId: c.id,
          currentStepId: firstStep?.id ?? null,
          status: 'active',
          lastActionAt: null,
          createdAt: actedAt,
        })),
      )
      .returning({ id: campaignLead.id });

    return NextResponse.json({
      ok: true,
      inserted: rows.length,
      skipped: candidates.length - toInsert.length,
      already_in_campaign: existingIds.length,
    }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Fehler' }, { status: 400 });
  }
}

/** Count of matching leads not yet in campaign (for „Alle Treffer“) */
export async function GET(req: NextRequest) {
  if (!(await requireSession())) return unauthorized();
  const campaignId = (req.nextUrl.searchParams.get('campaign_id') ?? '').trim();
  const cities = parseListParam(req.nextUrl.searchParams, ['city', 'cities']);
  const industries = parseListParam(req.nextUrl.searchParams, ['industry', 'industries']);
  const searchQueryIds = parseListParam(req.nextUrl.searchParams, [
    'search_query_id',
    'search_query_ids',
  ]);
  const status = (req.nextUrl.searchParams.get('status') ?? 'all').trim() || 'all';
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();

  if (!campaignId) {
    return NextResponse.json({ error: 'campaign_id erforderlich' }, { status: 400 });
  }
  if (
    cities.length === 0
    && industries.length === 0
    && searchQueryIds.length === 0
    && status === 'all'
    && !q
  ) {
    return NextResponse.json({ available: 0, match_total: 0, already_assigned: 0 });
  }

  const db = getLeadsDb();
  try {
    await assertEmailCampaign(db, campaignId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Fehler' }, { status: 400 });
  }
  const filters = leadFilters({ cities, industries, searchQueryIds, status, q });
  const where = and(...filters);

  const existing = await db
    .select({ leadId: campaignLead.leadId })
    .from(campaignLead)
    .where(eq(campaignLead.campaignId, campaignId));
  const existingIds = existing.map((r) => r.leadId);

  const [matchRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(lead)
    .where(where);
  const matchTotal = matchRow?.total ?? 0;

  const availableWhere = existingIds.length
    ? and(where, notInArray(lead.id, existingIds))
    : where;

  const [availableRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(lead)
    .where(availableWhere);

  return NextResponse.json({
    match_total: matchTotal,
    available: availableRow?.total ?? 0,
    already_assigned: matchTotal - (availableRow?.total ?? 0),
  });
}

/** Zuordnungen aufheben: campaign_id + lead_ids oder dieselben Filter wie Zuordnen */
export async function DELETE(req: NextRequest) {
  if (!(await requireSession())) return unauthorized();
  try {
    const body = await req.json();
    const campaignId = requireString(body.campaign_id ?? body.campaignId, 'campaign_id');
    const cities = [...parseListBody(body.cities ?? body.city)];
    const industries = [...parseListBody(body.industries ?? body.industry)];
    const searchQueryIds = [
      ...parseListBody(body.search_query_ids ?? body.search_query_id ?? body.searchQueryIds),
    ];
    const status =
      typeof body.status === 'string' && body.status.trim()
        ? body.status.trim()
        : 'all';
    const q = typeof body.q === 'string' ? body.q.trim() : '';
    const rawIds = Array.isArray(body.lead_ids ?? body.leadIds)
      ? (body.lead_ids ?? body.leadIds)
      : [];
    const leadIds = rawIds
      .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id: string) => id.trim());

    const hasFilter =
      cities.length > 0
      || industries.length > 0
      || searchQueryIds.length > 0
      || status !== 'all'
      || !!q;

    if (leadIds.length === 0 && !hasFilter) {
      return NextResponse.json(
        { error: 'lead_ids oder Filter (city / industry / search_query_id / status / q) erforderlich' },
        { status: 400 },
      );
    }

    const db = getLeadsDb();

    let targetLeadIds = leadIds;
    if (leadIds.length === 0) {
      const filters = leadFilters({ cities, industries, searchQueryIds, status, q });
      const matched = await db
        .select({ id: lead.id })
        .from(lead)
        .where(and(...filters));
      targetLeadIds = matched.map((r) => r.id);
    }

    if (targetLeadIds.length === 0) {
      return NextResponse.json({ ok: true, removed: 0 });
    }

    const BULK_DELETE_MAX = 500;
    if (targetLeadIds.length > BULK_DELETE_MAX) {
      return NextResponse.json(
        {
          error: `Maximal ${BULK_DELETE_MAX} Zuordnungen pro Vorgang. Bitte Filter enger setzen oder in Batches löschen.`,
          match_count: targetLeadIds.length,
          max: BULK_DELETE_MAX,
        },
        { status: 400 },
      );
    }

    const rows = await db
      .select({ id: campaignLead.id })
      .from(campaignLead)
      .where(
        and(
          eq(campaignLead.campaignId, campaignId),
          inArray(campaignLead.leadId, targetLeadIds),
        ),
      );

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, removed: 0 });
    }

    const clIds = rows.map((r) => r.id);
    await db
      .delete(campaignLeadAction)
      .where(inArray(campaignLeadAction.campaignLeadId, clIds));
    await db
      .delete(campaignLead)
      .where(inArray(campaignLead.id, clIds));

    await writeAudit({
      action: 'campaign_lead.bulk_unassign',
      resource: 'campaign',
      resourceId: campaignId,
      meta: { removed: clIds.length, leadCount: targetLeadIds.length },
    });

    return NextResponse.json({ ok: true, removed: clIds.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Fehler' }, { status: 400 });
  }
}
