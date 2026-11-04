import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireScoutToken } from '@/lib/auth/require-scout-token';
import { getLeadsDb } from '@/lib/leads/db';
import { lead, leadContact } from '@/lib/leads/schema';
import { emptyToNull, nowIso } from '@/lib/leads/http';
import { normalizeLinkedInUrl } from '@/lib/leads/normalize';
import {
  contactFieldsFromBody,
  findContactByLinkedIn,
  findScoutLead,
  publicContact,
  scoutLeadInsertValues,
  ensureRegionSearchQuery,
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

    let leadId = emptyToNull(body.lead_id ?? body.leadId);
    if (leadId) {
      const [exists] = await db.select({ id: lead.id }).from(lead).where(eq(lead.id, leadId)).limit(1);
      if (!exists) throw new Error('lead_id unbekannt');
    } else {
      const found = await findScoutLead(db, {
        domain: body.domain,
        companyName: body.company_name ?? body.companyName,
      });
      if (found) {
        leadId = found.id;
      } else if (body.company_name ?? body.companyName) {
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
      }
    }

    const patch = contactFieldsFromBody(body);
    const current = linkedinUrl ? await findContactByLinkedIn(db, linkedinUrl) : null;

    if (current) {
      const updates: Partial<typeof leadContact.$inferInsert> = {
        ...patch,
        updatedAt: ts,
      };
      if (leadId) updates.leadId = leadId;
      if (linkedinUrl) updates.linkedinUrl = linkedinUrl;
      const [updated] = await db
        .update(leadContact)
        .set(updates)
        .where(eq(leadContact.id, current.id))
        .returning();
      return NextResponse.json({
        ok: true,
        action: 'updated',
        contact: publicContact(updated),
        ids: { contact_id: updated.id, lead_id: updated.leadId },
      });
    }

    if (!leadId) throw new Error('lead_id oder company_name erforderlich');
    if (!patch.firstName && !patch.lastName) {
      throw new Error('first_name oder last_name erforderlich');
    }

    const [created] = await db
      .insert(leadContact)
      .values({
        leadId,
        salutation: patch.salutation ?? emptyToNull(body.salutation),
        firstName: patch.firstName ?? emptyToNull(body.first_name ?? body.firstName),
        lastName: patch.lastName ?? emptyToNull(body.last_name ?? body.lastName),
        position: patch.position ?? emptyToNull(body.position),
        email: patch.email ?? emptyToNull(body.email),
        phone: patch.phone ?? emptyToNull(body.phone),
        linkedinUrl,
        createdAt: ts,
        updatedAt: ts,
      })
      .returning();

    return NextResponse.json(
      {
        ok: true,
        action: 'created',
        contact: publicContact(created),
        ids: { contact_id: created.id, lead_id: created.leadId },
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Fehler' }, { status: 400 });
  }
}
