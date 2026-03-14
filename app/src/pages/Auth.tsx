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
import {
  MysticPanel,
  MysticScene,
  mysticButtonClass,
  mysticInfoPillClass,
  mysticInputClass,
} from "../components/chrome/MysticUI";

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
    <MysticScene background="Back1" className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,460px)]">
        <MysticPanel className="p-6 sm:p-8 lg:p-10" glow="#67e8f9">
          <div className="max-w-xl">
            <div className={mysticInfoPillClass}>✶ Astral Access</div>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
              Enter the Vessel’s hidden chamber.
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-7 text-white/72 sm:text-base">
              Authenticate through the luminous veil, recover your name, and return to the campaign lattice. The
              interface stays light on ceremony: username-only access still resolves to a local email identity.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ["⟁", "Username sign-in", "Use a short name or full email address."],
                ["✦", "Display identity", "Set the name shown across rooms and runs."],
                ["☉", "Mobile-ready", "Panels collapse cleanly on narrow screens."],
              ].map(([symbol, title, text]) => (
                <div
                  key={title}
                  className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[0_0_30px_rgba(56,189,248,0.08)] backdrop-blur-md"
                >
                  <div className="text-lg text-cyan-200/90">{symbol}</div>
                  <div className="mt-2 text-sm font-semibold text-white">{title}</div>
                  <div className="mt-1 text-xs leading-6 text-white/58">{text}</div>
                </div>
              ))}
            </div>
          </div>
        </MysticPanel>

        <div className="space-y-4">
          <MysticPanel className="p-5 sm:p-6" glow="#f6c453">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={mysticButtonClass(mode === "login" ? "primary" : "ghost")}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={mysticButtonClass(mode === "register" ? "primary" : "ghost")}
              >
                Create account
              </button>
            </div>

            <form onSubmit={onSubmit} className="mt-5 grid gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.24em] text-white/58">
                  Username or email
                </label>
                <input
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. dani or dani@email.com"
                  className={mysticInputClass}
                />
              </div>

              {mode === "register" && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.24em] text-white/58">
                    Display name
                  </label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Dani"
                    className={mysticInputClass}
                  />
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.24em] text-white/58">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={mysticInputClass}
                />
              </div>

              <button type="submit" disabled={busy} className={mysticButtonClass("primary", true)}>
                {mode === "login" ? "Unlock chamber" : "Bind new identity"}
              </button>
            </form>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-6 text-white/62">
              Username-only access resolves to <span className="font-mono text-white/84">{normalizedEmail || "username@golem.local"}</span>.
            </div>
          </MysticPanel>

          {err && (
            <MysticPanel className="p-4" glow="#fb7185">
              <div className="text-sm font-semibold text-rose-100">Error</div>
              <div className="mt-1 break-words text-sm text-rose-50/88">{err}</div>
            </MysticPanel>
          )}
        </div>
      </div>
    </MysticScene>
  );
}
