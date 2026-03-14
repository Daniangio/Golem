import React from "react";
import type { GameSummary } from "../../lib/firestoreGames";
import type { Players } from "../../types";
import { SLOTS, isBotUid, playerLabel, seatLabel } from "./gameUtils";
import {
  MysticPanel,
  MysticScene,
  mysticButtonClass,
  mysticInfoPillClass,
  mysticInputClass,
} from "../../components/chrome/MysticUI";

type GameLobbyViewProps = {
  game: GameSummary;
  gameId: string;
  players: Players;
  uid: string | null;
  displayName: string;
  isHost: boolean;
  isPlayer: boolean;
  busy: boolean;
  full: boolean;
  targetPlayers: 2 | 3;
  msg: string | null;
  inviteUid: string;
  onInviteUidChange: (value: string) => void;
  onOpenLobby: () => void;
  onOpenProfile: () => void;
  onJoin: () => void;
  onLeave: () => void;
  onAddBot: () => void;
  onStart: () => void;
  onInvite: () => void;
  onRevoke: (targetUid: string) => void;
  onRemoveBot: (botUid: string) => void;
};

function formatGameMode(mode: GameSummary["gameMode"]) {
  return mode === "single_location" ? "Single location" : mode === "tutorial" ? "Tutorial" : "Campaign";
}

export function GameLobbyView({
  game,
  gameId,
  players,
  uid,
  displayName,
  isHost,
  isPlayer,
  busy,
  full,
  targetPlayers,
  msg,
  inviteUid,
  onInviteUidChange,
  onOpenLobby,
  onOpenProfile,
  onJoin,
  onLeave,
  onAddBot,
  onStart,
  onInvite,
  onRevoke,
  onRemoveBot,
}: GameLobbyViewProps) {
  const shareUrl = `${window.location.origin}/game/${gameId}`;
  const lobbySlots = targetPlayers === 2 ? (["p1", "p2"] as const) : SLOTS;
  const joinedCount = lobbySlots.filter((slot) => Boolean(players[slot])).length;

  return (
    <MysticScene background="Back2" className="h-full min-h-0 rounded-[28px]">
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-3 sm:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(320px,390px)_minmax(0,1fr)]">
          <MysticPanel className="p-5 sm:p-6" glow="#67e8f9">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className={mysticInfoPillClass}>✶ Pre-game chamber</div>
              <div className="flex gap-2">
                <button type="button" onClick={onOpenLobby} className={mysticButtonClass("ghost")}>
                  Lobby
                </button>
                <button type="button" onClick={onOpenProfile} className={mysticButtonClass("ghost")}>
                  Profile
                </button>
              </div>
            </div>

            <div className="mt-4 text-2xl font-black text-white">Room {gameId}</div>
            <div className="mt-2 text-sm leading-7 text-white/70">
              Share the link, finish seating the circle, then begin the run when all required seats are filled.
            </div>

            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-md">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">Share link</div>
                <div className="mt-2 break-all font-mono text-xs text-white/82">{shareUrl}</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-md">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">Signed in as</div>
                  <div className="mt-2 text-sm font-bold text-white">{displayName}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-md">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">Run type</div>
                  <div className="mt-2 text-sm font-bold text-white">{formatGameMode(game.gameMode)}</div>
                  <div className="mt-2 text-xs text-white/56">
                    {game.campaignVariant === "preset_path"
                      ? "Preset path"
                      : game.campaignVariant === "random_choice"
                        ? "Random spheres"
                        : "Free choice"}
                  </div>
                </div>
              </div>
            </div>
          </MysticPanel>

          <MysticPanel className="p-5 sm:p-6" glow="#f6c453">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">Readiness</div>
                <div className="mt-1 text-2xl font-black text-white">
                  Players {joinedCount}/{targetPlayers}
                  {targetPlayers === 2 ? " + shared" : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={mysticInfoPillClass}>{game.visibility}</span>
                <span className={mysticInfoPillClass}>{game.status}</span>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {(targetPlayers === 2 ? (["p1", "p2", "p3"] as const) : SLOTS).map((slot) => {
                const playerUid = players[slot];
                const bot = isBotUid(playerUid);
                const sharedSeat = targetPlayers === 2 && slot === "p3";
                return (
                  <div
                    key={slot}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 backdrop-blur-md"
                  >
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/78">
                        {seatLabel(slot)}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {playerUid ? playerLabel(playerUid, game.playerNames) : sharedSeat ? "Shared vessel" : "Empty"}
                        </div>
                        <div className="text-xs text-white/55">
                          {bot ? "Bot" : sharedSeat ? "Public seat handled at runtime" : playerUid && playerUid === uid ? "You" : "Waiting"}
                        </div>
                      </div>
                    </div>
                    {isHost && playerUid && bot && targetPlayers !== 2 && (
                      <button type="button" onClick={() => onRemoveBot(playerUid)} disabled={busy} className={mysticButtonClass("danger")}>
                        Remove bot
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {!isPlayer && (
                <button type="button" onClick={onJoin} disabled={!uid || busy} className={mysticButtonClass("primary")}>
                  Join room
                </button>
              )}
              {isPlayer && (
                <button type="button" onClick={onLeave} disabled={!uid || busy} className={mysticButtonClass("danger")}>
                  {isHost ? "Delete room" : "Leave room"}
                </button>
              )}
              {isHost && (
                <>
                  <button type="button" onClick={onAddBot} disabled={!uid || busy || full} className={mysticButtonClass("secondary")}>
                    Add bot
                  </button>
                  <button type="button" onClick={onStart} disabled={!uid || busy || !full} className={mysticButtonClass("primary")}>
                    Start game
                  </button>
                </>
              )}
            </div>

            {msg && <div className="mt-4 text-sm text-rose-100/88">{msg}</div>}
          </MysticPanel>
        </div>

        {isHost && game.visibility === "private" && (
          <MysticPanel className="p-5 sm:p-6" glow="#8b5cf6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/52">Private invites</div>
            <div className="mt-1 text-xl font-black text-white">Invite by UID</div>
            <div className="mt-2 text-sm text-white/68">Players can find their UID on the profile page.</div>

            <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={inviteUid}
                onChange={(e) => onInviteUidChange(e.target.value)}
                placeholder="Paste UID…"
                className={mysticInputClass}
              />
              <button type="button" onClick={onInvite} disabled={busy || !inviteUid.trim()} className={mysticButtonClass("primary")}>
                Invite
              </button>
            </div>

            {(game.invitedUids ?? []).length > 0 && (
              <div className="mt-5 grid gap-3">
                {(game.invitedUids ?? []).map((invitedUid) => (
                  <div
                    key={invitedUid}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 backdrop-blur-md"
                  >
                    <div className="break-all font-mono text-xs text-white/78">{invitedUid}</div>
                    <button type="button" onClick={() => onRevoke(invitedUid)} disabled={busy} className={mysticButtonClass("danger")}>
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </MysticPanel>
        )}
      </div>
    </MysticScene>
  );
}
