-- Scout-Verify: eine Abfrage
-- Ausgang Produktion vor Migration: lead 1318, lead_contact 902, campaign_lead 963, campaign 3
-- Soll nach Import: lead_contact 902+281, campaign_contact 281
-- Neue Leads: bis zu 252 (236 Kanzlei-Keys + 16 generische Personen), minus Treffer auf bestehende Namen.
--   li_anfrage_gesendet 180, li_vernetzt 79, li_nachfass 16, li_zurueckgestellt 4,
--   li_absage 1, li_nachricht_gesendet 1, linkedin_url +260, campaign_lead 963 unverändert

SELECT
  (SELECT count(*)::int FROM lead) AS lead_total,
  (SELECT count(*)::int FROM lead_contact) AS lead_contact_total,
  (SELECT count(*)::int FROM campaign_lead) AS campaign_lead_total,
  (SELECT count(*)::int FROM campaign) AS campaign_total,
  (SELECT count(*)::int FROM campaign_contact) AS campaign_contact_total,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'li_shortlist') AS li_shortlist,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'li_anfrage_gesendet') AS li_anfrage_gesendet,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'li_vernetzt') AS li_vernetzt,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'li_nachricht_entwurf') AS li_nachricht_entwurf,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'li_nachricht_gesendet') AS li_nachricht_gesendet,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'li_geantwortet') AS li_geantwortet,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'li_nachfass') AS li_nachfass,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'li_absage') AS li_absage,
  (SELECT count(*)::int FROM campaign_contact WHERE status = 'li_zurueckgestellt') AS li_zurueckgestellt,
  (SELECT count(*)::int FROM lead_contact WHERE linkedin_url IS NOT NULL AND linkedin_url <> '') AS contacts_with_linkedin,
  (
    SELECT count(DISTINCT lc.lead_id)::int
    FROM campaign_contact cc
    JOIN lead_contact lc ON lc.id = cc.lead_contact_id
    JOIN campaign c ON c.id = cc.campaign_id
    WHERE c.name IN ('LinkedIn KI-Schulung Kanzleien', 'LinkedIn KI-Schulung Rechtsanwälte')
  ) AS notion_leads;
