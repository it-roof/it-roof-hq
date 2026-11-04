This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Mail-Modul

Das Mail-Modul (`/mail` und `/mail/konten`) ermöglicht das Versenden und Empfangen von E-Mails über IMAP/SMTP-Konten.

### HTML-Mails mit Signatur

Jedes Mail-Konto kann eine HTML-Signatur haben, die automatisch an alle neuen Mails und Antworten angehängt wird:

1. Gehe zu **Mail → Konten**
2. Klicke auf **Bearbeiten** bei einem Konto
3. Füge deine HTML-Signatur im Feld **Signatur (HTML)** ein
4. Beispiel mit Logo:
   ```html
   <p>Mit freundlichen Grüßen<br>
   Dein Name<br>
   <img src="https://signatur.it-roof.de/img.png" alt="IT ROOF Logo" /></p>
   ```

### Compose-Dialog

Der Compose-Dialog unterstützt:
- **HTML-Modus**: Checkbox aktivieren für HTML-Bearbeitung
- **Vorschau**: Live-Vorschau des gerenderten HTML
- **Multipart/Alternative**: Automatische Generierung einer Plain-Text-Fallback-Version
- **Signatur**: Wird automatisch angehängt (bei HTML als `<div>`, bei Plain-Text am Ende)

### Programmatische Mail-API

Für Automationen und Outreach-Kampagnen steht eine REST-API zur Verfügung:

**Endpoint:** `POST /api/mail/send-html`

**Authentifizierung:** Session-Cookie (gleiche Auth wie normale App)

**Request Body:**
```json
{
  "account_email": "jakob@it-roof.de",
  "to": "kunde@beispiel.de",
  "cc": ["kollege@it-roof.de"],
  "subject": "Betreff der Mail",
  "html": "<p>Hallo,</p><p>Dies ist der <strong>HTML-Body</strong>.</p>"
}
```

**Response (Erfolg):**
```json
{
  "ok": true,
  "message_id": "<...@it-roof.de>",
  "sent_from": "jakob@it-roof.de",
  "sent_to": ["kunde@beispiel.de"],
  "sent_cc": ["kollege@it-roof.de"]
}
```

**Response (Fehler):**
```json
{
  "error": "Fehlermeldung"
}
```

**Hinweise:**
- Die Signatur des Kontos wird **automatisch** angehängt
- Eine Plain-Text-Fallback-Version wird automatisch generiert
- Bilder können via Remote-URL (`<img src="https://...">`) eingebunden werden
- `to` und `cc` können String oder Array sein

**Beispiel (curl):**
```bash
curl -X POST https://hq.it-roof.com/api/mail/send-html \
  -H "Content-Type: application/json" \
  -H "Cookie: authjs.session-token=..." \
  -d '{
    "account_email": "jakob@it-roof.de",
    "to": "kunde@beispiel.de",
    "subject": "Sales Outreach",
    "html": "<p>Hallo,</p><p>Wir haben ein Angebot für Sie...</p>"
  }'
```

## Scout-API (LinkedIn / Kanzlei Scout)

Bot-API unter `/api/scout/*`. Auth: `Authorization: Bearer <token>`. Der SHA-256-Hash (Hex) des Tokens steht in `SCOUT_API_TOKEN_SHA256` (Leads-DB: `LEADS_DATABASE_URL`). Tabelle `lead` wird nicht verändert; Personen hängen an `lead_contact`, LinkedIn-Status an `campaign_contact` der Kampagne **LinkedIn KI-Schulung Rechtsanwälte** (`channel = linkedin`). Slug in Pfaden: `linkedin-ki-schulung`.

SQL (manuell auf einem Neon-Testbranch): `scripts/leads-scout.sql`, danach `scripts/leads-scout-import-notion.sql`. Prüfung: `scripts/leads-scout-verify.sql`.

### Endpunkte

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/scout/leads/lookup?domain=` oder `company_name=` | Kanzlei + Kontakte + Kampagnenstatus |
| GET | `/api/scout/contacts/lookup?linkedin=` | Person über normalisierte LinkedIn-URL |
| POST | `/api/scout/leads` | Upsert Kanzlei (Match Domain, sonst normalisierter Firmenname) |
| POST | `/api/scout/contacts` | Upsert Person (`lead_id` oder Kanzlei-Felder; Dublette `linkedin_url`) |
| GET | `/api/scout/campaigns/{id\|linkedin-ki-schulung}/contacts?status=` | Kampagnenkontakte |
| PUT | `/api/scout/campaigns/{id\|linkedin-ki-schulung}/contacts/{contactId}` | Upsert `campaign_contact` (`status` Pflicht, `status_at` bei Wechsel) |

LinkedIn-URLs werden gespeichert als `https://`, ohne `www.`, ohne Query/Fragment, ohne Slash am Ende, lowercase.

### curl

```bash
export SCOUT_TOKEN='…'

curl -sS "$HOST/api/scout/leads/lookup?company_name=Beispielkanzlei" \
  -H "Authorization: Bearer $SCOUT_TOKEN"

curl -sS "$HOST/api/scout/contacts/lookup?linkedin=https://www.linkedin.com/in/beispiel/" \
  -H "Authorization: Bearer $SCOUT_TOKEN"

curl -sS -X POST "$HOST/api/scout/leads" \
  -H "Authorization: Bearer $SCOUT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Beispielkanzlei","domain":"beispiel.de","city":"Bamberg","region":"oberfranken"}'

curl -sS -X POST "$HOST/api/scout/contacts" \
  -H "Authorization: Bearer $SCOUT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Beispielkanzlei","first_name":"Ada","last_name":"Beispiel","linkedin_url":"https://www.linkedin.com/in/ada-beispiel/"}'

curl -sS -X PUT "$HOST/api/scout/campaigns/linkedin-ki-schulung/contacts/<CONTACT_ID>" \
  -H "Authorization: Bearer $SCOUT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"li_anfrage_gesendet","notes":"Anfrage raus"}'

curl -sS "$HOST/api/scout/campaigns/linkedin-ki-schulung/contacts?status=li_anfrage_gesendet" \
  -H "Authorization: Bearer $SCOUT_TOKEN"
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
