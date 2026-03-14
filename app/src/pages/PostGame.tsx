import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MysticPanel, MysticScene, mysticButtonClass, mysticInfoPillClass } from "../components/chrome/MysticUI";
import { subscribeGame, type GameSummary } from "../lib/firestoreGames";

function PostGameFallback({
  message,
  glow = "#67e8f9",
}: {
  message: string;
  glow?: string;
}) {
  return (
    <MysticScene background="Back2" className="h-full min-h-0 rounded-[28px]">
      <div className="flex h-full items-center justify-center p-4">
        <MysticPanel className="max-w-lg p-6 text-sm text-white/80" glow={glow}>
          {message}
        </MysticPanel>
      </div>
    </MysticScene>
  );
}

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

  if (err) return <PostGameFallback message={`Error: ${err}`} glow="#fb7185" />;
  if (!gameId) return <PostGameFallback message="Missing game id." />;
  if (game === undefined) return <PostGameFallback message="Loading…" />;
  if (game === null) return <PostGameFallback message="Game not found." />;

  const outcome = game.endedReason ?? "loss";
  const title = outcome === "win" ? "Victory" : "Defeat";
  const subtitle =
    outcome === "win"
      ? "The Golem made it through all available stages."
      : "The Golem collapsed. Better luck next run.";
  const glow = outcome === "win" ? "#f6c453" : "#fb7185";
  const log = game.outcomeLog ?? [];
  const seatedPlayers = Object.values(game.players ?? {}).filter(Boolean);

  return (
    <MysticScene background={outcome === "win" ? "Back1" : "Back2"} className="h-full min-h-0 rounded-[28px]">
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
          <MysticPanel className="p-6 text-white" glow={glow}>
            <div className={mysticInfoPillClass}>{outcome === "win" ? "✶ Cycle complete" : "✶ Vessel broken"}</div>
            <div className="mt-4 text-4xl font-black tracking-tight text-white">{title}</div>
            <div className="mt-2 text-sm leading-7 text-white/72">{subtitle}</div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-md">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/48">Final spark</div>
                <div className="mt-2 text-3xl font-black text-white">{game.golem?.hp ?? "—"}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-md">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/48">Sphere reached</div>
                <div className="mt-2 text-3xl font-black text-white">{game.chapter ?? "—"}</div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-md">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/48">Participants</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {seatedPlayers.length ? (
                  seatedPlayers.map((playerUid) => (
                    <span key={playerUid} className={mysticInfoPillClass}>
                      {game.playerNames?.[playerUid] ?? playerUid}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-white/62">No players recorded.</span>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" onClick={() => nav("/")} className={mysticButtonClass("primary")}>
                Back to Lobby
              </button>
              <button type="button" onClick={() => nav(`/game/${gameId}`)} className={mysticButtonClass("ghost")}>
                View room
              </button>
            </div>
          </MysticPanel>

          <MysticPanel className="min-h-0 p-5 sm:p-6" glow="#67e8f9">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/48">Pulse chronicle</div>
                <div className="mt-1 text-2xl font-black text-white">Run log</div>
              </div>
              <div className={mysticInfoPillClass}>{log.length} entries</div>
            </div>

            <div className="mt-5 space-y-3">
              {log.length ? (
                [...log].reverse().map((e, idx) => (
                  <div key={`${e.chapter}:${e.step}:${idx}`} className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-md">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-extrabold text-white">{e.result.toUpperCase()}</div>
                      <div className="text-[11px] font-semibold text-white/50">
                        Sphere {e.chapter} • Step {e.step} • {e.terrainSuit.toUpperCase()}
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-white/72">
                      total <span className="font-extrabold text-white">{e.total}</span> • target {e.min}–{e.max}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-white/62">No log entries.</div>
              )}
            </div>
          </MysticPanel>
        </div>
      </div>
    </MysticScene>
  );
}
