# Mail-Bot JSON-API (Grok)

Programmatic JSON API for the internal Grok mail agent — read, organize, draft/send.

## Auth

```http
Authorization: Bearer <MAIL_BOT_TOKEN>
```

- Token min. 32 Zeichen (`MAIL_BOT_TOKEN`)
- Timing-safe Vergleich (SHA-256 + `timingSafeEqual`)
- Rate-Limit pro IP (`MAIL_BOT_RATE_LIMIT_PER_MIN`, default 120/min)
- Alle Zugriffe als Bot-User (`MAIL_BOT_USER_EMAIL`, default `grokbot@it-roof.com`)
- Audit-Log für Auth-Fails und jede Aktion

## Env

| Variable | Pflicht | Default | Bedeutung |
|---|---|---|---|
| `MAIL_BOT_TOKEN` | ja | — | Bearer-Secret (≥32) |
| `MAIL_BOT_USER_EMAIL` | nein | `grokbot@it-roof.com` | User, dessen Postfächer der Bot sieht |
| `MAIL_BOT_ALLOW_SEND` | nein | `false` | `true` erlaubt echtes Senden |
| `MAIL_BOT_MAX_BODY_CHARS` | nein | `20000` | Max. Body-Länge |
| `MAIL_BOT_MAX_ATTACHMENT_BYTES` | nein | `2097152` (2 MB) | Max. Anhang-Download |
| `MAIL_BOT_RATE_LIMIT_PER_MIN` | nein | `120` | Requests/IP/Minute |

## Setup

1. User `grokbot@…` anlegen (Seed)
2. Als dieser User IMAP/SMTP-Konten unter **Inbox → Konten** einrichten
3. `MAIL_BOT_TOKEN` setzen

Der Bot sieht **nur** die Postfächer dieses Users.

## Endpoints

### `GET /api/bot/mail`
Tool-Katalog / Capabilities (für den Agenten).

### `GET /api/bot/mail/mailboxes`
Postfächer auflisten.

### `GET /api/bot/mail/folders?mailbox_id=`
Ordner inkl. Unread.

### `GET /api/bot/mail/messages`
Query: `mailbox_id`, `folder_id`, `role`, `q`, `limit` (max 50), `threaded` (default 1).  
Metadaten + Snippet.

### `GET /api/bot/mail/messages/:id`
- ohne Query: Mail mit `body_text`
- `?thread=1`: + Thread-Liste
- `?thread=full`: + Thread mit Bodies

### `PATCH /api/bot/mail/messages/:id`
```json
{
  "seen": true,
  "flagged": false,
  "folder_id": "…",
  "move_to": "archive"
}
```
`move_to`: `archive` | `trash` | `inbox` | `junk` (oder `folder_id`).

### `DELETE /api/bot/mail/messages/:id`
→ Papierkorb; erneut aus Papierkorb = endgültig.

### `POST /api/bot/mail/drafts`
```json
{
  "mailbox_id": "…",
  "to": ["kunde@example.de"],
  "subject": "Re: …",
  "text": "…",
  "send": false
}
```
`send: true` nur mit `MAIL_BOT_ALLOW_SEND=true`.

### `POST /api/bot/mail/sync`
```json
{ "mailbox_id": "…" }
```
Ohne `mailbox_id` → alle Konten des Bot-Users syncen.

### `GET /api/bot/mail/attachments/:id`
- `?meta=1` → nur Metadaten
- sonst Base64-Inhalt (Größenlimit)

## Typischer Agent-Flow

1. `POST /sync` (optional)
2. `GET /messages?role=inbox&q=…`
3. `GET /messages/:id?thread=full`
4. `POST /drafts` (Antwort)
5. `PATCH` → `seen: true` / `move_to: archive`
6. bei Bedarf `DELETE`

## Security

- Nur Bearer, kein Session-Cookie
- Senden default aus
- Bodies Plaintext + Truncation
- Attachments Größenlimit
- Mutationen nur auf Postfächern des Bot-Users
