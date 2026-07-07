import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// ─── Firebase configuration ───────────────────────────────────────────────────
// Values come from environment variables — copy .env.example → .env.local
// and fill in your Firebase project credentials.

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string | undefined,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string | undefined,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string | undefined,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string | undefined,
};

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

// ─── Anonymous authentication ─────────────────────────────────────────────────
// Signs the current session in anonymously so Firestore rules can verify
// `request.auth != null`. Called once on app startup when Firebase is
// configured. Idempotent — does nothing if the user is already signed in.
// Errors are caught and logged; the app continues in offline/local mode.
export async function ensureAnonymousAuth(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    const auth = getFirebaseAuth();
    // If already signed in (auth state persisted across reloads), skip.
    if (auth.currentUser) return;

    await signInAnonymously(auth);
  } catch (err) {
    console.warn('[Firebase] Anonymous auth failed — continuing without cloud sync:', err);
  }
}

// ─── Auth ready promise ───────────────────────────────────────────────────────
// Resolves once Firebase Auth has determined the initial auth state.
// Use this to delay Firestore operations until we have (or know we lack) a token.
export function waitForAuth(): Promise<void> {
  if (!isFirebaseConfigured()) return Promise.resolve();
  return new Promise(resolve => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, () => {
      unsub();
      resolve();
    });
  });
}
