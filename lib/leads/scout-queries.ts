import { and, eq, inArray, sql } from 'drizzle-orm';
import { getLeadsDb } from '@/lib/leads/db';
import { campaignContact, lead, leadContact, searchQuery, searchQueryTag, tag } from '@/lib/leads/schema';
import { emptyToNull, nowIso } from '@/lib/leads/http';
import {
  normalizeCompanyName,
  normalizeDomain,
  normalizeLinkedInUrl,
  parseCompanyName,
  parseOptionalDate,
} from '@/lib/leads/normalize';
import { normalizeEmail } from '@/lib/leads/email-check';
import {
  LAW_FIRM_INDUSTRY,
  REGION_SEARCH,
  parseRegionKey,
} from '@/lib/leads/linkedin-status';
import { parseCampaignContactStatus } from '@/lib/leads/campaign-channel';

export type LeadsDb = ReturnType<typeof getLeadsDb>;

export function publicLead(row: typeof lead.$inferSelect) {
  return {
    id: row.id,
    company_name: row.companyName,
    domain: row.domain,
    street: row.street,
    city: row.city,
    country_code: row.countryCode,
    phone: row.phone,
    industry: row.industry,
    status: row.status,
    outreach_status: row.outreachStatus,
    outreach_status_at: row.outreachStatusAt,
    created_at: row.createdAt,
    search_query_id: row.searchQueryId,
    firm_size: row.firmSize,
    specialties: row.specialties,
    source_url: row.sourceUrl,
    fit_reason: row.fitReason,
    source: row.source,
    notes: row.notes,
    email_outreach_blocked: row.emailOutreachBlocked,
  };
}

