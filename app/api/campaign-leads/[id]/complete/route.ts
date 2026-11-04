import { NextRequest, NextResponse } from 'next/server';
import { getLeadsDb } from '@/lib/leads/db';
import {
  campaignLead,
  campaignLeadAction,
  campaignStep,
  lead,
  leadContact,
} from '@/lib/leads/schema';
import { nowIso } from '@/lib/leads/http';
import { renderStepTemplates } from '@/lib/leads/template';
import { asc, eq } from 'drizzle-orm';
import { requireSession, unauthorized } from '@/lib/auth/require-session';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  if (!(await requireSession())) return unauthorized();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = (body.action ?? 'done').trim() === 'skipped' ? 'skipped' : 'done';
  const note = typeof body.note === 'string' ? body.note.trim() || null : null;

  const db = getLeadsDb();
  const [cl] = await db.select().from(campaignLead).where(eq(campaignLead.id, id));
  if (!cl) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const steps = await db
    .select()
    .from(campaignStep)
    .where(eq(campaignStep.campaignId, cl.campaignId))
    .orderBy(asc(campaignStep.stepOrder));

  if (steps.length === 0) {
    return NextResponse.json({ error: 'Kampagne hat keine Steps' }, { status: 400 });
  }

  let current = cl.currentStepId
    ? steps.find((s) => s.id === cl.currentStepId)
    : steps[0];
  if (!current) current = steps[0]!;

  const [leadRow] = await db.select().from(lead).where(eq(lead.id, cl.leadId));
  if (!leadRow) return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 });

  const [contact] = await db
    .select()
    .from(leadContact)
    .where(eq(leadContact.leadId, cl.leadId))
    .orderBy(asc(leadContact.createdAt), asc(leadContact.id))
    .limit(1);

  const rendered = renderStepTemplates(
    current.subjectTemplate,
    current.bodyTemplate,
    {
      companyName: leadRow.companyName,
      city: leadRow.city,
      phone: leadRow.phone,
    },
    contact
      ? {
          salutation: contact.salutation,
          firstName: contact.firstName,
          lastName: contact.lastName,
          position: contact.position,
          email: contact.email,
          phone: contact.phone,
        }
      : null,
  );

  const actedAt = nowIso();
  await db.insert(campaignLeadAction).values({
    campaignLeadId: cl.id,
    stepId: current.id,
    action,
    renderedSubject: rendered.subject || null,
    renderedBody: rendered.body || null,
    note,
    actedAt,
  });

  const idx = steps.findIndex((s) => s.id === current.id);
  const next = idx >= 0 ? steps[idx + 1] : undefined;

  const [updated] = await db
    .update(campaignLead)
    .set({
      currentStepId: next?.id ?? current.id,
      status: next ? 'active' : 'done',
      lastActionAt: actedAt,
    })
    .where(eq(campaignLead.id, id))
    .returning();

  return NextResponse.json({
    ok: true,
    campaign_lead: updated,
    completed_step_id: current.id,
    next_step_id: next?.id ?? null,
    finished: !next,
  });
}
