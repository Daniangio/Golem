import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createGameAndJoin, playerCount, subscribeOpenGames, type GameSummary } from "../lib/firestoreGames";
import { useAuthUser } from "../lib/useAuth";
import type { GameMode } from "../types";

export default function Lobby() {
  const nav = useNavigate();
  const { user } = useAuthUser();
  const uid = user?.uid ?? null;

  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [gameMode, setGameMode] = useState<GameMode>("campaign");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [openGames, setOpenGames] = useState<GameSummary[]>([]);

  useEffect(() => subscribeOpenGames(setOpenGames), []);

  const sortedOpenGames = useMemo(() => {
    const items = openGames.filter((g) => (g.visibility ?? "public") === "public");
    items.sort((a, b) => {
      const aMs = typeof a.updatedAt?.toMillis === "function" ? a.updatedAt.toMillis() : 0;
      const bMs = typeof b.updatedAt?.toMillis === "function" ? b.updatedAt.toMillis() : 0;
      return bMs - aMs;
    });
    return items;
  }, [openGames]);

  const openLobbyGames = useMemo(
    () => sortedOpenGames.filter((g) => (g.status ?? "lobby") === "lobby"),
    [sortedOpenGames]
  );
  const openActiveGames = useMemo(
    () => sortedOpenGames.filter((g) => (g.status ?? "lobby") === "active"),
    [sortedOpenGames]
  );

  const displayName = useMemo(() => {
    const n = user?.displayName?.trim();
    if (n) return n.slice(0, 20);
    const email = user?.email?.trim();
    if (email) return email.split("@")[0]?.slice(0, 20) || "Player";
    return "Player";
  }, [user]);

  const canCreate = useMemo(() => Boolean(uid) && !busy, [uid, busy]);

  async function onCreate() {
    if (!uid) return;
    setBusy(true);
    setMsg(null);
    try {
      const gameId = await createGameAndJoin(uid, displayName, visibility, gameMode);
      nav(`/game/${gameId}`);
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="text-sm font-semibold text-slate-700">Create a room</div>
        <p className="mt-1 text-sm text-slate-600">3 seats total. You can fill empty seats with bots.</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-sm font-medium text-slate-700">Signed in as</div>
            <div className="mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm">
              {displayName}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Change your display name in{" "}
              <button onClick={() => nav("/me")} className="font-semibold underline">
                Profile
              </button>
              .
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as any)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-slate-400"
            >
              <option value="public">Public (listed)</option>
              <option value="private">Private (invite-only, v0: join by link requires invite)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Run type</label>
            <select
              value={gameMode}
              onChange={(e) => setGameMode(e.target.value as GameMode)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-slate-400"
            >
              <option value="campaign">Campaign (Sphere by Sphere)</option>
              <option value="single_location">Single location</option>
            </select>
          </div>
        </div>

        <button
          onClick={onCreate}
          disabled={!canCreate}
          className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2.5 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          Create room
        </button>

        {msg && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="font-semibold">Error</div>
            <div className="mt-1 break-words">{msg}</div>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="text-sm font-semibold text-slate-700">Open games</div>
        {sortedOpenGames.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No open games right now.</p>
        ) : (
          <div className="mt-3 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lobby rooms</div>
              {openLobbyGames.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">No waiting rooms.</p>
              ) : (
                <div className="mt-2 grid gap-2">
                  {openLobbyGames.map((g) => {
                    const count = playerCount(g.players ?? {});
                    const full = count >= 3;
                    return (
                      <button
                        key={g.id}
                        onClick={() => nav(`/game/${g.id}`)}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm shadow-sm hover:bg-slate-50"
                      >
                        <div>
                          <div className="font-semibold text-slate-800">Room {g.id}</div>
                          <div className="text-xs text-slate-500">
                            Players: {count}/3 • {full ? "Full" : "Joinable"} •{" "}
                            {g.gameMode === "single_location" ? "Single location" : "Campaign"}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-slate-500">Lobby</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">In progress</div>
              {openActiveGames.length === 0 ? (
                <p className="mt-1 text-sm text-slate-500">No active games.</p>
              ) : (
                <div className="mt-2 grid gap-2">
                  {openActiveGames.map((g) => {
                    const count = playerCount(g.players ?? {});
                    const chapter = g.chapter ?? 1;
                    const step = g.step ?? 1;
                    return (
                      <button
                        key={g.id}
                        onClick={() => nav(`/game/${g.id}`)}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm shadow-sm hover:bg-slate-50"
                      >
                        <div>
                          <div className="font-semibold text-slate-800">Game {g.id}</div>
                          <div className="text-xs text-slate-500">
                            Players: {count}/3 • Sphere {chapter} • Pulse {step} •{" "}
                            {g.gameMode === "single_location" ? "Single location" : "Campaign"}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-emerald-700">Active</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
