import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createGameAndJoin, playerCount, subscribeLobbyGames, type GameSummary } from "../lib/firestoreGames";
import { useAuthUser } from "../lib/useAuth";

export default function Lobby() {
  const nav = useNavigate();
  const { user } = useAuthUser();
  const uid = user?.uid ?? null;

  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [lobbies, setLobbies] = useState<GameSummary[]>([]);

  useEffect(() => subscribeLobbyGames(setLobbies), []);

  const publicLobbies = useMemo(() => {
    const items = lobbies.filter((g) => (g.visibility ?? "public") === "public");
    items.sort((a, b) => {
      const aMs = typeof a.createdAt?.toMillis === "function" ? a.createdAt.toMillis() : 0;
      const bMs = typeof b.createdAt?.toMillis === "function" ? b.createdAt.toMillis() : 0;
      return bMs - aMs;
    });
    return items;
  }, [lobbies]);

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
      const gameId = await createGameAndJoin(uid, displayName, visibility);
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
        <div className="text-sm font-semibold text-slate-700">Open lobbies</div>
        {publicLobbies.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No lobbies right now.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {publicLobbies.map((g) => {
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
                      Players: {count}/3 • {full ? "Full" : "Joinable"}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">Open</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
