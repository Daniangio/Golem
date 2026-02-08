import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addBot,
  autoVoteBots,
  confirmLocation,
  confirmParts,
  completeGame,
  endActions,
  getMySlot,
  invitePlayer,
  joinGame,
  leaveGame,
  playerCount,
  playCard,
  playAuxBatteryCard,
  revokeInvite,
  removeBot,
  setLocationVote,
  setPartPick,
  startGame,
  subscribeGame,
  swapWithReservoir,
  useFuse,
  type GameSummary,
} from "../lib/firestoreGames";
import { useAuthUser } from "../lib/useAuth";
import { getLocationById, LOCATIONS_L1, type LocationCard } from "../game/locations";
import { DeckStub, PulseCardMini, PulseCardPreview, TerrainCardView } from "../components/game/PulseCards";
import { LocationChoiceCard } from "../components/game/LocationChoiceCard";
import { PartChoiceCard } from "../components/game/PartChoiceCard";
import type { PlayerSlot, Players } from "../types";

const SLOTS: PlayerSlot[] = ["p1", "p2", "p3"];

function isBotUid(uid: string | undefined | null): boolean {
  return Boolean(uid && uid.startsWith("bot:"));
}

function seatLabel(seat: PlayerSlot): string {
  return seat.toUpperCase();
}

function displayNameForUser(user: { displayName?: string | null; email?: string | null } | null): string {
  const dn = user?.displayName?.trim();
  if (dn) return dn.slice(0, 20);
  const email = user?.email?.trim();
  if (email) return email.split("@")[0]?.slice(0, 20) || "Player";
  return "Player";
}

function playerLabel(uid: string, playerNames: Record<string, string> | undefined): string {
  return playerNames?.[uid] ?? (uid.startsWith("bot:") ? "Bot" : "Player");
}

function seatOrder(mySeat: PlayerSlot): PlayerSlot[] {
  if (mySeat === "p1") return ["p1", "p2", "p3"];
  if (mySeat === "p2") return ["p2", "p3", "p1"];
  return ["p3", "p1", "p2"];
}

function groupSeatsByValue(values: Partial<Record<PlayerSlot, string>> | undefined): Record<string, PlayerSlot[]> {
  const out: Record<string, PlayerSlot[]> = {};
  if (!values) return out;
  for (const seat of SLOTS) {
    const v = values[seat];
    if (!v) continue;
    out[v] = out[v] ?? [];
    out[v]!.push(seat);
  }
  return out;
}

function canControlSeat(game: GameSummary, actorUid: string, seat: PlayerSlot): boolean {
  const u = game.players?.[seat];
  if (!u) return false;
  if (u === actorUid) return true;
  return Boolean(game.createdBy === actorUid && isBotUid(u));
}

