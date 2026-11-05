import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireSession, unauthorized } from '@/lib/auth/require-session';
import { getLeadsDb } from '@/lib/leads/db';
import { campaignContact } from '@/lib/leads/schema';
import { botCatchResponse } from '@/lib/leads/bot-error';
import { nowIso } from '@/lib/leads/http';
import { campaignContactFieldsFromBody, publicCampaignContact } from '@/lib/leads/scout-queries';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireSession())) return unauthorized();
  const { id } = await params;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const fields = campaignContactFieldsFromBody(body);
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'Nichts zu updaten' }, { status: 400 });
    }
    const db = getLeadsDb();
    const [existing] = await db
      .select()
      .from(campaignContact)
      .where(eq(campaignContact.id, id))
      .limit(1);
    if (!existing) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

    const ts = nowIso();
    const statusChanged = fields.status !== undefined && fields.status !== existing.status;
    const [updated] = await db
      .update(campaignContact)
      .set({
        ...fields,
        statusAt: statusChanged ? ts : existing.statusAt,
        updatedAt: ts,
      })
      .where(eq(campaignContact.id, id))
      .returning();
    return NextResponse.json({
      ok: true,
      campaign_contact: publicCampaignContact(updated),
    });
  } catch (e) {
    return botCatchResponse(e, 'campaign-contacts.patch');
  }
}
