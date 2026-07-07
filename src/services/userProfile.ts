/**
 * userProfile.ts
 *
 * Manages the /userProfiles/{uid} Firestore collection.
 *
 * Documents are now keyed by the Firebase Auth UID (stable, random string)
 * rather than base64(email), matching the /users/{uid} collection.
 * Firestore rules enforce request.auth.uid == userId for both collections.
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

function profileDocRef(uid: string): DocumentReference {
  return doc(getDb(), 'userProfiles', uid);
}

// ─── Default profile factory ──────────────────────────────────────────────────
function buildDefaultProfile(email: string, uid: string): UserProfile {
  const now = Date.now();
  return {
    userId:             uid,
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
    features:           FULL_ACCESS_FEATURES,

    isAdmin:            false,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called once per login session.
 * - Creates the profile document if it does not exist (first-time user).
 * - Updates only `lastLoginAt` + `updatedAt` if it already exists.
 * @param email  The user's email address (stored in the profile for display).
 * @param uid    The Firebase Auth UID (used as the Firestore document ID).
 */
export async function ensureUserProfile(
  email: string,
  uid: string,
): Promise<UserProfile | null> {
  if (!isFirebaseConfigured()) return null;

  try {
    const ref  = profileDocRef(uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      const profile = buildDefaultProfile(email, uid);
      await setDoc(ref, profile);
      return profile;
    }

    const now = Date.now();
    await updateDoc(ref, { lastLoginAt: now, updatedAt: now });
    return snap.data() as UserProfile;
  } catch (err) {
    console.warn('[UserProfile] ensureUserProfile failed:', err);
    return null;
  }
}

/**
 * Read the profile without modifying it.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const snap = await getDoc(profileDocRef(uid));
    return snap.exists() ? (snap.data() as UserProfile) : null;
  } catch (err) {
    console.warn('[UserProfile] getUserProfile failed:', err);
    return null;
  }
}

/**
 * Partial update — for future admin panel or Stripe webhook handler.
 */
export async function updateUserProfile(
  uid: string,
  changes: Partial<UserProfile>,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await updateDoc(profileDocRef(uid), {
      ...changes,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('[UserProfile] updateUserProfile failed:', err);
  }
}

/**
 * Compute the feature entitlements for a given plan.
 */
export function computeFeaturesForPlan(
  plan: UserProfile['plan'],
  profile?: Partial<UserProfile>,
): UserProfile['features'] {
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
      return FULL_ACCESS_FEATURES;
  }
}
