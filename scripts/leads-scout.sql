-- Leads DB: Scout / LinkedIn-Kampagne (idempotent, transaktional)
-- Tabelle lead: nur additive nullable/boolean Spalten, keine Umstrukturierung.
BEGIN;

CREATE OR REPLACE FUNCTION scout_company_name_key(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s text;
  prev text;
  form text;
  prefix text;
  forms text[] := ARRAY[
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
    'stbg mbh',
    'stb gmbh',
    'partg',
    'mbb',
    'stbg',
    'wpg',
    'gmbh',
    'mbh',
    'gbr',
    'ag',
    'kg',
    'ohg',
    'ug',
    'ev',
    'se'
  ];
  prefixes text[] := ARRAY['selbststaendig', 'selbstständig', 'selbständig'];
  generic text[] := ARRAY[
    '', '-', 'n a', 'na', 'notar', 'notarin', 'rechtsanwalt', 'rechtsanwaeltin',
    'rechtsanwältin', 'kanzleiinhaber', 'kanzleiinhaberin', 'eigene kanzlei',
    'unbekannt', 'selbststaendig', 'selbstständig', 'selbständig',
    'steuerberater', 'steuerberaterin', 'steuer', 'steuerkanzlei',
    'einzelkanzlei', 'kanzlei', 'sonstig', 'wp', 'stb', 'wp stb', 'stbin'
  ];
  changed boolean;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  s := btrim(regexp_replace(raw, '\s+', ' ', 'g'));
  IF s = '' THEN RETURN NULL; END IF;

  LOOP
    prev := s;
    s := regexp_replace(s, '\([^()]*\)', ' ', 'g');
    EXIT WHEN s = prev;
  END LOOP;

  s := replace(s, '&', ' und ');
  s := replace(s, '.', '');
  s := lower(s);
  s := regexp_replace(s, '[^a-z0-9äöüß]+', ' ', 'g');
  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));

  LOOP
    changed := false;
    FOREACH prefix IN ARRAY prefixes LOOP
      IF s = prefix THEN
        s := '';
        changed := true;
        EXIT;
      ELSIF s LIKE prefix || ' %' THEN
        s := btrim(substr(s, char_length(prefix) + 2));
        changed := true;
        EXIT;
      END IF;
    END LOOP;
    EXIT WHEN NOT changed;
  END LOOP;

  LOOP
    changed := false;
    FOREACH form IN ARRAY forms LOOP
      IF s = form THEN
        s := '';
        changed := true;
        EXIT;
      ELSIF s LIKE '% ' || form THEN
        s := btrim(left(s, char_length(s) - char_length(form) - 1));
        changed := true;
        EXIT;
      END IF;
    END LOOP;
    EXIT WHEN NOT changed;
  END LOOP;

  s := btrim(regexp_replace(s, '\s+', ' ', 'g'));
  IF s = ANY (generic) THEN RETURN NULL; END IF;
  IF s = '' THEN RETURN NULL; END IF;
  RETURN s;
END;
$$;

ALTER TABLE lead ADD COLUMN IF NOT EXISTS firm_size text;
ALTER TABLE lead ADD COLUMN IF NOT EXISTS specialties text;
ALTER TABLE lead ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE lead ADD COLUMN IF NOT EXISTS fit_reason text;
ALTER TABLE lead ADD COLUMN IF NOT EXISTS email_outreach_blocked boolean;
UPDATE lead SET email_outreach_blocked = false WHERE email_outreach_blocked IS NULL;
ALTER TABLE lead ALTER COLUMN email_outreach_blocked SET DEFAULT false;
ALTER TABLE lead ALTER COLUMN email_outreach_blocked SET NOT NULL;

ALTER TABLE lead_contact DROP CONSTRAINT IF EXISTS lead_contact_lead_id_key;
DROP INDEX IF EXISTS lead_contact_lead_id_key;
CREATE INDEX IF NOT EXISTS lead_contact_lead_id_idx ON lead_contact (lead_id);

ALTER TABLE lead_contact ADD COLUMN IF NOT EXISTS linkedin_url text;
CREATE UNIQUE INDEX IF NOT EXISTS lead_contact_linkedin_url_key ON lead_contact (linkedin_url);

