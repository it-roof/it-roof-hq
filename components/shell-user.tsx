'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type ShellUser = {
  name: string | null;
  email: string | null;
};

const ShellUserContext = createContext<ShellUser | null>(null);

export function ShellUserProvider({
  user,
  children,
}: {
  user: ShellUser | null;
  children: ReactNode;
}) {
  return (
    <ShellUserContext.Provider value={user}>{children}</ShellUserContext.Provider>
  );
}

export function useShellUser() {
  return useContext(ShellUserContext);
}

export function shellUserInitials(user: ShellUser | null) {
  if (!user) return '?';
  const name = user.name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? '';
    const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
    return `${a}${b}`.toUpperCase() || '?';
  }
  return (user.email?.[0] ?? '?').toUpperCase();
}

export function shellUserLabel(user: ShellUser | null) {
  return user?.name?.trim() || user?.email || 'Benutzer';
}
