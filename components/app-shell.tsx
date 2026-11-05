/**
 * Legacy chrome removed — all app pages use DashboardShell.
 * Login and every other route pass children through; pages own their chrome.
 */
export type ShellUser = {
  name: string | null;
  email: string | null;
};

export function AppShell({
  children,
}: {
  children: React.ReactNode;
  user?: ShellUser | null;
}) {
  return <>{children}</>;
}
