import { initializeApp } from "firebase/app";

import {
  getAuth,
  GoogleAuthProvider,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";

/* -------------------------------------------------------------------------- */
/*                           FIREBASE CONFIG                                  */
/* -------------------------------------------------------------------------- */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCjtJPqmm9bH-vBkQEVBYzik1LrObzF3Mw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "organic-canada-2512b.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "organic-canada-2512b",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "organic-canada-2512b.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "152046409282",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:152046409282:web:eca6a3019a163ec986bfdb",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-1RVXEXR68S",
};

/* -------------------------------------------------------------------------- */
/*                           INITIALIZE APP                                   */
/* -------------------------------------------------------------------------- */

const firebaseApp =
  initializeApp(firebaseConfig);

/* -------------------------------------------------------------------------- */
/*                                AUTH                                        */
/* -------------------------------------------------------------------------- */

const auth = getAuth(firebaseApp);
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('[Firebase] Unable to enable local auth persistence:', error);
});

/* -------------------------------------------------------------------------- */
/*                         GOOGLE PROVIDER                                    */
/* -------------------------------------------------------------------------- */

const googleProvider =
  new GoogleAuthProvider();

/**
 * Always ask account selection
 */
googleProvider.setCustomParameters({
  prompt: "select_account",
});

/* -------------------------------------------------------------------------- */
/*                                EXPORTS                                     */
/* -------------------------------------------------------------------------- */

export {
  firebaseApp,
  auth,
  googleProvider,
};

export default firebaseApp;
