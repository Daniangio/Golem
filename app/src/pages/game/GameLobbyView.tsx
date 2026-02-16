import React from "react";
import { playerCount, type GameSummary } from "../../lib/firestoreGames";
import type { Players } from "../../types";
import { SLOTS, isBotUid, playerLabel, seatLabel } from "./gameUtils";

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

  return (
    <div className="h-full overflow-visible">
      <div className="grid gap-6">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-700">Room</div>
              <div className="mt-1 font-mono text-xs text-slate-600">{gameId}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={onOpenLobby} className="rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700">
                Lobby
              </button>
              <button onClick={onOpenProfile} className="rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700">
                Profile
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <div className="font-semibold">Share link</div>
            <div className="mt-1 break-all font-mono text-xs">{shareUrl}</div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Signed in as</div>
              <div className="mt-1 text-sm font-extrabold text-slate-900">{displayName}</div>
              <div className="mt-2 text-xs text-slate-500">
                Change your display name in{" "}
                <button onClick={onOpenProfile} className="font-semibold underline">
                  Profile
                </button>
                .
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Visibility</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{game.visibility}</div>
              <div className="mt-2 text-xs text-slate-500">Run type</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {game.gameMode === "single_location" ? "Single location" : "Campaign"}
              </div>
              <div className="mt-2 text-xs text-slate-500">Status</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{game.status}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="text-sm font-semibold text-slate-700">Players ({playerCount(players)}/3)</div>
          <div className="mt-3 grid gap-2">
            {SLOTS.map((slot) => {
              const playerUid = players[slot];
              const bot = isBotUid(playerUid);
              return (
                <div
                  key={slot}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-900/10 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {seatLabel(slot)}
                    </span>
                    {playerUid ? (
                      <span className="font-semibold text-slate-900">{playerLabel(playerUid, game.playerNames)}</span>
                    ) : (
                      <span className="text-slate-500">Empty</span>
                    )}
                    {playerUid && bot && <span className="text-xs text-slate-500">(bot)</span>}
                    {playerUid && uid && playerUid === uid && <span className="text-xs font-semibold text-emerald-700">you</span>}
                  </div>
                  {isHost && playerUid && bot && (
                    <button
                      onClick={() => onRemoveBot(playerUid)}
                      disabled={busy}
                      className="rounded-full bg-rose-600/10 px-3 py-1 text-xs font-semibold text-rose-700 disabled:opacity-40"
                    >
                      Remove bot
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!isPlayer && (
              <button
                onClick={onJoin}
                disabled={!uid || busy}
                className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Join room
              </button>
            )}

            {isPlayer && (
              <button
                onClick={onLeave}
                disabled={!uid || busy}
                className="rounded-xl bg-rose-600 px-4 py-2 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isHost ? "Delete room" : "Leave room"}
              </button>
            )}

            {isHost && (
              <>
                <button
                  onClick={onAddBot}
                  disabled={!uid || busy || full}
                  className="rounded-xl bg-slate-900/10 px-4 py-2 font-semibold text-slate-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Add bot
                </button>
                <button
                  onClick={onStart}
                  disabled={!uid || busy || !full}
                  className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Start game
                </button>
              </>
            )}
          </div>

          {msg && <div className="mt-3 text-sm text-slate-700">{msg}</div>}

          {isHost && game.visibility === "private" && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-700">Invites (private room)</div>
              <div className="mt-2 text-sm text-slate-600">Invite by UID (players can find their UID on the Profile page).</div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={inviteUid}
                  onChange={(e) => onInviteUidChange(e.target.value)}
                  placeholder="Paste UID…"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-slate-400"
                />
                <button
                  onClick={onInvite}
                  disabled={busy || !inviteUid.trim()}
                  className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Invite
                </button>
              </div>

              {(game.invitedUids ?? []).length > 0 && (
                <div className="mt-4 grid gap-2">
                  {(game.invitedUids ?? []).map((invitedUid) => (
                    <div key={invitedUid} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <div className="break-all font-mono text-xs text-slate-700">{invitedUid}</div>
                      <button
                        onClick={() => onRevoke(invitedUid)}
                        disabled={busy}
                        className="rounded-full bg-rose-600/10 px-3 py-1 text-xs font-semibold text-rose-700 disabled:opacity-40"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
