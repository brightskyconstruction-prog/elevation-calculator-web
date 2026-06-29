/**
 * userProfile.ts
 *
 * Manages the /userProfiles/{userId} Firestore collection.
 *
 * Each document is keyed with the same base64(email) ID used by /users,
 * so a single key lookup ties app data + account metadata together.
 *
 * CURRENT BEHAVIOUR
 *   - On first login  → create profile with free plan + full access
 *   - On repeat login → update lastLoginAt only (preserves all other fields)
 *   - Features        → FULL_ACCESS_FEATURES for every user
 *
 * FUTURE
 *   - Read plan from Stripe webhook → write to this document
 *   - Admin panel updates plan/status → app reads it here on next login
 *   - Feature gates read profile.features before allowing an action
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  DocumentReference,
} from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from '../firebase';
import {
  UserProfile,
  FULL_ACCESS_FEATURES,
} from '../types/subscription';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Same encoding used by cloudSync.ts so keys are consistent. */
function emailToDocId(email: string): string {
  return btoa(email.toLowerCase().trim()).replace(/=/g, '');
}

function profileDocRef(email: string): DocumentReference {
  return doc(getDb(), 'userProfiles', emailToDocId(email));
}

// ─── Default profile factory ──────────────────────────────────────────────────

/**
 * Builds a brand-new UserProfile for a first-time user.
 * Plan = 'free', but features = FULL_ACCESS until paid plans are introduced.
 * Flip features to FREE_PLAN_FEATURES when gating begins.
 */
function buildDefaultProfile(email: string): UserProfile {
  const now = Date.now();
  return {
    userId:             emailToDocId(email),
    email,
    createdAt:          now,
    updatedAt:          now,
    lastLoginAt:        now,

    accountStatus:      'active',

    plan:               'free',
    subscriptionStatus: 'inactive',
    billingCycle:       null,
    subscriptionId:     null,
    customerId:         null,

    planStartDate:      null,
    planExpiresAt:      null,
    trialStartDate:     null,
    trialEndsAt:        null,

    isPremium:          false,
    isTrialing:         false,
    hasLifetimeAccess:  false,

    promoCode:          null,
    promoExpiresAt:     null,

    // FULL_ACCESS until subscription tiers are introduced.
    // When ready: swap to computeFeaturesForPlan(profile.plan, profile)
    features:           FULL_ACCESS_FEATURES,

    isAdmin:            false,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called once per login session.
 * - Creates the profile document if it does not exist (first-time user).
 * - Updates only `lastLoginAt` + `updatedAt` if it already exists.
 * Returns the current (possibly newly created) profile.
 */
export async function ensureUserProfile(email: string): Promise<UserProfile | null> {
  if (!isFirebaseConfigured()) return null;

  try {
    const ref  = profileDocRef(email);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      // First login — create the profile
      const profile = buildDefaultProfile(email);
      await setDoc(ref, profile);
      return profile;
    }

    // Repeat login — refresh timestamps only
    const now = Date.now();
    await updateDoc(ref, { lastLoginAt: now, updatedAt: now });

    return snap.data() as UserProfile;
  } catch (err) {
    // Non-fatal: app works without the profile document
    console.warn('[UserProfile] ensureUserProfile failed:', err);
    return null;
  }
}

/**
 * Read the profile without modifying it.
 * Useful for admin panels or settings screens in the future.
 */
export async function getUserProfile(email: string): Promise<UserProfile | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const snap = await getDoc(profileDocRef(email));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  } catch (err) {
    console.warn('[UserProfile] getUserProfile failed:', err);
    return null;
  }
}

/**
 * Partial update — for future admin panel or Stripe webhook handler.
 * Only the supplied fields are written; everything else is preserved.
 *
 * Example (future Stripe webhook):
 *   await updateUserProfile(email, {
 *     plan: 'premium',
 *     subscriptionStatus: 'active',
 *     planExpiresAt: stripeCurrentPeriodEnd * 1000,
 *     features: computeFeaturesForPlan('premium'),
 *   });
 */
export async function updateUserProfile(
  email: string,
  changes: Partial<UserProfile>,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await updateDoc(profileDocRef(email), {
      ...changes,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('[UserProfile] updateUserProfile failed:', err);
  }
}

/**
 * Compute the feature entitlements for a given plan.
 * Centralises the plan→features mapping so future tiers only need
 * to be added here.
 *
 * NOT YET CALLED — wired in when gating begins.
 */
export function computeFeaturesForPlan(
  plan: UserProfile['plan'],
  profile?: Partial<UserProfile>,
): UserProfile['features'] {
  // Admin manual override always gets full access
  if (profile?.manualOverride) return FULL_ACCESS_FEATURES;

  switch (plan) {
    case 'enterprise':
    case 'pro':
      return FULL_ACCESS_FEATURES;

    case 'premium':
      return {
        ...FULL_ACCESS_FEATURES,
        teamCollaboration: false,
        apiAccess:         false,
      };

    case 'free':
    default:
      // During the free-for-all phase, return full access.
      // When ready to gate: return FREE_PLAN_FEATURES;
      return FULL_ACCESS_FEATURES;
  }
}
