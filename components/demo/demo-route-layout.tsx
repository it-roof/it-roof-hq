import type { ReactNode } from 'react';
import { DemoThemeProvider } from '@/components/demo/demo-theme';

/**
 * Shared layout wrapper for routes that use the demo dashboard chrome.
 * Prefer putting DemoThemeProvider inside DashboardShell; use this when a
 * segment layout needs the theme before the page mounts.
 */
export function DemoRouteLayout({ children }: { children: ReactNode }) {
  return <DemoThemeProvider>{children}</DemoThemeProvider>;
}
