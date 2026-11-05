import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';
import { requireInboxWatchToken, resetInboxWatchRateLimit } from './require-inbox-watch-token';

const rawToken = 'inbox-watch-test-token-not-for-production';
const tokenHash = createHash('sha256').update(rawToken, 'utf8').digest('hex');

function req(headers: Record<string, string>) {
  return new Request('http://localhost/api/mail/inbox', { headers });
}

const previousHash = process.env.INBOX_WATCH_API_TOKEN_SHA256;

describe('requireInboxWatchToken', () => {
  afterEach(() => {
    resetInboxWatchRateLimit();
    if (previousHash) process.env.INBOX_WATCH_API_TOKEN_SHA256 = previousHash;
    else delete process.env.INBOX_WATCH_API_TOKEN_SHA256;
  });

  it('401 ohne Token', () => {
    process.env.INBOX_WATCH_API_TOKEN_SHA256 = tokenHash;
    const result = requireInboxWatchToken(req({}));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.response.status, 401);
  });

  it('401 bei falschem Token', () => {
    process.env.INBOX_WATCH_API_TOKEN_SHA256 = tokenHash;
    const result = requireInboxWatchToken(req({ authorization: 'Bearer wrong-token' }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.response.status, 401);
  });

  it('401 wenn Env fehlt', () => {
    const result = requireInboxWatchToken(req({ authorization: `Bearer ${rawToken}` }));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.response.status, 401);
  });

  it('ok bei passendem SHA-256', () => {
    process.env.INBOX_WATCH_API_TOKEN_SHA256 = tokenHash;
    const result = requireInboxWatchToken(req({ authorization: `Bearer ${rawToken}` }));
    assert.equal(result.ok, true);
  });

  it('Rate-Limit 60/min', () => {
    process.env.INBOX_WATCH_API_TOKEN_SHA256 = tokenHash;
    const headers = { authorization: `Bearer ${rawToken}`, 'x-forwarded-for': '203.0.113.9' };
    for (let i = 0; i < 60; i += 1) {
      assert.equal(requireInboxWatchToken(req(headers)).ok, true);
    }
    const limited = requireInboxWatchToken(req(headers));
    assert.equal(limited.ok, false);
    if (!limited.ok) assert.equal(limited.response.status, 429);
  });
});
