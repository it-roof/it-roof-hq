import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { INBOX_WATCH_TEST_TOKEN } from '../../../lib/auth/inbox-watch-test-env';
import { isInboxWatchApiPath } from '../../../lib/auth/inbox-watch-path';
import { resetInboxWatchRateLimit } from '../../../lib/auth/require-inbox-watch-token';
import { GET as inboxGet } from './inbox/route';
import { POST as draftPost } from './draft/route';

function inboxReq(headers: Record<string, string> = {}, search = 'since=2026-01-01T00:00:00.000Z') {
  return new NextRequest(`http://localhost/api/mail/inbox?${search}`, { headers });
}

function bearer() {
  return { authorization: `Bearer ${INBOX_WATCH_TEST_TOKEN}` };
}

function source(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

describe('Inbox-Watch Routen-Auth', () => {
  afterEach(() => {
    resetInboxWatchRateLimit();
  });

  it('GET /api/mail/inbox ohne Token → 401', async () => {
    const res = await inboxGet(inboxReq());
    assert.equal(res.status, 401);
  });

  it('GET /api/mail/inbox mit falschem Token → 401', async () => {
    const res = await inboxGet(inboxReq({ authorization: 'Bearer wrong-token' }));
    assert.equal(res.status, 401);
  });

  it('GET /api/mail/inbox mit Token und ungültigem Konto → 400, nicht 401', async () => {
    const res = await inboxGet(inboxReq(bearer(), 'since=2026-01-01T00:00:00.000Z&konto=other'));
    assert.equal(res.status, 400);
    const body = await res.json() as { error?: string };
    assert.equal(body.error, 'Ungültiges Konto');
  });

  it('POST /api/mail/draft ohne Token → 401', async () => {
    const res = await draftPost(new NextRequest('http://localhost/api/mail/draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ konto: 'hello', an: 'ada@example.com', betreff: 'x', text: 'y', in_reply_to: '<x@example.com>' }),
    }));
    assert.equal(res.status, 401);
  });

  it('Bearer gilt nicht für send-html, sync, drafts — Session bleibt Pflicht', () => {
    for (const path of ['/api/mail/send-html', '/api/mail/sync', '/api/mail/drafts', '/api/mail/send']) {
      assert.equal(isInboxWatchApiPath(path), false, path);
    }

    const sendHtml = source('./send-html/route.ts');
    assert.match(sendHtml, /requireSession/);
    assert.doesNotMatch(sendHtml, /requireInboxWatchToken|INBOX_WATCH_API_TOKEN/);

    const sync = source('./sync/route.ts');
    assert.match(sync, /requireSession/);
    assert.match(sync, /CRON_SECRET/);
    assert.doesNotMatch(sync, /requireInboxWatchToken|INBOX_WATCH_API_TOKEN/);
    assert.match(sync, /authHeader === `Bearer \$\{cron\}`/);

    const drafts = source('./drafts/route.ts');
    assert.match(drafts, /requireSession/);
    assert.doesNotMatch(drafts, /requireInboxWatchToken|INBOX_WATCH_API_TOKEN/);

    const proxy = source('../../../proxy.ts');
    assert.match(proxy, /isInboxWatchApiPath/);
    assert.doesNotMatch(proxy, /pathname\.startsWith\('\/api\/mail\/'\)/);

    const inbox = source('./inbox/route.ts');
    const draft = source('./draft/route.ts');
    assert.match(inbox, /requireInboxWatchToken/);
    assert.match(draft, /requireInboxWatchToken/);
    assert.doesNotMatch(inbox, /requireSession/);
    assert.doesNotMatch(draft, /requireSession/);
  });
});
