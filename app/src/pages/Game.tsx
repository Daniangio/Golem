import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { SphereLocationImages } from "../components/game/SphereLocationImages";
import { CommunionExchangePanel, PlayerBottomPanel } from "../components/game/PlayerBottomPanel";
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

function imgSrc(path: string | undefined | null): string | null {
  if (!path) return null;
  return encodeURI(path);
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
  const [showFacultyModal, setShowFacultyModal] = useState(false);
  const [locationCarouselIndex, setLocationCarouselIndex] = useState(0);
  const facultyPopoverRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (game?.phase === "choose_location") setLocationCarouselIndex(0);
  }, [game?.id, game?.chapter, game?.phase]);

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
    setShowFacultyModal(false);
  }, [activeSeat]);

  useEffect(() => {
    const ex = game?.exchange ?? null;
    if (!ex) return;
    if (!uid || !game) return;

    if (ex.status === "awaiting_offer") {
      const from = (ex.from ?? null) as PlayerSlot | null;
      if (!from) return;
      if (!canControlSeat(game, uid, from)) return;
      setActiveSeat((prev) => (prev === from ? prev : from));
      return;
    }

    if (ex.status === "awaiting_return" && ex.to) {
      const to = (ex.to ?? null) as PlayerSlot | null;
      if (!to) return;
      if (!canControlSeat(game, uid, to)) return;
      setActiveSeat((prev) => (prev === to ? prev : to));
    }
  }, [
    game?.exchange?.status,
    game?.exchange?.from,
    game?.exchange?.to,
    game?.players?.p1,
    game?.players?.p2,
    game?.players?.p3,
    game?.createdBy,
    uid,
  ]);

  useEffect(() => {
    if (!showFacultyModal) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (facultyPopoverRef.current && facultyPopoverRef.current.contains(target)) return;
      setShowFacultyModal(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowFacultyModal(false);
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [showFacultyModal]);

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
      <div className="h-full overflow-visible">
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

  const exchangeStatusLine = (() => {
    if (!exchangePending || !exchange) return null;
    if (exchange.status === "awaiting_offer") {
      const fromUid = players[exchange.from] ?? "";
      const fromName = fromUid ? playerLabel(fromUid, game.playerNames) : seatLabel(exchange.from);
      return canOfferExchange ? "The Communion of Vessels: offer a card to a player." : `Waiting for ${fromName} to exchange…`;
    }
    if (exchange.status === "awaiting_return") {
      const toSeat = exchange.to ?? null;
      const toUid = toSeat ? (players[toSeat] ?? "") : "";
      const toName = toUid ? playerLabel(toUid, game.playerNames) : (toSeat ? seatLabel(toSeat) : "recipient");
      return canReturnExchange ? "The Communion of Vessels: return a card to finish the exchange." : `Waiting for ${toName} to return a card…`;
    }
    return null;
  })();

  const exchangeRecipients = (() => {
    if (!exchange || exchange.status !== "awaiting_offer") return [];
    return SLOTS.filter((s) => s !== exchange.from).map((s) => {
      const u = players[s];
      return { seat: s, name: u ? playerLabel(u, game.playerNames) : "Empty", enabled: Boolean(u) };
    });
  })();

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

  const sphereImageUrl = imgSrc(locationOptions[0]?.sphereImage ?? location?.sphereImage ?? null);
  const locationImageUrl = imgSrc(location?.image ?? null);

  return (
    <div className="h-full w-full text-white">
      <div className="grid h-full grid-rows-[5%_5%_minmax(0,1fr)_20%] gap-1">
        <aside className="shrink-0 rounded-3xl bg-white/5 px-2 py-1 ring-1 ring-white/10">
          <div className="flex h-full items-center gap-2">
            {seatList.map((seat) => {
              const u = players[seat] ?? "";
              const n = u ? playerLabel(u, game.playerNames) : "Empty";
              const selected = seat === selectedSeat;
              const clickable = Boolean(u);
              return (
                <button
                  key={seat}
                  type="button"
                  disabled={!clickable}
                  onClick={clickable ? () => setActiveSeat(seat) : undefined}
                  className={`min-w-0 flex h-full flex-1 items-center rounded-2xl px-2 text-left text-[11px] font-semibold ring-1 transition ${
                    selected
                      ? "bg-white/15 text-white ring-white/30"
                      : "bg-white/5 text-white/80 ring-white/10 hover:bg-white/10 hover:ring-white/20"
                  } disabled:opacity-40`}
                  title={n}
                >
                  <div className="w-full truncate">{n}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="shrink-0 rounded-3xl bg-white/5 px-2 py-1 ring-1 ring-white/10">
          <div className="flex h-full items-center gap-2">
            <div className="shrink-0 rounded-2xl bg-white/5 px-2 py-1 text-[11px] font-extrabold text-white ring-1 ring-white/10">
              ✦ {spark}
            </div>
            <div className="shrink-0 rounded-2xl bg-white/5 px-2 py-1 text-[11px] font-extrabold text-white ring-1 ring-white/10">
              ⟁ {friction}
            </div>
            <div className="shrink-0 rounded-2xl bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/70 ring-1 ring-white/10">
              Sphere <span className="ml-1 font-extrabold text-white">{sphere}</span>
            </div>
            <div className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white/70">
              {msg ? (
                <span className="text-rose-200">{msg}</span>
              ) : exchangeStatusLine ? (
                <span className="text-amber-100/90">{exchangeStatusLine}</span>
              ) : (
                `Phase: ${game.phase ?? "—"}`
              )}
            </div>
          </div>
        </div>

        <section className="relative z-10 min-h-0 rounded-2xl bg-white/5 p-1 ring-1 ring-white/10">
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] grid-cols-1 gap-0">
            <div className="min-h-0 space-y-1">
              {game.phase !== "choose_location" && game.phase !== "choose_parts" && game.phase !== "play" && (
                <div className="min-h-0 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 p-2 ring-1 ring-white/10">
                  {location ? (
                    <>
                      <div className="mt-2 grid grid-cols-[minmax(32px,10%)_minmax(0,1fr)] gap-1">
                        {sphereImageUrl ? (
                          <img
                            src={sphereImageUrl}
                            alt={`Sphere ${sphere}`}
                            className="h-[160px] w-full object-contain"
                            draggable={false}
                          />
                        ) : (
                          <div className="flex h-[160px] items-center justify-center text-xs text-white/60">
                            Sphere art missing
                          </div>
                        )}
                        
                        {locationImageUrl ? (
                          <img
                            src={locationImageUrl}
                            alt={location.name}
                            className="h-[160px] w-[80px] object-cover"
                            draggable={false}
                          />
                        ) : (
                          <div className="flex h-[160px] items-center justify-center p-3 text-center">
                            <div>
                              <div className="text-xs font-semibold text-white/60">Location art missing</div>
                              <div className="mt-2 text-sm font-extrabold text-white">{location.name}</div>
                            </div>
                          </div>
                        )}
                        
                      </div>

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
                    </>
                  ) : (
                    <div className="mt-2 text-sm text-white/60">No location chosen yet.</div>
                  )}
                </div>
              )}
            </div>

            <div className="min-h-0">
                {game.phase === "choose_location" && (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="mt-1 min-h-0 flex-1 overflow-visible pr-1">
                      <div className="grid min-h-0 grid-cols-[minmax(0,32%)_minmax(0,1fr)] gap-4">
                            {sphereImageUrl ? (
                              <img
                                src={sphereImageUrl}
                                alt={`Sphere ${sphere}`}
                                className="h-[360px] w-full object-contain sm:h-[420px]"
                                draggable={false}
                              />
                            ) : (
                              <div className="flex h-[360px] items-center justify-center text-xs text-white/60 sm:h-[420px]">
                                Sphere art missing
                              </div>
                            )}
                        <div className="relative min-h-[360px] [perspective:1200px] sm:min-h-[420px]">
                          <button
                            type="button"
                            onClick={() =>
                              setLocationCarouselIndex((i) => {
                                const n = locationOptions.length;
                                if (!n) return 0;
                                return (i - 1 + n) % n;
                              })
                            }
                            className="absolute left-1 top-1/2 z-30 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-sm font-extrabold text-white ring-1 ring-white/10 hover:bg-white/15"
                            aria-label="Previous location"
                            title="Previous"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setLocationCarouselIndex((i) => {
                                const n = locationOptions.length;
                                if (!n) return 0;
                                return (i + 1) % n;
                              })
                            }
                            className="absolute right-1 top-1/2 z-30 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-sm font-extrabold text-white ring-1 ring-white/10 hover:bg-white/15"
                            aria-label="Next location"
                            title="Next"
                          >
                            ›
                          </button>

                          {locationOptions.map((loc, idx) => {
                            const n = locationOptions.length;
                            const current = n ? ((locationCarouselIndex % n) + n) % n : 0;
                            const half = Math.floor(n / 2);
                            let diff = idx - current;
                            if (diff > half) diff -= n;
                            if (diff < -half) diff += n;

                            const show = Math.abs(diff) <= 1 || n <= 3;
                            const x = diff * 220;
                            const rot = diff * -28;
                            const scale = diff === 0 ? 1 : 0.88;
                            const opacity = diff === 0 ? 1 : 0.35;

                            return (
                              <div
                                key={loc.id}
                                className="absolute left-1/2 top-1/2 origin-center transition-[transform,opacity] duration-500 ease-out"
                                style={{
                                  transform: `translate(-50%, -50%) translateX(${x}px) scale(${scale}) rotateY(${rot}deg)`,
                                  opacity: show ? opacity : 0,
                                  zIndex: diff === 0 ? 20 : 10 - Math.abs(diff),
                                  pointerEvents: show ? "auto" : "none",
                                }}
                                onMouseDownCapture={() => {
                                  if (diff !== 0) setLocationCarouselIndex(idx);
                                }}
                              >
                                <LocationChoiceCard
                                  sphere={sphere}
                                  location={loc}
                                  votes={voteByValue[loc.id] ?? []}
                                  onVote={() => void onVoteLocation(loc.id)}
                                />
                              </div>
                            );
                          })}

                          {locationOptions.length > 1 && (
                            <div className="absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1">
                              {locationOptions.map((_, idx) => {
                                const n = locationOptions.length;
                                const current = n ? ((locationCarouselIndex % n) + n) % n : 0;
                                const active = idx === current;
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setLocationCarouselIndex(idx)}
                                    className={`h-2 w-2 rounded-full ring-1 ring-white/20 transition ${
                                      active ? "bg-white/80" : "bg-white/20 hover:bg-white/35"
                                    }`}
                                    aria-label={`Select location ${idx + 1}`}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
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
                  <div className="grid h-full min-h-0 grid-cols-[minmax(0,16%)_minmax(0,1fr)] gap-2">
                    <div className="min-h-0 p-1 max-w-[20vw]">
                      <SphereLocationImages
                        sphere={sphere}
                        sphereImageUrl={sphereImageUrl}
                        locationName={location.name}
                        locationImageUrl={locationImageUrl}
                        orientation="row"
                      />
                    </div>

                    <div className="flex min-h-0 flex-col">
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

                      <div className="mt-3 min-h-0 flex-1 overflow-visible pr-1">
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
                  </div>
                )}

                {game.phase === "play" && (
                  <div className="grid h-full min-h-0 grid-cols-[minmax(0,16%)_minmax(0,1fr)] gap-2">
                    <div className="min-h-0">
                      {location ? (
                        <>
                          <SphereLocationImages
                            sphere={sphere}
                            sphereImageUrl={sphereImageUrl}
                            locationName={location.name}
                            locationImageUrl={locationImageUrl}
                            orientation="row"
                          />
                          {locationTokens.length ? (
                            <div className="mt-1 flex flex-wrap gap-1 px-1">
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
                        </>
                      ) : (
                        <div className="rounded-2xl bg-white/5 p-3 text-sm text-white/70 ring-1 ring-white/10">
                          No location chosen yet.
                        </div>
                      )}
                    </div>

                    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
                      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
                        <div className="grid grid-cols-7 gap-2">
                          <div className="rounded-2xl col-span-3 bg-white/5 p-2 ring-1 ring-white/10">
                            <div className="flex items-center justify-between">
                              <div className="text-xs font-semibold text-white/70">Terrain</div>
                              <div className="text-[11px] font-semibold text-white/50">{terrainRemaining} left</div>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
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
	                      <div className="rounded-2xl col-span-3 bg-white/5 p-2 ring-1 ring-white/10">
	                        <div className="flex items-center justify-between gap-2">
	                          <div className="text-xs font-semibold text-white/70">Akashic Reservoir</div>
	                          <div className="text-[11px] font-semibold text-white/50">Phase: {pulsePhase}</div>
	                        </div>
	                        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
	                          {game.reservoir ? (
	                            <div className="flex flex-col items-center gap-1">
	                              <PulseCardPreview card={game.reservoir} />
	                            </div>
	                          ) : null}
	                          {game.reservoir2 ? (
	                            <div className="flex flex-col items-center gap-1">
	                              <PulseCardPreview card={game.reservoir2} />
	                            </div>
	                          ) : null}
	                          {!game.reservoir && !game.reservoir2 ? (
	                            <div className="text-sm text-white/60">No reservoir.</div>
	                          ) : null}
	                        </div>
	                      </div>

                        <div className="max-w-[10vw] grid grid-rows-2 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => setShowDiscardModal(true)}
                          className="flex items-center justify-center rounded-full bg-white/10 px-3 py-2 text-sm font-extrabold text-white ring-1 ring-white/10 hover:bg-white/15"
                          aria-label="Inspect discard pile"
                          title="Discard pile"
                        >
                          🗑 <span className="ml-2 text-[11px] font-semibold text-white/70">{discardAll.length}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowLogModal(true)}
                          className="flex items-center justify-center rounded-full bg-white/10 px-3 py-2 text-sm font-extrabold text-white ring-1 ring-white/10 hover:bg-white/15"
                          aria-label="Inspect history"
                          title="History"
                        >
                          📜 <span className="ml-2 text-[11px] font-semibold text-white/70">{outcomeLog.length}</span>
                        </button>
                      </div>
                        </div>

                        <div className="min-h-0 rounded-3xl bg-white/5 p-3 ring-1 ring-white/10">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-white/70">Played cards</div>
                          <div className="flex flex-wrap items-center gap-2">
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
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

        <PlayerBottomPanel
          seatTag={seatLabel(selectedSeat)}
          playerName={selectedName}
          viewOnly={Boolean(selectedUid && !canActForSelected)}
          message={
            <CommunionExchangePanel
              exchange={exchange as any}
              pending={exchangePending}
              canOffer={canOfferExchange}
              canReturn={canReturnExchange}
              recipients={exchangeRecipients}
              fromHand={exchange?.from ? (hands[exchange.from] ?? []) : []}
              toHand={exchange?.to ? (hands[exchange.to] ?? []) : []}
              selectedCardId={selectedCardId}
              busy={busy}
              onOfferTo={(to, cardId) =>
                void guarded(async () => {
                  if (!uid || !gameId || !exchange?.from) return;
                  await offerExchangeCard(gameId, uid, exchange.from, to, cardId);
                })
              }
              onReturn={(cardId) =>
                void guarded(async () => {
                  if (!uid || !gameId || !exchange?.to) return;
                  await returnExchangeCard(gameId, uid, exchange.to, cardId);
                })
              }
            />
          }
          canSeeHand={canSeeSelectedHand}
          hand={canSeeSelectedHand ? selectedHand : selectedHandRaw}
          selectedCardId={selectedCardId}
          onToggleSelectCard={(cardId) => setSelectedCardId((prev) => (prev === cardId ? null : cardId))}
          canPlaySelected={Boolean(selectedCardId && canPlayFromSelected)}
          onPlaySelected={() =>
            void guarded(async () => {
              if (!uid || !gameId || !actingSeat || !selectedCardId) return;
              await playCard(gameId, uid, actingSeat, selectedCardId);
            })
          }
          canOverflowSelected={Boolean(selectedCardId && canAuxBatteryFromSelected)}
          onOverflowSelected={() =>
            void guarded(async () => {
              if (!uid || !gameId || !actingSeat || !selectedCardId) return;
              await playAuxBatteryCard(gameId, uid, actingSeat, selectedCardId);
            })
          }
          busy={busy}
          icons={
            <>
              <div ref={facultyPopoverRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowFacultyModal((v) => !v)}
                  disabled={!selectedPartDetail}
                  className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10 text-sm font-extrabold text-white ring-1 ring-white/10 transition hover:bg-white/15 disabled:opacity-40"
                  title={selectedPartDetail ? selectedPartDetail.name : "No faculty"}
                  aria-haspopup="dialog"
                  aria-expanded={showFacultyModal}
                >
                  ✦
                </button>

                {showFacultyModal && (
                  <div className="absolute bottom-full right-0 z-50 mb-2 w-[min(320px,calc(100vw-2rem))]">
                    <div className="rounded-3xl bg-slate-950 p-4 text-white shadow-2xl ring-1 ring-white/10">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-white/60">Faculty</div>
                          <div className="mt-1 truncate text-sm font-extrabold text-white">
                            {seatLabel(selectedSeat)} • {selectedName}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowFacultyModal(false)}
                          className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/15"
                          aria-label="Close faculty details"
                        >
                          Close
                        </button>
                      </div>

                      {selectedPartDetail ? (
                        <div className="mt-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-extrabold text-white">{selectedPartDetail.name}</div>
                            <div className="flex items-center gap-2">
                              {selectedPartToken && (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                                    selectedPartToken.tone === "good"
                                      ? "bg-emerald-400/20 text-emerald-200 ring-emerald-200/20"
                                      : "bg-white/10 text-white/70 ring-white/10"
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
                          <div className="mt-2 text-[11px] leading-relaxed text-white/80">{selectedPartDetail.effect}</div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-2xl bg-white/5 p-3 text-[11px] text-white/70 ring-1 ring-white/10">
                          No faculty chosen yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/75 ring-1 ring-white/10">
                🂠 {selectedHandRaw.length}
              </div>
            </>
          }
          hiddenNote={
            !canSeeSelectedHand && selectedUid ? (
              <>Viewing another player — cards are hidden.</>
            ) : null
          }
        />
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
              <div className="mt-2 max-h-[60vh] overflow-visible rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
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

            <div className="mt-4 max-h-[70vh] overflow-visible rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
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

      {/* Communion exchange now lives in the bottom hand panel (non-blocking). */}
    </div>
  );
}
