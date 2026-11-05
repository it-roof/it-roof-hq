import { NextRequest, NextResponse } from 'next/server';
import { getLeadsDb } from '@/lib/leads/db';
import { campaignLead, campaignStep, lead, leadContact } from '@/lib/leads/schema';
import { campaignStepMeta } from '@/lib/leads/campaign-steps';
import { renderStepTemplates } from '@/lib/leads/template';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { requireSession, unauthorized } from '@/lib/auth/require-session';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  if (!(await requireSession())) return unauthorized();
  const { id: campaignId } = await params;
  const includeDone = req.nextUrl.searchParams.get('include_done') === '1';
  const db = getLeadsDb();

  const steps = await db
    .select()
    .from(campaignStep)
    .where(eq(campaignStep.campaignId, campaignId))
    .orderBy(asc(campaignStep.stepOrder));

  const stepById = new Map(steps.map((s) => [s.id, s]));

  const filters = [eq(campaignLead.campaignId, campaignId)];
  if (!includeDone) filters.push(ne(campaignLead.status, 'done'));

  const rows = await db
    .select({
      id: campaignLead.id,
      lead_id: campaignLead.leadId,
      current_step_id: campaignLead.currentStepId,
      status: campaignLead.status,
      last_action_at: campaignLead.lastActionAt,
      company_name: lead.companyName,
      city: lead.city,
      phone: lead.phone,
      domain: lead.domain,
    })
    .from(campaignLead)
    .innerJoin(lead, eq(lead.id, campaignLead.leadId))
    .where(and(...filters))
    .orderBy(asc(campaignLead.createdAt));

  const leadIds = rows.map((r) => r.lead_id);
  const contacts = leadIds.length
    ? await db
        .select()
        .from(leadContact)
        .where(inArray(leadContact.leadId, leadIds))
        .orderBy(asc(leadContact.createdAt), asc(leadContact.id))
    : [];

  const firstContactByLead = new Map<string, (typeof contacts)[number]>();
  for (const c of contacts) {
    if (!firstContactByLead.has(c.leadId)) firstContactByLead.set(c.leadId, c);
  }

  const items = rows.map((r) => {
    const contact = firstContactByLead.get(r.lead_id) ?? null;
    let step = r.current_step_id ? stepById.get(r.current_step_id) : undefined;
    if (!step && steps.length) step = steps[0];

    const rendered = step
      ? renderStepTemplates(step.subjectTemplate, step.bodyTemplate, {
          companyName: r.company_name,
          city: r.city,
          phone: r.phone,
        }, contact
          ? {
              salutation: contact.salutation,
              firstName: contact.firstName,
              lastName: contact.lastName,
              position: contact.position,
              email: contact.email,
              phone: contact.phone,
            }
          : null)
      : { subject: '', body: '', vars: {} };

    return {
      id: r.id,
      lead_id: r.lead_id,
      status: r.status,
      last_action_at: r.last_action_at,
      company_name: r.company_name,
      city: r.city,
      domain: r.domain,
      contact: contact
        ? {
            id: contact.id,
            salutation: contact.salutation,
            first_name: contact.firstName,
            last_name: contact.lastName,
            position: contact.position,
            email: contact.email,
            phone: contact.phone,
          }
        : null,
      current_step: step
        ? {
            id: step.id,
            type: step.type,
            label: campaignStepMeta(step.type).label,
            step_order: step.stepOrder,
            delay_days: step.delayDays,
            uses_template: campaignStepMeta(step.type).usesTemplate,
            subject_template: step.subjectTemplate,
            body_template: step.bodyTemplate,
          }
        : null,
      rendered,
    };
  });

  return NextResponse.json({
    items,
    steps: steps.map((s) => ({
      id: s.id,
      type: s.type,
      label: campaignStepMeta(s.type).label,
      step_order: s.stepOrder,
      delay_days: s.delayDays,
    })),
    meta: {
      total: items.length,
      active: items.filter((i) => i.status !== 'done').length,
    },
  });
}
