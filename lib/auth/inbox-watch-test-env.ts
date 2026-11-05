import { createHash } from 'node:crypto';

process.env.AUTH_SECRET ??= 'test-auth-secret-for-inbox-watch-tests-32ch';
process.env.DATABASE_URL ??= 'postgresql://inbox-watch-test:inbox-watch-test@127.0.0.1/inbox-watch-test';
process.env.CRON_SECRET ??= 'cron-secret-distinct-from-inbox-watch';

export const INBOX_WATCH_TEST_TOKEN = 'inbox-watch-test-token-not-for-production';
process.env.INBOX_WATCH_API_TOKEN_SHA256 = createHash('sha256')
  .update(INBOX_WATCH_TEST_TOKEN, 'utf8')
  .digest('hex');
