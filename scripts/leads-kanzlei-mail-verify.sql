-- Kanzlei-Mail-Verify: eine Abfrage
-- Vorher: leads-scout.sql, dann leads-kanzlei-mail.sql
-- campaign_lead unverändert; neue Kampagne +1; campaign_contact mail_* startet bei 0

SELECT
  (SELECT count(*)::int FROM lead) AS lead_total,
  (SELECT count(*)::int FROM lead_contact) AS lead_contact_total,
  (SELECT count(*)::int FROM campaign_lead) AS campaign_lead_total,
  (SELECT count(*)::int FROM campaign) AS campaign_total,
  (SELECT count(*)::int FROM campaign WHERE name = 'E-Mail KI-Schulung Kanzleien') AS email_campaign,
  (SELECT count(*)::int FROM campaign_contact) AS campaign_contact_total,
  (SELECT count(*)::int FROM campaign_contact WHERE status LIKE 'mail_%') AS mail_status_total,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'mail_neu') AS mail_neu,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'mail_entwurf') AS mail_entwurf,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'mail_gesendet') AS mail_gesendet,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'mail_geantwortet') AS mail_geantwortet,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'mail_nachfass') AS mail_nachfass,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'mail_absage') AS mail_absage,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'mail_zurueckgestellt') AS mail_zurueckgestellt,
  (
    SELECT count(*)::int FROM information_schema.columns
    WHERE table_name = 'lead' AND column_name IN ('source', 'notes')
  ) AS lead_source_notes_columns,
  (
    SELECT count(*)::int FROM pg_trigger
    WHERE tgname = 'campaign_contact_channel_status_trg'
  ) AS channel_status_trigger,
  (
    SELECT count(*)::int FROM pg_constraint
    WHERE conname = 'campaign_contact_status_check'
  ) AS status_check,
  (
    SELECT count(*)::int FROM pg_indexes
    WHERE indexname = 'lead_contact_email_norm_idx'
  ) AS email_norm_index,
  (
    SELECT count(*)::int
    FROM (
      SELECT 1
      FROM lead_contact
      WHERE email IS NOT NULL AND btrim(email) <> ''
      GROUP BY lower(trim(email))
      HAVING count(*) > 1
    ) d
  ) AS duplicate_emails;
