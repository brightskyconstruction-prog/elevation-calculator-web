/**
 * cloudSync.ts
 *
 * Handles reading and writing all user data to Firebase Firestore.
 * Each user is identified by their Firebase Auth UID (a stable, random string
 * assigned when the user first signs in via Email Link).
 *
 * Data is stored as a flat map of localStorage key → JSON string, so the
 * cloud record is an exact mirror of the user's localStorage state.
 * This means zero changes are needed in any screen component.
 *
 * Firestore path:  /users/{firebaseUid}
 * Document shape:  { [lsKey: string]: string;  _updatedAt: number }
 *
 * Migration (v1.1 → v1.2):
 *   Previous versions stored data at /users/{btoa(email)}.
 *   migrateUserData() copies that document to /users/{uid} on first login
 *   with the new auth system, so no data is lost.
 */

import { doc, getDoc, setDoc, DocumentReference } from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from '../firebase';

// ─── All localStorage keys used by the app ───────────────────────────────────
export const STATIC_LS_KEYS = [
  'elevation-calculator-v1',   // Zustand survey store (projects, points, sets, history)
  'elevCalc:history',          // Calculator sub-tab history
  'elevCalc:convHistory',      // Converter sub-tab history
] as const;

const SLOPE_KEY_PREFIX = 'slope:calcs:';

// ─── Firestore document reference ────────────────────────────────────────────
// Documents are keyed by the Firebase Auth UID, which is a stable, random
// string that cannot be guessed or enumerated. Firestore rules enforce
// `request.auth.uid == userId` so each user can only access their own doc.

function userDocRef(uid: string): DocumentReference {
  return doc(getDb(), 'users', uid);
}

// ─── Collect all relevant localStorage entries ───────────────────────────────
export function collectLocalData(): Record<string, string> {
  const data: Record<string, string> = {};

  for (const key of STATIC_LS_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) data[key] = val;
  }

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(SLOPE_KEY_PREFIX)) {
      const val = localStorage.getItem(k);
      if (val !== null) data[k] = val;
    }
  }

  return data;
}

// ─── Apply cloud data back into localStorage ─────────────────────────────────
export function applyLocalData(data: Record<string, string>): void {
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('_')) continue; // skip internal metadata fields
    try {
      _origSetItem(key, value);
    } catch { /* quota errors: ignore */ }
  }
}

// ─── Clear all app data from localStorage (called on logout) ─────────────────
export function clearLocalData(): void {
  for (const key of STATIC_LS_KEYS) {
    localStorage.removeItem(key);
  }

  const slopeKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(SLOPE_KEY_PREFIX)) slopeKeys.push(k);
  }
  slopeKeys.forEach(k => localStorage.removeItem(k));
}

// ─── Firestore operations ─────────────────────────────────────────────────────

/**
 * Load a user's data from Firestore by their Firebase UID.
 * Returns null if the user has no cloud record yet.
 */
export async function loadUserData(
  uid: string,
): Promise<Record<string, string> | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await getDoc(userDocRef(uid));
  if (!snap.exists()) return null;
  return snap.data() as Record<string, string>;
}

/**
 * Persist the current localStorage snapshot to Firestore under the given UID.
 */
export async function saveUserData(
  uid: string,
  data: Record<string, string>,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await setDoc(userDocRef(uid), { ...data, _updatedAt: Date.now() });
}

// ─── Data migration (v1.1 btoa-email path → v1.2 Firebase UID path) ──────────
/**
 * On the user's first login after upgrading to Email Link auth, their old data
 * lives at /users/{btoa(email)}. This function copies it to /users/{uid}.
 *
 * Safe to call on every login — does nothing if:
 *   • New path already has data (migration already done)
 *   • Old path doesn't exist (user is brand new)
 *
 * Returns true if data was migrated, false otherwise.
 */
export async function migrateUserData(
  oldEmail: string,
  uid: string,
): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;
  try {
    // Check whether new UID path already has data
    const newSnap = await getDoc(userDocRef(uid));
    if (newSnap.exists()) return false; // already migrated

    // Compute old btoa(email) doc ID (same algorithm as the v1.1 system)
    const oldDocId = btoa(oldEmail.toLowerCase().trim()).replace(/=/g, '');
    const oldRef   = doc(getDb(), 'users', oldDocId);
    const oldSnap  = await getDoc(oldRef);
    if (!oldSnap.exists()) return false; // no old data — brand-new user

    // Copy old data to new UID path
    const data = oldSnap.data() as Record<string, string>;
    await setDoc(userDocRef(uid), {
      ...data,
      _migratedAt: Date.now(),
      _updatedAt:  Date.now(),
    });

    console.info('[CloudSync] Migrated user data from btoa-email path to UID path.');
    return true;
  } catch (err) {
    console.warn('[CloudSync] Data migration failed (non-fatal):', err);
    return false;
  }
}

// ─── localStorage.setItem proxy ───────────────────────────────────────────────
// We capture the original setItem once so applyLocalData can bypass the patch
// (prevents infinite sync loops when writing cloud data back to localStorage).

// eslint-disable-next-line prefer-const
export let _origSetItem: typeof localStorage.setItem =
  localStorage.setItem.bind(localStorage);

/**
 * Intercept every localStorage write and schedule a debounced cloud sync.
 * Call once on mount from App.tsx.
 */
export function patchLocalStorage(onWrite: (key: string) => void): () => void {
  _origSetItem = localStorage.setItem.bind(localStorage);

  localStorage.setItem = (key: string, value: string) => {
    _origSetItem(key, value);
    onWrite(key);
  };

  return () => {
    localStorage.setItem = _origSetItem;
  };
}
