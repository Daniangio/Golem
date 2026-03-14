import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createGameAndJoin, playerCount, subscribeOpenGames, type GameSummary } from "../lib/firestoreGames";
import { useAuthUser } from "../lib/useAuth";
import { getAllCampaignPaths } from "../game/locations";
import type { CampaignVariant, GameMode } from "../types";
import {
  MysticPanel,
  MysticScene,
  mysticButtonClass,
  mysticInfoPillClass,
  mysticSelectClass,
} from "../components/chrome/MysticUI";

function formatGameMode(mode: GameMode | undefined) {
  return mode === "single_location" ? "Single location" : mode === "tutorial" ? "Tutorial" : "Campaign";
}

function formatCampaignVariant(variant: CampaignVariant | undefined) {
  return variant === "random_choice" ? "Random each sphere" : variant === "preset_path" ? "Preset path" : "Free choice";
}

export default function Lobby() {
  const nav = useNavigate();
  const { user } = useAuthUser();
  const uid = user?.uid ?? null;

  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [targetPlayers, setTargetPlayers] = useState<2 | 3>(3);
  const [gameMode, setGameMode] = useState<GameMode>("campaign");
  const campaignPaths = useMemo(() => getAllCampaignPaths(), []);
  const [campaignVariant, setCampaignVariant] = useState<CampaignVariant>("free_choice");
  const [campaignRandomFaculties, setCampaignRandomFaculties] = useState(false);
  const [campaignPathId, setCampaignPathId] = useState<string>(campaignPaths[0]?.id ?? "");
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
  const selectedCampaignPath = useMemo(
    () => campaignPaths.find((path) => path.id === campaignPathId) ?? null,
    [campaignPathId, campaignPaths]
  );

  async function onCreate() {
    if (!uid) return;
    setBusy(true);
    setMsg(null);
    try {
      const gameId = await createGameAndJoin(uid, displayName, visibility, gameMode, {
        campaignVariant,
        campaignRandomFaculties,
        campaignPathId: campaignVariant === "preset_path" ? campaignPathId : null,
        targetPlayers,
      });
      nav(`/game/${gameId}`);
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <MysticScene background="Back2" className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col gap-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(360px,440px)_minmax(0,1fr)]">
          <MysticPanel className="p-6 sm:p-7" glow="#67e8f9">
            <div className={mysticInfoPillClass}>✶ Threshold of Rooms</div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Compose a new pilgrimage.
            </h1>
            <p className="mt-3 text-sm leading-7 text-white/72">
              Configure visibility, player structure, and campaign flow. The new shell stays fully responsive, with the
              same room logic underneath.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-md">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">Signed in as</div>
                <div className="mt-2 text-lg font-extrabold text-white">{displayName}</div>
                <button
                  type="button"
                  onClick={() => nav("/me")}
                  className="mt-3 text-xs font-semibold text-cyan-200/90 hover:text-cyan-100"
                >
                  Edit profile →
                </button>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-md">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">Room archetype</div>
                <div className="mt-2 text-sm font-semibold text-white/84">
                  {targetPlayers === 2 ? "2 players + shared vessel" : "Classic 3-player circle"}
                </div>
                <div className="mt-2 text-xs leading-6 text-white/58">
                  Two-player rooms keep the shared seat. Three-player rooms use the full circle.
                </div>
              </div>
            </div>
          </MysticPanel>

          <MysticPanel className="p-6 sm:p-7" glow="#f6c453">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">Room creation</div>
                <div className="mt-1 text-2xl font-black text-white">Create a room</div>
              </div>
              <div className={mysticInfoPillClass}>{formatGameMode(gameMode)}</div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.24em] text-white/56">Visibility</label>
                <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)} className={mysticSelectClass}>
                  <option value="public">Public (listed)</option>
                  <option value="private">Private (invite-only)</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.24em] text-white/56">Run type</label>
                <select value={gameMode} onChange={(e) => setGameMode(e.target.value as GameMode)} className={mysticSelectClass}>
                  <option value="campaign">Campaign (Sphere by Sphere)</option>
                  <option value="single_location">Single location</option>
                  <option value="tutorial">Tutorial (no location/faculty effects)</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.24em] text-white/56">Players</label>
                <select
                  value={targetPlayers}
                  onChange={(e) => setTargetPlayers(Number(e.target.value) as 2 | 3)}
                  className={mysticSelectClass}
                >
                  <option value={3}>3 players</option>
                  <option value={2}>2 players + shared pseudo-seat</option>
                </select>
              </div>

              {gameMode === "campaign" ? (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.24em] text-white/56">Campaign flow</label>
                  <select
                    value={campaignVariant}
                    onChange={(e) => setCampaignVariant(e.target.value as CampaignVariant)}
                    className={mysticSelectClass}
                  >
                    <option value="free_choice">Free choice</option>
                    <option value="random_choice">Random each sphere</option>
                    <option value="preset_path">Preset path</option>
                  </select>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/6 p-4 text-xs leading-6 text-white/58">
                  Tutorial strips location and faculty effects. Single-location runs skip the campaign arc.
                </div>
              )}
            </div>

            {gameMode === "campaign" && campaignVariant === "preset_path" && (
              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
                <select value={campaignPathId} onChange={(e) => setCampaignPathId(e.target.value)} className={mysticSelectClass}>
                  {campaignPaths.map((path) => (
                    <option key={path.id} value={path.id}>
                      {path.name} ({path.difficulty})
                    </option>
                  ))}
                </select>
                {selectedCampaignPath && (
                  <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white/70 backdrop-blur-md">
                    <div className="font-semibold text-white">{selectedCampaignPath.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.24em] text-white/42">{selectedCampaignPath.difficulty}</div>
                    <div className="mt-2 text-sm leading-6 text-white/66">{selectedCampaignPath.lore}</div>
                  </div>
                )}
              </div>
            )}

            {gameMode === "campaign" && campaignVariant === "random_choice" && (
              <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white/78 backdrop-blur-md">
                <input
                  type="checkbox"
                  checked={campaignRandomFaculties}
                  onChange={(e) => setCampaignRandomFaculties(e.target.checked)}
                  className="h-4 w-4 accent-cyan-300"
                />
                Randomly assign faculties while preserving compulsory picks.
              </label>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <span className={mysticInfoPillClass}>{visibility === "public" ? "Listed room" : "Invite-only room"}</span>
              {gameMode === "campaign" && <span className={mysticInfoPillClass}>{formatCampaignVariant(campaignVariant)}</span>}
            </div>

            <button onClick={onCreate} disabled={!canCreate} className={mysticButtonClass("primary", true)}>
              Open chamber
            </button>

            {msg && (
              <div className="mt-4 rounded-2xl border border-rose-200/18 bg-rose-400/10 p-4 text-sm text-rose-50">
                <div className="font-semibold">Error</div>
                <div className="mt-1 break-words text-rose-50/86">{msg}</div>
              </div>
            )}
          </MysticPanel>
        </div>

        <MysticPanel className="flex min-h-0 flex-1 flex-col p-6 sm:p-7" glow="#8b5cf6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">Public lattice</div>
              <div className="mt-1 text-2xl font-black text-white">Open games</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={mysticInfoPillClass}>Lobby {openLobbyGames.length}</span>
              <span className={mysticInfoPillClass}>Active {openActiveGames.length}</span>
            </div>
          </div>

          {sortedOpenGames.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-white/12 bg-white/5 p-8 text-center text-sm text-white/58">
              No open games right now.
            </div>
          ) : (
            <div className="mt-6 grid min-h-0 gap-5 xl:grid-cols-2">
              <div className="min-h-0">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/44">Lobby rooms</div>
                <div className="mt-3 grid gap-3">
                  {openLobbyGames.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/55">No waiting rooms.</div>
                  ) : (
                    openLobbyGames.map((g) => {
                      const target = g.targetPlayers ?? 3;
                      const count =
                        target === 2
                          ? ["p1", "p2"].filter((seat) => Boolean((g.players ?? {})[seat as "p1" | "p2"])).length
                          : playerCount(g.players ?? {});
                      const full = count >= target;
                      return (
                        <button
                          key={g.id}
                          onClick={() => nav(`/game/${g.id}`)}
                          className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-left shadow-[0_0_26px_rgba(56,189,248,0.05)] backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/10"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">Room {g.id}</div>
                            <div className="mt-1 text-xs leading-6 text-white/56">
                              Players: {count}/{target}
                              {target === 2 ? " (+shared)" : ""} • {full ? "Full" : "Joinable"} • {formatGameMode(g.gameMode)}
                            </div>
                          </div>
                          <span className="ml-3 shrink-0 text-xs font-semibold text-cyan-200/82 group-hover:text-cyan-100">
                            Lobby →
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="min-h-0">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/44">In progress</div>
                <div className="mt-3 grid gap-3">
                  {openActiveGames.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/55">No active games.</div>
                  ) : (
                    openActiveGames.map((g) => {
                      const target = g.targetPlayers ?? 3;
                      const count =
                        target === 2
                          ? ["p1", "p2"].filter((seat) => Boolean((g.players ?? {})[seat as "p1" | "p2"])).length
                          : playerCount(g.players ?? {});
                      return (
                        <button
                          key={g.id}
                          onClick={() => nav(`/game/${g.id}`)}
                          className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-left shadow-[0_0_26px_rgba(246,196,83,0.05)] backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white/10"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">Room {g.id}</div>
                            <div className="mt-1 text-xs leading-6 text-white/56">
                              Players: {count}/{target}
                              {target === 2 ? " (+shared)" : ""} • Sphere {g.chapter ?? 1} • Pulse {g.step ?? 1}
                            </div>
                          </div>
                          <span className="ml-3 shrink-0 text-xs font-semibold text-amber-200/86 group-hover:text-amber-100">
                            Spectate →
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </MysticPanel>
      </div>
    </MysticScene>
  );
}
