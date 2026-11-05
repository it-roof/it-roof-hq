import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { requireSession, unauthorized } from '@/lib/auth/require-session';
import { getLeadsDb } from '@/lib/leads/db';
import { checkEmail, pickContactEmail } from '@/lib/leads/email-check';
import { nowIso } from '@/lib/leads/http';
import { lead, leadContact } from '@/lib/leads/schema';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  if (!(await requireSession())) return unauthorized();
  const { id } = await params;
  const db = getLeadsDb();

  const [row] = await db
    .select({ id: lead.id, outreachStatus: lead.outreachStatus })
    .from(lead)
    .where(eq(lead.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  // Manuell gesetzte Bounces nicht überschreiben
  if (row.outreachStatus === 'bounced') {
    return NextResponse.json(
      {
        error: 'Lead ist auf Bounce gesetzt — Check übersprungen',
        outreach_status: 'bounced',
      },
      { status: 409 },
    );
  }

  const contacts = await db
    .select({ email: leadContact.email })
    .from(leadContact)
    .where(eq(leadContact.leadId, id))
    .orderBy(asc(leadContact.createdAt), asc(leadContact.id));

  const email = pickContactEmail(contacts);
  const result = await checkEmail(email);
  const at = nowIso();

  const [updated] = await db
    .update(lead)
    .set({
      outreachStatus: result.status,
      outreachStatusAt: at,
    })
    .where(eq(lead.id, id))
    .returning({
      id: lead.id,
      outreachStatus: lead.outreachStatus,
      outreachStatusAt: lead.outreachStatusAt,
    });

  return NextResponse.json({
    ok: true,
    check: result,
    lead: {
      id: updated?.id ?? id,
      outreach_status: result.status,
      outreach_status_at: at,
    },
  });
}
