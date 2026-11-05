export const LINKEDIN_STATUSES = [
  'li_shortlist',
  'li_anfrage_gesendet',
  'li_vernetzt',
  'li_nachricht_entwurf',
  'li_nachricht_gesendet',
  'li_geantwortet',
  'li_nachfass',
  'li_absage',
  'li_zurueckgestellt',
] as const;

export type LinkedInStatus = (typeof LINKEDIN_STATUSES)[number];

export const LINKEDIN_STATUS_DE: Record<LinkedInStatus, string> = {
  li_shortlist: 'Shortlist',
  li_anfrage_gesendet: 'Anfrage gesendet',
  li_vernetzt: 'Vernetzt',
  li_nachricht_entwurf: 'Nachricht-Entwurf',
  li_nachricht_gesendet: 'Nachricht gesendet',
  li_geantwortet: 'Geantwortet',
  li_nachfass: 'Nachfass geplant',
  li_absage: 'Absage',
  li_zurueckgestellt: 'Zurückgestellt',
};

export const LINKEDIN_CAMPAIGN_NAME = 'LinkedIn KI-Schulung Kanzleien';
export const LINKEDIN_CAMPAIGN_NAME_LEGACY = 'LinkedIn KI-Schulung Rechtsanwälte';
export const LINKEDIN_CAMPAIGN_SLUG = 'linkedin-ki-schulung';

export const LAW_FIRM_INDUSTRY = 'Rechtsanwaltskanzlei';

export const REGION_SEARCH: Record<
  'oberfranken' | 'mittelfranken' | 'unterfranken',
  { query: string; tag: string }
> = {
  oberfranken: { query: 'KI-Schulung Kanzleien+Oberfranken', tag: 'Oberfranken' },
  mittelfranken: { query: 'KI-Schulung Kanzleien+Mittelfranken', tag: 'Mittelfranken' },
  unterfranken: { query: 'KI-Schulung Kanzleien+Unterfranken', tag: 'Unterfranken' },
};

export const NOTION_STATUS_TO_LI: Record<string, LinkedInStatus> = {
  Shortlist: 'li_shortlist',
  'Anfrage offen': 'li_anfrage_gesendet',
  Angenommen: 'li_vernetzt',
  Angeschrieben: 'li_nachricht_gesendet',
  Antwort: 'li_geantwortet',
  Absage: 'li_absage',
  'Nachfass geplant': 'li_nachfass',
  Zurückgestellt: 'li_zurueckgestellt',
};

export const NOTION_INDUSTRY: Record<string, string> = {
  Recht: 'Rechtsanwaltskanzlei',
  Notar: 'Notariat',
  Steuer: 'Steuerberater',
  'WP/StB': 'Wirtschaftsprüfer/Steuerberater',
};

export function isLinkedInStatus(value: string): value is LinkedInStatus {
  return (LINKEDIN_STATUSES as readonly string[]).includes(value);
}

export function parseLinkedInStatus(value: unknown): LinkedInStatus {
  const v = String(value ?? '').trim();
  if (!isLinkedInStatus(v)) {
    throw new Error(
      `status muss einer von ${LINKEDIN_STATUSES.join(', ')} sein`,
    );
  }
  return v;
}

export function notionStatusToLinkedIn(value: unknown): LinkedInStatus | null {
  const v = String(value ?? '').trim();
  return NOTION_STATUS_TO_LI[v] ?? null;
}

export function mapZielgruppeToIndustry(value: unknown): string | null {
  const v = String(value ?? '').trim();
  if (!v || v === 'sonstig') return null;
  return NOTION_INDUSTRY[v] ?? null;
}

export function parseRegionKey(
  value: unknown,
): keyof typeof REGION_SEARCH | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'oberfranken' || v === 'mittelfranken' || v === 'unterfranken') {
    return v;
  }
  return null;
}

export function mapRegionToQuery(value: unknown): string | null {
  const key = parseRegionKey(value);
  return key ? REGION_SEARCH[key].query : null;
}
