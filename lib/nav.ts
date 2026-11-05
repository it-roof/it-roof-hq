import {
  CalendarDaysIcon,
  ListTodoIcon,
  UsersIcon,
  FolderIcon,
  SparklesIcon,
  ClapperboardIcon,
  CrosshairIcon,
  ContactIcon,
  MegaphoneIcon,
  Link2Icon,
  SearchIcon,
  LayoutDashboardIcon,
  InboxIcon,
  MailIcon,
  Settings2Icon,
  FileBarChartIcon,
  BriefcaseIcon,
  TargetIcon,
  LayoutPanelLeftIcon,
  RadioIcon,
  type LucideIcon,
} from 'lucide-react';

export type NavLink = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type OsAreaId =
  | 'crm-bestand'
  | 'crm-akquise'
  | 'workspace'
  | 'kanaele';

export type OsArea = {
  id: OsAreaId;
  /** Full name in sidebar / breadcrumbs */
  label: string;
  /** Compact label in the area switcher */
  shortLabel: string;
  icon: LucideIcon;
  /** Landing when switching into this area */
  href: string;
  /** Path prefixes that belong to this area */
  match: string[];
  links: NavLink[];
};

/**
 * Lightweight enterprise areas:
 * - Workspace  → day-to-day work (tasks, studio, AI)
 * - CRM        → existing customers / delivery data
 * - CRM Leads  → leads / outreach (strictly separate)
 * - Inbox      → mail / channels
 */
export const OS_AREAS: OsArea[] = [
  {
    id: 'crm-bestand',
    label: 'CRM',
    shortLabel: 'CRM',
    icon: BriefcaseIcon,
    href: '/kunden',
    match: ['/kunden', '/projekte', '/monatsberichte'],
    links: [
      { href: '/kunden', label: 'Kunden', icon: UsersIcon },
      { href: '/projekte', label: 'Projekte', icon: FolderIcon },
      { href: '/monatsberichte', label: 'Monatsberichte', icon: FileBarChartIcon },
    ],
  },
  {
    id: 'crm-akquise',
    label: 'CRM Leads',
    shortLabel: 'CRM Leads',
    icon: TargetIcon,
    href: '/leads/dashboard',
    match: ['/leads'],
    links: [
      { href: '/leads/dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
      { href: '/leads/abarbeiten', label: 'Abarbeiten', icon: InboxIcon },
      { href: '/leads', label: 'Leads', icon: CrosshairIcon },
      { href: '/leads/kontakte', label: 'Kontakte', icon: ContactIcon },
      { href: '/leads/kampagnen', label: 'Kampagnen', icon: MegaphoneIcon },
      { href: '/leads/zuordnungen', label: 'Zuordnungen', icon: Link2Icon },
      { href: '/leads/suchen', label: 'Suchen', icon: SearchIcon },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    shortLabel: 'Workspace',
    icon: LayoutPanelLeftIcon,
    href: '/',
    match: ['/', '/aufgaben', '/studio', '/ai'],
    links: [
      { href: '/', label: 'Heute', icon: CalendarDaysIcon },
      { href: '/aufgaben', label: 'Aufgaben', icon: ListTodoIcon },
      { href: '/studio', label: 'Studio', icon: ClapperboardIcon },
      { href: '/ai', label: 'AI', icon: SparklesIcon },
    ],
  },
  {
    id: 'kanaele',
    label: 'Inbox',
    shortLabel: 'Inbox',
    icon: RadioIcon,
    href: '/mail',
    match: ['/mail', '/einstellungen'],
    links: [
      { href: '/mail', label: 'E-Mail', icon: MailIcon },
      { href: '/mail/konten', label: 'Konten', icon: Settings2Icon },
    ],
  },
];

/** @deprecated use getAreaForPath / OS_AREAS — kept for any leftover imports */
export const NAV_LINKS: NavLink[] = OS_AREAS.flatMap((a) => a.links);

export function getAreaForPath(path: string): OsArea {
  const scored = OS_AREAS.map((area) => {
    const hit = area.match.find((m) =>
      m === '/' ? path === '/' : path === m || path.startsWith(`${m}/`),
    );
    return { area, score: hit ? hit.length : -1 };
  }).sort((a, b) => b.score - a.score);

  if (scored[0]!.score >= 0) return scored[0]!.area;
  return OS_AREAS.find((a) => a.id === 'workspace') ?? OS_AREAS[0]!;
}

export function isLinkActive(path: string, href: string) {
  if (href === '/') return path === '/';
  if (path === href) return true;
  // Detail-Routen unter einem Sidebar-Punkt (z. B. /ai/[id])
  if (href === '/ai' && path.startsWith('/ai/')) return true;
  // E-Mail-Kanal: Postfach inkl. tieferer Routes, aber nicht /mail/konten
  if (href === '/mail') {
    return path === '/mail' || (path.startsWith('/mail/') && !path.startsWith('/mail/konten'));
  }
  return false;
}

export type BreadcrumbCrumb = {
  label: string;
  href?: string;
};

function titleFromSegment(seg: string) {
  const decoded = decodeURIComponent(seg);
  if (decoded.length <= 2) return decoded.toUpperCase();
  return decoded.charAt(0).toUpperCase() + decoded.slice(1);
}

/** Best matching nav link for a path (longest href wins). */
function getLinkForPath(path: string, area: OsArea = getAreaForPath(path)) {
  return [...area.links]
    .sort((a, b) => b.href.length - a.href.length)
    .find((l) => {
      if (l.href === '/') return path === '/';
      return path === l.href || path.startsWith(`${l.href}/`);
    }) ?? null;
}

/** Breadcrumbs for the top navbar: Area › Page › … */
export function getBreadcrumbsForPath(path: string): BreadcrumbCrumb[] {
  const area = getAreaForPath(path);
  const link = getLinkForPath(path, area);

  if (!link) {
    const segs = path.split('/').filter(Boolean);
    if (segs.length === 0) return [{ label: area.label }];
    return [
      { href: area.href, label: area.label },
      ...segs.slice(0, -1).map((s, i) => ({
        href: `/${segs.slice(0, i + 1).join('/')}`,
        label: titleFromSegment(s),
      })),
      { label: titleFromSegment(segs[segs.length - 1]!) },
    ];
  }

  // Genau der Nav-Link
  if (path === link.href) {
    if (link.href === area.href && link.label === area.label) {
      return [{ label: area.label }];
    }
    return [
      { href: area.href, label: area.label },
      { label: link.label },
    ];
  }

  // Tiefer unter dem Link (z. B. /leads/dashboard unter /leads)
  const rest = path
    .slice(link.href === '/' ? 0 : link.href.length)
    .split('/')
    .filter(Boolean);

  const crumbs: BreadcrumbCrumb[] = [
    { href: area.href, label: area.label },
  ];

  if (!(link.href === area.href && link.label === area.label)) {
    crumbs.push({ href: link.href, label: link.label });
  }

  for (let i = 0; i < rest.length; i++) {
    const isLast = i === rest.length - 1;
    const href = `${link.href === '/' ? '' : link.href}/${rest.slice(0, i + 1).join('/')}`;
    crumbs.push(
      isLast
        ? { label: titleFromSegment(rest[i]!) }
        : { href, label: titleFromSegment(rest[i]!) },
    );
  }

  const last = crumbs[crumbs.length - 1];
  if (last?.href) {
    crumbs[crumbs.length - 1] = { label: last.label };
  }

  return crumbs;
}
