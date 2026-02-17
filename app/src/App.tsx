import React, { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import Auth from "./pages/Auth";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import PostGame from "./pages/PostGame";
import Profile from "./pages/Profile";
import Rules from "./pages/Rules";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [terrainAnimDebug, setTerrainAnimDebug] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("golem_debug_terrain_anim") === "1";
  });

  useEffect(() => {
    if (!user) return;
    void ensureUserProfile(user);
  }, [user]);

  return (
    <div
      className={
        inGame
          ? "h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white"
          : "min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900"
      }
    >
      {user && (
        <>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            className={`fixed right-3 top-3 z-[70] flex h-10 w-10 items-center justify-center rounded-full ring-1 transition ${
              inGame
                ? "bg-white/10 text-white ring-white/15 hover:bg-white/15"
                : "bg-white text-slate-900 shadow-sm ring-slate-200 hover:bg-slate-50"
            }`}
            aria-label="Open settings"
            title="Settings"
          >
            ⚙
          </button>

          {settingsOpen && (
            <div
              className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 p-4"
              onMouseDown={() => setSettingsOpen(false)}
            >
              <div
                className="w-full max-w-sm rounded-3xl bg-slate-950 p-5 text-white shadow-2xl ring-1 ring-white/10"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold">Settings</div>
                    <div className="mt-1 text-xs text-white/60">Signed in as {displayName}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(false)}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/15"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 grid gap-2">
                  <Link
                    to="/"
                    onClick={() => setSettingsOpen(false)}
                    className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 ring-1 ring-white/10 hover:bg-white/15"
                  >
                    Lobby
                  </Link>
                  <Link
                    to="/me"
                    onClick={() => setSettingsOpen(false)}
                    className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 ring-1 ring-white/10 hover:bg-white/15"
                  >
                    Profile
                  </Link>
                  <Link
                    to="/rules"
                    onClick={() => setSettingsOpen(false)}
                    className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 ring-1 ring-white/10 hover:bg-white/15"
                  >
                    Rules
                  </Link>
                  <label className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/90 ring-1 ring-white/10">
                    <span>Terrain anim debug</span>
                    <input
                      type="checkbox"
                      checked={terrainAnimDebug}
                      onChange={(e) => {
                        const next = e.target.checked;
                        setTerrainAnimDebug(next);
                        if (next) {
                          window.localStorage.setItem("golem_debug_terrain_anim", "1");
                        } else {
                          window.localStorage.removeItem("golem_debug_terrain_anim");
                          window.sessionStorage.removeItem("golem_debug_terrain_anim_events");
                        }
                      }}
                      className="h-4 w-4 accent-emerald-500"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => signOut(auth)}
                    className="rounded-2xl bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 ring-1 ring-rose-200/10 hover:bg-rose-500/25"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className={inGame ? "h-full w-full p-2" : "mx-auto max-w-5xl px-4 py-6"}>
        <main className={inGame ? "h-full w-full" : ""}>
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
              path="/rules"
              element={
                <RequireAuth>
                  <Rules />
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
            <Route
              path="/game/:gameId/post"
              element={
                <RequireAuth>
                  <PostGame />
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
