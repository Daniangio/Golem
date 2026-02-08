import React, { useEffect, useMemo, useState } from "react";
import { updateProfile } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { subscribeMyGames, type GameSummary } from "../lib/firestoreGames";
import { useAuthUser } from "../lib/useAuth";
import { ensureUserProfile } from "../lib/users";

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

  async function onSaveName() {
    if (!user) return;
    setBusy(true);
    setMsg(null);
    try {
      await updateProfile(user, { displayName: displayName.trim().slice(0, 20) });
      await ensureUserProfile(user);
      setMsg("Saved.");
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="text-sm font-semibold text-slate-700">Account</div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-slate-500">UID</div>
            <div className="mt-1 break-all font-mono text-xs text-slate-900">{uid}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-slate-500">Email</div>
            <div className="mt-1 break-all font-mono text-xs text-slate-900">{user?.email ?? "—"}</div>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700">Display name</label>
          <div className="mt-1 flex gap-2">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Dani"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-slate-400"
            />
            <button
              onClick={onSaveName}
              disabled={busy}
              className="whitespace-nowrap rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
          </div>
          {msg && <div className="mt-2 text-sm text-slate-600">{msg}</div>}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700">Game history</div>
          <button
            onClick={() => nav("/")}
            className="rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700"
          >
            Lobby
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No games yet.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {sorted.map((g) => (
              <button
                key={g.id}
                onClick={() => nav(`/game/${g.id}`)}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm shadow-sm hover:bg-slate-50"
              >
                <div>
                  <div className="font-semibold text-slate-800">Game {g.id}</div>
                  <div className="text-xs text-slate-500">Status: {g.status}</div>
                </div>
                <span className="text-xs font-semibold text-slate-500">Open</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

