/** Edge-sicher: Bot-API-Pfade. */

export function isScoutApiPath(pathname: string) {
  return pathname === '/api/scout' || pathname.startsWith('/api/scout/');
}

export function isKanzleiMailApiPath(pathname: string) {
  return pathname === '/api/kanzlei-mail' || pathname.startsWith('/api/kanzlei-mail/');
}

export function hasBearerToken(authorization: string | null | undefined) {
  return /^Bearer\s+\S+/i.test(authorization ?? '');
}
