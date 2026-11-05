/**
 * Routes that use DashboardShell + DemoThemeProvider (bypass old AppShell).
 * Keep in sync as pages migrate; login is never listed.
 */
export const DEMO_SHELL_PREFIXES = [
  '/demo',
  '/kunden',
  '/projekte',
  '/monatsberichte',
  '/aufgaben',
  '/studio',
  '/ai',
  '/leads',
  '/mail',
  '/einstellungen',
] as const;

export function usesDemoShell(path: string): boolean {
  if (path === '/') return true;
  return DEMO_SHELL_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
