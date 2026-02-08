import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth } from "../firebase";
import { useAuthUser } from "../lib/useAuth";
import { ensureUserProfile } from "../lib/users";

type Mode = "login" | "register";

function normalizeEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.includes("@")) return trimmed;
  return `${trimmed}@golem.local`;
}

export default function Auth() {
  const nav = useNavigate();
  const { user, loading } = useAuthUser();
  const [mode, setMode] = useState<Mode>("login");
  const [identifier, setIdentifier] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) nav("/");
  }, [loading, user, nav]);

  const normalizedEmail = useMemo(() => normalizeEmail(identifier), [identifier]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!normalizedEmail || !password.trim()) {
      setErr("Enter username/email and password.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, normalizedEmail, password);
        nav("/");
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      const nextName =
        displayName.trim() ||
        normalizedEmail.split("@")[0]?.slice(0, 20) ||
        "Player";
      await updateProfile(cred.user, { displayName: nextName });
      await ensureUserProfile(cred.user);
      nav("/");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-full px-3 py-1 ${mode === "login" ? "bg-slate-900 text-white" : "bg-slate-100"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`rounded-full px-3 py-1 ${mode === "register" ? "bg-slate-900 text-white" : "bg-slate-100"}`}
          >
            Create account
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 grid gap-3">
          <label className="text-sm font-medium text-slate-700">Username or email</label>
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="e.g. dani or dani@email.com"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-slate-400"
          />

          {mode === "register" && (
            <>
              <label className="text-sm font-medium text-slate-700">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Dani"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-slate-400"
              />
            </>
          )}

          <label className="text-sm font-medium text-slate-700">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-slate-400"
          />

          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-2.5 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-3 text-xs text-slate-500">
          If you enter only a username, it becomes{" "}
          <span className="font-mono">{normalizedEmail || "username@golem.local"}</span>.
        </p>
      </div>

      {err && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <div className="font-semibold">Error</div>
          <div className="mt-1 break-words">{err}</div>
        </div>
      )}
    </div>
  );
}

