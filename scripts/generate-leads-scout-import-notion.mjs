#!/usr/bin/env node
/**
 * Erzeugt scripts/leads-scout-import-notion.sql aus der Notion-JSON.
 * Quellen (erste Treffer): argv[2], uploads/leads.json, scripts/data/linkedin-pipeline.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const STATUS_MAP = {
  Shortlist: 'li_shortlist',
  'Anfrage offen': 'li_anfrage_gesendet',
  Angenommen: 'li_vernetzt',
  Angeschrieben: 'li_nachricht_gesendet',
  Antwort: 'li_geantwortet',
  Absage: 'li_absage',
  'Nachfass geplant': 'li_nachfass',
  Zurückgestellt: 'li_zurueckgestellt',
};

const INDUSTRY_MAP = {
  Recht: 'Rechtsanwaltskanzlei',
  Notar: 'Notariat',
  Steuer: 'Steuerberater',
  'WP/StB': 'Wirtschaftsprüfer/Steuerberater',
};

const REGION_QUERY = {
  Oberfranken: 'KI-Schulung Kanzleien+Oberfranken',
  Mittelfranken: 'KI-Schulung Kanzleien+Mittelfranken',
  Unterfranken: 'KI-Schulung Kanzleien+Unterfranken',
};

function companyNameKey(value) {
  const s = String(value ?? '').trim().replace(/\s+/g, ' ');
  return s ? s.toLowerCase() : 'unbekannt';
}

function normalizeCompanyName(value) {
  const s = String(value ?? '').trim().replace(/\s+/g, ' ');
  return s || 'unbekannt';
}

function normalizeLinkedInUrl(value) {
  if (value === undefined || value === null) return null;
  let raw = String(value).trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const u = new URL(raw);
    let host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'lnkd.in') {
      const p = u.pathname.replace(/\/+$/, '');
      return p ? `https://lnkd.in${p}` : null;
    }
    if (host.endsWith('linkedin.com')) host = 'linkedin.com';
    const p = u.pathname.replace(/\/+$/, '').toLowerCase();
    if (!p || p === '/') return `https://${host}`;
    return `https://${host}${p}`;
  } catch {
    return raw.toLowerCase().replace(/\/+$/, '') || null;
  }
}

function splitName(name) {
  const s = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return { first: null, last: null };
  const i = s.indexOf(' ');
  if (i < 0) return { first: s, last: null };
  return { first: s.slice(0, i), last: s.slice(i + 1) };
}

function sqlLit(value) {
  if (value === undefined || value === null || value === '') return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function compact(s) {
  return s.replace(/[^a-z0-9äöüß]/gi, '');
}

function stem(s) {
  return s.replace(/[.\s]+$/g, '');
}

function similarPairs(keys) {
  const skip = new Set(['steuer', 'notar', 'rechtsanwalt', 'sonstig', 'unbekannt']);
  const names = [...keys].sort();
  const out = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      if (skip.has(a) || skip.has(b)) continue;
      const sa = stem(a);
      const sb = stem(b);
      const prefix = (sa.length >= 4 && sb.startsWith(sa) && sb !== sa)
        || (sb.length >= 4 && sa.startsWith(sb) && sa !== sb);
      const ca = compact(a);
      const cb = compact(b);
      const contained = ca.length >= 8 && cb.length >= 8 && ca !== cb
        && (ca.includes(cb) || cb.includes(ca));
      if (prefix || contained) out.push([a, b]);
    }
  }
  return out;
}

const candidates = [
  process.argv[2],
  path.join(root, 'uploads/leads.json'),
  path.join(root, 'scripts/data/linkedin-pipeline.json'),
  '/home/ubuntu/.cursor/projects/agent-repos-it-roof-operating-system/uploads/leads_bfd2.json',
].filter(Boolean);

const src = candidates.find((p) => fs.existsSync(p));
if (!src) {
  console.error('Keine Notion-JSON gefunden. Erwartet uploads/leads.json oder scripts/data/linkedin-pipeline.json');
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(src, 'utf8'));
if (!Array.isArray(rows) || rows.length === 0) {
  console.error('JSON ist leer oder kein Array');
  process.exit(1);
}

const keys = new Set();
const mapped = rows.map((r, idx) => {
  const company = normalizeCompanyName(r.Firma);
  const key = companyNameKey(r.Firma);
  keys.add(key);
  const { first, last } = splitName(r.Name);
  const status = STATUS_MAP[String(r.Status ?? '').trim()];
  if (!status) {
    throw new Error(`Zeile ${idx}: unbekannter Status ${JSON.stringify(r.Status)}`);
  }
  const notes = [
    r.Notizen ? String(r.Notizen).trim() : '',
    r.Angebot ? `Angebot: ${String(r.Angebot).trim()}` : '',
  ].filter(Boolean).join('\n') || null;
  const zg = String(r.Zielgruppe ?? '').trim();
  const region = String(r.Region ?? '').trim();
  return {
    first,
    last,
    company,
    key,
    city: String(r.Stadt ?? '').trim() || null,
    industry: INDUSTRY_MAP[zg] ?? null,
    regionQuery: REGION_QUERY[region] ?? null,
    linkedin: normalizeLinkedInUrl(r.LinkedIn),
    status,
    notes,
    nextStep: String(r['Nächster Schritt'] ?? '').trim() || null,
    requestedAt: r['Anfrage am'] || null,
    acceptedAt: r['Annahme am'] || null,
    writeFrom: r['Anschreiben ab'] || null,
    writtenAt: r['Angeschrieben am'] || null,
    repliedAt: r['Antwort am'] || null,
    createdAt: r.created_time || null,
  };
});

const similar = similarPairs(keys);
const statusCounts = {};
let withLi = 0;
for (const r of mapped) {
  statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  if (r.linkedin) withLi += 1;
}

const similarComment = similar.length
  ? similar.map(([a, b]) => `--   '${a.replace(/'/g, "''")}' vs '${b.replace(/'/g, "''")}'`).join('\n')
  : '--   (keine)';

const values = mapped.map((r) => `(
    ${sqlLit(r.first)},
    ${sqlLit(r.last)},
    ${sqlLit(r.company)},
    ${sqlLit(r.key)},
    ${sqlLit(r.city)},
    ${sqlLit(r.industry)},
    ${sqlLit(r.regionQuery)},
    ${sqlLit(r.linkedin)},
    ${sqlLit(r.status)},
    ${sqlLit(r.notes)},
    ${sqlLit(r.nextStep)},
    ${sqlLit(r.requestedAt)}::date,
    ${sqlLit(r.acceptedAt)}::date,
    ${sqlLit(r.writeFrom)}::date,
    ${sqlLit(r.writtenAt)}::date,
    ${sqlLit(r.repliedAt)}::date,
    ${sqlLit(r.createdAt)}::timestamptz
  )`).join(',\n  ');

const sql = `-- Notion LinkedIn-Pipeline Import (idempotent)
-- Quelle: ${path.relative(root, src)} (${mapped.length} Zeilen)
-- Generator: scripts/generate-leads-scout-import-notion.mjs
-- Kanzlei-Merge: lowercase + trim + Mehrfach-Leerzeichen. Distinct Firmen: ${keys.size}
-- Kontakte mit LinkedIn-URL: ${withLi}
-- Status: ${Object.entries(statusCounts).map(([k, n]) => `${k}=${n}`).join(', ')}
--
-- Ähnliche Firmennamen, die NICHT zusammengeführt wurden (kein Fuzzy, nur exakter Key):
${similarComment}

BEGIN;

CREATE TEMP TABLE scout_notion_import (
  first_name text,
  last_name text,
  company_name text NOT NULL,
  company_key text NOT NULL,
  city text,
  industry text,
  region_query text,
  linkedin_url text,
  status text NOT NULL,
  notes text,
  next_step text,
  requested_at date,
  accepted_at date,
  write_from date,
  written_at date,
  replied_at date,
  created_at timestamptz
) ON COMMIT DROP;

INSERT INTO scout_notion_import (
  first_name, last_name, company_name, company_key, city, industry, region_query,
  linkedin_url, status, notes, next_step,
  requested_at, accepted_at, write_from, written_at, replied_at, created_at
) VALUES
  ${values};

INSERT INTO lead (
  company_name, domain, city, country_code, industry, status, search_query_id, created_at
)
SELECT DISTINCT ON (i.company_key)
  i.company_name,
  NULL,
  i.city,
  'DE',
  i.industry,
  'error_no_domain',
  sq.id,
  coalesce(i.created_at, now())
FROM scout_notion_import i
LEFT JOIN search_query sq ON sq.query = i.region_query
WHERE NOT EXISTS (
  SELECT 1 FROM lead l
  WHERE lower(regexp_replace(trim(l.company_name), '\\s+', ' ', 'g')) = i.company_key
)
ORDER BY i.company_key, i.created_at NULLS LAST;

INSERT INTO lead_contact (
  lead_id, first_name, last_name, linkedin_url, created_at, updated_at
)
SELECT
  l.id,
  i.first_name,
  i.last_name,
  i.linkedin_url,
  coalesce(i.created_at, now()),
  coalesce(i.created_at, now())
FROM scout_notion_import i
JOIN lead l ON lower(regexp_replace(trim(l.company_name), '\\s+', ' ', 'g')) = i.company_key
WHERE i.linkedin_url IS NOT NULL
ON CONFLICT (linkedin_url) DO UPDATE SET
  first_name = COALESCE(EXCLUDED.first_name, lead_contact.first_name),
  last_name = COALESCE(EXCLUDED.last_name, lead_contact.last_name),
  updated_at = EXCLUDED.updated_at;

INSERT INTO lead_contact (
  lead_id, first_name, last_name, linkedin_url, created_at, updated_at
)
SELECT
  l.id,
  i.first_name,
  i.last_name,
  NULL,
  coalesce(i.created_at, now()),
  coalesce(i.created_at, now())
FROM scout_notion_import i
JOIN lead l ON lower(regexp_replace(trim(l.company_name), '\\s+', ' ', 'g')) = i.company_key
WHERE i.linkedin_url IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM lead_contact c
    WHERE c.lead_id = l.id
      AND coalesce(c.first_name, '') = coalesce(i.first_name, '')
      AND coalesce(c.last_name, '') = coalesce(i.last_name, '')
  );

INSERT INTO campaign_contact (
  campaign_id, lead_contact_id, status, status_at, notes, next_step,
  requested_at, accepted_at, write_from, written_at, replied_at,
  created_at, updated_at
)
SELECT
  camp.id,
  c.id,
  i.status,
  coalesce(i.created_at, now()),
  i.notes,
  i.next_step,
  i.requested_at,
  i.accepted_at,
  i.write_from,
  i.written_at,
  i.replied_at,
  coalesce(i.created_at, now()),
  coalesce(i.created_at, now())
FROM scout_notion_import i
JOIN lead l ON lower(regexp_replace(trim(l.company_name), '\\s+', ' ', 'g')) = i.company_key
JOIN lead_contact c ON (
  (i.linkedin_url IS NOT NULL AND c.linkedin_url = i.linkedin_url)
  OR (
    i.linkedin_url IS NULL
    AND c.lead_id = l.id
    AND coalesce(c.first_name, '') = coalesce(i.first_name, '')
    AND coalesce(c.last_name, '') = coalesce(i.last_name, '')
  )
)
JOIN campaign camp ON camp.name = 'LinkedIn KI-Schulung Rechtsanwälte'
ON CONFLICT (campaign_id, lead_contact_id) DO UPDATE SET
  status = EXCLUDED.status,
  status_at = EXCLUDED.status_at,
  notes = EXCLUDED.notes,
  next_step = EXCLUDED.next_step,
  requested_at = EXCLUDED.requested_at,
  accepted_at = EXCLUDED.accepted_at,
  write_from = EXCLUDED.write_from,
  written_at = EXCLUDED.written_at,
  replied_at = EXCLUDED.replied_at,
  updated_at = EXCLUDED.updated_at;

COMMIT;
`;

const out = path.join(root, 'scripts/leads-scout-import-notion.sql');
fs.writeFileSync(out, sql);
console.log(`wrote ${path.relative(root, out)} (${mapped.length} rows, ${keys.size} firms, ${withLi} linkedin)`);
console.log('similar unmatched:');
for (const [a, b] of similar) console.log(`  '${a}' vs '${b}'`);
