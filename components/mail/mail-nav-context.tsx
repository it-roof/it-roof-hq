'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type MailNavFolder = {
  id: string;
  name: string;
  role: string;
  unread: number;
  kind: 'role' | 'folder';
};

export type MailNavMailbox = {
  id: string;
  label: string;
  email: string;
  unread: number;
  folders: MailNavFolder[];
};

type MailNavPayload = {
  mailboxes: MailNavMailbox[];
  activeMailboxId: string | null;
  activeFolderId: string | null;
  onSelectMailbox: (mailboxId: string) => void;
  onSelectFolder: (mailboxId: string, folder: MailNavFolder) => void;
};

type MailNavValue = MailNavPayload & {
  setMailNav: (next: MailNavPayload | null) => void;
};

const empty: Omit<MailNavValue, 'setMailNav'> = {
  mailboxes: [],
  activeMailboxId: null,
  activeFolderId: null,
  onSelectMailbox: () => {},
  onSelectFolder: () => {},
};

const MailNavContext = createContext<MailNavValue | null>(null);

export function MailNavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<MailNavValue, 'setMailNav'>>(empty);

  const setMailNav = useCallback((next: MailNavPayload | null) => {
    if (!next) {
      setState(empty);
      return;
    }
    setState({
      mailboxes: next.mailboxes,
      activeMailboxId: next.activeMailboxId,
      activeFolderId: next.activeFolderId,
      onSelectMailbox: next.onSelectMailbox,
      onSelectFolder: next.onSelectFolder,
    });
  }, []);

  const value = useMemo(
    () => ({ ...state, setMailNav }),
    [state, setMailNav],
  );

  return (
    <MailNavContext.Provider value={value}>{children}</MailNavContext.Provider>
  );
}

export function useMailNav() {
  return useContext(MailNavContext);
}
