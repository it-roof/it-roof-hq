import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasBearerToken, isInboxWatchApiPath } from './inbox-watch-path';

describe('isInboxWatchApiPath', () => {
  it('lässt nur die zwei Inbox-Watch-Pfade durch', () => {
    assert.equal(isInboxWatchApiPath('/api/mail/inbox'), true);
    assert.equal(isInboxWatchApiPath('/api/mail/draft'), true);
    assert.equal(isInboxWatchApiPath('/api/mail/inbox/'), true);
    assert.equal(isInboxWatchApiPath('/api/mail/draft/'), true);
  });

  it('blockt alle anderen /api/mail/*-Pfade inkl. send-html und sync', () => {
    for (const path of [
      '/api/mail/send-html',
      '/api/mail/sync',
      '/api/mail/send',
      '/api/mail/drafts',
      '/api/mail/messages',
      '/api/mail/inbox/extra',
      '/api/mail/draft/extra',
      '/api/mail',
      '/api/scout/leads',
    ]) {
      assert.equal(isInboxWatchApiPath(path), false, path);
    }
  });
});

describe('hasBearerToken', () => {
  it('erkennt nur Bearer mit Token', () => {
    assert.equal(hasBearerToken('Bearer abc'), true);
    assert.equal(hasBearerToken('bearer abc'), true);
    assert.equal(hasBearerToken('Bearer'), false);
    assert.equal(hasBearerToken('Basic abc'), false);
    assert.equal(hasBearerToken(null), false);
  });
});

describe('Proxy-Vertrag', () => {
  it('ohne Session nur die zwei Pfade mit Bearer, send-html bleibt draußen', () => {
    const pass = (pathname: string, authorization: string | null) =>
      isInboxWatchApiPath(pathname) && hasBearerToken(authorization);
    assert.equal(pass('/api/mail/inbox', 'Bearer test-token'), true);
    assert.equal(pass('/api/mail/draft', 'Bearer test-token'), true);
    assert.equal(pass('/api/mail/inbox', null), false);
    assert.equal(pass('/api/mail/send-html', 'Bearer test-token'), false);
    assert.equal(pass('/api/mail/sync', 'Bearer test-token'), false);
    assert.equal(pass('/api/mail/drafts', 'Bearer test-token'), false);
  });
});