export default function Game() {
  const nav = useNavigate();
  const { gameId } = useParams();
  const { user } = useAuthUser();
  const uid = user?.uid ?? null;
  const displayName = useMemo(() => displayNameForUser(user), [user]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [inviteUid, setInviteUid] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);

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

  const players = (game?.players ?? {}) as Players;
  const mySlot = useMemo(() => (uid && game ? getMySlot(players, uid) : null), [uid, game, players]);
  const isHost = Boolean(uid && game?.createdBy && uid === game.createdBy);
  const isPlayer = Boolean(mySlot);
  const full = playerCount(players) >= 3;

  const [activeSeat, setActiveSeat] = useState<PlayerSlot | null>(null); // the seat we're viewing / selecting
  useEffect(() => {
    if (!game) return;
    const occupied = SLOTS.filter((s) => Boolean(game.players?.[s]));
    const next = mySlot && occupied.includes(mySlot) ? mySlot : occupied[0] ?? null;
    setActiveSeat((prev) => (prev && occupied.includes(prev) ? prev : next));
  }, [game?.id, game?.phase, game?.status, game?.players, mySlot]);

  useEffect(() => {
    // Reset selection when switching seats.
    setSelectedCardId(null);
  }, [activeSeat]);

  const actingSeat =
    activeSeat && uid && game && canControlSeat(game, uid, activeSeat) ? activeSeat : mySlot;

  async function guarded(fn: () => Promise<void>) {
    if (!uid || !gameId) return;
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onJoin() {
    return guarded(async () => {
      if (!uid || !gameId) return;
      await joinGame(gameId, uid, displayName);
    });
  }

  async function onLeave() {
    return guarded(async () => {
      if (!uid || !gameId) return;
      await leaveGame(gameId, uid);
      nav("/");
    });
  }

  async function onAddBot() {
    return guarded(async () => {
      if (!uid || !gameId) return;
      await addBot(gameId, uid);
    });
  }

  async function onRemoveBot(botUid: string) {
    return guarded(async () => {
      if (!uid || !gameId) return;
      await removeBot(gameId, uid, botUid);
    });
  }

  async function onStart() {
    return guarded(async () => {
      if (!uid || !gameId) return;
      await startGame(gameId, uid);
    });
  }

  async function onInvite() {
    return guarded(async () => {
      if (!uid || !gameId) return;
      const target = inviteUid.trim();
      if (!target) return;
      await invitePlayer(gameId, uid, target);
      setInviteUid("");
      setMsg("Invited.");
    });
  }

  async function onRevoke(targetUid: string) {
    return guarded(async () => {
      if (!uid || !gameId) return;
      await revokeInvite(gameId, uid, targetUid);
      setMsg("Invite revoked.");
    });
  }

  async function onVoteLocation(locationId: string) {
    return guarded(async () => {
      if (!uid || !gameId || !game || !actingSeat) return;
      await setLocationVote(gameId, uid, actingSeat, locationId);
    });
  }

  async function onAutoVoteBots() {
    return guarded(async () => {
      if (!uid || !gameId) return;
      await autoVoteBots(gameId, uid);
    });
  }

  async function onConfirmLocation() {
    return guarded(async () => {
      if (!uid || !gameId) return;
      await confirmLocation(gameId, uid);
    });
  }

  async function onPickPart(partId: string | null) {
    return guarded(async () => {
      if (!uid || !gameId || !game || !actingSeat) return;
      await setPartPick(gameId, uid, actingSeat, partId);
    });
  }

  async function onConfirmParts() {
    return guarded(async () => {
      if (!uid || !gameId) return;
      await confirmParts(gameId, uid);
    });
  }

  async function onComplete() {
    return guarded(async () => {
      if (!uid || !gameId) return;
      await completeGame(gameId, uid);
    });
  }

  if (err) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <div className="font-semibold">Error</div>
        <div className="mt-1 break-words">{err}</div>
      </div>
    );
  }

  if (!gameId) return <div className="text-sm text-slate-600">Missing game id.</div>;
  if (game === undefined) return <div className="text-sm text-slate-600">Loading…</div>;
  if (game === null) return <div className="text-sm text-slate-600">Game not found.</div>;

  const shareUrl = `${window.location.origin}/game/${gameId}`;

  if (game.status === "lobby") {
    return (
      <div className="h-full overflow-auto">
        <div className="grid gap-6">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-700">Room</div>
              <div className="mt-1 font-mono text-xs text-slate-600">{gameId}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => nav("/")}
                className="rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                Lobby
              </button>
              <button
                onClick={() => nav("/me")}
                className="rounded-full bg-slate-900/10 px-3 py-1 text-xs font-semibold text-slate-700"
              >
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
                <button onClick={() => nav("/me")} className="font-semibold underline">
                  Profile
                </button>
                .
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Visibility</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{game.visibility}</div>
              <div className="mt-2 text-xs text-slate-500">Status</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{game.status}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="text-sm font-semibold text-slate-700">Players ({playerCount(players)}/3)</div>
          <div className="mt-3 grid gap-2">
            {SLOTS.map((slot) => {
              const u = players[slot];
              const bot = isBotUid(u);
              return (
                <div
                  key={slot}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-900/10 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {seatLabel(slot)}
                    </span>
                    {u ? (
                      <span className="font-semibold text-slate-900">{playerLabel(u, game.playerNames)}</span>
                    ) : (
                      <span className="text-slate-500">Empty</span>
                    )}
                    {u && bot && <span className="text-xs text-slate-500">(bot)</span>}
                    {u && uid && u === uid && (
                      <span className="text-xs font-semibold text-emerald-700">you</span>
                    )}
                  </div>
                  {isHost && u && bot && (
                    <button
                      onClick={() => onRemoveBot(u)}
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
              <div className="mt-2 text-sm text-slate-600">
                Invite by UID (players can find their UID on the Profile page).
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={inviteUid}
                  onChange={(e) => setInviteUid(e.target.value)}
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
                  {(game.invitedUids ?? []).map((u) => (
                    <div key={u} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <div className="break-all font-mono text-xs text-slate-700">{u}</div>
                      <button
                        onClick={() => onRevoke(u)}
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

  const golemHp = game.golem?.hp ?? 5;
  const golemHeat = game.golem?.heat ?? 0;
  const stage = game.chapter ?? 1;

  const location = getLocationById(game.locationId ?? null);
  const locationOptions = (game.locationOptions ?? LOCATIONS_L1.map((l) => l.id))
    .map((id) => getLocationById(id))
    .filter(Boolean) as LocationCard[];

  const voteByValue = groupSeatsByValue(game.locationVotes);
  const picksByValue = groupSeatsByValue(game.partPicks);

  const viewSeat = activeSeat ?? mySlot ?? "p1";
  const order = seatOrder(viewSeat);
  const bottomSeat = order[0];
  const leftSeat = order[1];
  const rightSeat = order[2];

  const partNameById = (() => {
    if (!location) return new Map<string, string>();
    const m = new Map<string, string>();
    [...location.compulsory, ...location.optional].forEach((p) => m.set(p.id, p.name));
    return m;
  })();

  const canConfirmLocation =
    isHost &&
    game.phase === "choose_location" &&
    SLOTS.every((s) => Boolean(players[s]) && Boolean(game.locationVotes?.[s]));

  const canConfirmParts = (() => {
    if (!isHost) return false;
    if (game.phase !== "choose_parts") return false;
    if (!location) return false;
    const picks = game.partPicks ?? {};
    const ids = SLOTS.map((s) => picks[s]).filter(Boolean) as string[];
    if (ids.length !== 3) return false;
    if (new Set(ids).size !== ids.length) return false;
    const comp = location.compulsory.map((p) => p.id);
    return comp.every((id) => ids.includes(id));
  })();

  const controllableSeats = uid ? SLOTS.filter((s) => canControlSeat(game, uid, s)) : [];

  const hands = game.hands ?? {};
  const selectedSeat = viewSeat;
  const selectedUid = players[selectedSeat] ?? "";
  const selectedHandRaw = hands[selectedSeat] ?? [];
  const canSeeSelectedHand = Boolean(uid && selectedUid && canControlSeat(game, uid, selectedSeat));
  const selectedHand = canSeeSelectedHand ? selectedHandRaw : [];

  const selectedCard = selectedHand.find((c) => c.id === selectedCardId) ?? null;

  const played = game.played ?? {};
  const haveAllPlayed = SLOTS.every((s) => Boolean(players[s]) && Boolean(played[s]?.card));

  const discardAll = game.pulseDiscard ?? [];
  const lastDiscarded = game.lastDiscarded ?? [];
  const outcomeLog = game.outcomeLog ?? [];

  const terrainDeck = game.terrainDeck ?? [];
  const terrainIndex = game.terrainIndex ?? 0;
  const terrain = terrainDeck[terrainIndex] ?? null;
  const terrainRemaining = Math.max(0, terrainDeck.length - (terrainIndex + 1));
  const pulsePhase = game.pulsePhase ?? "selection";

  const selectedName = selectedUid ? playerLabel(selectedUid, game.playerNames) : "Empty";
  const selectedPartId = game.partPicks?.[selectedSeat] ?? null;
  const selectedPartDetail = (() => {
    if (!location || !selectedPartId) return null;
    const all = [...location.compulsory, ...location.optional];
    const p = all.find((x) => x.id === selectedPartId);
    return p ? { name: p.name, effect: p.effect, type: p.type } : null;
  })();

  const seatList = SLOTS;
  const canActForSelected = Boolean(uid && canControlSeat(game, uid, selectedSeat));
  const canPlayFromSelected =
    Boolean(gameId && uid && canActForSelected && actingSeat && actingSeat === selectedSeat && pulsePhase === "selection");
  const canAuxBatteryFromSelected = Boolean(
    gameId &&
      uid &&
      actingSeat &&
      actingSeat === selectedSeat &&
      selectedPartId === "aux_battery" &&
      pulsePhase === "actions" &&
      Boolean(played[selectedSeat]?.card) &&
      !Boolean(played[selectedSeat]?.extraCard) &&
      !(game.chapterAbilityUsed?.[selectedSeat]?.aux_battery ?? false)
  );

  const fuseSeat = actingSeat && (game.partPicks?.[actingSeat] ?? null) === "fuse" ? actingSeat : null;
  const fuseAvailable = Boolean(
    gameId && uid && fuseSeat && pulsePhase === "actions" && !(game.chapterAbilityUsed?.[fuseSeat]?.fuse ?? false)
  );

  const selectedAbilityUsed = game.chapterAbilityUsed?.[selectedSeat] ?? {};
  const selectedPartToken = (() => {
    if (!selectedPartId) return null;
    if (selectedPartId === "aux_battery") {
      const used = Boolean(selectedAbilityUsed.aux_battery);
      return { label: used ? "Battery used" : "Battery ready", tone: used ? "muted" : "good" } as const;
    }
    if (selectedPartId === "fuse") {
      const used = Boolean(selectedAbilityUsed.fuse);
      return { label: used ? "Fuse used" : "Fuse ready", tone: used ? "muted" : "good" } as const;
    }
    if (selectedPartId === "numb_leg") return { label: "Passive", tone: "muted" } as const;
    if (selectedPartId === "static_core") return { label: "Passive", tone: "muted" } as const;
    return null;
  })();

  return (
    <div className="h-full w-full overflow-hidden text-white">
      <div className="grid h-full grid-rows-[minmax(0,1fr)_minmax(220px,30vh)] gap-3">
        <div className="grid min-h-0 grid-cols-[minmax(220px,20%)_minmax(0,1fr)] gap-3">
          <aside className="min-h-0 overflow-visible rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-white/60">Players</div>
              <div className="text-[11px] font-semibold text-white/50">Stage {stage}</div>
            </div>
            <div className="mt-3 space-y-2">
              {seatList.map((seat) => {
                const u = players[seat] ?? "";
                const n = u ? playerLabel(u, game.playerNames) : "Empty";
                const count = (hands[seat] ?? []).length;
                const pid = game.partPicks?.[seat] ?? null;
                const partName = pid ? partNameById.get(pid) ?? null : null;
                const partDetail = (() => {
                  if (!location || !pid) return null;
                  const all = [...location.compulsory, ...location.optional];
                  const p = all.find((x) => x.id === pid);
                  return p ? { name: p.name, effect: p.effect, type: p.type } : null;
                })();
                const selected = seat === selectedSeat;
                const clickable = Boolean(u);
                return (
                  <div
                    key={seat}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : -1}
                    onClick={clickable ? () => setActiveSeat(seat) : undefined}
                    onKeyDown={
                      clickable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setActiveSeat(seat);
                            }
                          }
                        : undefined
                    }
                    className={`group relative rounded-2xl bg-white/5 p-3 ring-1 transition ${
                      selected ? "ring-white/40" : "ring-white/10 hover:bg-white/7.5 hover:ring-white/20"
                    } ${clickable ? "cursor-pointer" : "opacity-60"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/75">
                            {seatLabel(seat)}
                          </span>
                          <div className="truncate text-sm font-extrabold text-white">
                            {n}
                            {uid && u === uid ? " (you)" : ""}
                          </div>
                          {isBotUid(u) && <span className="text-[11px] font-semibold text-white/50">bot</span>}
                        </div>
                        {partName ? (
                          <div className="mt-1 truncate text-[11px] font-semibold text-white/70">Part: {partName}</div>
                        ) : (
                          <div className="mt-1 text-[11px] font-semibold text-white/40">No part yet</div>
                        )}
                      </div>
                      <div className="shrink-0 rounded-xl bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/70 ring-1 ring-white/10">
                        🂠 {count}
                      </div>
                    </div>

                    {partDetail && (
                      <>
                        <div className="mt-2 hidden rounded-2xl bg-white/5 p-2 text-[11px] text-white/70 ring-1 ring-white/10 xl:block">
                          <div className="font-extrabold text-white/90">{partDetail.name}</div>
                          <div className="mt-1 line-clamp-3 leading-relaxed">{partDetail.effect}</div>
                        </div>
                        <div className="pointer-events-none absolute left-full top-0 z-40 ml-2 hidden w-72 rounded-3xl bg-slate-950/95 p-4 text-xs text-white/85 shadow-2xl ring-1 ring-white/10 backdrop-blur group-hover:block">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-extrabold text-white">{partDetail.name}</div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                partDetail.type === "compulsory"
                                  ? "bg-amber-400/20 text-amber-200"
                                  : "bg-slate-200/10 text-slate-200"
                              }`}
                            >
                              {partDetail.type}
                            </span>
                          </div>
                          <div className="mt-2 leading-relaxed text-white/75">{partDetail.effect}</div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </aside>

          <section className="relative z-10 min-h-0 overflow-hidden rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="grid h-full min-h-0 grid-cols-[minmax(240px,28%)_minmax(0,1fr)] gap-3">
              <div className="min-h-0 space-y-3">
                <div className="rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 p-4 ring-1 ring-white/10">
                  <div className="text-[11px] font-semibold text-white/60">Golem status</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="rounded-2xl bg-white/5 px-3 py-2 text-sm font-extrabold text-white ring-1 ring-white/10">
                      HP <span className="ml-1 text-white/90">♥</span> {golemHp}
                    </div>
                    <div className="rounded-2xl bg-white/5 px-3 py-2 text-sm font-extrabold text-white ring-1 ring-white/10">
                      Heat <span className="ml-1 text-white/90">♨</span> {golemHeat}
                    </div>
                    <div className="rounded-2xl bg-white/5 px-3 py-2 text-sm font-extrabold text-white ring-1 ring-white/10">
                      Phase <span className="ml-1 text-white/80">{game.phase ?? "—"}</span>
                    </div>
                  </div>
                  {msg && <div className="mt-3 text-sm text-rose-200">{msg}</div>}
                </div>

                <div className="min-h-0 overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 p-4 ring-1 ring-white/10">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-white/60">Location</div>
                    {location ? (
                      <div className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/75">
                        Stage {stage}
                      </div>
                    ) : null}
                  </div>
                  {location ? (
                    <>
                      <div className="mt-2 text-lg font-extrabold tracking-tight text-white">{location.name}</div>
                      <div className="mt-2 text-xs leading-relaxed text-white/75">{location.rule}</div>
                      {location.rewards?.length ? (
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-white/70">
                          {location.rewards.slice(0, 4).map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : (
                    <div className="mt-2 text-sm text-white/60">No location chosen yet.</div>
                  )}
                </div>
              </div>

              <div className="min-h-0 overflow-hidden">
                {game.phase === "choose_location" && (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-extrabold text-white">Choose a location</div>
                      <div className="text-[11px] font-semibold text-white/60">
                        Voting as: <span className="font-extrabold text-white">{actingSeat ? seatLabel(actingSeat) : "—"}</span>
                      </div>
                    </div>
                    <div className="mt-3 min-h-0 flex-1 overflow-auto pr-1">
                      <div className="flex flex-wrap items-start justify-center gap-4">
                        {locationOptions.map((loc) => (
                          <div key={loc.id} className="origin-top scale-[0.92]">
                            <LocationChoiceCard
                              stage={stage}
                              location={loc}
                              votes={voteByValue[loc.id] ?? []}
                              onVote={() => onVoteLocation(loc.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      {isHost && (
                        <button
                          onClick={onAutoVoteBots}
                          disabled={busy}
                          className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/85 ring-1 ring-white/10 hover:bg-white/15 disabled:opacity-40"
                        >
                          Auto-vote bots
                        </button>
                      )}
                      {isHost && (
                        <button
                          onClick={onConfirmLocation}
                          disabled={busy || !canConfirmLocation}
                          className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Confirm location
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {game.phase === "choose_parts" && location && (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <div className="text-sm font-extrabold text-white">Pick parts</div>
                        <div className="mt-1 text-xs text-white/65">
                          Selected seat: <span className="font-extrabold text-white">{seatLabel(selectedSeat)}</span>{" "}
                          {canActForSelected ? "" : "(view-only)"}
                        </div>
                      </div>
                      {isHost && (
                        <button
                          onClick={onConfirmParts}
                          disabled={busy || !canConfirmParts}
                          className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Confirm parts
                        </button>
                      )}
                    </div>

                    <div className="mt-3 min-h-0 flex-1 overflow-auto pr-1">
                      <div className="grid gap-3 lg:grid-cols-2">
                        {location.compulsory.map((p) => (
                          <PartChoiceCard
                            key={p.id}
                            part={p}
                            takenBy={picksByValue[p.id] ?? []}
                            onPick={() => {
                              const current = game.partPicks?.[actingSeat ?? selectedSeat] ?? null;
                              void onPickPart(current === p.id ? null : p.id);
                            }}
                          />
                        ))}
                        {location.optional.map((p) => (
                          <PartChoiceCard
                            key={p.id}
                            part={p}
                            takenBy={picksByValue[p.id] ?? []}
                            onPick={() => {
                              const current = game.partPicks?.[actingSeat ?? selectedSeat] ?? null;
                              void onPickPart(current === p.id ? null : p.id);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {game.phase === "play" && (
                  <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-white/70">Terrain</div>
                          <div className="text-[11px] font-semibold text-white/50">{terrainRemaining} left</div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <DeckStub label="Deck" count={terrainRemaining} />
                          {terrain ? (
                            <TerrainCardView suit={terrain.suit} min={terrain.min} max={terrain.max} />
                          ) : (
                            <div className="text-sm text-white/60">No terrain.</div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-white/70">Reservoir</div>
                          <div className="text-[11px] font-semibold text-white/50">Phase: {pulsePhase}</div>
                        </div>
                        <div className="mt-3 flex items-center justify-center">
                          {game.reservoir ? (
                            <PulseCardPreview card={game.reservoir} />
                          ) : (
                            <div className="text-sm text-white/60">No reservoir.</div>
                          )}
                        </div>
                      </div>

                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setShowDiscardModal(true)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setShowDiscardModal(true);
                          }
                        }}
                        className="rounded-3xl bg-white/5 p-3 text-left ring-1 ring-white/10 transition hover:bg-white/7.5 hover:ring-white/20"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-white/70">Discard</div>
                          <div className="text-[11px] font-semibold text-white/50">{discardAll.length} cards</div>
                        </div>
                        <div className="mt-3 text-[11px] font-semibold text-white/50">Last discarded</div>
                        {lastDiscarded.length ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {lastDiscarded.slice(-3).map((c) => (
                              <PulseCardMini
                                key={c.id}
                                card={c}
                                selected={false}
                                lift="none"
                                className="scale-[0.85]"
                                onClick={() => {}}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 text-sm text-white/60">No discards yet.</div>
                        )}
                        <div className="mt-3 text-[11px] font-semibold text-white/45">Click to view all</div>
                      </div>
                    </div>

                    <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(220px,24%)] gap-3">
                      <div className="min-h-0 overflow-hidden rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-white/70">Played cards</div>
                          <div className="flex flex-wrap items-center gap-2">
                            {game.lastOutcome && (
                              <div className="text-[11px] font-semibold text-white/60">
                                Last:{" "}
                                <span className="font-extrabold text-white">{game.lastOutcome.result.toUpperCase()}</span> • total{" "}
                                {game.lastOutcome.total}
                              </div>
                            )}
                            {pulsePhase === "actions" && isHost && (
                              <button
                                onClick={() =>
                                  guarded(async () => {
                                    if (!uid || !gameId) return;
                                    await endActions(gameId, uid);
                                  })
                                }
                                disabled={busy || !haveAllPlayed}
                                className="rounded-2xl bg-emerald-500 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                End actions
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 grid min-h-0 grid-cols-3 gap-2">
                          {SLOTS.map((s) => {
                            const entry = played[s];
                            const seatUid = players[s] ?? "";
                            const seatName = seatUid ? playerLabel(seatUid, game.playerNames) : seatLabel(s);
                            const canSwapHere = Boolean(
                              pulsePhase === "actions" && uid && gameId && game.reservoir && canControlSeat(game, uid, s)
                            );
                            const fused = entry?.valueOverride === 0;
                            const canFuseHere = Boolean(fuseAvailable && !fused && entry?.card);
                            return (
                              <div key={s} className="relative rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                                <div className="flex items-center justify-between gap-0">
                                  <div className="min-w-0 truncate text-[11px] font-semibold text-white/70">
                                    {seatLabel(s)} • {seatName}
                                  </div>
                                  <div className="text-[10px] font-semibold text-white/45">
                                    {entry?.card ? (pulsePhase === "selection" ? "Covered" : "Revealed") : "—"}
                                  </div>
                                </div>
                                <div className="mt-2 flex items-center justify-center">
                                  {entry?.card ? (
                                    pulsePhase === "selection" ? (
                                      <div className="h-[110px] w-[80px] rounded-xl bg-gradient-to-b from-slate-700/40 to-slate-950 shadow-xl ring-1 ring-white/10" />
                                    ) : (
                                      <div className="flex flex-row items-center gap-1">
                                        <div className="relative pt-2">
                                          <PulseCardMini card={entry.card} selected={false} lift="none" onClick={() => {}} />
                                          {fused && (
                                            <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-fuchsia-500/30 px-2 py-0.5 text-[11px] font-extrabold text-fuchsia-100 ring-1 ring-fuchsia-200/20">
                                              0
                                            </div>
                                          )}
                                          {(canSwapHere || canFuseHere) && (
                                            <div className="absolute left-1/2 top-0 z-10 flex -translate-x-1/2 gap-2">
                                              {canSwapHere && (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    guarded(async () => {
                                                      if (!uid || !gameId) return;
                                                      await swapWithReservoir(gameId, uid, s);
                                                    })
                                                  }
                                                  disabled={busy}
                                                  className="rounded-full bg-white px-3 py-1 text-[11px] font-extrabold text-slate-900 shadow disabled:opacity-40"
                                                >
                                                  Swap
                                                </button>
                                              )}
                                              {canFuseHere && fuseSeat && (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    guarded(async () => {
                                                      if (!uid || !gameId) return;
                                                      await useFuse(gameId, uid, fuseSeat, s);
                                                    })
                                                  }
                                                  disabled={busy}
                                                  className="rounded-full bg-fuchsia-400 px-3 py-1 text-[11px] font-extrabold text-slate-950 shadow disabled:opacity-40"
                                                >
                                                  Fuse → 0
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>

                                        {entry.extraCard && (
                                          <div className="flex flex-col items-center gap-1">
                                            <div className="text-[10px] font-semibold text-emerald-200/80">Battery</div>
                                            <PulseCardMini
                                              card={entry.extraCard}
                                              selected={false}
                                              lift="none"
                                              className="scale-[0.9]"
                                              onClick={() => {}}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )
                                  ) : (
                                    <div className="text-sm text-white/50">Not played yet.</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowLogModal(true)}
                        className="min-h-0 overflow-hidden rounded-xl bg-white/5 p-3 text-left ring-1 ring-white/10 transition hover:bg-white/7.5 hover:ring-white/20"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-white/70">History</div>
                          <div className="text-[11px] font-semibold text-white/50">{outcomeLog.length} turns</div>
                        </div>
                        <div className="mt-3 space-y-2">
                          {outcomeLog.length ? (
                            [...outcomeLog].slice(-6).reverse().map((e, idx) => (
                              <div key={`${e.chapter}:${e.step}:${idx}`} className="rounded-2xl bg-white/5 p-2 ring-1 ring-white/10">
                                <div className="flex items-center justify-between">
                                  <div className="text-[11px] font-extrabold text-white">
                                    {e.result.toUpperCase()}
                                  </div>
                                  <div className="text-[10px] font-semibold text-white/50">
                                    Step {e.step}
                                  </div>
                                </div>
                                <div className="mt-1 text-[11px] text-white/60">
                                  total {e.total} • target {e.min}–{e.max}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-sm text-white/60">No results yet.</div>
                          )}
                        </div>
                        <div className="mt-3 text-[11px] font-semibold text-white/45">Click to view all</div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="relative z-30 flex min-h-0 flex-col overflow-visible rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-white/60">Selected board</div>
              <div className="mt-1 truncate text-lg font-extrabold text-white">
                {seatLabel(selectedSeat)} • {selectedName}{" "}
                {!canActForSelected && selectedUid ? <span className="text-sm font-semibold text-white/50">(view-only)</span> : null}
              </div>
            </div>
            {isHost && (
              <button
                onClick={onComplete}
                disabled={busy}
                className="rounded-2xl bg-rose-500/20 px-3 py-1.5 text-[11px] font-extrabold text-rose-100 disabled:opacity-40"
              >
                Mark completed (v0)
              </button>
            )}
          </div>

          <div className="mt-3 grid min-h-0 flex-1 grid-cols-[minmax(220px,32%)_minmax(0,1fr)] gap-3">
            <div className="min-h-0 overflow-hidden rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
              <div className="text-xs font-semibold text-white/60">Part</div>
	              {selectedPartDetail ? (
	                <div className="mt-2">
	                  <div className="flex items-center justify-between gap-2">
	                    <div className="text-base font-extrabold text-white">{selectedPartDetail.name}</div>
	                    <div className="flex items-center gap-2">
	                      {selectedPartToken && (
	                        <span
	                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
	                            selectedPartToken.tone === "good"
	                              ? "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-200/20"
	                              : "bg-white/10 text-white/70 ring-1 ring-white/10"
	                          }`}
	                        >
	                          {selectedPartToken.label}
	                        </span>
	                      )}
	                      <span
	                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
	                          selectedPartDetail.type === "compulsory"
	                            ? "bg-amber-400/20 text-amber-200"
	                            : "bg-slate-200/10 text-slate-200"
	                        }`}
	                      >
	                        {selectedPartDetail.type}
	                      </span>
	                    </div>
	                  </div>
	                  <div className="mt-2 text-sm leading-relaxed text-white/75">{selectedPartDetail.effect}</div>
	                </div>
	              ) : (
                <div className="mt-2 text-sm text-white/60">No part chosen yet.</div>
              )}
            </div>

            <div className="min-h-0 overflow-visible rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-white/60">Hand</div>
                <div className="text-[11px] font-semibold text-white/50">🂠 {selectedHandRaw.length}</div>
              </div>
              <div className="relative mt-3 h-[180px] overflow-x-auto pb-10">
                <div className="flex h-full items-end gap-2">
                {canSeeSelectedHand ? (
                  selectedHand.map((c) => {
                    const selected = selectedCardId === c.id;
                    return (
                      <div key={c.id} className="relative shrink-0 pt-6">
	                        <PulseCardMini
	                          card={c}
	                          selected={selected}
	                          lift="lg"
	                          onClick={() => setSelectedCardId((prev) => (prev === c.id ? null : c.id))}
	                        />
	                        {selected && canPlayFromSelected && (
                          <button
                            type="button"
                            onClick={() =>
                              guarded(async () => {
                                if (!uid || !gameId || !actingSeat || !selectedCardId) return;
                                await playCard(gameId, uid, actingSeat, selectedCardId);
                              })
                            }
                            disabled={busy}
                            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[11px] font-extrabold text-slate-900 shadow disabled:opacity-40"
                          >
	                            Play
	                          </button>
	                        )}
	                        {selected && canAuxBatteryFromSelected && (
	                          <button
	                            type="button"
	                            onClick={() =>
	                              guarded(async () => {
	                                if (!uid || !gameId || !actingSeat || !selectedCardId) return;
	                                await playAuxBatteryCard(gameId, uid, actingSeat, selectedCardId);
	                              })
	                            }
	                            disabled={busy}
	                            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-extrabold text-slate-950 shadow disabled:opacity-40"
	                          >
	                            Battery
	                          </button>
	                        )}
	                      </div>
	                    );
	                  })
	                ) : (
                  Array.from({ length: Math.max(0, selectedHandRaw.length) }).map((_, i) => (
                    <div
                      key={i}
                      className="h-[110px] w-[80px] shrink-0 rounded-2xl bg-gradient-to-b from-slate-700/40 to-slate-950 shadow-xl ring-1 ring-white/10"
                    />
                  ))
                )}
                </div>
              </div>
              {!canSeeSelectedHand && selectedUid && (
                <div className="mt-1 text-[11px] font-semibold text-white/45">
                  Viewing another player — cards are hidden.
                </div>
              )}
              {selectedCard && pulsePhase !== "selection" && (
                <div className="mt-2 text-[11px] text-white/50">Selected: {selectedCard.id}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showDiscardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={() => setShowDiscardModal(false)}>
          <div
            className="w-full max-w-4xl rounded-3xl bg-slate-950 p-5 text-white shadow-2xl ring-1 ring-white/10"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold">Discard pile</div>
                <div className="mt-1 text-xs text-white/60">{discardAll.length} cards</div>
              </div>
              <button
                type="button"
                onClick={() => setShowDiscardModal(false)}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/15"
              >
                Close
              </button>
            </div>

            {lastDiscarded.length ? (
              <div className="mt-4">
                <div className="text-xs font-semibold text-white/60">Last discarded</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {lastDiscarded.map((c) => (
                    <PulseCardMini key={`last:${c.id}`} card={c} selected={false} lift="none" onClick={() => {}} />
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5">
              <div className="text-xs font-semibold text-white/60">All discarded</div>
              <div className="mt-2 max-h-[60vh] overflow-auto rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                <div className="flex flex-wrap gap-2">
                  {[...discardAll].reverse().map((c, idx) => (
                    <PulseCardMini
                      key={`${c.id}:${idx}`}
                      card={c}
                      selected={false}
                      lift="none"
                      className="scale-[0.9]"
                      onClick={() => {}}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={() => setShowLogModal(false)}>
          <div
            className="w-full max-w-3xl rounded-3xl bg-slate-950 p-5 text-white shadow-2xl ring-1 ring-white/10"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold">Pulse history</div>
                <div className="mt-1 text-xs text-white/60">{outcomeLog.length} entries</div>
              </div>
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/15"
              >
                Close
              </button>
            </div>

            <div className="mt-4 max-h-[70vh] overflow-auto rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
              <div className="space-y-2">
                {[...outcomeLog].reverse().map((e, idx) => (
                  <div key={`${e.chapter}:${e.step}:${idx}`} className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-extrabold text-white">{e.result.toUpperCase()}</div>
                      <div className="text-[11px] font-semibold text-white/50">
                        Chapter {e.chapter} • Step {e.step} • {e.terrainSuit.toUpperCase()}
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-white/70">
                      total <span className="font-extrabold text-white">{e.total}</span> • target {e.min}–{e.max}
                    </div>
                  </div>
                ))}
                {!outcomeLog.length && <div className="text-sm text-white/60">No entries yet.</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
