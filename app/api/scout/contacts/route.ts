import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireScoutToken } from '@/lib/auth/require-scout-token';
import { getLeadsDb } from '@/lib/leads/db';
import { lead, leadContact } from '@/lib/leads/schema';
import { emptyToNull, nowIso } from '@/lib/leads/http';
import {
  normalizeDomain,
  normalizeLinkedInUrl,
  parseCompanyName,
  personalFirmName,
} from '@/lib/leads/normalize';
import {
  contactFieldsFromBody,
  ensureRegionSearchQuery,
  findContactByLinkedIn,
  findContactByNameOnLead,
  findLeadByCompanyName,
  findLeadByDomain,
  publicContact,
  publicLead,
  scoutLeadInsertValues,
} from '@/lib/leads/scout-queries';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = requireScoutToken(req);
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const db = getLeadsDb();
    const ts = nowIso();
    const linkedinUrl = normalizeLinkedInUrl(
      body.linkedin_url ?? body.linkedin ?? body.linkedinUrl,
    );

    const firstName = emptyToNull(body.first_name ?? body.firstName);
    const lastName = emptyToNull(body.last_name ?? body.lastName);
    const city = emptyToNull(body.city);
    const patch = contactFieldsFromBody(body);
    const first = patch.firstName ?? firstName;
    const last = patch.lastName ?? lastName;

    const explicitLeadId = emptyToNull(body.lead_id ?? body.leadId);
    if (explicitLeadId) {
      const [exists] = await db
        .select({ id: lead.id })
        .from(lead)
        .where(eq(lead.id, explicitLeadId))
        .limit(1);
      if (!exists) throw new Error('lead_id unbekannt');
    }

    const parsed = parseCompanyName(body.company_name ?? body.companyName);
    const byDomain = await findLeadByDomain(db, body.domain);
    const byName = parsed.generic
      ? null
      : await findLeadByCompanyName(db, body.company_name ?? body.companyName);
    const matchedLeadId = explicitLeadId ?? byDomain?.id ?? byName?.id ?? null;

    const currentLi = linkedinUrl ? await findContactByLinkedIn(db, linkedinUrl) : null;
    if (currentLi && matchedLeadId && currentLi.leadId !== matchedLeadId) {
      return NextResponse.json(
        {
          error: 'linkedin_url gehört zu einem anderen Lead',
          lead_id: currentLi.leadId,
          contact_id: currentLi.id,
        },
        { status: 409 },
      );
    }

    let leadId = matchedLeadId ?? currentLi?.leadId ?? null;
    let existing = currentLi;
    if (!existing && leadId && !linkedinUrl) {
      existing = await findContactByNameOnLead(db, leadId, first, last);
    }

    if (!existing && !first && !last) {
      throw new Error('first_name oder last_name erforderlich');
    }

    let createdLeadId: string | null = null;
    if (!leadId) {
      const needsPersonal = parsed.generic
        || (!(body.company_name ?? body.companyName) && !normalizeDomain(body.domain));
      if (needsPersonal) {
        if (!first && !last) {
          throw new Error('lead_id oder company_name erforderlich');
        }
        const searchQueryId = await ensureRegionSearchQuery(db, body.region);
        const [createdLead] = await db
          .insert(lead)
          .values({
            companyName: personalFirmName(first, last, city),
            domain: null,
            city,
            countryCode: emptyToNull(body.country_code ?? body.countryCode) ?? 'DE',
            phone: emptyToNull(body.phone),
            industry: emptyToNull(body.industry),
            status: 'error_no_domain',
            firmSize: emptyToNull(body.firm_size ?? body.firmSize),
            specialties: emptyToNull(body.specialties),
            sourceUrl: emptyToNull(body.source_url ?? body.sourceUrl),
            fitReason: emptyToNull(body.fit_reason ?? body.fitReason),
            emailOutreachBlocked: true,
            searchQueryId,
            createdAt: ts,
          })
          .returning({ id: lead.id });
        leadId = createdLead.id;
        createdLeadId = createdLead.id;
      } else if (body.company_name ?? body.companyName ?? body.domain) {
        const values = scoutLeadInsertValues(body);
        const searchQueryId = await ensureRegionSearchQuery(db, body.region);
        const [createdLead] = await db
          .insert(lead)
          .values({
            ...values,
            searchQueryId,
            createdAt: ts,
          })
          .returning({ id: lead.id });
        leadId = createdLead.id;
        createdLeadId = createdLead.id;
      }
    }

    if (!leadId) throw new Error('lead_id oder company_name erforderlich');

    try {
      if (existing) {
        const [updated] = await db
          .update(leadContact)
          .set({
            ...patch,
            linkedinUrl: linkedinUrl ?? existing.linkedinUrl,
            updatedAt: ts,
          })
          .where(eq(leadContact.id, existing.id))
          .returning();
        if (!createdLeadId) {
          await db
            .update(lead)
            .set({ emailOutreachBlocked: true })
            .where(eq(lead.id, leadId));
        }
        return NextResponse.json({
          ok: true,
          action: 'updated',
          contact: publicContact(updated),
          ids: { contact_id: updated.id, lead_id: updated.leadId },
        });
      }

      const [created] = await db
        .insert(leadContact)
        .values({
          leadId,
          salutation: patch.salutation ?? emptyToNull(body.salutation),
          firstName: first,
          lastName: last,
          position: patch.position ?? emptyToNull(body.position),
          email: patch.email ?? emptyToNull(body.email),
          phone: patch.phone ?? emptyToNull(body.phone),
          linkedinUrl,
          createdAt: ts,
          updatedAt: ts,
        })
        .returning();

      if (!createdLeadId) {
        await db
          .update(lead)
          .set({ emailOutreachBlocked: true })
          .where(eq(lead.id, leadId));
      }

      const [createdLead] = await db.select().from(lead).where(eq(lead.id, leadId)).limit(1);

      return NextResponse.json(
        {
          ok: true,
          action: 'created',
          contact: publicContact(created),
          lead: createdLead ? publicLead(createdLead) : undefined,
          ids: { contact_id: created.id, lead_id: created.leadId },
        },
        { status: 201 },
      );
    } catch (writeErr) {
      if (createdLeadId) {
        await db.delete(lead).where(eq(lead.id, createdLeadId));
      }
      throw writeErr;
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Fehler' }, { status: 400 });
  }
}
