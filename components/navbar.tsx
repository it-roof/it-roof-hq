'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { getAreaForPath, isLinkActive, OS_AREAS } from '@/lib/nav';
import {
  areaSwitchItemMobileClassName,
  areaSwitchTrackClassName,
  chromeSurface,
} from '@/lib/nav-chrome';
import { cn } from '@/lib/utils';

export default function Navbar() {
  const path = usePathname();
  if (path.startsWith('/ai/')) return null;

  const area = getAreaForPath(path);
  const showAreaLinks = area.links.length > 1;

  return (
    <nav className={cn('z-50 shrink-0 border-t md:hidden', chromeSurface)}>
      {/* Areas — same switcher language as top bar */}
      <div className="flex justify-center px-2 py-2">
        <div className={areaSwitchTrackClassName()}>
          {OS_AREAS.map((a) => {
            const active = a.id === area.id;
            return (
              <Link
                key={a.id}
                href={a.href}
                className={areaSwitchItemMobileClassName(active)}
                title={a.label}
              >
                <a.icon className="size-4" strokeWidth={active ? 2.5 : 1.5} />
                <span className="text-[10px] font-mono font-medium leading-none tracking-wide">
                  {a.shortLabel}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Pages within area */}
      {showAreaLinks && (
        <div className="flex items-center justify-around border-t border-sidebar-border px-1 py-1.5">
          {area.links.map((l) => {
            const active = isLinkActive(path, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-md px-2 py-1 transition-colors',
                  active
                    ? 'text-sidebar-foreground'
                    : 'text-sidebar-foreground/50 hover:text-sidebar-foreground',
                )}
              >
                <l.icon className="size-3.5" strokeWidth={active ? 2.5 : 1.5} />
                <span className="text-[9px] font-mono font-medium leading-none tracking-wide">
                  {l.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
