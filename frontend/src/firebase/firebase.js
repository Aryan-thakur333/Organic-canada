import { initializeApp } from "firebase/app";

import {
  getAuth,
  GoogleAuthProvider,
} from "firebase/auth";

/* -------------------------------------------------------------------------- */
/*                           FIREBASE CONFIG                                  */
/* -------------------------------------------------------------------------- */

const firebaseConfig = {
  apiKey: "AIzaSyCjtJPqmm9bH-vBkQEVBYzik1LrObzF3Mw",

  authDomain:
    "organic-canada-2512b.firebaseapp.com",

  projectId: "organic-canada-2512b",

  storageBucket:
    "organic-canada-2512b.firebasestorage.app",

  messagingSenderId: "152046409282",

  appId:
    "1:152046409282:web:eca6a3019a163ec986bfdb",

  measurementId: "G-1RVXEXR68S",
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