ALTER TABLE campaign ADD COLUMN IF NOT EXISTS channel text;
UPDATE campaign SET channel = 'email' WHERE channel IS NULL;
ALTER TABLE campaign ALTER COLUMN channel SET DEFAULT 'email';
ALTER TABLE campaign ALTER COLUMN channel SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_channel_check'
  ) THEN
    ALTER TABLE campaign
      ADD CONSTRAINT campaign_channel_check
      CHECK (channel IN ('email', 'linkedin'));
  END IF;
END $$;

UPDATE campaign
SET name = 'LinkedIn KI-Schulung Kanzleien',
    channel = 'linkedin'
WHERE name IN ('LinkedIn KI-Schulung Rechtsanwälte', 'LinkedIn KI-Schulung Kanzleien');

INSERT INTO campaign (name, channel, created_at)
SELECT 'LinkedIn KI-Schulung Kanzleien', 'linkedin', now()
WHERE NOT EXISTS (
  SELECT 1 FROM campaign
  WHERE name IN ('LinkedIn KI-Schulung Kanzleien', 'LinkedIn KI-Schulung Rechtsanwälte')
);

UPDATE campaign
SET channel = 'linkedin'
WHERE name = 'LinkedIn KI-Schulung Kanzleien'
  AND channel IS DISTINCT FROM 'linkedin';

CREATE TABLE IF NOT EXISTS campaign_contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  campaign_id uuid NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
  lead_contact_id uuid NOT NULL REFERENCES lead_contact(id) ON DELETE CASCADE,
  status text NOT NULL,
  status_at timestamptz,
  notes text,
  next_step text,
  requested_at date,
  accepted_at date,
  write_from date,
  written_at date,
  replied_at date,
  draft_subject text,
  draft_body text,
  created_at timestamptz,
  updated_at timestamptz,
  CONSTRAINT campaign_contact_campaign_id_lead_contact_id_key UNIQUE (campaign_id, lead_contact_id),
  CONSTRAINT campaign_contact_status_check CHECK (status IN (
    'li_shortlist',
    'li_anfrage_gesendet',
    'li_vernetzt',
    'li_nachricht_entwurf',
    'li_nachricht_gesendet',
    'li_geantwortet',
    'li_nachfass',
    'li_absage',
    'li_zurueckgestellt'
  ))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_contact_status_check'
  ) THEN
    ALTER TABLE campaign_contact
      ADD CONSTRAINT campaign_contact_status_check
      CHECK (status IN (
        'li_shortlist',
        'li_anfrage_gesendet',
        'li_vernetzt',
        'li_nachricht_entwurf',
        'li_nachricht_gesendet',
        'li_geantwortet',
        'li_nachfass',
        'li_absage',
        'li_zurueckgestellt'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaign_contact_campaign_id_lead_contact_id_key'
  ) THEN
    ALTER TABLE campaign_contact
      ADD CONSTRAINT campaign_contact_campaign_id_lead_contact_id_key
      UNIQUE (campaign_id, lead_contact_id);
  END IF;
END $$;

INSERT INTO search_query (query, searched, created_at)
SELECT v.query, false, now()
FROM (VALUES
  ('KI-Schulung Kanzleien+Oberfranken'),
  ('KI-Schulung Kanzleien+Mittelfranken'),
  ('KI-Schulung Kanzleien+Unterfranken')
) AS v(query)
WHERE NOT EXISTS (
  SELECT 1 FROM search_query sq WHERE sq.query = v.query
);

INSERT INTO search_query_tag (search_query_id, tag_id)
SELECT sq.id, t.id
FROM search_query sq
JOIN tag t ON t.name = CASE sq.query
  WHEN 'KI-Schulung Kanzleien+Oberfranken' THEN 'Oberfranken'
  WHEN 'KI-Schulung Kanzleien+Mittelfranken' THEN 'Mittelfranken'
  WHEN 'KI-Schulung Kanzleien+Unterfranken' THEN 'Unterfranken'
END
WHERE sq.query IN (
  'KI-Schulung Kanzleien+Oberfranken',
  'KI-Schulung Kanzleien+Mittelfranken',
  'KI-Schulung Kanzleien+Unterfranken'
)
AND NOT EXISTS (
  SELECT 1 FROM search_query_tag sqt
  WHERE sqt.search_query_id = sq.id AND sqt.tag_id = t.id
);

COMMIT;
