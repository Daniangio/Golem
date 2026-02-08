import React, { useEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import Auth from "./pages/Auth";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import Profile from "./pages/Profile";
import { useAuthUser } from "./lib/useAuth";
import { ensureUserProfile } from "./lib/users";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthUser();
  if (loading) {
    return <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">Signing in…</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

export default function App() {
  const loc = useLocation();
  const { user } = useAuthUser();
  const displayName = user?.displayName || user?.email || "Player";
  const inGame = loc.pathname.startsWith("/game/");

  useEffect(() => {
    if (!user) return;
    void ensureUserProfile(user);
  }, [user]);

  return (
    <div
      className={
        inGame
          ? "h-screen overflow-hidden bg-gradient-to-b from-slate-950 to-slate-900 text-white"
          : "min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900"
      }
    >
      <div className={inGame ? "flex h-full w-full flex-col px-3 py-2" : "mx-auto max-w-5xl px-4 py-6"}>
        <header
          className={
            inGame
              ? "flex h-11 items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 ring-1 ring-white/10"
              : "flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
          }
        >
          <div className="flex items-baseline gap-3">
            <Link to="/" className={inGame ? "text-base font-extrabold tracking-tight" : "text-2xl font-extrabold tracking-tight"}>
              Golem's Journey
            </Link>
            <span
              className={
                inGame
                  ? "hidden rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70 sm:inline"
                  : "rounded-full bg-slate-900/5 px-2.5 py-1 text-xs font-medium text-slate-700"
              }
            >
              3 players • Firebase realtime
            </span>
          </div>

          <div className={inGame ? "flex flex-wrap items-center gap-2 text-[11px] text-white/70" : "flex flex-wrap items-center gap-2 text-sm text-slate-600"}>
            <Link to="/" className={inGame ? "rounded-full bg-white/10 px-3 py-1 font-semibold text-white/80" : "rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700"}>
              Lobby
            </Link>
            <Link to="/me" className={inGame ? "rounded-full bg-white/10 px-3 py-1 font-semibold text-white/80" : "rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700"}>
              Profile
            </Link>
            {user && (
              <button
                onClick={() => signOut(auth)}
                className={inGame ? "rounded-full bg-white/10 px-3 py-1 font-semibold text-white/80" : "rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700"}
              >
                Sign out ({displayName})
              </button>
            )}
          </div>
        </header>

        <main className={inGame ? "mt-3 flex-1 overflow-hidden" : "mt-6"}>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Lobby />
                </RequireAuth>
              }
            />
            <Route
              path="/me"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route
              path="/game/:gameId"
              element={
                <RequireAuth>
                  <Game />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {!inGame && (
          <footer className="mt-10 text-xs text-slate-500">
            v0 — lobby + room start (gameplay and bots pending).
          </footer>
        )}
      </div>
    </div>
  );
}
