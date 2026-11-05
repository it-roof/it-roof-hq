/** Edge-sicher: Scout-Bot-API-Pfade. */

export function isScoutApiPath(pathname: string) {
  return pathname === '/api/scout' || pathname.startsWith('/api/scout/');
}

export function hasBearerToken(authorization: string | null | undefined) {
  return /^Bearer\s+\S+/i.test(authorization ?? '');
}
