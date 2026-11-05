'use client';

import type { ReactNode } from 'react';
import { AppSidebar } from '@/components/demo/dashboard-01/app-sidebar';
import { SiteHeader } from '@/components/demo/dashboard-01/site-header';
import { DemoThemeProvider } from '@/components/demo/demo-theme';
import { MailNavProvider } from '@/components/mail/mail-nav-context';
import { Toaster } from '@/components/demo/ui/sonner';
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/demo/ui/sidebar';
import { cn } from '@/lib/utils';

/**
 * Shared grundgerüst for demo + app pages (dashboard-01 chrome).
 */
export function DashboardShell({
  title,
  children,
  fullHeight = false,
}: {
  title: string;
  children: ReactNode;
  /** Split/chat apps: fill remaining viewport instead of document padding */
  fullHeight?: boolean;
}) {
  return (
    <DemoThemeProvider>
      <MailNavProvider>
        <SidebarProvider
          style={
            {
              '--sidebar-width': 'calc(var(--spacing) * 72)',
              '--header-height': 'calc(var(--spacing) * 12)',
            } as React.CSSProperties
          }
          className={cn(fullHeight && 'min-h-svh')}
        >
          <AppSidebar variant="inset" />
          <SidebarInset className={cn(fullHeight && 'min-h-0 overflow-hidden')}>
            <SiteHeader title={title} />
            {fullHeight ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {children}
              </div>
            ) : (
              <div className="flex flex-1 flex-col">
                <div className="@container/main flex flex-1 flex-col gap-2">
                  <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                    {children}
                  </div>
                </div>
              </div>
            )}
          </SidebarInset>
        </SidebarProvider>
        <Toaster />
      </MailNavProvider>
    </DemoThemeProvider>
  );
}
