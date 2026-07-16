/**
 * Firebase initialization for AppShots (project `appshots-76a56`).
 *
 * The web config below is a PUBLIC client identifier, not a secret — Firebase
 * security is enforced by Auth + Firestore rules (see `firestore.rules`), never
 * by hiding these values — so it's safe to bake in as the default and commit it.
 * Any VITE_FIREBASE_* env var overrides its matching field, so you can point a
 * build at a different project without touching code.
 *
 * The SDK is initialized lazily (first `getFirebase()` call), so importing this
 * module — or the backend that uses it — never triggers Firebase in tests.
 */
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const DEFAULT_CONFIG = {
  apiKey: "AIzaSyBogR7znlj6E66a-sBFC4p1OuT_5RIPjOA",
  authDomain: "appshots-76a56.firebaseapp.com",
  projectId: "appshots-76a56",
  storageBucket: "appshots-76a56.firebasestorage.app",
  messagingSenderId: "213809293861",
  appId: "1:213809293861:web:81a408eb07127322682dcc",
  measurementId: "G-1M5WMT27SC",
};

const env = import.meta.env || {};

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || DEFAULT_CONFIG.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_CONFIG.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || DEFAULT_CONFIG.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_CONFIG.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_CONFIG.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || DEFAULT_CONFIG.appId,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || DEFAULT_CONFIG.measurementId,
};

// A valid config always exists (baked default), so Firebase is the active backend
// everywhere EXCEPT the test env (kept offline/deterministic) or when explicitly
// disabled with VITE_FIREBASE_DISABLED=1.
export const hasFirebase =
  env.MODE !== "test" &&
  !env.VITEST &&
  env.VITE_FIREBASE_DISABLED !== "1" &&
  !!firebaseConfig.apiKey;

let app = null;
let authInstance = null;
let dbInstance = null;

/** Lazily initialize (memoized) and return the Firebase app/auth/firestore handles. */
export function getFirebase() {
  if (!hasFirebase) return { app: null, auth: null, db: null };
  if (!app) {
    app = initializeApp(firebaseConfig);
    authInstance = getAuth(app);
    dbInstance = getFirestore(app);
    // Analytics is optional + browser-only; load it guarded so it never throws
    // (e.g. blocked by an ad-blocker, or unsupported environment).
    if (firebaseConfig.measurementId) {
      import("firebase/analytics")
        .then(({ getAnalytics, isSupported }) =>
          isSupported().then((ok) => {
            if (ok) getAnalytics(app);
          })
        )
        .catch(() => {});
    }
  }
  return { app, auth: authInstance, db: dbInstance };
}
