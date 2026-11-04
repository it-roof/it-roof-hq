-- Leads DB: Scout / LinkedIn-Kampagne (idempotent, transaktional)
-- Tabelle lead bleibt unverändert.
BEGIN;

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

INSERT INTO campaign (name, channel, created_at)
SELECT 'LinkedIn KI-Schulung Rechtsanwälte', 'linkedin', now()
WHERE NOT EXISTS (
  SELECT 1 FROM campaign WHERE name = 'LinkedIn KI-Schulung Rechtsanwälte'
);

UPDATE campaign
SET channel = 'linkedin'
WHERE name = 'LinkedIn KI-Schulung Rechtsanwälte'
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
