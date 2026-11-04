import { NextRequest, NextResponse } from 'next/server';
import { getLeadsDb } from '@/lib/leads/db';
import { lead, leadContact, searchQuery } from '@/lib/leads/schema';
import { emptyToNull, nowIso, requireString } from '@/lib/leads/http';
import { pageMeta, pageOffset, parseLimit, parsePage } from '@/lib/leads/pagination';
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { parseListParam } from '@/lib/leads/filter-params';
import { parseOutreachStatus } from '@/lib/leads/outreach-status';
import { requireSession, unauthorized } from '@/lib/auth/require-session';

function searchFilter(q: string) {
  const pattern = `%${q}%`;
  return or(
    ilike(lead.companyName, pattern),
    ilike(lead.city, pattern),
    ilike(lead.industry, pattern),
    ilike(lead.domain, pattern),
    ilike(lead.phone, pattern),
    sql`EXISTS (
      SELECT 1 FROM lead_contact lc
      WHERE lc.lead_id = ${lead.id}
        AND (
          lc.first_name ILIKE ${pattern}
          OR lc.last_name ILIKE ${pattern}
          OR lc.email ILIKE ${pattern}
          OR CONCAT_WS(' ', lc.first_name, lc.last_name) ILIKE ${pattern}
        )
    )`,
  )!;
}

function pushMulti(
  filters: SQL[],
  column: typeof lead.city | typeof lead.industry | typeof lead.searchQueryId,
  values: string[],
) {
  if (values.length === 1) filters.push(eq(column, values[0]!));
  else if (values.length > 1) filters.push(inArray(column, values));
}

function inCampaign(campaignId: string) {
  return sql`EXISTS (
    SELECT 1 FROM campaign_lead cl
    WHERE cl.lead_id = ${lead.id}
      AND cl.campaign_id = ${campaignId}::uuid
  )`;
}

function notInCampaign(campaignId: string) {
  return sql`NOT EXISTS (
    SELECT 1 FROM campaign_lead cl
    WHERE cl.lead_id = ${lead.id}
      AND cl.campaign_id = ${campaignId}::uuid
  )`;
}

