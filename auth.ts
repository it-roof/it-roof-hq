import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import { db, getDb } from '@/lib/db';
import { accounts, sessions, users, verificationTokens } from '@/lib/schema';
import authConfig from '@/auth.config';
import {
  clearLoginFailures,
  getClientIp,
  isLoginLocked,
  recordLoginFailure,
} from '@/lib/auth/login-rate-limit';
import { verifyPassword } from '@/lib/auth/password';
import { verifyTotp } from '@/lib/auth/totp';

const SESSION_MAX_AGE = 60 * 60 * 12; // 12 Stunden
const useSecureCookies = process.env.NODE_ENV === 'production';

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  ...authConfig,
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE,
  },
  cookies: {
    sessionToken: {
      name: useSecureCookies
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
        maxAge: SESSION_MAX_AGE,
      },
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-Mail', type: 'email' },
        password: { label: 'Passwort', type: 'password' },
        totp: { label: '2FA-Code', type: 'text' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? '').trim().toLowerCase();
        const password = String(credentials?.password ?? '');
        const totp = String(credentials?.totp ?? '').trim();
        if (!email || !password) return null;

        const ip = await getClientIp();
        if (await isLoginLocked(ip, email)) {
          return null;
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user?.password) {
          await recordLoginFailure(ip, email);
          return null;
        }

        const ok = await verifyPassword(password, user.password);
        if (!ok) {
          await recordLoginFailure(ip, email);
          return null;
        }

        if (user.totpEnabled && user.totpSecret) {
          if (!totp || !verifyTotp(user.totpSecret, totp)) {
            await recordLoginFailure(ip, email);
            return null;
          }
        }

        await clearLoginFailures(ip, email);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? '';
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
      }
      return session;
    },
  },
}));
