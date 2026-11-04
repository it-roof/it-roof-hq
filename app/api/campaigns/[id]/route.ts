import { NextRequest, NextResponse } from 'next/server';
import { getLeadsDb } from '@/lib/leads/db';
import { campaign, campaignStep } from '@/lib/leads/schema';
import { emptyToNull } from '@/lib/leads/http';
import { asc, eq, sql } from 'drizzle-orm';
import { requireSession, unauthorized } from '@/lib/auth/require-session';
import { writeAudit } from '@/lib/auth/audit';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  if (!(await requireSession())) return unauthorized();
  const { id } = await params;
  const db = getLeadsDb();

  const [row] = await db.select().from(campaign).where(eq(campaign.id, id));
  if (!row) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const steps = await db
    .select()
    .from(campaignStep)
    .where(eq(campaignStep.campaignId, id))
    .orderBy(asc(campaignStep.stepOrder));

  return NextResponse.json({
    id: row.id,
    name: row.name,
    description: row.description,
    created_at: row.createdAt,
    channel: row.channel,
    steps,
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!(await requireSession())) return unauthorized();
  const { id } = await params;
  const body = await req.json();
  const updates: Partial<typeof campaign.$inferInsert> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: 'name erforderlich' }, { status: 400 });
    updates.name = name;
  }
  if (body.description !== undefined) updates.description = emptyToNull(body.description);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nichts zu updaten' }, { status: 400 });
  }

  const db = getLeadsDb();
  const [row] = await db.update(campaign).set(updates).where(eq(campaign.id, id)).returning();
  if (!row) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  return NextResponse.json({ ok: true, campaign: row });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (!(await requireSession())) return unauthorized();
  const { id } = await params;
  const db = getLeadsDb();
  // Null current_step refs that would block step cascade via NO ACTION
  await db.execute(sql`UPDATE campaign_lead SET current_step_id = NULL WHERE campaign_id = ${id}`);
  const [row] = await db.delete(campaign).where(eq(campaign.id, id)).returning({ id: campaign.id });
  if (!row) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  await writeAudit({ action: 'campaign.delete', resource: 'campaign', resourceId: id });
  return NextResponse.json({ ok: true });
}
