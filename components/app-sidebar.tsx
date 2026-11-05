'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getAreaForPath, isLinkActive } from '@/lib/nav';
import { logoutAction } from '@/app/actions/auth';
import type { ShellUser } from '@/components/shell-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { LogOutIcon, ShieldIcon } from 'lucide-react';

function userInitials(user: ShellUser) {
  const name = user.name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? '';
    const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return `${a}${b}`.toUpperCase() || '?';
  }
  return (user.email?.[0] ?? '?').toUpperCase();
}

export function AppSidebar({ user }: { user: ShellUser | null }) {
  const path = usePathname();
  const area = getAreaForPath(path);
  const label = user?.name?.trim() || user?.email || 'Benutzer';
  const sub = user?.name?.trim() && user.email ? user.email : null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex h-12 flex-row items-center border-b border-sidebar-border p-0 px-3">
        <Link href={area.href} className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-6 shrink-0 items-center justify-center bg-sidebar-primary font-heading text-[10px] font-bold text-sidebar-primary-foreground">
            P
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate font-heading text-sm font-bold leading-none tracking-tight">
              Pinguine OS
            </p>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] tracking-wide">
            {area.label}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {area.links.map((l) => (
                <SidebarMenuItem key={l.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isLinkActive(path, l.href)}
                    tooltip={l.label}
                    className="font-mono text-[12px] tracking-wide"
                  >
                    <Link href={l.href}>
                      <l.icon />
                      <span>{l.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        {user && (
          <div className="mb-1 flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <div
              className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent font-mono text-[10px] font-semibold tracking-wide text-sidebar-accent-foreground"
              title={user.email ?? label}
            >
              {userInitials(user)}
            </div>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-[12px] font-medium leading-tight">{label}</p>
              {sub && (
                <p className="truncate font-mono text-[10px] tracking-wide text-muted-foreground">
                  {sub}
                </p>
              )}
            </div>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={path.startsWith('/einstellungen')}
              tooltip="Sicherheit"
              className="font-mono text-[12px] tracking-wide"
            >
              <Link href="/einstellungen/sicherheit">
                <ShieldIcon />
                <span>Sicherheit</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={logoutAction}>
              <SidebarMenuButton
                type="submit"
                tooltip="Abmelden"
                className="w-full font-mono text-[12px] tracking-wide"
              >
                <LogOutIcon />
                <span>Abmelden</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
