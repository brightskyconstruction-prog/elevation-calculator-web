/**
 * profileStore.ts
 *
 * Holds the authenticated user's profile for the current session.
 * Populated after login, cleared on logout.
 *
 * Not persisted to localStorage — always reloaded fresh from Firestore
 * on the next login so subscription status is always up-to-date.
 */

import { create } from 'zustand';
import { UserProfile } from '../types/subscription';

interface ProfileState {
  profile:      UserProfile | null;
  isLoaded:     boolean;

  setProfile:   (p: UserProfile | null) => void;
  clearProfile: () => void;
}

export const useProfileStore = create<ProfileState>()((set) => ({
  profile:  null,
  isLoaded: false,

  setProfile(p) {
    set({ profile: p, isLoaded: true });
  },

  clearProfile() {
    set({ profile: null, isLoaded: false });
  },
}));
