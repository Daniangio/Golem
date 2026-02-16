import { type User } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export type UserProfile = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  createdAt?: any;
  lastSeenAt?: any;
};

export async function ensureUserProfile(user: User) {
  const payload: UserProfile = {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  };
  await setDoc(doc(db, "users", user.uid), payload, { merge: true });
}
