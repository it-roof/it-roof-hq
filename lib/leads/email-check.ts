import dns from 'node:dns/promises';
import { isDisposableDomain } from '@/lib/leads/disposable-domains';
import type { OutreachStatus } from '@/lib/leads/outreach-status';

export type EmailCheckStatus = Extract<
  OutreachStatus,
  'valid' | 'invalid' | 'domain_dead' | 'skip'
>;

export type EmailCheckResult = {
  status: EmailCheckStatus;
  email: string | null;
  domain: string | null;
  detail: string;
};

const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  return s === '' ? null : s;
}

export function extractDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1);
}

export function isValidEmailFormat(email: string): boolean {
  if (email.length > 254) return false;
  if (!EMAIL_RE.test(email)) return false;
  const [local, domain] = email.split('@');
  if (!local || !domain) return false;
  if (local.length > 64) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  return true;
}

export async function domainHasMailExchange(domain: string): Promise<boolean> {
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.length > 0) return true;
  } catch {
    // weiter mit A/AAAA-Fallback
  }

  try {
    const a = await dns.resolve4(domain);
    if (a.length > 0) return true;
  } catch {
    // ignore
  }

  try {
    const aaaa = await dns.resolve6(domain);
    if (aaaa.length > 0) return true;
  } catch {
    // ignore
  }

  return false;
}

/**
 * Lightweight E-Mail-Check: Format → Disposable → Domain/MX.
 * Setzt keinen Bounce-Status — der kommt nur nach Versand.
 */
export async function checkEmail(raw: string | null | undefined): Promise<EmailCheckResult> {
  const email = normalizeEmail(raw);
  if (!email) {
    return {
      status: 'invalid',
      email: null,
      domain: null,
      detail: 'Keine E-Mail-Adresse',
    };
  }

  if (!isValidEmailFormat(email)) {
    return {
      status: 'invalid',
      email,
      domain: extractDomain(email),
      detail: 'Ungültiges E-Mail-Format',
    };
  }

  const domain = extractDomain(email);
  if (!domain) {
    return {
      status: 'invalid',
      email,
      domain: null,
      detail: 'Keine Domain in der E-Mail',
    };
  }

  if (isDisposableDomain(domain)) {
    return {
      status: 'skip',
      email,
      domain,
      detail: 'Wegwerf-E-Mail (disposable)',
    };
  }

  const hasMx = await domainHasMailExchange(domain);
  if (!hasMx) {
    return {
      status: 'domain_dead',
      email,
      domain,
      detail: 'Keine MX-/A-Records für die Domain',
    };
  }

  return {
    status: 'valid',
    email,
    domain,
    detail: 'Format und Domain/MX ok',
  };
}

/** Ältester Kontakt mit Mail (created_at, id); sonst null. */
export function pickContactEmail(
  contacts: { email?: string | null }[] | null | undefined,
): string | null {
  if (!contacts?.length) return null;
  for (const c of contacts) {
    const e = normalizeEmail(c.email);
    if (e) return e;
  }
  return null;
}
