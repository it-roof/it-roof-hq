/** Domain/Firmenname/LinkedIn-Normalisierung für Dubletten-Abgleich. */

export function normalizeDomain(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  let s = String(value).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^\/\//, '');
  const slash = s.search(/[/?#]/);
  if (slash >= 0) s = s.slice(0, slash);
  s = s.replace(/:\d+$/, '');
  s = s.replace(/^www\./, '');
  s = s.replace(/\.$/, '');
  return s || null;
}

export function normalizeCompanyName(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().replace(/\s+/g, ' ');
  return s || null;
}

/** Längste zuerst: am Ende des Keys abschneiden, nicht „und partner“ / „& partner“. */
export const LEGAL_FORMS_AT_END = [
  'rechtsanwaltsgesellschaft',
  'steuerberatungsgesellschaft',
  'wirtschaftspruefungsgesellschaft',
  'wirtschaftsprüfungsgesellschaft',
  'partnerschaftsgesellschaft',
  'partnergesellschaft',
  'partnerschaft',
  'partg mbb',
  'partgmbb',
  'part mbb',
  'partmbb',
  'gmbh und co kg',
  'gmbh co kg',
  'partg',
  'mbb',
  'gmbh',
  'mbh',
  'gbr',
  'ag',
  'kg',
  'ohg',
  'ug',
  'ev',
  'se',
] as const;

const GENERIC_COMPANY_KEYS = new Set([
  '',
  '-',
  'n a',
  'na',
  'notar',
  'notarin',
  'rechtsanwalt',
  'rechtsanwaeltin',
  'rechtsanwältin',
  'kanzleiinhaber',
  'kanzleiinhaberin',
  'eigene kanzlei',
  'unbekannt',
  'selbststaendig',
  'selbstständig',
  'selbständig',
  'steuerberater',
  'steuerberaterin',
  'steuer',
  'steuerkanzlei',
  'einzelkanzlei',
  'kanzlei',
  'sonstig',
  'wp',
  'stb',
  'wp stb',
  'stbin',
  'stbg',
]);

const GENERIC_PREFIXES = [
  'selbststaendig',
  'selbstständig',
  'selbständig',
] as const;

export type CompanyAliasFamily = 'fels' | 'roedl';

export type ParsedCompanyName = {
  displayName: string | null;
  key: string | null;
  generic: boolean;
  aliasFamily: CompanyAliasFamily | null;
};

function stripParentheticals(s: string) {
  let prev = '';
  let out = s;
  while (out !== prev) {
    prev = out;
    out = out.replace(/\([^()]*\)/g, ' ');
  }
  return out;
}

function stripLeadingPrefixes(key: string) {
  let s = key;
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of GENERIC_PREFIXES) {
      if (s === prefix) return '';
      if (s.startsWith(`${prefix} `)) {
        s = s.slice(prefix.length).trim();
        changed = true;
      }
    }
  }
  return s;
}

function stripLegalForms(key: string) {
  let s = key;
  let changed = true;
  while (changed && s) {
    changed = false;
    for (const form of LEGAL_FORMS_AT_END) {
      if (s === form) return '';
      if (s.endsWith(` ${form}`)) {
        s = s.slice(0, -form.length - 1).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}

/** Satzzeichen weg, Klammern weg, Rechtsformen am Ende weg. Generisch → null. */
export function companyNameKey(value: unknown): string | null {
  const raw = normalizeCompanyName(value);
  if (!raw) return null;
  let s = stripParentheticals(raw);
  s = s.replace(/&/g, ' und ');
  s = s.replace(/\./g, '');
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9äöüß]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = stripLeadingPrefixes(s);
  s = stripLegalForms(s);
  s = s.replace(/\s+/g, ' ').trim();
  if (!s || GENERIC_COMPANY_KEYS.has(s)) return null;
  return s;
}

export function isGenericCompanyName(value: unknown): boolean {
  const raw = normalizeCompanyName(value);
  if (!raw) return true;
  return companyNameKey(raw) === null;
}

export function companyAliasFamily(value: unknown): CompanyAliasFamily | null {
  const key = companyNameKey(value);
  if (!key) return null;
  if (key === 'fels' || key.startsWith('fels ')) return 'fels';
  if (
    key === 'rödl'
    || key === 'roedl'
    || key.startsWith('rödl ')
    || key.startsWith('roedl ')
  ) {
    return 'roedl';
  }
  return null;
}

export const COMPANY_ALIAS_DISPLAY: Record<CompanyAliasFamily, string> = {
  fels: 'F.E.L.S Rechtsanwälte',
  roedl: 'Rödl & Partner',
};

export function applyCompanyAlias(value: unknown): string | null {
  const family = companyAliasFamily(value);
  if (family) return COMPANY_ALIAS_DISPLAY[family];
  return normalizeCompanyName(value);
}

export function parseCompanyName(value: unknown): ParsedCompanyName {
  const generic = isGenericCompanyName(value);
  const family = generic ? null : companyAliasFamily(value);
  const display = family
    ? COMPANY_ALIAS_DISPLAY[family]
    : normalizeCompanyName(value);
  return {
    displayName: display,
    key: generic ? null : companyNameKey(display ?? value),
    generic,
    aliasFamily: family,
  };
}

export function personalFirmName(
  firstName?: string | null,
  lastName?: string | null,
  city?: string | null,
) {
  const who = [firstName, lastName]
    .map((p) => (p ? String(p).trim() : ''))
    .filter(Boolean)
    .join(' ') || 'Unbekannt';
  const c = city ? String(city).trim() : '';
  return c ? `${who} (Kanzlei, ${c})` : `${who} (Kanzlei)`;
}

/**
 * LinkedIn-Profil-Link: Host ohne www/Ländersubdomain, Pfad kleingeschrieben,
 * ohne Trailing-Slash und Query.
 */
export function normalizeLinkedInUrl(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  let raw = String(value).trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  try {
    const u = new URL(raw);
    let host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'lnkd.in') {
      const path = u.pathname.replace(/\/+$/, '');
      return path ? `https://lnkd.in${path}` : null;
    }
    if (host.endsWith('linkedin.com')) host = 'linkedin.com';
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();
    if (!path || path === '/') return `https://${host}`;
    return `https://${host}${path}`;
  } catch {
    const fallback = raw.toLowerCase().replace(/\/+$/, '');
    return fallback || null;
  }
}

export function parseOptionalInt(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${field} muss eine nicht-negative Ganzzahl sein`);
  }
  return n;
}

export function parseOptionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(`${field} muss YYYY-MM-DD sein`);
  }
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) throw new Error(`${field} ist kein gültiges Datum`);
  return s;
}