export async function GET(req: NextRequest) {
  if (!(await requireSession())) return unauthorized();
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const status = req.nextUrl.searchParams.get('status') ?? 'all';
  const outreachStatus = req.nextUrl.searchParams.get('outreach_status') ?? 'all';
  const cities = parseListParam(req.nextUrl.searchParams, ['city', 'cities']);
  const industries = parseListParam(req.nextUrl.searchParams, ['industry', 'industries']);
  const searchQueryIds = parseListParam(req.nextUrl.searchParams, [
    'search_query_id',
    'search_query_ids',
  ]);
  const excludeCampaignId = (req.nextUrl.searchParams.get('exclude_campaign_id') ?? '').trim();
  const includeCampaignId = (req.nextUrl.searchParams.get('include_campaign_id') ?? '').trim();
  const page = parsePage(req.nextUrl.searchParams.get('page'));
  const limit = parseLimit(req.nextUrl.searchParams.get('limit'));

  const db = getLeadsDb();

  const base: SQL[] = [];
  if (status !== 'all') base.push(eq(lead.status, status));
  if (outreachStatus !== 'all') base.push(eq(lead.outreachStatus, outreachStatus));
  if (q) base.push(searchFilter(q));

  if (includeCampaignId) base.push(inCampaign(includeCampaignId));
  else if (excludeCampaignId) base.push(notInCampaign(excludeCampaignId));

  const listFilters = [...base];
  pushMulti(listFilters, lead.city, cities);
  pushMulti(listFilters, lead.industry, industries);
  pushMulti(listFilters, lead.searchQueryId, searchQueryIds);
  const where = listFilters.length ? and(...listFilters) : undefined;

  const cityFacetFilters = [...base, sql`${lead.city} IS NOT NULL AND ${lead.city} <> ''`];
  pushMulti(cityFacetFilters, lead.industry, industries);
  pushMulti(cityFacetFilters, lead.searchQueryId, searchQueryIds);

  const industryFacetFilters = [...base, sql`${lead.industry} IS NOT NULL AND ${lead.industry} <> ''`];
  pushMulti(industryFacetFilters, lead.city, cities);
  pushMulti(industryFacetFilters, lead.searchQueryId, searchQueryIds);

  const searchFacetFilters = [...base];
  pushMulti(searchFacetFilters, lead.city, cities);
  pushMulti(searchFacetFilters, lead.industry, industries);

  const [filteredRow, statsRow, cityRows, industryRows, searchRows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(lead)
      .where(where)
      .then((r) => r[0]),
    db
      .select({
        total: sql<number>`count(*)::int`,
        complete: sql<number>`count(*) FILTER (WHERE ${lead.status} = 'complete')::int`,
      })
      .from(lead)
      .then((r) => r[0]),
    db
      .select({
        city: lead.city,
        n: sql<number>`count(*)::int`,
      })
      .from(lead)
      .where(and(...cityFacetFilters))
      .groupBy(lead.city)
      .orderBy(desc(sql`count(*)`), lead.city),
    db
      .select({
        industry: lead.industry,
        n: sql<number>`count(*)::int`,
      })
      .from(lead)
      .where(and(...industryFacetFilters))
      .groupBy(lead.industry)
      .orderBy(desc(sql`count(*)`), lead.industry),
    db
      .select({
        id: searchQuery.id,
        query: searchQuery.query,
        lead_count: sql<number>`count(${lead.id})::int`,
        tags: sql<{ id: string; name: string }[]>`
          COALESCE(
            (
              SELECT json_agg(
                json_build_object('id', t.id, 'name', t.name)
                ORDER BY t.name
              )
              FROM search_query_tag sqt
              JOIN tag t ON t.id = sqt.tag_id
              WHERE sqt.search_query_id = ${searchQuery.id}
            ),
            '[]'::json
          )
        `,
      })
      .from(searchQuery)
      .innerJoin(lead, eq(lead.searchQueryId, searchQuery.id))
      .where(searchFacetFilters.length ? and(...searchFacetFilters) : undefined)
      .groupBy(searchQuery.id)
      .orderBy(desc(sql`count(${lead.id})`), searchQuery.query),
  ]);

  const filteredTotal = filteredRow?.total ?? 0;
  const paging = pageMeta(filteredTotal, page, limit);

  const rows = await db
    .select({
      id: lead.id,
      company_name: lead.companyName,
      domain: lead.domain,
      street: lead.street,
      city: lead.city,
      country_code: lead.countryCode,
      phone: lead.phone,
      industry: lead.industry,
      status: lead.status,
      outreach_status: lead.outreachStatus,
      outreach_status_at: lead.outreachStatusAt,
      created_at: lead.createdAt,
      search_query_id: lead.searchQueryId,
      contacts: sql<{
        id: string;
        salutation: string | null;
        first_name: string | null;
        last_name: string | null;
        position: string | null;
        email: string | null;
        phone: string | null;
        linkedin_url: string | null;
      }[]>`
        COALESCE(
          json_agg(
            json_build_object(
              'id', ${leadContact.id},
              'salutation', ${leadContact.salutation},
              'first_name', ${leadContact.firstName},
              'last_name', ${leadContact.lastName},
              'position', ${leadContact.position},
              'email', ${leadContact.email},
              'phone', ${leadContact.phone},
              'linkedin_url', ${leadContact.linkedinUrl}
            )
            ORDER BY ${leadContact.lastName} NULLS LAST, ${leadContact.firstName} NULLS LAST
          ) FILTER (WHERE ${leadContact.id} IS NOT NULL),
          '[]'
        )
      `,
    })
    .from(lead)
    .leftJoin(leadContact, eq(leadContact.leadId, lead.id))
    .where(where)
    .groupBy(lead.id)
    .orderBy(lead.companyName)
    .limit(paging.limit)
    .offset(pageOffset(paging.page, paging.limit));

  return NextResponse.json({
    leads: rows,
    meta: {
      ...paging,
      returned: rows.length,
      complete: statsRow?.complete ?? 0,
      all_total: statsRow?.total ?? 0,
      q,
      status,
      outreach_status: outreachStatus,
      selected_cities: cities,
      selected_industries: industries,
      selected_search_query_ids: searchQueryIds,
      city: cities[0] ?? '',
      industry: industries[0] ?? '',
      search_query_id: searchQueryIds[0] ?? null,
      cities: cityRows
        .filter((r): r is { city: string; n: number } => !!r.city)
        .map((r) => ({ city: r.city, n: r.n })),
      industries: industryRows
        .filter((r): r is { industry: string; n: number } => !!r.industry)
        .map((r) => ({ industry: r.industry, n: r.n })),
      searches: searchRows.map((r) => ({
        id: r.id,
        query: r.query,
        lead_count: r.lead_count,
        tags: r.tags ?? [],
      })),
    },
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireSession())) return unauthorized();
  try {
    const body = await req.json();
    const companyName = requireString(body.company_name ?? body.companyName, 'company_name');
    const status = (body.status ?? 'raw').trim() || 'raw';
    const outreachStatus = parseOutreachStatus(
      body.outreach_status ?? body.outreachStatus,
      'open',
    );

    const db = getLeadsDb();
    const [row] = await db
      .insert(lead)
      .values({
        companyName,
        domain: emptyToNull(body.domain),
        street: emptyToNull(body.street),
        city: emptyToNull(body.city),
        countryCode: emptyToNull(body.country_code ?? body.countryCode) ?? 'DE',
        phone: emptyToNull(body.phone),
        industry: emptyToNull(body.industry),
        status,
        outreachStatus,
        createdAt: nowIso(),
      })
      .returning();

    return NextResponse.json({ ok: true, lead: row }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Fehler' }, { status: 400 });
  }
}
