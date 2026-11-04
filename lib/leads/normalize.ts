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

export function companyNameKey(value: unknown): string | null {
  const s = normalizeCompanyName(value);
  return s ? s.toLowerCase() : null;
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
