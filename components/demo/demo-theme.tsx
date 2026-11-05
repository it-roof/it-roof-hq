'use client';

import * as React from 'react';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { Button } from '@/components/demo/ui/button';
import { cn } from '@/lib/utils';

export type DemoTheme = 'light' | 'dark';

const STORAGE_KEY = 'demo-dashboard-theme';

const DEMO_DARK_VARS: Record<string, string> = {
  '--radius': '0.625rem',
  '--background': 'oklch(0.145 0 0)',
  '--foreground': 'oklch(0.985 0 0)',
  '--card': 'oklch(0.205 0 0)',
  '--card-foreground': 'oklch(0.985 0 0)',
  '--popover': 'oklch(0.205 0 0)',
  '--popover-foreground': 'oklch(0.985 0 0)',
  '--primary': 'oklch(0.922 0 0)',
  '--primary-foreground': 'oklch(0.205 0 0)',
  '--secondary': 'oklch(0.269 0 0)',
  '--secondary-foreground': 'oklch(0.985 0 0)',
  '--muted': 'oklch(0.269 0 0)',
  '--muted-foreground': 'oklch(0.708 0 0)',
  '--accent': 'oklch(0.371 0 0)',
  '--accent-foreground': 'oklch(0.985 0 0)',
  '--destructive': 'oklch(0.704 0.191 22.216)',
  '--border': 'oklch(1 0 0 / 10%)',
  '--input': 'oklch(1 0 0 / 15%)',
  '--ring': 'oklch(0.556 0 0)',
  '--chart-1': 'var(--color-blue-300)',
  '--chart-2': 'var(--color-blue-500)',
  '--chart-3': 'var(--color-blue-600)',
  '--chart-4': 'var(--color-blue-700)',
  '--chart-5': 'var(--color-blue-800)',
  '--sidebar': 'oklch(0.205 0 0)',
  '--sidebar-foreground': 'oklch(0.985 0 0)',
  '--sidebar-primary': 'oklch(0.488 0.243 264.376)',
  '--sidebar-primary-foreground': 'oklch(0.985 0 0)',
  '--sidebar-accent': 'oklch(0.269 0 0)',
  '--sidebar-accent-foreground': 'oklch(0.985 0 0)',
  '--sidebar-border': 'oklch(1 0 0 / 10%)',
  '--sidebar-ring': 'oklch(0.439 0 0)',
};

const DEMO_LIGHT_VARS: Record<string, string> = {
  '--radius': '0.625rem',
  '--background': 'oklch(1 0 0)',
  '--foreground': 'oklch(0.145 0 0)',
  '--card': 'oklch(1 0 0)',
  '--card-foreground': 'oklch(0.145 0 0)',
  '--popover': 'oklch(1 0 0)',
  '--popover-foreground': 'oklch(0.145 0 0)',
  '--primary': 'oklch(0.205 0 0)',
  '--primary-foreground': 'oklch(0.985 0 0)',
  '--secondary': 'oklch(0.97 0 0)',
  '--secondary-foreground': 'oklch(0.205 0 0)',
  '--muted': 'oklch(0.97 0 0)',
  '--muted-foreground': 'oklch(0.556 0 0)',
  '--accent': 'oklch(0.97 0 0)',
  '--accent-foreground': 'oklch(0.205 0 0)',
  '--destructive': 'oklch(0.577 0.245 27.325)',
  '--border': 'oklch(0.922 0 0)',
  '--input': 'oklch(0.922 0 0)',
  '--ring': 'oklch(0.708 0 0)',
  '--chart-1': 'var(--color-blue-300)',
  '--chart-2': 'var(--color-blue-500)',
  '--chart-3': 'var(--color-blue-600)',
  '--chart-4': 'var(--color-blue-700)',
  '--chart-5': 'var(--color-blue-800)',
  '--sidebar': 'oklch(0.985 0 0)',
  '--sidebar-foreground': 'oklch(0.145 0 0)',
  '--sidebar-primary': 'oklch(0.205 0 0)',
  '--sidebar-primary-foreground': 'oklch(0.985 0 0)',
  '--sidebar-accent': 'oklch(0.97 0 0)',
  '--sidebar-accent-foreground': 'oklch(0.205 0 0)',
  '--sidebar-border': 'oklch(0.922 0 0)',
  '--sidebar-ring': 'oklch(0.708 0 0)',
};

type DemoThemeContextValue = {
  theme: DemoTheme;
  setTheme: (theme: DemoTheme) => void;
  toggleTheme: () => void;
};

const DemoThemeContext = React.createContext<DemoThemeContextValue | null>(null);

function readStoredTheme(): DemoTheme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* ignore */
  }
  return 'dark';
}

