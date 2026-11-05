import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireKanzleiMailToken } from '@/lib/auth/require-kanzlei-mail-token';
import { getLeadsDb } from '@/lib/leads/db';
import { emptyToNull, nowIso } from '@/lib/leads/http';
import { domainTakenConflict, pickLeadMatch } from '@/lib/leads/kanzlei-mail';
import { normalizeDomain, parseCompanyName } from '@/lib/leads/normalize';
import { lead } from '@/lib/leads/schema';
import {
  ensureRegionSearchQuery,
  fillLeadNulls,
  findLeadByCompanyName,
  findLeadByDomain,
  leadFieldsFromBody,
  publicLead,
} from '@/lib/leads/scout-queries';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = requireKanzleiMailToken(req);
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const parsedName = parseCompanyName(body.company_name ?? body.companyName);
    const domainOnly = normalizeDomain(body.domain ?? body.website);
    if (parsedName.generic && !domainOnly) {
      return NextResponse.json(
        { error: 'company_name ist zu generisch' },
        { status: 400 },
      );
    }

    const db = getLeadsDb();
    const searchQueryId = await ensureRegionSearchQuery(db, body.region);
    const extras = {
      city: emptyToNull(body.city ?? body.ort),
      specialties: emptyToNull(body.specialties),
      sourceUrl: emptyToNull(body.source_url ?? body.sourceUrl),
      source: emptyToNull(body.source),
      notes: emptyToNull(body.notes),
      searchQueryId,
    };

    if (parsedName.generic && domainOnly) {
      const current = await findLeadByDomain(db, domainOnly);
      if (!current) {
        return NextResponse.json(
          { error: 'company_name ist zu generisch' },
          { status: 400 },
        );
      }
      const updates = fillLeadNulls(current, extras);
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({
          ok: true,
          action: 'updated',
          lead: publicLead(current),
          ids: { lead_id: current.id },
        });
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

    const values = leadFieldsFromBody(body);
    const byDomain = await findLeadByDomain(db, values.domain);
    const byCompany = byDomain
      ? null
      : await findLeadByCompanyName(db, values.companyName);
    const current = pickLeadMatch(byDomain, byCompany);

    if (current) {
      const updates = fillLeadNulls(current, { ...values, ...extras });
      if (updates.domain) {
        const taken = await findLeadByDomain(db, updates.domain);
        const conflict = domainTakenConflict(current.id, taken?.id);
        if (conflict) return NextResponse.json({ error: conflict.error }, { status: conflict.status });
      }
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({
          ok: true,
          action: 'updated',
          lead: publicLead(current),
          ids: { lead_id: current.id },
        });
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
        source: extras.source,
        notes: extras.notes,
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