export function publicContact(row: typeof leadContact.$inferSelect) {
  return {
    id: row.id,
    lead_id: row.leadId,
    salutation: row.salutation,
    first_name: row.firstName,
    last_name: row.lastName,
    position: row.position,
    email: row.email,
    phone: row.phone,
    linkedin_url: row.linkedinUrl,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function publicCampaignContact(row: typeof campaignContact.$inferSelect) {
  return {
    id: row.id,
    campaign_id: row.campaignId,
    lead_contact_id: row.leadContactId,
    status: row.status,
    status_at: row.statusAt,
    notes: row.notes,
    next_step: row.nextStep,
    requested_at: row.requestedAt,
    accepted_at: row.acceptedAt,
    write_from: row.writeFrom,
    written_at: row.writtenAt,
    replied_at: row.repliedAt,
    draft_subject: row.draftSubject,
    draft_body: row.draftBody,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function findLeadByDomain(db: LeadsDb, domain: unknown) {
  const domainNorm = normalizeDomain(domain);
  if (!domainNorm) return null;
  const [row] = await db
    .select()
    .from(lead)
    .where(
      sql`lower(regexp_replace(regexp_replace(coalesce(${lead.domain}, ''), '^https?://', '', 'i'), '^www\\.', '', 'i')) = ${domainNorm}`,
    )
    .limit(1);
  return row ?? null;
}

function companyKeyMatch(parsed: ReturnType<typeof parseCompanyName>) {
  const key = parsed.aliasFamily === 'fels'
    ? 'fels'
    : parsed.aliasFamily === 'roedl'
      ? 'rödl'
      : parsed.key;
  if (!key) return null;
  if (parsed.aliasFamily) {
    const prefix = `${key} %`;
    return sql`(
      scout_company_name_key(${lead.companyName}) = ${key}
      OR scout_company_name_key(${lead.companyName}) LIKE ${prefix}
    )`;
  }
  return sql`scout_company_name_key(${lead.companyName}) = ${key}`;
}

export async function findLeadByCompanyName(db: LeadsDb, companyName: unknown) {
  const parsed = parseCompanyName(companyName);
  if (parsed.generic || !parsed.key) return null;
  const match = companyKeyMatch(parsed);
  if (!match) return null;
  const [row] = await db.select().from(lead).where(match).limit(1);
  return row ?? null;
}

export async function findScoutLead(
  db: LeadsDb,
  opts: { domain?: unknown; companyName?: unknown },
) {
  const byDomain = await findLeadByDomain(db, opts.domain);
  if (byDomain) return byDomain;
  return findLeadByCompanyName(db, opts.companyName);
}

export async function findContactByLinkedIn(db: LeadsDb, linkedin: unknown) {
  const url = normalizeLinkedInUrl(linkedin);
  if (!url) return null;
  const [row] = await db
    .select()
    .from(leadContact)
    .where(eq(leadContact.linkedinUrl, url))
    .limit(1);
  return row ?? null;
}

/** Gleicher Ausdruck wie Index lead_contact_email_norm_idx. */
export const emailNormSql = sql`lower(trim(${leadContact.email}))`;

export async function findContactByEmail(db: LeadsDb, email: unknown) {
  const norm = normalizeEmail(typeof email === 'string' ? email : String(email ?? ''));
  if (!norm) return null;
  const [row] = await db
    .select()
    .from(leadContact)
    .where(sql`${emailNormSql} = ${norm}`)
    .limit(1);
  return row ?? null;
}

export async function findContactByNameOnLead(
  db: LeadsDb,
  leadId: string,
  firstName: unknown,
  lastName: unknown,
) {
  const first = String(firstName ?? '').trim().toLowerCase();
  const last = String(lastName ?? '').trim().toLowerCase();
  if (!first && !last) return null;
  const [row] = await db
    .select()
    .from(leadContact)
    .where(
      and(
        eq(leadContact.leadId, leadId),
        sql`lower(coalesce(${leadContact.firstName}, '')) = ${first}`,
        sql`lower(coalesce(${leadContact.lastName}, '')) = ${last}`,
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function ensureRegionSearchQuery(db: LeadsDb, region: unknown) {
  const key = parseRegionKey(region);
  if (!key) return null;
  const { query, tag: tagName } = REGION_SEARCH[key];
  const ts = nowIso();

  const [existing] = await db
    .select({ id: searchQuery.id })
    .from(searchQuery)
    .where(eq(searchQuery.query, query))
    .limit(1);

  let searchQueryId = existing?.id ?? null;
  if (!searchQueryId) {
    const [created] = await db
      .insert(searchQuery)
      .values({ query, searched: false, createdAt: ts })
      .returning({ id: searchQuery.id });
    searchQueryId = created?.id ?? null;
  }
  if (!searchQueryId) return null;

  const [tagRow] = await db
    .select({ id: tag.id })
    .from(tag)
    .where(eq(tag.name, tagName))
    .limit(1);
  if (tagRow) {
    await db
      .insert(searchQueryTag)
      .values({ searchQueryId, tagId: tagRow.id })
      .onConflictDoNothing({ target: [searchQueryTag.searchQueryId, searchQueryTag.tagId] });
  }
  return searchQueryId;
}

export async function contactsWithCampaigns(db: LeadsDb, leadId: string) {
  const contacts = await db
    .select()
    .from(leadContact)
    .where(eq(leadContact.leadId, leadId));
  if (contacts.length === 0) return [];
  const ids = contacts.map((c) => c.id);
  const statuses = await db
    .select()
    .from(campaignContact)
    .where(inArray(campaignContact.leadContactId, ids));
  const byContact = new Map<string, (typeof statuses)[number][]>();
  for (const row of statuses) {
    const list = byContact.get(row.leadContactId) ?? [];
    list.push(row);
    byContact.set(row.leadContactId, list);
  }
  return contacts.map((c) => ({
    ...publicContact(c),
    campaign_contacts: (byContact.get(c.id) ?? []).map(publicCampaignContact),
  }));
}

export function leadFieldsFromBody(body: Record<string, unknown>) {
  const parsed = parseCompanyName(body.company_name ?? body.companyName);
  if (parsed.generic) {
    throw new Error('company_name ist zu generisch');
  }
  const companyName = parsed.displayName ?? normalizeCompanyName(body.company_name ?? body.companyName);
  if (!companyName) throw new Error('company_name erforderlich');
  const domain = normalizeDomain(body.domain ?? body.website);
  const industry =
    emptyToNull(body.industry) ?? LAW_FIRM_INDUSTRY;
  return {
    companyName,
    domain,
    street: emptyToNull(body.street),
    city: emptyToNull(body.city ?? body.ort),
    countryCode: emptyToNull(body.country_code ?? body.countryCode) ?? 'DE',
    phone: emptyToNull(body.phone),
    industry,
    status: domain ? (emptyToNull(body.status) ?? 'raw') : 'error_no_domain',
    firmSize: emptyToNull(body.firm_size ?? body.firmSize),
    specialties: emptyToNull(body.specialties),
    sourceUrl: emptyToNull(body.source_url ?? body.sourceUrl),
    fitReason: emptyToNull(body.fit_reason ?? body.fitReason),
    source: emptyToNull(body.source),
    notes: emptyToNull(body.notes),
  };
}

export function scoutLeadInsertValues(body: Record<string, unknown>) {
  return { ...leadFieldsFromBody(body), emailOutreachBlocked: true };
}

export function fillLeadNulls(
  current: typeof lead.$inferSelect,
  next: Partial<typeof lead.$inferInsert>,
) {
  const updates: Partial<typeof lead.$inferInsert> = {};
  const take = <K extends keyof typeof lead.$inferSelect>(
    col: K,
    insertKey: keyof typeof lead.$inferInsert,
    value: unknown,
  ) => {
    if (value === undefined) return;
    const cur = current[col];
    if (cur == null || cur === '') {
      (updates as Record<string, unknown>)[insertKey as string] = value;
    }
  };
  take('companyName', 'companyName', next.companyName);
  take('street', 'street', next.street);
  take('city', 'city', next.city);
  take('countryCode', 'countryCode', next.countryCode);
  take('phone', 'phone', next.phone);
  take('industry', 'industry', next.industry);
  take('firmSize', 'firmSize', next.firmSize);
  take('specialties', 'specialties', next.specialties);
  take('sourceUrl', 'sourceUrl', next.sourceUrl);
  take('fitReason', 'fitReason', next.fitReason);
  take('source', 'source', next.source);
  take('notes', 'notes', next.notes);
  take('searchQueryId', 'searchQueryId', next.searchQueryId);
  if (!current.domain && next.domain) {
    updates.domain = next.domain;
    if (current.status === 'error_no_domain') updates.status = 'raw';
  }
  return updates;
}

export function fillContactNulls(
  current: typeof leadContact.$inferSelect,
  next: Partial<typeof leadContact.$inferInsert>,
) {
  const updates: Partial<typeof leadContact.$inferInsert> = {};
  const take = <K extends keyof typeof leadContact.$inferSelect>(
    col: K,
    insertKey: keyof typeof leadContact.$inferInsert,
    value: unknown,
  ) => {
    if (value === undefined) return;
    const cur = current[col];
    if (cur == null || cur === '') {
      (updates as Record<string, unknown>)[insertKey as string] = value;
    }
  };
  take('salutation', 'salutation', next.salutation);
  take('firstName', 'firstName', next.firstName);
  take('lastName', 'lastName', next.lastName);
  take('position', 'position', next.position);
  take('phone', 'phone', next.phone);
  take('linkedinUrl', 'linkedinUrl', next.linkedinUrl);
  if ((current.email == null || current.email === '') && next.email) {
    updates.email = next.email;
  }
  return updates;
}

export function contactFieldsFromBody(body: Record<string, unknown>) {
  const updates: Partial<typeof leadContact.$inferInsert> = {};
  if (body.salutation !== undefined) updates.salutation = emptyToNull(body.salutation);
  if (body.first_name !== undefined || body.firstName !== undefined) {
    updates.firstName = emptyToNull(body.first_name ?? body.firstName);
  }
  if (body.last_name !== undefined || body.lastName !== undefined) {
    updates.lastName = emptyToNull(body.last_name ?? body.lastName);
  }
  if (body.position !== undefined || body.rolle !== undefined || body.role !== undefined) {
    updates.position = emptyToNull(body.position ?? body.rolle ?? body.role);
  }
  if (body.email !== undefined) updates.email = normalizeEmail(emptyToNull(body.email));
  if (body.phone !== undefined) updates.phone = emptyToNull(body.phone);
  if (body.linkedin_url !== undefined || body.linkedin !== undefined || body.linkedinUrl !== undefined) {
    updates.linkedinUrl = normalizeLinkedInUrl(
      body.linkedin_url ?? body.linkedin ?? body.linkedinUrl,
    );
  }
  return updates;
}

export function campaignContactFieldsFromBody(
  body: Record<string, unknown>,
  parseStatus: (value: unknown) => string = parseCampaignContactStatus,
) {
  const updates: Partial<typeof campaignContact.$inferInsert> = {};
  if (body.status !== undefined) updates.status = parseStatus(body.status);
  if (body.notes !== undefined) updates.notes = emptyToNull(body.notes);
  if (body.next_step !== undefined || body.nextStep !== undefined) {
    updates.nextStep = emptyToNull(body.next_step ?? body.nextStep);
  }
  if (body.requested_at !== undefined || body.requestedAt !== undefined) {
    updates.requestedAt = parseOptionalDate(body.requested_at ?? body.requestedAt, 'requested_at');
  }
  if (body.accepted_at !== undefined || body.acceptedAt !== undefined) {
    updates.acceptedAt = parseOptionalDate(body.accepted_at ?? body.acceptedAt, 'accepted_at');
  }
  if (body.write_from !== undefined || body.writeFrom !== undefined) {
    updates.writeFrom = parseOptionalDate(body.write_from ?? body.writeFrom, 'write_from');
  }
  if (body.written_at !== undefined || body.writtenAt !== undefined || body.date !== undefined) {
    updates.writtenAt = parseOptionalDate(
      body.written_at ?? body.writtenAt ?? body.date,
      body.written_at !== undefined || body.writtenAt !== undefined ? 'written_at' : 'date',
    );
  }
  if (body.replied_at !== undefined || body.repliedAt !== undefined) {
    updates.repliedAt = parseOptionalDate(body.replied_at ?? body.repliedAt, 'replied_at');
  }
  if (body.draft_subject !== undefined || body.draftSubject !== undefined) {
    updates.draftSubject = emptyToNull(body.draft_subject ?? body.draftSubject);
  }
  if (body.draft_body !== undefined || body.draftBody !== undefined) {
    updates.draftBody = emptyToNull(body.draft_body ?? body.draftBody);
  }
  return updates;
}

export async function listCampaignContacts(
  db: LeadsDb,
  campaignId: string,
  status?: string | null,
) {
  const filters = [eq(campaignContact.campaignId, campaignId)];
  if (status) filters.push(eq(campaignContact.status, status));

  return db
    .select({
      id: campaignContact.id,
      campaign_id: campaignContact.campaignId,
      lead_contact_id: campaignContact.leadContactId,
      status: campaignContact.status,
      status_at: campaignContact.statusAt,
      notes: campaignContact.notes,
      next_step: campaignContact.nextStep,
      requested_at: campaignContact.requestedAt,
      accepted_at: campaignContact.acceptedAt,
      write_from: campaignContact.writeFrom,
      written_at: campaignContact.writtenAt,
      replied_at: campaignContact.repliedAt,
      draft_subject: campaignContact.draftSubject,
      draft_body: campaignContact.draftBody,
      created_at: campaignContact.createdAt,
      updated_at: campaignContact.updatedAt,
      first_name: leadContact.firstName,
      last_name: leadContact.lastName,
      linkedin_url: leadContact.linkedinUrl,
      email: leadContact.email,
      position: leadContact.position,
      lead_id: lead.id,
      company_name: lead.companyName,
      city: lead.city,
    })
    .from(campaignContact)
    .innerJoin(leadContact, eq(leadContact.id, campaignContact.leadContactId))
    .innerJoin(lead, eq(lead.id, leadContact.leadId))
    .where(and(...filters))
    .orderBy(lead.companyName, leadContact.lastName, leadContact.firstName);
}
