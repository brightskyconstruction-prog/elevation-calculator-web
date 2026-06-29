/**
 * cloudSync.ts
 *
 * Handles reading and writing all user data to Firebase Firestore.
 * Each user is identified by their email address (encoded as a Firestore doc ID).
 *
 * Data is stored as a flat map of localStorage key → JSON string, so the
 * cloud record is an exact mirror of the user's localStorage state.
 * This means zero changes are needed in any screen component.
 *
 * Firestore path:  /users/{emailKey}
 * Document shape:  { [lsKey: string]: string;  _updatedAt: number }
 */

import { doc, getDoc, setDoc, DocumentReference } from 'firebase/firestore';
import { getDb, isFirebaseConfigured } from '../firebase';

// ─── All localStorage keys used by the app ───────────────────────────────────
//
// Static keys — always present:
export const STATIC_LS_KEYS = [
  'elevation-calculator-v1',   // Zustand survey store (projects, points, sets, history)
  'elevCalc:history',          // Calculator sub-tab history
  'elevCalc:convHistory',      // Converter sub-tab history
] as const;

// Dynamic key prefix — one entry per projectId:
const SLOPE_KEY_PREFIX = 'slope:calcs:';

// ─── Helper — stable Firestore doc ID from email ─────────────────────────────
// Firestore doc IDs can't contain '/' or null bytes. Email addresses can't
// contain '/' either, so the only transformations needed are minor encoding.
function emailToDocId(email: string): string {
  // Replace '.' with '․' (ONE DOT LEADER) so Firestore sub-path parsing
  // stays happy, then base64-encode the whole thing to keep it URL-safe.
  return btoa(email.toLowerCase().trim()).replace(/=/g, '');
}

// ─── Collect all relevant localStorage entries ───────────────────────────────
export function collectLocalData(): Record<string, string> {
  const data: Record<string, string> = {};

  for (const key of STATIC_LS_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) data[key] = val;
  }

  // Collect every slope:calcs:* key
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
      // Use the real underlying setItem so we don't re-trigger our own sync.
      // _origSetItem is already bound to localStorage so no .call() needed.
      _origSetItem(key, value);
    } catch { /* quota errors: ignore */ }
  }
}

// ─── Clear all app data from localStorage (called on logout) ─────────────────
// This removes device-cached data so the next user on the same device
// doesn't see a previous user's records. Cloud data is NEVER deleted here.
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

function userDocRef(email: string): DocumentReference {
  return doc(getDb(), 'users', emailToDocId(email));
}

/**
 * Load a user's data from Firestore.
 * Returns null if the user has no cloud record yet.
 */
export async function loadUserData(
  email: string,
): Promise<Record<string, string> | null> {
  if (!isFirebaseConfigured()) return null;
  const snap = await getDoc(userDocRef(email));
  if (!snap.exists()) return null;
  return snap.data() as Record<string, string>;
}

/**
 * Persist the current localStorage snapshot to Firestore.
 * Uses setDoc (full overwrite) — the cloud record always reflects the
 * latest device state, not a merge of multiple devices.
 */
export async function saveUserData(
  email: string,
  data: Record<string, string>,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await setDoc(userDocRef(email), { ...data, _updatedAt: Date.now() });
}

// ─── localStorage.setItem proxy ───────────────────────────────────────────────
// We capture the original setItem once so applyLocalData can bypass the patch
// (prevents infinite sync loops when writing cloud data back to localStorage).

// eslint-disable-next-line prefer-const
export let _origSetItem: typeof localStorage.setItem =
  localStorage.setItem.bind(localStorage);

/**
 * Call this once (from App.tsx useEffect) to intercept every localStorage
 * write and schedule a cloud sync automatically — without touching any
 * individual screen component.
 *
 * @param onWrite  callback invoked after every setItem (use to schedule sync)
 * @returns        cleanup function that restores the original setItem
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
