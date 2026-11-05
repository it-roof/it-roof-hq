import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireKanzleiMailToken } from '@/lib/auth/require-kanzlei-mail-token';
import { botCatchResponse } from '@/lib/leads/bot-error';
import { fillContactEmailWithLock, insertContactWithEmailLock } from '@/lib/leads/contact-email-lock';
import { getLeadsDb } from '@/lib/leads/db';
import { emptyToNull, nowIso } from '@/lib/leads/http';
import { normalizeEmail } from '@/lib/leads/email-check';
import { contactEmailConflict, hasLeadLocator, personNameFromBody } from '@/lib/leads/kanzlei-mail';
import { parseCompanyName } from '@/lib/leads/normalize';
import { lead, leadContact } from '@/lib/leads/schema';
import {
  contactFieldsFromBody,
  fillContactNulls,
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
    if (!hasLeadLocator(body)) {
      return NextResponse.json(
        { error: 'lead_id, domain oder company_name erforderlich' },
        { status: 400 },
      );
    }

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
      return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 });
    }

    const byEmail = email ? await findContactByEmail(db, email) : null;
    const emailConflict = contactEmailConflict(byEmail?.leadId, leadId);
    if (emailConflict) {
      return NextResponse.json(
        { error: emailConflict.error },
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
      const updates = fillContactNulls(existing, { ...patch, email });
      const nextEmail = updates.email ?? null;
      delete updates.email;
      if (Object.keys(updates).length > 0) {
        await db
          .update(leadContact)
          .set({ ...updates, updatedAt: ts })
          .where(eq(leadContact.id, existing.id));
      }
      if (nextEmail) {
        const fill = await fillContactEmailWithLock(existing.id, nextEmail, ts);
        if (fill === 'taken') {
          return NextResponse.json(
            { error: 'E-Mail gehört zu einem anderen Lead' },
            { status: 409 },
          );
        }
      }
      const [updated] = await db
        .select()
        .from(leadContact)
        .where(eq(leadContact.id, existing.id))
        .limit(1);
      return NextResponse.json({
        ok: true,
        action: 'updated',
        contact: publicContact(updated ?? existing),
        ids: { contact_id: existing.id, lead_id: existing.leadId },
      });
    }

    if (email) {
      const created = await insertContactWithEmailLock({
        leadId,
        salutation: patch.salutation ?? emptyToNull(body.salutation),
        firstName: first,
        lastName: last,
        position: patch.position ?? emptyToNull(body.position ?? body.rolle ?? body.role),
        email,
        phone: patch.phone ?? emptyToNull(body.phone),
        createdAt: ts,
        updatedAt: ts,
      });
      if (!created) {
        const raced = await findContactByEmail(db, email);
        const racedConflict = contactEmailConflict(raced?.leadId, leadId);
        if (racedConflict) {
          return NextResponse.json({ error: racedConflict.error }, { status: racedConflict.status });
        }
        if (raced) {
          const updates = fillContactNulls(raced, { ...patch, email });
          delete updates.email;
          if (Object.keys(updates).length > 0) {
            const [updated] = await db
              .update(leadContact)
              .set({ ...updates, updatedAt: ts })
              .where(eq(leadContact.id, raced.id))
              .returning();
            return NextResponse.json({
              ok: true,
              action: 'updated',
              contact: publicContact(updated ?? raced),
              ids: { contact_id: raced.id, lead_id: raced.leadId },
            });
          }
          return NextResponse.json({
            ok: true,
            action: 'updated',
            contact: publicContact(raced),
            ids: { contact_id: raced.id, lead_id: raced.leadId },
          });
        }
        throw new Error('Kontakt konnte nicht angelegt werden');
      }
      const [row] = await db
        .select()
        .from(leadContact)
        .where(eq(leadContact.id, created.id))
        .limit(1);
      return NextResponse.json(
        {
          ok: true,
          action: 'created',
          contact: publicContact(row!),
          ids: { contact_id: created.id, lead_id: leadId },
        },
        { status: 201 },
      );
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
    return botCatchResponse(e, 'kanzlei-mail.contacts');
  }
}
