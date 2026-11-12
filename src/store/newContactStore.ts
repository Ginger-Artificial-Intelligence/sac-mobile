import { create } from 'zustand';

/** Opens the shared "New chat / Add contact" sheet from any screen */
interface NewContactSheetState {
  mode: 'chat' | 'contact' | null;
  /** bumps after a contact is created so lists can reload */
  version: number;
  open: (mode: 'chat' | 'contact') => void;
  close: () => void;
  created: () => void;
}

export const useNewContactSheet = create<NewContactSheetState>((set) => ({
  mode: null,
  version: 0,
  open: (mode) => set({ mode }),
  close: () => set({ mode: null }),
  created: () => set((s) => ({ version: s.version + 1 })),
}));
