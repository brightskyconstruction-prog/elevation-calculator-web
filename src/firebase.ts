import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

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
let _app:  FirebaseApp | null  = null;
let _db:   Firestore   | null  = null;

export function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

export function getDb(): Firestore {
  if (!_db) {
    if (!isFirebaseConfigured()) {
      throw new Error('Firebase env vars are not set. Cloud sync is disabled.');
    }
    _app = initializeApp(firebaseConfig as Required<typeof firebaseConfig>);
    _db  = getFirestore(_app);
  }
  return _db;
}
