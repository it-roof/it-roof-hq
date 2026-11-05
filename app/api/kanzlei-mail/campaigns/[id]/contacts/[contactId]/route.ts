import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireKanzleiMailToken } from '@/lib/auth/require-kanzlei-mail-token';
import {
  assertStatusMatchesChannel,
  isUuid,
  resolveCampaignId,
} from '@/lib/leads/campaign-channel';
import { getLeadsDb } from '@/lib/leads/db';
import { nowIso } from '@/lib/leads/http';
import { emailOutreachBlockedConflict } from '@/lib/leads/kanzlei-mail';
import { EMAIL_CAMPAIGN_NAME } from '@/lib/leads/mail-status';
import { campaignContact, lead, leadContact } from '@/lib/leads/schema';
import {
  campaignContactFieldsFromBody,
  publicCampaignContact,
} from '@/lib/leads/scout-queries';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string; contactId: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = requireKanzleiMailToken(req);
  if (!auth.ok) return auth.response;

  const { id, contactId } = await params;
  try {
    if (!isUuid(contactId)) throw new Error('contactId ungültig');
    const body = (await req.json()) as Record<string, unknown>;
    const fields = campaignContactFieldsFromBody(body);
    const status = fields.status;
    if (!status) throw new Error('status erforderlich');

    const db = getLeadsDb();
    const camp = await resolveCampaignId(db, id);
    if (!camp) return NextResponse.json({ error: 'Kampagne nicht gefunden' }, { status: 404 });
    if (camp.channel !== 'email' || camp.name !== EMAIL_CAMPAIGN_NAME) {
      return NextResponse.json({ error: 'Kampagne ist keine Kanzlei-Mail-Kampagne' }, { status: 400 });
    }
    assertStatusMatchesChannel(status, camp.channel);

    const [person] = await db
      .select({ id: leadContact.id, leadId: leadContact.leadId })
      .from(leadContact)
      .where(eq(leadContact.id, contactId))
      .limit(1);
    if (!person) return NextResponse.json({ error: 'Kontakt nicht gefunden' }, { status: 404 });

    const [firm] = await db
      .select({ emailOutreachBlocked: lead.emailOutreachBlocked })
      .from(lead)
      .where(eq(lead.id, person.leadId))
      .limit(1);
    const blocked = emailOutreachBlockedConflict(firm?.emailOutreachBlocked);
    if (blocked) {
      return NextResponse.json({ error: blocked.error }, { status: blocked.status });
    }

    const ts = nowIso();
    const [existing] = await db
      .select()
      .from(campaignContact)
      .where(
        and(
          eq(campaignContact.campaignId, camp.id),
          eq(campaignContact.leadContactId, contactId),
        ),
      )
      .limit(1);

    if (existing) {
      const statusChanged = existing.status !== status;
      const [updated] = await db
        .update(campaignContact)
        .set({
          ...fields,
          statusAt: statusChanged ? ts : existing.statusAt,
          updatedAt: ts,
        })
        .where(eq(campaignContact.id, existing.id))
        .returning();
      return NextResponse.json({
        ok: true,
        action: 'updated',
        campaign_contact: publicCampaignContact(updated),
        ids: {
          campaign_contact_id: updated.id,
          campaign_id: camp.id,
          contact_id: contactId,
        },
      });
    }

    const [created] = await db
      .insert(campaignContact)
      .values({
        campaignId: camp.id,
        leadContactId: contactId,
        ...fields,
        status,
        statusAt: ts,
        createdAt: ts,
        updatedAt: ts,
      })
      .returning();

    return NextResponse.json(
      {
        ok: true,
        action: 'created',
        campaign_contact: publicCampaignContact(created),
        ids: {
          campaign_contact_id: created.id,
          campaign_id: camp.id,
          contact_id: contactId,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Fehler' }, { status: 400 });
  }
}
