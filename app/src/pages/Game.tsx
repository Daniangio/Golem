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
  offerExchangeCard,
  playerCount,
  playCard,
  playAuxBatteryCard,
  returnExchangeCard,
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
import { getLocationById, getLocationsForStage, getPartById, type LocationCard } from "../game/locations";
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
  const [showTerrainModal, setShowTerrainModal] = useState(false);
  const [exchangeTargetSeat, setExchangeTargetSeat] = useState<PlayerSlot | null>(null);
  const [exchangeCardId, setExchangeCardId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!gameId) return;
    if (!game) return;
    if (game.status === "completed") {
      nav(`/game/${gameId}/post`);
    }
  }, [game, gameId, nav]);

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

  useEffect(() => {
    const ex = game?.exchange ?? null;
    if (!ex) {
      setExchangeTargetSeat(null);
      setExchangeCardId(null);
      return;
    }

    if (ex.status === "awaiting_offer") {
      const candidates = SLOTS.filter((s) => s !== ex.from && Boolean(game?.players?.[s]));
      setExchangeTargetSeat((prev) => (prev && prev !== ex.from && candidates.includes(prev) ? prev : candidates[0] ?? null));
      setExchangeCardId(null);
      return;
    }

    if (ex.status === "awaiting_return") {
      setExchangeTargetSeat(ex.to ?? null);
      setExchangeCardId(null);
    }
  }, [
    game?.exchange?.status,
    game?.exchange?.from,
    game?.exchange?.to,
    game?.players?.p1,
    game?.players?.p2,
    game?.players?.p3,
  ]);

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

  const spark = game.golem?.hp ?? 5;
  const friction = game.golem?.heat ?? 0;
  const sphere = game.chapter ?? 1;

  const location = getLocationById(game.locationId ?? null);
  const locationOptions = (game.locationOptions ?? getLocationsForStage(game.chapter ?? 1).map((l) => l.id))
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
  const isPreSelection = pulsePhase === "pre_selection";
  const exchange = game.exchange ?? null;
  const exchangePending = Boolean(exchange);

  const selectedName = selectedUid ? playerLabel(selectedUid, game.playerNames) : "Empty";
  const selectedPartId = game.partPicks?.[selectedSeat] ?? null;
  const selectedPartDef = getPartById(selectedPartId);
  const selectedPartDetail = (() => {
    if (!location || !selectedPartId) return null;
    const all = [...location.compulsory, ...location.optional];
    const p = all.find((x) => x.id === selectedPartId);
    return p ? { name: p.name, effect: p.effect, type: p.type } : null;
  })();

  const seatList = SLOTS;
  const canActForSelected = Boolean(uid && canControlSeat(game, uid, selectedSeat));
  const effectsForSeat = (seat: PlayerSlot): any[] => {
    const out: any[] = [];
    const pid = game.partPicks?.[seat] ?? null;
    const def = getPartById(pid);
    if (def?.effects?.length) out.push(...def.effects);
    if (location?.effects?.length) out.push(...location.effects);
    return out;
  };
  const seatHasEffect = (seat: PlayerSlot, effectType: string): boolean =>
    effectsForSeat(seat).some((e) => e && e.type === effectType);

  const selectedSeatEffects = effectsForSeat(selectedSeat);
  const selectedHasEffect = (type: string) => selectedSeatEffects.some((e) => e && e.type === type);

  const preSelectionSeats = SLOTS.filter((s) => seatHasEffect(s, "hide_terrain_until_played"));
  const preSelectionDone = preSelectionSeats.every((s) => Boolean(played[s]?.card));

  const ABILITY_EXTRA_CARD = "once_per_chapter_extra_card_after_reveal";
  const ABILITY_FUSE = "once_per_chapter_fuse_to_zero_after_reveal";

  const canPlayFromSelected = Boolean(
    gameId &&
      uid &&
      canActForSelected &&
      actingSeat &&
      actingSeat === selectedSeat &&
      (pulsePhase === "selection"
        ? !exchangePending && (!preSelectionSeats.length || preSelectionDone)
        : pulsePhase === "pre_selection"
          ? preSelectionSeats.includes(selectedSeat) && !played[selectedSeat]?.card
          : false)
  );
  const canAuxBatteryFromSelected = Boolean(
    gameId &&
      uid &&
      actingSeat &&
      actingSeat === selectedSeat &&
      selectedHasEffect(ABILITY_EXTRA_CARD) &&
      pulsePhase === "actions" &&
      Boolean(played[selectedSeat]?.card) &&
      !Boolean(played[selectedSeat]?.extraCard) &&
      !(game.chapterAbilityUsed?.[selectedSeat]?.[ABILITY_EXTRA_CARD] ?? false)
  );

  const fuseSeat = actingSeat && seatHasEffect(actingSeat, ABILITY_FUSE) ? actingSeat : null;
  const fuseAvailable = Boolean(
    gameId && uid && fuseSeat && pulsePhase === "actions" && !(game.chapterAbilityUsed?.[fuseSeat]?.[ABILITY_FUSE] ?? false)
  );

  const canOfferExchange = Boolean(
    exchange && exchange.status === "awaiting_offer" && uid && canControlSeat(game, uid, exchange.from)
  );
  const canReturnExchange = Boolean(
    exchange && exchange.status === "awaiting_return" && exchange.to && uid && canControlSeat(game, uid, exchange.to)
  );

  const selectedAbilityUsed = game.chapterAbilityUsed?.[selectedSeat] ?? {};
  const chapterGlobalUsed = game.chapterGlobalUsed ?? {};
  const selectedPartToken = (() => {
    if (!selectedPartId) return null;
    if (selectedHasEffect(ABILITY_EXTRA_CARD)) {
      const used = Boolean(selectedAbilityUsed[ABILITY_EXTRA_CARD]);
      return { label: used ? "Overflow used" : "Overflow ready", tone: used ? "muted" : "good" } as const;
    }
    if (selectedHasEffect(ABILITY_FUSE)) {
      const used = Boolean(selectedAbilityUsed[ABILITY_FUSE]);
      return { label: used ? "Dissolution used" : "Dissolution ready", tone: used ? "muted" : "good" } as const;
    }
    return { label: "Passive", tone: "muted" } as const;
  })();

  const locationTokens = (() => {
    if (!location?.effects?.length) return [];
    const out: Array<{ key: string; label: string; tone: "good" | "muted" }> = [];
    for (const e of location.effects as any[]) {
      if (!e?.type) continue;
      if (e.type === "first_stall_refill_all") {
        const used = Boolean(chapterGlobalUsed.first_stall_refill_all);
        out.push({ key: e.type, label: used ? "Warm-up used" : "Warm-up ready", tone: used ? "muted" : "good" });
      }
    }
    return out;
  })();

  return (
    <div className="h-full w-full overflow-hidden text-white">
      <div className="grid h-full grid-rows-[minmax(0,1fr)_minmax(220px,30vh)] gap-3">
        <div className="grid min-h-0 grid-cols-[minmax(220px,20%)_minmax(0,1fr)] gap-3">
          <aside className="min-h-0 overflow-visible rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-white/60">Players</div>
              <div className="text-[11px] font-semibold text-white/50">Sphere {sphere}</div>
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
                          <div className="mt-1 truncate text-[11px] font-semibold text-white/70">Faculty: {partName}</div>
                        ) : (
                          <div className="mt-1 text-[11px] font-semibold text-white/40">No faculty yet</div>
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
                      Spark <span className="ml-1 text-white/90">✦</span> {spark}
                    </div>
                    <div className="rounded-2xl bg-white/5 px-3 py-2 text-sm font-extrabold text-white ring-1 ring-white/10">
                      Friction <span className="ml-1 text-white/90">⟁</span> {friction}
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
                        Sphere {sphere}
                      </div>
                    ) : null}
                  </div>
	                  {location ? (
	                    <>
	                      <div className="mt-2 text-lg font-extrabold tracking-tight text-white">{location.name}</div>
	                      {locationTokens.length ? (
	                        <div className="mt-2 flex flex-wrap gap-2">
	                          {locationTokens.map((t) => (
	                            <span
	                              key={t.key}
	                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
	                                t.tone === "good"
	                                  ? "bg-emerald-400/15 text-emerald-100 ring-emerald-200/20"
	                                  : "bg-white/10 text-white/60 ring-white/10"
	                              }`}
	                            >
	                              {t.label}
	                            </span>
	                          ))}
	                        </div>
	                      ) : null}
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
	                              sphere={sphere}
	                              location={loc}
	                              votes={voteByValue[loc.id] ?? []}
	                              onVote={() => void onVoteLocation(loc.id)}
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
                        <div className="text-sm font-extrabold text-white">Assign faculties</div>
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
	                          Confirm faculties
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
		                          <DeckStub
		                            label="Deck"
		                            count={terrainRemaining}
		                            onClick={
		                              !isPreSelection &&
		                              terrainDeck.length &&
		                              SLOTS.some((s) => seatHasEffect(s, "peek_terrain_deck"))
		                                ? () => setShowTerrainModal(true)
		                                : undefined
		                            }
		                          />
		                          {terrain ? (
		                            isPreSelection ? (
		                              <div className="relative h-[110px] w-[80px] rounded-xl bg-gradient-to-b from-slate-700/40 to-slate-950 p-4 shadow-xl ring-1 ring-white/10">
		                                <div className="text-[11px] font-semibold text-white/60">Unrevealed</div>
		                                <div className="mt-2 text-sm font-extrabold text-white">???</div>
		                                <div className="mt-2 text-[10px] text-white/60">Pre-selection</div>
		                              </div>
		                            ) : selectedHasEffect("hide_terrain_until_played") &&
		                              pulsePhase === "selection" &&
		                              !played[selectedSeat]?.card ? (
		                              <div className="relative h-[110px] w-[80px] rounded-xl bg-gradient-to-b from-slate-700/40 to-slate-950 p-4 shadow-xl ring-1 ring-white/10">
		                                <div className="text-[11px] font-semibold text-white/60">Hidden</div>
		                                <div className="mt-2 text-sm font-extrabold text-white">???</div>
		                                <div className="mt-2 text-[10px] text-white/60">Play first</div>
		                              </div>
		                            ) : (
		                              <TerrainCardView suit={terrain.suit} min={terrain.min} max={terrain.max} />
		                            )
		                          ) : (
		                            <div className="text-sm text-white/60">No terrain.</div>
		                          )}
	                        </div>
	                      </div>

	                      <div className="rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
	                        <div className="flex items-center justify-between gap-2">
	                          <div className="text-xs font-semibold text-white/70">Akashic Reservoir</div>
	                          <div className="text-[11px] font-semibold text-white/50">Phase: {pulsePhase}</div>
	                        </div>
	                        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
	                          {game.reservoir ? (
	                            <div className="flex flex-col items-center gap-1">
	                              <div className="text-[10px] font-semibold text-white/50">R1</div>
	                              <PulseCardPreview card={game.reservoir} />
	                            </div>
	                          ) : null}
	                          {game.reservoir2 ? (
	                            <div className="flex flex-col items-center gap-1">
	                              <div className="text-[10px] font-semibold text-white/50">R2</div>
	                              <PulseCardPreview card={game.reservoir2} />
	                            </div>
	                          ) : null}
	                          {!game.reservoir && !game.reservoir2 ? (
	                            <div className="text-sm text-white/60">No reservoir.</div>
	                          ) : null}
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
                                disabled={busy || !haveAllPlayed || exchangePending}
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
		                            const isOwnOrControlled = Boolean(
		                              uid && (seatUid === uid || (isHost && isBotUid(seatUid) && activeSeat === s))
		                            );
		                            const revealedToAll = Boolean(entry?.revealedDuringSelection && pulsePhase === "selection");
		                            const showFaceUpInSelection = Boolean(
		                              entry?.card &&
		                                (pulsePhase === "selection" || pulsePhase === "pre_selection") &&
		                                (revealedToAll || isOwnOrControlled)
		                            );
		                            const canSwapR1 = Boolean(
		                              pulsePhase === "actions" && uid && gameId && game.reservoir && canControlSeat(game, uid, s)
		                            );
		                            const canSwapR2 = Boolean(
		                              pulsePhase === "actions" && uid && gameId && game.reservoir2 && canControlSeat(game, uid, s)
		                            );
		                            const canSwapHere = canSwapR1 || canSwapR2;
		                            const fused = entry?.valueOverride === 0;
		                            const canFuseHere = Boolean(fuseAvailable && !fused && entry?.card);
                            return (
                              <div key={s} className="relative rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                                <div className="flex items-center justify-between gap-0">
                                  <div className="min-w-0 truncate text-[11px] font-semibold text-white/70">
                                    {seatLabel(s)} • {seatName}
                                  </div>
		                                  <div className="text-[10px] font-semibold text-white/45">
		                                    {entry?.card
		                                      ? pulsePhase === "selection" || pulsePhase === "pre_selection"
		                                        ? showFaceUpInSelection
		                                          ? revealedToAll && !isOwnOrControlled
		                                            ? "Face-up"
		                                            : "Your card"
		                                          : "Covered"
		                                        : "Revealed"
		                                      : "—"}
		                                  </div>
	                                </div>
	                                <div className="mt-2 flex items-center justify-center">
		                                  {entry?.card ? (
		                                    pulsePhase === "selection" || pulsePhase === "pre_selection" ? (
	                                      showFaceUpInSelection ? (
	                                        <PulseCardMini card={entry.card} selected={false} lift="none" onClick={() => {}} />
	                                      ) : (
	                                        <div className="h-[110px] w-[80px] rounded-xl bg-gradient-to-b from-slate-700/40 to-slate-950 shadow-xl ring-1 ring-white/10" />
	                                      )
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
	                                              {canSwapR1 && (
	                                                <button
	                                                  type="button"
	                                                  onClick={() =>
	                                                    guarded(async () => {
	                                                      if (!uid || !gameId) return;
	                                                      await swapWithReservoir(gameId, uid, s, 1);
	                                                    })
	                                                  }
	                                                  disabled={busy}
	                                                  className="rounded-full bg-white px-3 py-1 text-[11px] font-extrabold text-slate-900 shadow disabled:opacity-40"
	                                                >
	                                                  Swap R1
	                                                </button>
	                                              )}
	                                              {canSwapR2 && (
	                                                <button
	                                                  type="button"
	                                                  onClick={() =>
	                                                    guarded(async () => {
	                                                      if (!uid || !gameId) return;
	                                                      await swapWithReservoir(gameId, uid, s, 2);
	                                                    })
	                                                  }
	                                                  disabled={busy}
	                                                  className="rounded-full bg-white px-3 py-1 text-[11px] font-extrabold text-slate-900 shadow disabled:opacity-40"
	                                                >
	                                                  Swap R2
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
	                                                  Dissolve → 0
	                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>

                                        {entry.extraCard && (
                                          <div className="flex flex-col items-center gap-1">
                                            <div className="text-[10px] font-semibold text-emerald-200/80">Overflow</div>
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
              <div className="text-xs font-semibold text-white/60">Faculty</div>
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
	                <div className="mt-2 text-sm text-white/60">No faculty chosen yet.</div>
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
		                            Overflow
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

      {showTerrainModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onMouseDown={() => setShowTerrainModal(false)}
        >
          <div
            className="w-full max-w-3xl rounded-3xl bg-slate-950 p-5 text-white shadow-2xl ring-1 ring-white/10"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold">Terrain deck</div>
                <div className="mt-1 text-xs text-white/60">{terrainDeck.length} cards (ordered)</div>
              </div>
              <button
                type="button"
                onClick={() => setShowTerrainModal(false)}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/15"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
              {terrainDeck.length ? (
                <div className="flex flex-wrap gap-3">
                  {terrainDeck.map((t, idx) => (
                    <div key={t.id} className="flex flex-col items-center gap-2">
                      <div
                        className={`text-[11px] font-semibold ${
                          idx === terrainIndex ? "text-emerald-200" : "text-white/55"
                        }`}
                      >
                        Step {idx + 1}
                        {idx === terrainIndex ? " • current" : ""}
                      </div>
                      <TerrainCardView suit={t.suit} min={t.min} max={t.max} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-white/60">No terrain deck.</div>
              )}
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
                        Sphere {e.chapter} • Step {e.step} • {e.terrainSuit.toUpperCase()}
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

      {exchangePending && exchange && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-4xl rounded-3xl bg-slate-950 p-5 text-white shadow-2xl ring-1 ring-white/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-extrabold">The Communion of Vessels</div>
                <div className="mt-1 text-xs text-white/60">Mandatory exchange before continuing.</div>
              </div>
              <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70">
                {exchange.status === "awaiting_offer" ? "Offer" : "Return"}
              </div>
            </div>

            {exchange.status === "awaiting_offer" ? (
              <div className="mt-4">
                <div className="text-sm font-semibold text-white">
                  {seatLabel(exchange.from)} • {playerLabel(players[exchange.from] ?? "", game.playerNames)}{" "}
                  <span className="text-white/60">must offer one card.</span>
                </div>

                {canOfferExchange ? (
                  <>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                        <div className="text-xs font-semibold text-white/70">Choose recipient</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {SLOTS.filter((s) => s !== exchange.from).map((s) => {
                            const u = players[s];
                            const disabled = !u;
                            const selected = exchangeTargetSeat === s;
                            return (
                              <button
                                key={s}
                                type="button"
                                disabled={disabled}
                                onClick={() => setExchangeTargetSeat(s)}
                                className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                                  selected
                                    ? "bg-emerald-400/20 text-emerald-100 ring-emerald-200/30"
                                    : "bg-white/10 text-white/80 ring-white/10 hover:bg-white/15"
                                } disabled:opacity-40`}
                              >
                                {seatLabel(s)} • {u ? playerLabel(u, game.playerNames) : "Empty"}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-white/70">Choose card to offer</div>
                          <div className="text-[11px] font-semibold text-white/50">🂠 {(hands[exchange.from] ?? []).length}</div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(hands[exchange.from] ?? []).map((c) => (
                            <PulseCardMini
                              key={c.id}
                              card={c}
                              selected={exchangeCardId === c.id}
                              lift="sm"
                              onClick={() => setExchangeCardId(c.id)}
                            />
                          ))}
                          {!(hands[exchange.from] ?? []).length && <div className="text-sm text-white/60">No cards.</div>}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          guarded(async () => {
                            if (!uid || !gameId) return;
                            if (!exchangeTargetSeat || !exchangeCardId) return;
                            await offerExchangeCard(gameId, uid, exchange.from, exchangeTargetSeat, exchangeCardId);
                          })
                        }
                        disabled={busy || !exchangeTargetSeat || !exchangeCardId}
                        className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-white shadow-sm disabled:opacity-40"
                      >
                        Offer card
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-sm text-white/60">
                    Waiting for {seatLabel(exchange.from)} to offer a card…
                  </div>
                )}
              </div>
            ) : exchange.status === "awaiting_return" ? (
              <div className="mt-4">
                <div className="text-sm font-semibold text-white">
                  {seatLabel(exchange.to ?? "p1")} • {playerLabel(players[exchange.to ?? "p1"] ?? "", game.playerNames)}{" "}
                  <span className="text-white/60">must return one card to</span> {seatLabel(exchange.from)} •{" "}
                  {playerLabel(players[exchange.from] ?? "", game.playerNames)}.
                </div>

                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                    <div className="text-xs font-semibold text-white/70">Offered card</div>
                    <div className="mt-3 flex items-center justify-center">
                      {exchange.offered ? <PulseCardPreview card={exchange.offered} /> : <div className="text-sm text-white/60">—</div>}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-white/70">Choose card to return</div>
                      <div className="text-[11px] font-semibold text-white/50">
                        🂠 {exchange.to ? (hands[exchange.to] ?? []).length : 0}
                      </div>
                    </div>

                    {canReturnExchange && exchange.to ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(hands[exchange.to] ?? []).map((c) => (
                          <PulseCardMini
                            key={c.id}
                            card={c}
                            selected={exchangeCardId === c.id}
                            lift="sm"
                            onClick={() => setExchangeCardId(c.id)}
                          />
                        ))}
                        {!(hands[exchange.to] ?? []).length && <div className="text-sm text-white/60">No cards.</div>}
                      </div>
                    ) : (
                      <div className="mt-3 text-sm text-white/60">
                        Waiting for {exchange.to ? seatLabel(exchange.to) : "the recipient"} to return a card…
                      </div>
                    )}
                  </div>
                </div>

                {canReturnExchange && exchange.to && (
                  <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        guarded(async () => {
                          if (!uid || !gameId) return;
                          if (!exchange.to || !exchangeCardId) return;
                          await returnExchangeCard(gameId, uid, exchange.to, exchangeCardId);
                        })
                      }
                      disabled={busy || !exchangeCardId}
                      className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-white shadow-sm disabled:opacity-40"
                    >
                      Return card
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
