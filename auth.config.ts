import type { NextAuthConfig } from 'next-auth';
import { hasBearerToken, isScoutApiPath } from '@/lib/auth/scout-path';

function isPublicPath(pathname: string) {
  if (pathname.startsWith('/api/auth')) return true;
  if (pathname === '/login') return true;
  // Nur Reset mit Token — kein öffentliches „Passwort vergessen“
  if (pathname === '/login/reset' || pathname.startsWith('/login/reset/')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (pathname === '/manifest.webmanifest') return true;
  if (pathname === '/robots.txt') return true;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$/i.test(pathname)) return true;
  return false;
}

/**
 * Edge-sichere Auth-Config (für proxy.ts).
 * Credentials/DB bleiben in auth.ts.
 */
export default {
  providers: [],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request }) {
      if (isPublicPath(request.nextUrl.pathname)) return true;
      if (
        isScoutApiPath(request.nextUrl.pathname)
        && hasBearerToken(request.headers.get('authorization'))
      ) {
        return true;
      }
      return !!auth;
    },
  },
} satisfies NextAuthConfig;
