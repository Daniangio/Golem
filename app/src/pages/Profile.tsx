import React, { useEffect, useMemo, useState } from "react";
import { updateProfile } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { subscribeMyGames, type GameSummary } from "../lib/firestoreGames";
import { useAuthUser } from "../lib/useAuth";
import { ensureUserProfile } from "../lib/users";
import {
  MysticPanel,
  MysticScene,
  mysticButtonClass,
  mysticInfoPillClass,
  mysticInputClass,
} from "../components/chrome/MysticUI";

export default function Profile() {
  const nav = useNavigate();
  const { user } = useAuthUser();
  const uid = user?.uid ?? null;

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [games, setGames] = useState<GameSummary[]>([]);

  useEffect(() => {
    if (!uid) return;
    return subscribeMyGames(uid, setGames);
  }, [uid]);

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
  }, [user?.displayName]);

  const sorted = useMemo(() => {
    const items = [...games];
    items.sort((a, b) => {
      const aMs = typeof a.updatedAt?.toMillis === "function" ? a.updatedAt.toMillis() : 0;
      const bMs = typeof b.updatedAt?.toMillis === "function" ? b.updatedAt.toMillis() : 0;
      return bMs - aMs;
    });
    return items;
  }, [games]);

  const openGames = useMemo(
    () => sorted.filter((g) => (g.status ?? "lobby") !== "completed"),
    [sorted]
  );
  const finishedGames = useMemo(
    () => sorted.filter((g) => (g.status ?? "lobby") === "completed"),
    [sorted]
  );

  async function onSaveName() {
    if (!user) return;
    setBusy(true);
    setMsg(null);
    try {
      await updateProfile(user, { displayName: displayName.trim().slice(0, 20) });
      await ensureUserProfile(user);
      setMsg("Display name updated.");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <MysticScene background="Back1" className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col gap-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(340px,430px)_minmax(0,1fr)]">
          <MysticPanel className="p-6 sm:p-7" glow="#67e8f9">
            <div className={mysticInfoPillClass}>✦ Identity lattice</div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">Profile</h1>
            <p className="mt-3 text-sm leading-7 text-white/72">
              Update the name shown in rooms, keep your identifiers visible, and track ongoing or finished runs from a
              single screen.
            </p>

            <div className="mt-6 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-md">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">UID</div>
                <div className="mt-2 break-all font-mono text-xs text-white/82">{uid}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-md">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">Email</div>
                <div className="mt-2 break-all font-mono text-xs text-white/82">{user?.email ?? "—"}</div>
              </div>
              <button type="button" onClick={() => nav("/")} className={mysticButtonClass("ghost", true)}>
                Return to lobby
              </button>
            </div>
          </MysticPanel>

          <MysticPanel className="p-6 sm:p-7" glow="#f6c453">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">Public presence</div>
                <div className="mt-1 text-2xl font-black text-white">Display name</div>
              </div>
              <div className="flex gap-2">
                <span className={mysticInfoPillClass}>Open {openGames.length}</span>
                <span className={mysticInfoPillClass}>Finished {finishedGames.length}</span>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Dani"
                className={mysticInputClass}
              />
              <button onClick={onSaveName} disabled={busy} className={mysticButtonClass("primary")}>
                Save
              </button>
            </div>

            {msg && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white/78">
                {msg}
              </div>
            )}

            <div className="mt-6 grid gap-5 xl:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/44">Open games</div>
                <div className="mt-3 grid gap-3">
                  {openGames.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/55">
                      No open games.
                    </div>
                  ) : (
                    openGames.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => nav(`/game/${g.id}`)}
                        className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-left backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/10"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">Game {g.id}</div>
                          <div className="mt-1 text-xs text-white/56">
                            {g.status === "active" ? "Active run" : "Room in lobby"} • Sphere {g.chapter ?? 1}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-cyan-200/85 group-hover:text-cyan-100">
                          Open →
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/44">Finished games</div>
                <div className="mt-3 grid gap-3">
                  {finishedGames.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/55">
                      No finished games.
                    </div>
                  ) : (
                    finishedGames.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => nav(`/game/${g.id}/post`)}
                        className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-left backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/10"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">Game {g.id}</div>
                          <div className="mt-1 text-xs text-white/56">Completed run</div>
                        </div>
                        <span className="text-xs font-semibold text-amber-200/85 group-hover:text-amber-100">
                          {g.endedReason === "win" ? "Win" : g.endedReason === "loss" ? "Loss" : "Done"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </MysticPanel>
        </div>
      </div>
    </MysticScene>
  );
}
