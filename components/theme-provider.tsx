'use client';

/**
 * Light-only shell. next-themes injects a <script> that Next.js 16 / React 19
 * rejects on the client ("Encountered a script tag while rendering…").
 * Until dark mode is needed, skip next-themes entirely.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
