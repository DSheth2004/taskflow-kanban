import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
