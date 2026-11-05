-- Leads DB: Kanzlei-Mail / E-Mail-Kampagne (idempotent, transaktional)
-- Nach scripts/leads-scout.sql ausführen. Tabelle lead: nur additive Spalten.
BEGIN;

ALTER TABLE lead ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE lead ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE campaign_contact DROP CONSTRAINT IF EXISTS campaign_contact_status_check;
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
    'li_zurueckgestellt',
    'mail_neu',
    'mail_entwurf',
    'mail_gesendet',
    'mail_geantwortet',
    'mail_nachfass',
    'mail_absage',
    'mail_zurueckgestellt'
  ));

CREATE OR REPLACE FUNCTION campaign_contact_channel_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ch text;
BEGIN
  SELECT channel INTO ch FROM campaign WHERE id = NEW.campaign_id;
  IF ch = 'linkedin' AND NEW.status NOT LIKE 'li\_%' ESCAPE '\' THEN
    RAISE EXCEPTION 'linkedin-Kampagne erlaubt nur li_* Status';
  END IF;
  IF ch = 'email' AND NEW.status NOT LIKE 'mail\_%' ESCAPE '\' THEN
    RAISE EXCEPTION 'email-Kampagne erlaubt nur mail_* Status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_contact_channel_status_trg ON campaign_contact;
CREATE TRIGGER campaign_contact_channel_status_trg
  BEFORE INSERT OR UPDATE OF status, campaign_id ON campaign_contact
  FOR EACH ROW
  EXECUTE FUNCTION campaign_contact_channel_status();

INSERT INTO campaign (name, channel, created_at)
SELECT 'E-Mail KI-Schulung Kanzleien', 'email', now()
WHERE NOT EXISTS (
  SELECT 1 FROM campaign WHERE name = 'E-Mail KI-Schulung Kanzleien'
);

UPDATE campaign
SET channel = 'email'
WHERE name = 'E-Mail KI-Schulung Kanzleien'
  AND channel IS DISTINCT FROM 'email';

DROP INDEX IF EXISTS lead_contact_email_norm_key;
CREATE INDEX IF NOT EXISTS lead_contact_email_norm_idx
  ON lead_contact (lower(trim(email)));

COMMIT;
