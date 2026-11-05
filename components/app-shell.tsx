import type { ShellUser } from '@/components/shell-user';

export type { ShellUser };

/**
 * Legacy chrome removed — all app pages use DashboardShell.
 * Login and every other route pass children through; pages own their chrome.
 */
export function AppShell({
  children,
}: {
  children: React.ReactNode;
  user?: ShellUser | null;
}) {
  return <>{children}</>;
}
