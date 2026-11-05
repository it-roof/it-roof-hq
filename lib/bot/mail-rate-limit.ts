type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const DEFAULT_MAX = 120;

function maxPerWindow() {
  const n = Number(process.env.MAIL_BOT_RATE_LIMIT_PER_MIN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX;
}

/** Einfaches In-Memory-Limit pro IP (eine Instanz). */
export function checkBotRateLimit(ip: string): { ok: boolean; remaining: number } {
  const now = Date.now();
  const key = ip || 'unknown';
  const max = maxPerWindow();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return { ok: false, remaining: 0 };
  }
  return { ok: true, remaining: Math.max(0, max - bucket.count) };
}
