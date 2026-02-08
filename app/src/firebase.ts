import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "demo",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "demo-golem",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "demo",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "demo",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "demo",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export function maybeConnectEmulators() {
  const useEmu = import.meta.env.VITE_USE_EMULATORS === "true";
  if (!useEmu) return;

  // Prevent double connections with Vite HMR.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.__GOLEM_EMU_CONNECTED__) return;
  w.__GOLEM_EMU_CONNECTED__ = true;

  // When running in remote/dev-container setups, the browser may not be able to reach
  // emulator ports directly (19099/8080). We connect the SDK to the dev server origin and
  // proxy those paths in `vite.config.ts`.
  const devOrigin = window.location.origin;
  const devHost = window.location.hostname;
  const devPort =
    Number(window.location.port) ||
    (window.location.protocol === "https:" ? 443 : 80);

  connectAuthEmulator(auth, devOrigin, { disableWarnings: true });
  connectFirestoreEmulator(db, devHost, devPort);
}

// Connect as early as possible so auth actions on first paint (e.g. /auth) don't race the connection.
maybeConnectEmulators();
