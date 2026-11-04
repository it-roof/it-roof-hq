import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireScoutToken } from '@/lib/auth/require-scout-token';
import { getLeadsDb } from '@/lib/leads/db';
import { lead } from '@/lib/leads/schema';
import { nowIso } from '@/lib/leads/http';
import { normalizeDomain } from '@/lib/leads/normalize';
import {
  ensureRegionSearchQuery,
  findScoutLead,
  publicLead,
  scoutLeadInsertValues,
} from '@/lib/leads/scout-queries';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = requireScoutToken(req);
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const values = scoutLeadInsertValues(body);
    const db = getLeadsDb();
    const searchQueryId = await ensureRegionSearchQuery(db, body.region);
    const current = await findScoutLead(db, {
      domain: values.domain,
      companyName: values.companyName,
    });

    if (current) {
      const updates: Partial<typeof lead.$inferInsert> = {};
      if (body.company_name !== undefined || body.companyName !== undefined) {
        updates.companyName = values.companyName;
      }
      if (body.domain !== undefined) {
        const nextDomain = normalizeDomain(body.domain);
        if (nextDomain && nextDomain !== current.domain) {
          const taken = await findScoutLead(db, { domain: nextDomain });
          if (taken && taken.id !== current.id) {
            return NextResponse.json(
              { error: 'domain bereits vergeben' },
              { status: 409 },
            );
          }
          updates.domain = nextDomain;
        } else if (!nextDomain) {
          updates.domain = null;
        }
      }
      if (body.street !== undefined) updates.street = values.street;
      if (body.city !== undefined) updates.city = values.city;
      if (body.phone !== undefined) updates.phone = values.phone;
      if (body.industry !== undefined) updates.industry = values.industry;
      if (searchQueryId) updates.searchQueryId = searchQueryId;
      if (updates.domain !== undefined && !current.domain && updates.domain) {
        if (current.status === 'error_no_domain') updates.status = 'raw';
      }

      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ ok: true, action: 'updated', lead: publicLead(current) });
      }

      const [updated] = await db
        .update(lead)
        .set(updates)
        .where(eq(lead.id, current.id))
        .returning();
      return NextResponse.json({
        ok: true,
        action: 'updated',
        lead: publicLead(updated ?? current),
        ids: { lead_id: current.id },
      });
    }

    const [created] = await db
      .insert(lead)
      .values({
        ...values,
        searchQueryId,
        createdAt: nowIso(),
      })
      .returning();
    return NextResponse.json(
      {
        ok: true,
        action: 'created',
        lead: publicLead(created),
        ids: { lead_id: created.id },
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Fehler' }, { status: 400 });
  }
}
