#!/usr/bin/env node
/**
 * Erzeugt ein lokales Import-SQL aus einer Notion-Export-JSON.
 * Aufruf: node --import tsx scripts/generate-leads-scout-import-notion.mjs <leads.json> [out.sql]
 * Standard-Ausgabe: scripts/leads-scout-import-notion.sql (gitignored, Personendaten).
 * Ähnliche Firmen (nicht zusammengeführt) → stdout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  displayCompanyName,
  normalizeLinkedInUrl,
  parseCompanyName,
  personalFirmName,
} from '../lib/leads/normalize.ts';
import {
  LINKEDIN_CAMPAIGN_NAME,
  mapRegionToQuery,
  mapZielgruppeToIndustry,
  notionStatusToLinkedIn,
} from '../lib/leads/linkedin-status.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

function similarPairs(entries) {
  const names = [...entries].sort((a, b) => a.key.localeCompare(b.key, 'de'));
  const pairs = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      if (a.key === b.key) continue;
      const sa = stem(a.key);
      const sb = stem(b.key);
      const prefix = (sa.length >= 4 && sb.startsWith(sa) && sb !== sa)
        || (sb.length >= 4 && sa.startsWith(sb) && sa !== sb);
      const ca = compact(a.key);
      const cb = compact(b.key);
      const contained = ca.length >= 8 && cb.length >= 8 && ca !== cb
        && (ca.includes(cb) || cb.includes(ca));
      if (prefix || contained) pairs.push([a, b]);
    }
  }
  return pairs;
}

const srcArg = process.argv[2];
if (!srcArg) {
  console.error('Aufruf: node --import tsx scripts/generate-leads-scout-import-notion.mjs <notion.json> [out.sql]');
  process.exit(1);
}

const src = path.resolve(srcArg);
if (!fs.existsSync(src)) {
  console.error(`Datei nicht gefunden: ${src}`);
  process.exit(1);
}

const out = path.resolve(process.argv[3] || path.join(root, 'scripts/leads-scout-import-notion.sql'));

const rows = JSON.parse(fs.readFileSync(src, 'utf8'));
if (!Array.isArray(rows) || rows.length === 0) {
  console.error('JSON ist leer oder kein Array');
  process.exit(1);
}

const mapped = rows.map((r, idx) => {
  const { first, last } = splitName(r.Name);
  const status = notionStatusToLinkedIn(r.Status);
  if (!status) {
    throw new Error(`Zeile ${idx}: unbekannter Status ${JSON.stringify(r.Status)}`);
  }
  const notes = [
    r.Notizen ? String(r.Notizen).trim() : '',
    r.Angebot ? `Angebot: ${String(r.Angebot).trim()}` : '',
  ].filter(Boolean).join('\n') || null;
  const parsed = parseCompanyName(r.Firma);
  const city = String(r.Stadt ?? '').trim() || null;
  const generic = parsed.generic;
  const company = generic
    ? personalFirmName(first, last, city)
    : (displayCompanyName(r.Firma) || personalFirmName(first, last, city));
  const mergeKey = generic ? null : (parsed.aliasFamily === 'fels'
    ? 'fels'
    : parsed.aliasFamily === 'roedl'
      ? 'rödl'
      : parsed.key);
  return {
    rowId: idx + 1,
    first,
    last,
    company,
    mergeKey,
    aliasFamily: parsed.aliasFamily,
    generic,
    originalFirma: String(r.Firma ?? '').trim(),
    city,
    industry: mapZielgruppeToIndustry(r.Zielgruppe),
    regionQuery: mapRegionToQuery(r.Region),
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

const mergeKeys = new Map();
for (const r of mapped) {
  if (!r.mergeKey) continue;
  if (!mergeKeys.has(r.mergeKey)) mergeKeys.set(r.mergeKey, r.company);
}

const similar = similarPairs(
  [...mergeKeys.entries()].map(([key, label]) => ({ key, label })),
);

const statusCounts = {};
let withLi = 0;
let genericCount = 0;
for (const r of mapped) {
  statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
  if (r.linkedin) withLi += 1;
  if (r.generic) genericCount += 1;
}

const expectedNewLeads = mergeKeys.size + genericCount;

const values = mapped.map((r) => `(
    ${r.rowId},
    ${sqlLit(r.first)},
    ${sqlLit(r.last)},
    ${sqlLit(r.company)},
    ${sqlLit(r.mergeKey)},
    ${sqlLit(r.aliasFamily)},
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

const sql = `-- Notion LinkedIn-Pipeline Import (idempotent, lokal generiert, nicht committen)
-- Quelle: ${path.relative(root, src)} (${mapped.length} Zeilen)
-- Generator: scripts/generate-leads-scout-import-notion.mjs
-- Merge-Keys (nicht generisch): ${mergeKeys.size}; generische Einzel-Leads: ${genericCount}
-- Erwartete neue Leads (ohne bestehende Treffer): ${expectedNewLeads}
-- Kontakte mit LinkedIn-URL: ${withLi}
-- Status: ${Object.entries(statusCounts).map(([k, n]) => `${k}=${n}`).join(', ')}

BEGIN;

CREATE TEMP TABLE scout_notion_import (
  row_id int PRIMARY KEY,
  first_name text,
  last_name text,
  company_name text NOT NULL,
  merge_key text,
  alias_family text,
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

CREATE TEMP TABLE scout_lead_map (
  row_id int PRIMARY KEY,
  lead_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO scout_notion_import (
  row_id, first_name, last_name, company_name, merge_key, alias_family, city, industry, region_query,
  linkedin_url, status, notes, next_step,
  requested_at, accepted_at, write_from, written_at, replied_at, created_at
) VALUES
  ${values};

-- Bestehende Kanzleien (nicht generisch)
INSERT INTO scout_lead_map (row_id, lead_id)
SELECT DISTINCT ON (i.row_id)
  i.row_id,
  l.id
FROM scout_notion_import i
JOIN lead l ON i.merge_key IS NOT NULL
  AND (
    scout_company_name_key(l.company_name) = i.merge_key
    OR (
      i.alias_family IS NOT NULL
      AND (
        scout_company_name_key(l.company_name) = i.merge_key
        OR scout_company_name_key(l.company_name) LIKE i.merge_key || ' %'
      )
    )
  )
ORDER BY i.row_id, l.created_at NULLS LAST, l.id;

-- Neue Kanzleien je merge_key
INSERT INTO lead (
  company_name, domain, city, country_code, industry, status, search_query_id,
  email_outreach_blocked, created_at
)
SELECT DISTINCT ON (i.merge_key)
  i.company_name,
  NULL,
  i.city,
  'DE',
  i.industry,
  'error_no_domain',
  sq.id,
  true,
  coalesce(i.created_at, now())
FROM scout_notion_import i
LEFT JOIN search_query sq ON sq.query = i.region_query
WHERE i.merge_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM scout_lead_map m WHERE m.row_id = i.row_id
  )
ORDER BY i.merge_key, i.created_at NULLS LAST, i.row_id;

INSERT INTO scout_lead_map (row_id, lead_id)
SELECT i.row_id, l.id
FROM scout_notion_import i
JOIN lead l ON i.merge_key IS NOT NULL
  AND (
    scout_company_name_key(l.company_name) = i.merge_key
    OR (
      i.alias_family IS NOT NULL
      AND (
        scout_company_name_key(l.company_name) = i.merge_key
        OR scout_company_name_key(l.company_name) LIKE i.merge_key || ' %'
      )
    )
  )
WHERE NOT EXISTS (SELECT 1 FROM scout_lead_map m WHERE m.row_id = i.row_id);

-- Generische Namen: bestehenden Kontakt (LinkedIn oder Name) wiederverwenden
INSERT INTO scout_lead_map (row_id, lead_id)
SELECT DISTINCT ON (i.row_id) i.row_id, c.lead_id
FROM scout_notion_import i
JOIN lead_contact c ON i.merge_key IS NULL
  AND i.linkedin_url IS NOT NULL
  AND c.linkedin_url = i.linkedin_url
WHERE NOT EXISTS (SELECT 1 FROM scout_lead_map m WHERE m.row_id = i.row_id)
ORDER BY i.row_id, c.id;

INSERT INTO scout_lead_map (row_id, lead_id)
SELECT DISTINCT ON (i.row_id) i.row_id, l.id
FROM scout_notion_import i
JOIN lead l ON i.merge_key IS NULL AND l.company_name = i.company_name
JOIN lead_contact c ON c.lead_id = l.id
  AND lower(coalesce(c.first_name, '')) = lower(coalesce(i.first_name, ''))
  AND lower(coalesce(c.last_name, '')) = lower(coalesce(i.last_name, ''))
WHERE NOT EXISTS (SELECT 1 FROM scout_lead_map m WHERE m.row_id = i.row_id)
ORDER BY i.row_id, l.created_at NULLS LAST, l.id;

INSERT INTO scout_lead_map (row_id, lead_id)
SELECT i.row_id, gen_random_uuid()
FROM scout_notion_import i
WHERE i.merge_key IS NULL
  AND NOT EXISTS (SELECT 1 FROM scout_lead_map m WHERE m.row_id = i.row_id);

INSERT INTO lead (
  id, company_name, domain, city, country_code, industry, status, search_query_id,
  email_outreach_blocked, created_at
)
SELECT
  m.lead_id,
  i.company_name,
  NULL,
  i.city,
  'DE',
  i.industry,
  'error_no_domain',
  sq.id,
  true,
  coalesce(i.created_at, now())
FROM scout_lead_map m
JOIN scout_notion_import i ON i.row_id = m.row_id
LEFT JOIN search_query sq ON sq.query = i.region_query
WHERE i.merge_key IS NULL
  AND NOT EXISTS (SELECT 1 FROM lead l WHERE l.id = m.lead_id);

-- Bestehende (auch gematchte) Leads: nie in E-Mail-Kampagnen
UPDATE lead l
SET email_outreach_blocked = true
WHERE l.id IN (SELECT lead_id FROM scout_lead_map)
  AND l.email_outreach_blocked IS DISTINCT FROM true;

INSERT INTO lead_contact (
  lead_id, first_name, last_name, linkedin_url, created_at, updated_at
)
SELECT
  m.lead_id,
  i.first_name,
  i.last_name,
  i.linkedin_url,
  coalesce(i.created_at, now()),
  coalesce(i.created_at, now())
FROM scout_notion_import i
JOIN scout_lead_map m ON m.row_id = i.row_id
WHERE i.linkedin_url IS NOT NULL
ON CONFLICT (linkedin_url) DO UPDATE SET
  first_name = COALESCE(EXCLUDED.first_name, lead_contact.first_name),
  last_name = COALESCE(EXCLUDED.last_name, lead_contact.last_name),
  updated_at = EXCLUDED.updated_at;

INSERT INTO lead_contact (
  lead_id, first_name, last_name, linkedin_url, created_at, updated_at
)
SELECT
  m.lead_id,
  i.first_name,
  i.last_name,
  NULL,
  coalesce(i.created_at, now()),
  coalesce(i.created_at, now())
FROM scout_notion_import i
JOIN scout_lead_map m ON m.row_id = i.row_id
WHERE i.linkedin_url IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM lead_contact c
    WHERE c.lead_id = m.lead_id
      AND lower(coalesce(c.first_name, '')) = lower(coalesce(i.first_name, ''))
      AND lower(coalesce(c.last_name, '')) = lower(coalesce(i.last_name, ''))
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
JOIN scout_lead_map m ON m.row_id = i.row_id
JOIN lead_contact c ON (
  (i.linkedin_url IS NOT NULL AND c.linkedin_url = i.linkedin_url)
  OR (
    i.linkedin_url IS NULL
    AND c.lead_id = m.lead_id
    AND lower(coalesce(c.first_name, '')) = lower(coalesce(i.first_name, ''))
    AND lower(coalesce(c.last_name, '')) = lower(coalesce(i.last_name, ''))
  )
)
JOIN campaign camp ON camp.name = ${sqlLit(LINKEDIN_CAMPAIGN_NAME)}
ON CONFLICT (campaign_id, lead_contact_id) DO NOTHING;

COMMIT;
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, sql);

console.log(`wrote ${path.relative(root, out) || out}`);
console.log(`rows=${mapped.length} merge_keys=${mergeKeys.size} generic=${genericCount} expected_new_leads=${expectedNewLeads} linkedin=${withLi}`);
console.log(`status ${Object.entries(statusCounts).map(([k, n]) => `${k}=${n}`).join(' ')}`);
console.log('ähnliche Firmen, nicht zusammengeführt:');
if (similar.length === 0) {
  console.log('  (keine)');
} else {
  for (const [a, b] of similar) {
    console.log(`  '${a.label}' [${a.key}] vs '${b.label}' [${b.key}]`);
  }
}
