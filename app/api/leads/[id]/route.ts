import { NextRequest, NextResponse } from 'next/server';
import { getLeadsDb } from '@/lib/leads/db';
import { lead, leadContact } from '@/lib/leads/schema';
import { emptyToNull, nowIso } from '@/lib/leads/http';
import { isOutreachStatus } from '@/lib/leads/outreach-status';
import { eq, sql } from 'drizzle-orm';
import { requireSession, unauthorized } from '@/lib/auth/require-session';
import { writeAudit } from '@/lib/auth/audit';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await requireSession())) return unauthorized();
  const { id } = await params;
  const db = getLeadsDb();

  const [row] = await db
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
            ORDER BY ${leadContact.lastName} NULLS LAST
          ) FILTER (WHERE ${leadContact.id} IS NOT NULL),
          '[]'
        )
      `,
    })
    .from(lead)
    .leftJoin(leadContact, eq(leadContact.leadId, lead.id))
    .where(eq(lead.id, id))
    .groupBy(lead.id);

  if (!row) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireSession())) return unauthorized();
  const { id } = await params;
  const body = await req.json();
  const updates: Partial<typeof lead.$inferInsert> = {};

  if (body.company_name !== undefined || body.companyName !== undefined) {
    const v = (body.company_name ?? body.companyName ?? '').trim();
    if (!v) return NextResponse.json({ error: 'company_name erforderlich' }, { status: 400 });
    updates.companyName = v;
  }
  if (body.domain !== undefined) updates.domain = emptyToNull(body.domain);
  if (body.street !== undefined) updates.street = emptyToNull(body.street);
  if (body.city !== undefined) updates.city = emptyToNull(body.city);
  if (body.country_code !== undefined || body.countryCode !== undefined) {
    updates.countryCode = emptyToNull(body.country_code ?? body.countryCode);
  }
  if (body.phone !== undefined) updates.phone = emptyToNull(body.phone);
  if (body.industry !== undefined) updates.industry = emptyToNull(body.industry);
  if (body.status !== undefined) updates.status = String(body.status).trim();
  if (body.outreach_status !== undefined || body.outreachStatus !== undefined) {
    const v = String(body.outreach_status ?? body.outreachStatus ?? '').trim();
    if (!isOutreachStatus(v)) {
      return NextResponse.json(
        {
          error:
            'outreach_status muss open, valid, invalid, domain_dead, skip oder bounced sein',
        },
        { status: 400 },
      );
    }
    updates.outreachStatus = v;
    updates.outreachStatusAt = nowIso();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nichts zu updaten' }, { status: 400 });
  }

  const db = getLeadsDb();
  const [row] = await db.update(lead).set(updates).where(eq(lead.id, id)).returning();
  if (!row) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  return NextResponse.json({ ok: true, lead: row });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!(await requireSession())) return unauthorized();
  const { id } = await params;
  const db = getLeadsDb();
  const [row] = await db.delete(lead).where(eq(lead.id, id)).returning({ id: lead.id });
  if (!row) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  await writeAudit({ action: 'lead.delete', resource: 'lead', resourceId: id });
  return NextResponse.json({ ok: true });
}