function applyTheme(theme: DemoTheme, prevVars: Map<string, string>) {
  const root = document.documentElement;
  const body = document.body;
  const vars = theme === 'dark' ? DEMO_DARK_VARS : DEMO_LIGHT_VARS;

  for (const [key, value] of Object.entries(vars)) {
    if (!prevVars.has(key)) {
      prevVars.set(key, root.style.getPropertyValue(key));
    }
    root.style.setProperty(key, value);
  }

  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
  body.style.backgroundColor = vars['--background']!;
  body.style.color = vars['--foreground']!;

  const shell = document.querySelector('.demo-dashboard');
  if (shell) {
    shell.classList.remove('light', 'dark');
    shell.classList.add(theme);
  }
}

/**
 * Match ui.shadcn.com document scroll:
 * - page/document scrolls (not an inner flex pane)
 * - fixed sidebar stays put
 * - body is block + overscroll-none (not app shell flex column)
 */
function applyDemoDocumentScroll() {
  const root = document.documentElement;
  const body = document.body;

  // Match ui.shadcn.com: html { overscroll-y-none } + body { overscroll-none }
  root.classList.remove('h-full');
  root.classList.add('overscroll-y-none');
  root.style.height = 'auto';
  root.style.minHeight = '100%';
  root.style.overflow = 'visible';
  root.style.overscrollBehaviorY = 'none';

  body.classList.remove('flex', 'flex-col', 'min-h-full');
  body.classList.add('overscroll-none');
  body.style.display = 'block';
  body.style.minHeight = '100%';
  body.style.height = 'auto';
  body.style.overflow = 'visible';
  body.style.overscrollBehavior = 'none';
}

export function DemoThemeProvider({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [theme, setThemeState] = React.useState<DemoTheme>('dark');
  const [ready, setReady] = React.useState(false);
  const restoreRef = React.useRef<{
    htmlClass: string;
    bodyClass: string;
    bodyBg: string;
    bodyColor: string;
    bodyDisplay: string;
    bodyMinHeight: string;
    bodyHeight: string;
    bodyOverflow: string;
    bodyOverscroll: string;
    htmlHeight: string;
    htmlMinHeight: string;
    htmlOverflow: string;
    htmlOverscrollY: string;
    scheme: string;
    vars: Map<string, string>;
  } | null>(null);

  React.useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    restoreRef.current = {
      htmlClass: root.className,
      bodyClass: body.className,
      bodyBg: body.style.backgroundColor,
      bodyColor: body.style.color,
      bodyDisplay: body.style.display,
      bodyMinHeight: body.style.minHeight,
      bodyHeight: body.style.height,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      htmlHeight: root.style.height,
      htmlMinHeight: root.style.minHeight,
      htmlOverflow: root.style.overflow,
      htmlOverscrollY: root.style.overscrollBehaviorY,
      scheme: root.style.colorScheme,
      vars: new Map(),
    };

    const initial = readStoredTheme();
    setThemeState(initial);
    applyTheme(initial, restoreRef.current.vars);
    applyDemoDocumentScroll();
    setReady(true);

    return () => {
      const snap = restoreRef.current;
      if (!snap) return;
      root.className = snap.htmlClass;
      root.style.colorScheme = snap.scheme;
      root.style.height = snap.htmlHeight;
      root.style.minHeight = snap.htmlMinHeight;
      root.style.overflow = snap.htmlOverflow;
      root.style.overscrollBehaviorY = snap.htmlOverscrollY;
      body.className = snap.bodyClass;
      body.style.backgroundColor = snap.bodyBg;
      body.style.color = snap.bodyColor;
      body.style.display = snap.bodyDisplay;
      body.style.minHeight = snap.bodyMinHeight;
      body.style.height = snap.bodyHeight;
      body.style.overflow = snap.bodyOverflow;
      body.style.overscrollBehavior = snap.bodyOverscroll;
      for (const [key, value] of snap.vars) {
        if (value) root.style.setProperty(key, value);
        else root.style.removeProperty(key);
      }
    };
  }, []);

  const setTheme = React.useCallback((next: DemoTheme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    if (restoreRef.current) {
      applyTheme(next, restoreRef.current.vars);
      applyDemoDocumentScroll();
    }
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  const value = React.useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <DemoThemeContext.Provider value={value}>
      <div
        className={cn(
          'demo-dashboard min-h-svh w-full bg-background text-foreground antialiased',
          // Keep document as the scroll container (same as ui.shadcn.com view).
          'overflow-visible',
          ready ? theme : 'dark',
          className,
        )}
      >
        {children}
      </div>
    </DemoThemeContext.Provider>
  );
}

export function useDemoTheme() {
  const ctx = React.useContext(DemoThemeContext);
  if (!ctx) {
    throw new Error('useDemoTheme must be used within DemoThemeProvider');
  }
  return ctx;
}

export function DemoThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useDemoTheme();
  const isDark = theme === 'dark';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('size-8', className)}
      onClick={toggleTheme}
      aria-label={isDark ? 'Hellmodus' : 'Dunkelmodus'}
      title={isDark ? 'Hellmodus' : 'Dunkelmodus'}
    >
      {isDark ? <IconSun className="size-4" /> : <IconMoon className="size-4" />}
    </Button>
  );
}
