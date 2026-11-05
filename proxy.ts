import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import authConfig from '@/auth.config';
import { hasBearerToken, isScoutApiPath } from '@/lib/auth/scout-path';

const { auth } = NextAuth(authConfig);

const NO_INDEX =
  'noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate';

function withNoIndex(response: NextResponse) {
  response.headers.set('X-Robots-Tag', NO_INDEX);
  return response;
}

function nextWithNoIndex() {
  return withNoIndex(NextResponse.next());
}

function isPublicPath(pathname: string) {
  if (pathname.startsWith('/api/auth')) return true;
  if (pathname === '/login') return true;
  if (pathname === '/login/reset' || pathname.startsWith('/login/reset/')) return true;
  if (pathname === '/demo' || pathname.startsWith('/demo/')) return true;
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (pathname === '/manifest.webmanifest') return true;
  if (pathname === '/robots.txt') return true;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$/i.test(pathname)) return true;
  return false;
}

export const proxy = auth((request) => {
  const { pathname } = request.nextUrl;
  const isLoggedIn = !!request.auth;

  if (pathname.startsWith('/api/auth')) {
    return nextWithNoIndex();
  }

  if (isScoutApiPath(pathname)) {
    if (hasBearerToken(request.headers.get('authorization'))) {
      return nextWithNoIndex();
    }
    return withNoIndex(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
  }

  // Alte/öffentliche Reset-Request-URLs nicht exposen
  if (pathname === '/login/forgot' || pathname.startsWith('/login/forgot/')) {
    return withNoIndex(NextResponse.redirect(new URL('/login', request.url)));
  }

  const isAsset =
    pathname.startsWith('/_next')
    || pathname.startsWith('/favicon')
    || pathname === '/manifest.webmanifest'
    || pathname === '/robots.txt'
    || /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$/i.test(pathname);

  if (isAsset) {
    return nextWithNoIndex();
  }

  if (pathname === '/login' || pathname === '/login/reset' || pathname.startsWith('/login/reset/')) {
    if (isLoggedIn && pathname === '/login') {
      return withNoIndex(NextResponse.redirect(new URL('/', request.url)));
    }
    return nextWithNoIndex();
  }

  if (!isPublicPath(pathname) && !isLoggedIn) {
    if (pathname.startsWith('/api/')) {
      return withNoIndex(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      );
    }
    const login = new URL('/login', request.url);
    // next-Param weglassen — weniger Infoleak über interne Pfade
    return withNoIndex(NextResponse.redirect(login));
  }

  return nextWithNoIndex();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
