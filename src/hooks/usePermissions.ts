/**
 * usePermissions.ts
 *
 * Centralised feature-access hook.
 *
 * CURRENT BEHAVIOUR
 *   Returns full access for every user regardless of plan.
 *   `can(feature)` always returns true.
 *   No features are restricted, no UI changes visible to users.
 *
 * HOW TO GATE A FEATURE IN THE FUTURE
 *   1. Add the feature key to FeatureEntitlements in types/subscription.ts
 *   2. Set it to false in FREE_PLAN_FEATURES
 *   3. In the component: const { can } = usePermissions();
 *                        if (!can('dataExport')) return <UpgradePrompt />;
 *
 * The hook reads from profileStore, which is populated at login.
 * No backend call is made here — it's a pure in-memory read.
 */

import { useProfileStore } from '../stores/profileStore';
import {
  FeatureEntitlements,
  FULL_ACCESS_FEATURES,
} from '../types/subscription';

// All possible feature keys
export type FeatureKey = keyof Omit<
  FeatureEntitlements,
  'maxPoints' | 'maxSets' | 'maxProjects'
>;

export interface PermissionsResult {
  /** Check if the current user can use a given feature. Always true now. */
  can:        (feature: FeatureKey) => boolean;

  /** Full entitlements object — for rendering plan badges, etc. */
  features:   FeatureEntitlements;

  /** Current plan name — 'free' for everyone now. */
  plan:       string;

  /** True only when user is on a paid plan (always false now). */
  isPremium:  boolean;

  /** True while the profile is still loading from Firestore. */
  isLoading:  boolean;

  /** Numeric limit helpers — null means unlimited. */
  maxPoints:    number | null;
  maxSets:      number | null;
  maxProjects:  number | null;
}

export function usePermissions(): PermissionsResult {
  const { profile, isLoaded } = useProfileStore();

  // While loading (or no Firebase), grant full access so the UI never blocks.
  const features = profile?.features ?? FULL_ACCESS_FEATURES;
  const plan     = profile?.plan     ?? 'free';

  return {
    can(_feature: FeatureKey): boolean {
      // Currently always true. In the future:
      // return features[_feature] === true;
      return true;
    },

    features,
    plan,
    isPremium:   profile?.isPremium  ?? false,
    isLoading:   !isLoaded,
    maxPoints:   features.maxPoints,
    maxSets:     features.maxSets,
    maxProjects: features.maxProjects,
  };
}
