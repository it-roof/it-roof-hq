import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireKanzleiMailToken } from '@/lib/auth/require-kanzlei-mail-token';
import { getLeadsDb } from '@/lib/leads/db';
import { emptyToNull, nowIso } from '@/lib/leads/http';
import { normalizeEmail } from '@/lib/leads/email-check';
import { contactEmailConflict, personNameFromBody } from '@/lib/leads/kanzlei-mail';
import { parseCompanyName } from '@/lib/leads/normalize';
import { lead, leadContact } from '@/lib/leads/schema';
import {
  contactFieldsFromBody,
  findContactByEmail,
  findContactByNameOnLead,
  findLeadByCompanyName,
  findLeadByDomain,
  publicContact,
} from '@/lib/leads/scout-queries';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = requireKanzleiMailToken(req);
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const db = getLeadsDb();
    const ts = nowIso();
    const names = personNameFromBody(body);
    const patch = contactFieldsFromBody({
      ...body,
      first_name: body.first_name ?? body.firstName ?? names.firstName,
      last_name: body.last_name ?? body.lastName ?? names.lastName,
    });
    const first = patch.firstName ?? names.firstName;
    const last = patch.lastName ?? names.lastName;
    const email = normalizeEmail(patch.email ?? emptyToNull(body.email));

    const explicitLeadId = emptyToNull(body.lead_id ?? body.leadId);
    if (explicitLeadId) {
      const [exists] = await db
        .select({ id: lead.id })
        .from(lead)
        .where(eq(lead.id, explicitLeadId))
        .limit(1);
      if (!exists) {
        return NextResponse.json({ error: 'lead_id unbekannt' }, { status: 404 });
      }
    }

    const parsed = parseCompanyName(body.company_name ?? body.companyName);
    const byDomain = await findLeadByDomain(db, body.domain ?? body.website);
    const byName = parsed.generic
      ? null
      : await findLeadByCompanyName(db, body.company_name ?? body.companyName);
    const leadId = explicitLeadId ?? byDomain?.id ?? byName?.id ?? null;
    if (!leadId) {
      return NextResponse.json(
        { error: 'lead_id, domain oder company_name erforderlich' },
        { status: 404 },
      );
    }

    const byEmail = email ? await findContactByEmail(db, email) : null;
    const emailConflict = contactEmailConflict(byEmail?.leadId, leadId);
    if (emailConflict) {
      return NextResponse.json(
        {
          error: emailConflict.error,
          lead_id: byEmail?.leadId,
          contact_id: byEmail?.id,
        },
        { status: emailConflict.status },
      );
    }

    let existing = byEmail && byEmail.leadId === leadId ? byEmail : null;
    if (!existing) {
      existing = await findContactByNameOnLead(db, leadId, first, last);
    }

    if (!existing && !first && !last && !email) {
      throw new Error('name oder email erforderlich');
    }

    if (existing) {
      const [updated] = await db
        .update(leadContact)
        .set({
          ...patch,
          email: email ?? existing.email,
          updatedAt: ts,
        })
        .where(eq(leadContact.id, existing.id))
        .returning();
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
        position: patch.position ?? emptyToNull(body.position ?? body.rolle ?? body.role),
        email,
        phone: patch.phone ?? emptyToNull(body.phone),
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
