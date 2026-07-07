import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import {
  getAuth,
  Auth,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  ActionCodeSettings,
  User,
} from 'firebase/auth';

// ─── Firebase configuration ───────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string | undefined,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string | undefined,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string | undefined,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string | undefined,
};

// Deployed app URL — used as the "continue URL" in sign-in emails.
// Override by setting VITE_APP_URL in your .env.local / Vercel env vars.
const APP_URL: string =
  (import.meta.env.VITE_APP_URL as string | undefined) ??
  'https://elevation-calculator-web.vercel.app/';

// localStorage key where we stash the email while the user checks their inbox.
const EMAIL_FOR_SIGNIN_KEY = 'auth:emailForSignIn';

// ─── Lazy init — only when all required env vars are present ─────────────────
let _app:  FirebaseApp | null = null;
let _db:   Firestore   | null = null;
let _auth: Auth        | null = null;

export function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

function ensureApp(): FirebaseApp {
  if (!_app) {
    if (!isFirebaseConfigured()) {
      throw new Error('Firebase env vars are not set. Cloud sync is disabled.');
    }
    _app = initializeApp(firebaseConfig as Required<typeof firebaseConfig>);
  }
  return _app;
}

export function getDb(): Firestore {
  if (!_db) {
    _db = getFirestore(ensureApp());
  }
  return _db;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(ensureApp());
  }
  return _auth;
}

// ─── Auth state ───────────────────────────────────────────────────────────────

/** Current Firebase user UID, or null if not signed in. */
export function getFirebaseUid(): string | null {
  if (!isFirebaseConfigured()) return null;
  try { return getFirebaseAuth().currentUser?.uid ?? null; } catch { return null; }
}

/**
 * Subscribe to Firebase auth state changes.
 * Returns the unsubscribe function.
 * No-op if Firebase is not configured.
 */
export function onAuthChanged(
  callback: (user: User | null) => void,
): () => void {
  if (!isFirebaseConfigured()) return () => {};
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

/**
 * Sign out the current Firebase user.
 * No-op if Firebase is not configured or user is not signed in.
 */
export async function signOutFirebase(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try { await firebaseSignOut(getFirebaseAuth()); } catch {}
}

// ─── Email Link (passwordless) authentication ─────────────────────────────────
//
// Flow:
//   1. User enters email → sendSignInLink(email)
//      • Stores email in localStorage so we can retrieve it on return.
//      • Firebase sends an email with a magic link pointing back to APP_URL.
//   2. User taps the link in their email → browser opens APP_URL with auth params.
//   3. App calls isEmailSignInLink(window.location.href) → true.
//   4. App retrieves stored email → calls completeEmailSignIn(email, href).
//      • Returns signed-in Firebase User with a stable UID.
//      • We store that UID in localStorage and use it as the Firestore doc path.
//   5. Firebase Auth state is persisted across sessions (IndexedDB by default).
//      • On subsequent visits onAuthChanged fires immediately with the user —
//        no need to click the link again.
//
// Prerequisites in Firebase Console:
//   • Authentication → Sign-in method → Email link (passwordless) must be ENABLED.
//   • Authentication → Settings → Authorized domains must include your domain.

const ACTION_CODE_SETTINGS: ActionCodeSettings = {
  url:             APP_URL,
  handleCodeInApp: true,
};

/**
 * Send a sign-in link to the given email address.
 * Also stashes the email in localStorage so we can retrieve it when the user
 * returns from the link (prevents open-redirect attacks).
 */
export async function sendSignInLink(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  await sendSignInLinkToEmail(auth, email, ACTION_CODE_SETTINGS);
  try { localStorage.setItem(EMAIL_FOR_SIGNIN_KEY, email); } catch {}
}

/**
 * Returns true if the given URL is a Firebase Email Link sign-in URL.
 * Call on app start-up with window.location.href.
 */
export function isEmailSignInLink(url: string = window.location.href): boolean {
  if (!isFirebaseConfigured()) return false;
  try { return isSignInWithEmailLink(getFirebaseAuth(), url); } catch { return false; }
}

/**
 * Complete the email link sign-in.
 * @param email  The email the link was sent to.
 * @param link   The full current page URL (window.location.href).
 * @returns      The signed-in Firebase User (has a stable .uid).
 */
export async function completeEmailSignIn(email: string, link: string): Promise<User> {
  const auth   = getFirebaseAuth();
  const result = await signInWithEmailLink(auth, email, link);
  // Clean up the stashed email — it's no longer needed.
  try { localStorage.removeItem(EMAIL_FOR_SIGNIN_KEY); } catch {}
  return result.user;
}

/**
 * Retrieve the email that was stashed when sendSignInLink was called.
 * Returns null when the link was opened on a different device (nothing stashed).
 */
export function getStoredSignInEmail(): string | null {
  try { return localStorage.getItem(EMAIL_FOR_SIGNIN_KEY); } catch { return null; }
}

// ─── Auth ready promise ───────────────────────────────────────────────────────
// Resolves once Firebase Auth has determined the initial auth state.
export function waitForAuth(): Promise<void> {
  if (!isFirebaseConfigured()) return Promise.resolve();
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), () => {
      unsub();
      resolve();
    });
  });
}
