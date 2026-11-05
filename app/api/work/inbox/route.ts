import { NextRequest, NextResponse } from 'next/server';
import { getLeadsDb } from '@/lib/leads/db';
import {
  campaign,
  campaignLead,
  campaignLeadAction,
  campaignStep,
  lead,
  leadContact,
  searchQueryTag,
  tag,
} from '@/lib/leads/schema';
import { campaignStepMeta } from '@/lib/leads/campaign-steps';
import { renderStepTemplates } from '@/lib/leads/template';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { requireSession, unauthorized } from '@/lib/auth/require-session';

const REGION_ORDER = ['Mittelfranken', 'Oberfranken', 'Unterfranken', 'Bayern'];

/** Globale Inbox: offene Kampagnen-Leads über alle Kampagnen. */
export async function GET(req: NextRequest) {
  if (!(await requireSession())) return unauthorized();
  const campaignId = (req.nextUrl.searchParams.get('campaign_id') ?? '').trim();
  const db = getLeadsDb();

  const filters = [ne(campaignLead.status, 'done')];
  if (campaignId) filters.push(eq(campaignLead.campaignId, campaignId));

  const rows = await db
    .select({
      id: campaignLead.id,
      campaign_id: campaignLead.campaignId,
      campaign_name: campaign.name,
      lead_id: campaignLead.leadId,
      search_query_id: lead.searchQueryId,
      current_step_id: campaignLead.currentStepId,
      status: campaignLead.status,
      last_action_at: campaignLead.lastActionAt,
      created_at: campaignLead.createdAt,
      company_name: lead.companyName,
      city: lead.city,
      phone: lead.phone,
      domain: lead.domain,
      outreach_status: lead.outreachStatus,
      outreach_status_at: lead.outreachStatusAt,
    })
    .from(campaignLead)
    .innerJoin(lead, eq(lead.id, campaignLead.leadId))
    .innerJoin(campaign, eq(campaign.id, campaignLead.campaignId))
    .where(and(...filters))
    .orderBy(asc(campaignLead.createdAt));

  const campaignIds = [...new Set(rows.map((r) => r.campaign_id))];
  const leadIds = rows.map((r) => r.lead_id);
  const searchQueryIds = [
    ...new Set(
      rows
        .map((r) => r.search_query_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  const steps = campaignIds.length
    ? await db
        .select()
        .from(campaignStep)
        .where(inArray(campaignStep.campaignId, campaignIds))
        .orderBy(asc(campaignStep.stepOrder))
    : [];

  const stepsByCampaign = new Map<string, typeof steps>();
  const stepById = new Map(steps.map((s) => [s.id, s]));
  for (const s of steps) {
    const list = stepsByCampaign.get(s.campaignId) ?? [];
    list.push(s);
    stepsByCampaign.set(s.campaignId, list);
  }

  const contacts = leadIds.length
    ? await db
        .select()
        .from(leadContact)
        .where(inArray(leadContact.leadId, leadIds))
        .orderBy(asc(leadContact.createdAt), asc(leadContact.id))
    : [];

  const firstContactByLead = new Map<string, (typeof contacts)[number]>();
  for (const c of contacts) {
    if (!firstContactByLead.has(c.leadId)) firstContactByLead.set(c.leadId, c);
  }

  const tagRows = searchQueryIds.length
    ? await db
        .select({
          search_query_id: searchQueryTag.searchQueryId,
          tag_id: tag.id,
          tag_name: tag.name,
        })
        .from(searchQueryTag)
        .innerJoin(tag, eq(tag.id, searchQueryTag.tagId))
        .where(inArray(searchQueryTag.searchQueryId, searchQueryIds))
    : [];

  const tagsBySearch = new Map<string, { id: string; name: string }[]>();
  const tagMeta = new Map<string, { id: string; name: string }>();
  for (const row of tagRows) {
    tagMeta.set(row.tag_id, { id: row.tag_id, name: row.tag_name });
    const list = tagsBySearch.get(row.search_query_id) ?? [];
    list.push({ id: row.tag_id, name: row.tag_name });
    tagsBySearch.set(row.search_query_id, list);
  }

  const campaignsMeta = new Map<string, { id: string; name: string; n: number }>();
  const regionsMeta = new Map<string, { id: string; name: string; n: number }>();

  const items = rows.map((r) => {
    const campSteps = stepsByCampaign.get(r.campaign_id) ?? [];
    let step = r.current_step_id ? stepById.get(r.current_step_id) : undefined;
    if (!step && campSteps.length) step = campSteps[0];

    const contact = firstContactByLead.get(r.lead_id) ?? null;
    const tags = r.search_query_id
      ? (tagsBySearch.get(r.search_query_id) ?? [])
      : [];
    const rendered = step
      ? renderStepTemplates(
          step.subjectTemplate,
          step.bodyTemplate,
          {
            companyName: r.company_name,
            city: r.city,
            phone: r.phone,
          },
          contact
            ? {
                salutation: contact.salutation,
                firstName: contact.firstName,
                lastName: contact.lastName,
                position: contact.position,
                email: contact.email,
                phone: contact.phone,
              }
            : null,
        )
      : { subject: '', body: '', vars: {} };

    const prev = campaignsMeta.get(r.campaign_id);
    if (prev) prev.n += 1;
    else campaignsMeta.set(r.campaign_id, { id: r.campaign_id, name: r.campaign_name, n: 1 });

    for (const t of tags) {
      const region = regionsMeta.get(t.id);
      if (region) region.n += 1;
      else regionsMeta.set(t.id, { id: t.id, name: t.name, n: 1 });
    }

    return {
      id: r.id,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      lead_id: r.lead_id,
      status: r.status,
      last_action_at: r.last_action_at,
      created_at: r.created_at,
      company_name: r.company_name,
      city: r.city,
      domain: r.domain,
      outreach_status: r.outreach_status,
      outreach_status_at: r.outreach_status_at,
      tag_ids: tags.map((t) => t.id),
      contact: contact
        ? {
            id: contact.id,
            salutation: contact.salutation,
            first_name: contact.firstName,
            last_name: contact.lastName,
            position: contact.position,
            email: contact.email,
            phone: contact.phone,
          }
        : null,
      current_step: step
        ? {
            id: step.id,
            type: step.type,
            label: campaignStepMeta(step.type).label,
            step_order: step.stepOrder,
            delay_days: step.delayDays,
            uses_template: campaignStepMeta(step.type).usesTemplate,
          }
        : null,
      rendered: {
        subject: rendered.subject,
        body: rendered.body,
      },
    };
  });

  const regions = [...regionsMeta.values()].sort((a, b) => {
    const ai = REGION_ORDER.indexOf(a.name);
    const bi = REGION_ORDER.indexOf(b.name);
    const aRank = ai === -1 ? REGION_ORDER.length : ai;
    const bRank = bi === -1 ? REGION_ORDER.length : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.name.localeCompare(b.name, 'de');
  });

  const [todayRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(campaignLeadAction)
    .where(sql`${campaignLeadAction.actedAt} >= (
      date_trunc('day', now() AT TIME ZONE 'Europe/Berlin')
      AT TIME ZONE 'Europe/Berlin'
    )`);

  return NextResponse.json({
    items,
    campaigns: [...campaignsMeta.values()].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    regions,
    meta: {
      total: items.length,
      today_done: todayRow?.total ?? 0,
    },
  });
}
