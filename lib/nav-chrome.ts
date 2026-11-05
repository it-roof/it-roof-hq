import { cn } from '@/lib/utils';

/** Shared chrome surface for sidebar + top/bottom bars */
export const chromeSurface =
  'bg-sidebar text-sidebar-foreground border-sidebar-border';

/** Segmented area switcher (Workspace / CRM / CRM Leads / Inbox) */
export function areaSwitchTrackClassName() {
  return 'flex items-center gap-0.5 rounded-lg bg-sidebar-accent/60 p-[3px]';
}

export function areaSwitchItemClassName(active: boolean) {
  return cn(
    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors',
    active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm ring-1 ring-sidebar-border/80'
      : 'text-sidebar-foreground/55 hover:text-sidebar-foreground',
  );
}

export function areaSwitchItemMobileClassName(active: boolean) {
  return cn(
    'flex flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-1.5 transition-colors',
    active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
      : 'text-sidebar-foreground/55 hover:text-sidebar-foreground',
  );
}
