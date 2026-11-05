/** Edge-sicher: Inbox-Watch-Bot-API-Pfade. Token gilt nur für genau diese zwei Routen. */

export function isInboxWatchApiPath(pathname: string) {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return path === '/api/mail/inbox' || path === '/api/mail/draft';
}

export function hasBearerToken(authorization: string | null | undefined) {
  return /^Bearer\s+\S+/i.test(authorization ?? '');
}
