import { emptyToNull } from '@/lib/leads/http';
import { isLinkedInStatus } from '@/lib/leads/linkedin-status';

export type ApiConflict = { status: 409; error: string };

export function pickLeadMatch<T>(byDomain: T | null | undefined, byCompany: T | null | undefined): T | null {
  return byDomain ?? byCompany ?? null;
}

export function contactEmailConflict(
  emailLeadId: string | null | undefined,
  targetLeadId: string,
): ApiConflict | null {
  if (!emailLeadId || emailLeadId === targetLeadId) return null;
  return {
    status: 409,
    error: 'E-Mail gehört zu einem anderen Lead',
  };
}

export function emailOutreachBlockedConflict(blocked: boolean | null | undefined): ApiConflict | null {
  if (!blocked) return null;
  return {
    status: 409,
    error: 'Lead ist für E-Mail-Outreach gesperrt (email_outreach_blocked)',
  };
}

export function domainTakenConflict(
  currentId: string,
  takenId: string | null | undefined,
): ApiConflict | null {
  if (!takenId || takenId === currentId) return null;
  return { status: 409, error: 'domain bereits vergeben' };
}

export function splitPersonName(value: unknown): { firstName: string | null; lastName: string | null } {
  const raw = emptyToNull(value);
  if (!raw) return { firstName: null, lastName: null };
  const parts = raw.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return { firstName: parts[0] ?? null, lastName: parts.slice(1).join(' ') };
}

export function hasLeadLocator(body: Record<string, unknown>) {
  return !!(
    emptyToNull(body.lead_id ?? body.leadId)
    || emptyToNull(body.company_name ?? body.companyName)
    || emptyToNull(body.domain ?? body.website)
  );
}

export function personNameFromBody(body: Record<string, unknown>) {
  const first = emptyToNull(body.first_name ?? body.firstName);
  const last = emptyToNull(body.last_name ?? body.lastName);
  if (first || last) return { firstName: first, lastName: last };
  return splitPersonName(body.name);
}

export function lookupContactFlags(
  contacts: {
    linkedin_url?: string | null;
    campaign_contacts?: { status?: string | null }[];
  }[],
) {
  const has_scout_contacts = contacts.some((c) => !!c.linkedin_url);
  const has_linkedin_contacts = contacts.some(
    (c) => !!c.linkedin_url
      || (c.campaign_contacts ?? []).some((cc) => isLinkedInStatus(String(cc.status ?? ''))),
  );
  return { has_scout_contacts, has_linkedin_contacts };
}
