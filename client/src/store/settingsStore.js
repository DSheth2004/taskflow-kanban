import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Per-browser preferences: the display name written into the activity log, and a
// chaos switch that makes every write fail so the rollback can be demoed.
export const useSettingsStore = create(
  persist(
    (set) => ({
      actor: '',
      chaos: false,
      setActor: (actor) => set({ actor: actor.slice(0, 40) }),
      toggleChaos: () => set((s) => ({ chaos: !s.chaos })),
    }),
    { name: 'taskflow.settings' }
  )
);
