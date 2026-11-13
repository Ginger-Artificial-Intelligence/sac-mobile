import { create } from 'zustand';

/**
 * One-shot requests between the tab screens and the shell (app/index.tsx), which owns the pager and
 * the header. Each request bumps a counter so the same request can be repeated.
 */
interface ShellNavState {
  /** Ask the shell to show the inbox with this quick filter selected ("All", "Unread", ...) */
  inboxFilter: string | null;
  inboxNonce: number;
  openInbox: (filter: string) => void;
  /** Ask the Contacts screen to start a CSV import (the button lives in the shell header) */
  importNonce: number;
  requestImport: () => void;
}

export const useShellNav = create<ShellNavState>((set) => ({
  inboxFilter: null,
  inboxNonce: 0,
  openInbox: (filter) => set((s) => ({ inboxFilter: filter, inboxNonce: s.inboxNonce + 1 })),
  importNonce: 0,
  requestImport: () => set((s) => ({ importNonce: s.importNonce + 1 })),
}));
