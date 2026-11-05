'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { OS_AREAS, getAreaForPath, getBreadcrumbsForPath } from '@/lib/nav';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  areaSwitchItemClassName,
  areaSwitchTrackClassName,
  chromeSurface,
} from '@/lib/nav-chrome';
import { cn } from '@/lib/utils';
import { Fragment } from 'react';

export function AppNavbar() {
  const path = usePathname();
  if (path.startsWith('/ai/')) return null;

  const area = getAreaForPath(path);
  const crumbs = getBreadcrumbsForPath(path);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b px-3 md:px-4',
        chromeSurface,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <SidebarTrigger className="-ml-1 shrink-0 text-sidebar-foreground" />
        <Separator orientation="vertical" className="mr-1 hidden h-4 bg-sidebar-border sm:block" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap gap-1 text-[12px] text-sidebar-foreground/55 sm:gap-1.5">
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <Fragment key={`${crumb.label}-${i}`}>
                  {i > 0 && (
                    <BreadcrumbSeparator className="hidden text-sidebar-foreground/35 sm:block [&>svg]:size-3" />
                  )}
                  <BreadcrumbItem className={cn(i < crumbs.length - 1 && 'hidden sm:inline-flex')}>
                    {isLast || !crumb.href ? (
                      <BreadcrumbPage className="truncate font-mono tracking-wide text-sidebar-foreground">
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link
                          href={crumb.href}
                          className="truncate font-mono tracking-wide hover:text-sidebar-foreground"
                        >
                          {crumb.label}
                        </Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <nav className={cn(areaSwitchTrackClassName())}>
        {OS_AREAS.map((a) => {
          const active = a.id === area.id;
          return (
            <Link
              key={a.id}
              href={a.href}
              className={areaSwitchItemClassName(active)}
              title={a.label}
            >
              <a.icon className="size-3.5" strokeWidth={active ? 2.5 : 1.75} />
              <span className="font-mono tracking-wide">{a.shortLabel}</span>
            </Link>
          );
        })}
      </nav>

      <div aria-hidden="true" />
    </header>
  );
}
