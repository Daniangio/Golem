import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { subscribeGame, type GameSummary } from "../lib/firestoreGames";

export default function PostGame() {
  const nav = useNavigate();
  const { gameId } = useParams();
  const [game, setGame] = useState<GameSummary | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;
    return subscribeGame(
      gameId,
      (g) => setGame(g),
      (e) => setErr(String(e))
    );
  }, [gameId]);

  if (err) {
    return (
      <div className="rounded-2xl bg-white/10 p-5 text-sm text-white ring-1 ring-white/10">
        <div className="font-semibold">Error</div>
        <div className="mt-1 break-words">{err}</div>
      </div>
    );
  }
  if (!gameId) return <div className="text-sm text-white/70">Missing game id.</div>;
  if (game === undefined) return <div className="text-sm text-white/70">Loading…</div>;
  if (game === null) return <div className="text-sm text-white/70">Game not found.</div>;

  const outcome = game.endedReason ?? "loss";
  const title = outcome === "win" ? "Victory" : "Defeat";
  const subtitle =
    outcome === "win"
      ? "The Golem made it through all available stages."
      : "The Golem collapsed. Better luck next run.";

  const log = game.outcomeLog ?? [];

  return (
    <div className="h-full overflow-auto rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-extrabold text-white">{title}</div>
          <div className="mt-1 text-sm text-white/70">{subtitle}</div>
          <div className="mt-2 text-xs font-semibold text-white/50">
            Final Spark: {game.golem?.hp ?? "—"} • Sphere: {game.chapter ?? "—"}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => nav("/")}
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/15"
          >
            Back to Lobby
          </button>
          <button
            type="button"
            onClick={() => nav(`/game/${gameId}`)}
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/15"
          >
            View room
          </button>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs font-semibold text-white/60">Pulse log</div>
        <div className="mt-2 space-y-2">
          {log.length ? (
            [...log].reverse().map((e, idx) => (
              <div key={`${e.chapter}:${e.step}:${idx}`} className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-white">{e.result.toUpperCase()}</div>
                  <div className="text-[11px] font-semibold text-white/50">
                    Sphere {e.chapter} • Step {e.step} • {e.terrainSuit.toUpperCase()}
                  </div>
                </div>
                <div className="mt-1 text-sm text-white/70">
                  total <span className="font-extrabold text-white">{e.total}</span> • target {e.min}–{e.max}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-white/60">No log entries.</div>
          )}
        </div>
      </div>
    </div>
  );
}
