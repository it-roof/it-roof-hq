import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireScoutToken } from '@/lib/auth/require-scout-token';
import { getLeadsDb } from '@/lib/leads/db';
import { lead } from '@/lib/leads/schema';
import { nowIso } from '@/lib/leads/http';
import { normalizeDomain, parseCompanyName } from '@/lib/leads/normalize';
import {
  ensureRegionSearchQuery,
  fillLeadNulls,
  findLeadByDomain,
  findLeadByCompanyName,
  publicLead,
  scoutLeadInsertValues,
} from '@/lib/leads/scout-queries';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = requireScoutToken(req);
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const parsedName = parseCompanyName(body.company_name ?? body.companyName);
    const domainOnly = normalizeDomain(body.domain);
    if (parsedName.generic && !domainOnly) {
      return NextResponse.json(
        { error: 'company_name ist zu generisch' },
        { status: 400 },
      );
    }
    const db = getLeadsDb();
    const searchQueryId = await ensureRegionSearchQuery(db, body.region);

    if (parsedName.generic && domainOnly) {
      const current = await findLeadByDomain(db, domainOnly);
      if (!current) {
        return NextResponse.json(
          { error: 'company_name ist zu generisch' },
          { status: 400 },
        );
      }
      const [updated] = await db
        .update(lead)
        .set({ emailOutreachBlocked: true })
        .where(eq(lead.id, current.id))
        .returning();
      return NextResponse.json({
        ok: true,
        action: 'updated',
        lead: publicLead(updated ?? current),
        ids: { lead_id: current.id },
      });
    }

    const values = scoutLeadInsertValues(body);
    const byDomain = await findLeadByDomain(db, values.domain);
    const current = byDomain ?? await findLeadByCompanyName(db, values.companyName);

    if (current) {
      const updates: Partial<typeof lead.$inferInsert> = {
        emailOutreachBlocked: true,
      };

      if (byDomain) {
        Object.assign(updates, fillLeadNulls(current, { ...values, searchQueryId }));
      } else {
        if (body.company_name !== undefined || body.companyName !== undefined) {
          updates.companyName = values.companyName;
        }
        if (body.domain !== undefined) {
          const nextDomain = normalizeDomain(body.domain);
          if (nextDomain && nextDomain !== current.domain) {
            const taken = await findLeadByDomain(db, nextDomain);
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
        if (body.firm_size !== undefined || body.firmSize !== undefined) {
          updates.firmSize = values.firmSize;
        }
        if (body.specialties !== undefined) updates.specialties = values.specialties;
        if (body.source_url !== undefined || body.sourceUrl !== undefined) {
          updates.sourceUrl = values.sourceUrl;
        }
        if (body.fit_reason !== undefined || body.fitReason !== undefined) {
          updates.fitReason = values.fitReason;
        }
        if (searchQueryId) updates.searchQueryId = searchQueryId;
        if (updates.domain !== undefined && !current.domain && updates.domain) {
          if (current.status === 'error_no_domain') updates.status = 'raw';
        }
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
