import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addBot,
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
import { getAllLocations, getLocationById, getLocationsForStage, getPartById, type LocationCard } from "../game/locations";
import { CommunionExchangePanel, PlayerBottomPanel } from "../components/game/PlayerBottomPanel";
import { DiscardModal, OutcomeHistoryModal, TerrainDeckModal } from "../components/game/GameModals";
import type { PlayerSlot, Players } from "../types";
import { GameLobbyView } from "./game/GameLobbyView";
import { ChooseLocationPhase } from "./game/phases/ChooseLocationPhase";
import { ChoosePartsPhase } from "./game/phases/ChoosePartsPhase";
import { PlayPhase } from "./game/phases/PlayPhase";
import { useMobileLayout } from "./game/hooks/useMobileLayout";
import {
  SLOTS,
  canControlSeat,
  displayNameForUser,
  groupSeatsByValue,
  imgSrc,
  isBotUid,
  playerLabel,
  seatLabel,
  seatOrder,
} from "./game/gameUtils";

export default function Game() {
  const nav = useNavigate();
  const { gameId } = useParams();
  const { user } = useAuthUser();
  const uid = user?.uid ?? null;
  const isMobileLayout = useMobileLayout();
  const displayName = useMemo(() => displayNameForUser(user), [user]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [inviteUid, setInviteUid] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showTerrainModal, setShowTerrainModal] = useState(false);
  const [showFacultyModal, setShowFacultyModal] = useState(false);
  const [showLocationInfoModal, setShowLocationInfoModal] = useState(false);
  const [locationCarouselIndex, setLocationCarouselIndex] = useState(0);
  const [resolvingLocationId, setResolvingLocationId] = useState<string | null>(null);
  const resolvingVotesKeyRef = useRef<string | null>(null);
  const confirmingLocationRef = useRef(false);
  const [sparkAnim, setSparkAnim] = useState<{ type: "gain" | "loss"; tick: number } | null>(null);
  const [frictionAnim, setFrictionAnim] = useState<{ type: "up" | "down"; tick: number } | null>(null);
  const sparkAnimTimerRef = useRef<number | null>(null);
  const frictionAnimTimerRef = useRef<number | null>(null);
  const prevSparkRef = useRef<number | null>(null);
  const prevFrictionRef = useRef<number | null>(null);

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
    setShowLocationInfoModal(false);
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
    if (!showFacultyModal && !showLocationInfoModal) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowFacultyModal(false);
        setShowLocationInfoModal(false);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [showFacultyModal, showLocationInfoModal]);

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

  const sparkValue = game?.golem?.hp ?? 5;
  const frictionValue = game?.golem?.heat ?? 0;

  useEffect(() => {
    return () => {
      if (sparkAnimTimerRef.current) window.clearTimeout(sparkAnimTimerRef.current);
      if (frictionAnimTimerRef.current) window.clearTimeout(frictionAnimTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!game || game.status === "lobby") {
      prevSparkRef.current = null;
      prevFrictionRef.current = null;
      return;
    }

    const prevSpark = prevSparkRef.current;
    const prevFriction = prevFrictionRef.current;

    if (prevSpark !== null) {
      if (sparkValue > prevSpark) {
        setSparkAnim({ type: "gain", tick: Date.now() });
        if (sparkAnimTimerRef.current) window.clearTimeout(sparkAnimTimerRef.current);
        sparkAnimTimerRef.current = window.setTimeout(() => setSparkAnim(null), 900);
      } else if (sparkValue < prevSpark) {
        setSparkAnim({ type: "loss", tick: Date.now() });
        if (sparkAnimTimerRef.current) window.clearTimeout(sparkAnimTimerRef.current);
        sparkAnimTimerRef.current = window.setTimeout(() => setSparkAnim(null), 900);
      }
    }

    if (prevFriction !== null) {
      if (frictionValue > prevFriction) {
        setFrictionAnim({ type: "up", tick: Date.now() });
        if (frictionAnimTimerRef.current) window.clearTimeout(frictionAnimTimerRef.current);
        frictionAnimTimerRef.current = window.setTimeout(() => setFrictionAnim(null), 900);
      } else if (frictionValue < prevFriction) {
        setFrictionAnim({ type: "down", tick: Date.now() });
        if (frictionAnimTimerRef.current) window.clearTimeout(frictionAnimTimerRef.current);
        frictionAnimTimerRef.current = window.setTimeout(() => setFrictionAnim(null), 900);
      }
    }

    prevSparkRef.current = sparkValue;
    prevFrictionRef.current = frictionValue;
  }, [game, sparkValue, frictionValue]);

  useEffect(() => {
    if (!game || game.phase !== "choose_location") {
      setResolvingLocationId(null);
      resolvingVotesKeyRef.current = null;
      confirmingLocationRef.current = false;
      return;
    }

    const locationVotes = game.locationVotes ?? {};
    const playersNow = game.players ?? {};
    const allVotesIn = SLOTS.every((s) => Boolean(playersNow[s]) && Boolean(locationVotes[s]));
    if (!allVotesIn || resolvingLocationId || confirmingLocationRef.current) return;

    const key = SLOTS.map((s) => `${s}:${locationVotes[s] ?? ""}`).join("|");
    if (resolvingVotesKeyRef.current === key) return;

    const counts = new Map<string, number>();
    for (const seat of SLOTS) {
      const vote = locationVotes[seat];
      if (!vote) continue;
      counts.set(vote, (counts.get(vote) ?? 0) + 1);
    }

    let best = 0;
    let tied: string[] = [];
    counts.forEach((c, k) => {
      if (c > best) {
        best = c;
        tied = [k];
      } else if (c === best) {
        tied.push(k);
      }
    });
    if (!tied.length) return;

    tied.sort();
    const base = `${gameId ?? ""}|${key}`;
    let hash = 0;
    for (let i = 0; i < base.length; i += 1) {
      hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
    }
    const winnerId = tied[hash % tied.length] ?? null;
    if (!winnerId) return;

    resolvingVotesKeyRef.current = key;
    setResolvingLocationId(winnerId);
  }, [game, gameId, resolvingLocationId]);

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

  if (game.status === "lobby") {
    return (
      <GameLobbyView
        game={game}
        gameId={gameId}
        players={players}
        uid={uid}
        displayName={displayName}
        isHost={isHost}
        isPlayer={isPlayer}
        busy={busy}
        full={full}
        msg={msg}
        inviteUid={inviteUid}
        onInviteUidChange={setInviteUid}
        onOpenLobby={() => nav("/")}
        onOpenProfile={() => nav("/me")}
        onJoin={() => void onJoin()}
        onLeave={() => void onLeave()}
        onAddBot={() => void onAddBot()}
        onStart={() => void onStart()}
        onInvite={() => void onInvite()}
        onRevoke={(targetUid) => void onRevoke(targetUid)}
        onRemoveBot={(botUid) => void onRemoveBot(botUid)}
      />
    );
  }

  const spark = sparkValue;
  const friction = frictionValue;
  const sphere = game.chapter ?? 1;

  const location = getLocationById(game.locationId ?? null);
  const locationOptions = (
    game.locationOptions ??
    (game.gameMode === "single_location"
      ? getAllLocations().map((l) => l.id)
      : getLocationsForStage(game.chapter ?? 1).map((l) => l.id))
  )
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

  const allLocationVotesIn =
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
  const ABILITY_OVERSHOOT_SHIELD = "once_per_chapter_prevent_first_overshoot_damage";

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
    if (selectedHasEffect(ABILITY_OVERSHOOT_SHIELD)) {
      const used = Boolean(selectedAbilityUsed[ABILITY_OVERSHOOT_SHIELD]);
      return { label: used ? "Shield used" : "Shield ready", tone: used ? "muted" : "good" } as const;
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

  const carouselCurrentLocation =
    locationOptions.length > 0
      ? locationOptions[((locationCarouselIndex % locationOptions.length) + locationOptions.length) % locationOptions.length]
      : null;
  const sphereImageUrl = imgSrc(carouselCurrentLocation?.sphereImage ?? location?.sphereImage ?? null);
  const locationImageUrl = imgSrc(location?.image ?? null);

  async function onLocationResolveAnimationDone() {
    if (!uid || !gameId || !isHost || !resolvingLocationId || confirmingLocationRef.current) return;
    confirmingLocationRef.current = true;
    await guarded(async () => {
      if (!uid || !gameId || !resolvingLocationId) return;
      await confirmLocation(gameId, uid, resolvingLocationId);
    });
    confirmingLocationRef.current = false;
  }

  return (
    <div className="h-full w-full text-white">
      <div
        className={`grid h-full gap-1 ${
          isMobileLayout ? "grid-rows-[7%_6%_minmax(0,1fr)_23%]" : "grid-rows-[5%_5%_minmax(0,1fr)_26%]"
        }`}
      >
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
            {(game.phase !== "play" || isMobileLayout) && (
              <>
                <div className="shrink-0 rounded-2xl bg-white/5 px-2 py-1 text-[10px] font-extrabold text-white ring-1 ring-white/10">
                  ✦ {spark}
                </div>
                <div className="shrink-0 rounded-2xl bg-white/5 px-2 py-1 text-[10px] font-extrabold text-white ring-1 ring-white/10">
                  ⟁ {friction}
                </div>
              </>
            )}
            <div className="shrink-0 rounded-2xl bg-white/5 px-2 py-1 text-[10px] font-semibold text-white/70 ring-1 ring-white/10">
              Sphere <span className="ml-1 font-extrabold text-white">{sphere}</span>
            </div>
            <div className={`min-w-0 flex-1 truncate font-semibold text-white/70 ${isMobileLayout ? "text-[10px]" : "text-[11px]"}`}>
              {msg ? (
                <span className="text-rose-200">{msg}</span>
              ) : exchangeStatusLine ? (
                <span className="text-amber-100/90">{exchangeStatusLine}</span>
              ) : (
                `Phase: ${game.phase ?? "—"}`
              )}
            </div>
            {isMobileLayout && location?.rule ? (
              <button
                type="button"
                onClick={() => setShowLocationInfoModal(true)}
                className="shrink-0 rounded-xl bg-white/10 px-2 py-1 text-[11px] font-extrabold text-white ring-1 ring-white/10 hover:bg-white/15"
                aria-label="Open location rule"
                title="Location rule"
              >
                ⓘ
              </button>
            ) : null}
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
                  <ChooseLocationPhase
                    sphere={carouselCurrentLocation?.sphere ?? sphere}
                    sphereImageUrl={sphereImageUrl}
                    locationOptions={locationOptions}
                    voteByValue={voteByValue}
                    locationCarouselIndex={locationCarouselIndex}
                    setLocationCarouselIndex={setLocationCarouselIndex}
                    busy={busy}
                    voteLocked={allLocationVotesIn}
                    resolvingWinnerId={allLocationVotesIn ? resolvingLocationId : null}
                    onResolveAnimationDone={onLocationResolveAnimationDone}
                    onVoteLocation={(locationId) => void onVoteLocation(locationId)}
                  />
                )}

                {game.phase === "choose_parts" && location && (
                  <ChoosePartsPhase
                    location={location}
                    locationImageUrl={locationImageUrl}
                    selectedSeat={selectedSeat}
                    pickingSeat={actingSeat ?? selectedSeat}
                    canActForSelected={canActForSelected}
                    picksByValue={picksByValue}
                    isHost={isHost}
                    busy={busy}
                    canConfirmParts={canConfirmParts}
                    onPickPart={(partId) => void onPickPart(partId)}
                    onConfirmParts={() => void onConfirmParts()}
                  />
                )}

                {game.phase === "play" && (
                  <PlayPhase
                    isMobileLayout={isMobileLayout}
                    locationName={location?.name ?? null}
                    locationRule={location?.rule ?? null}
                    locationImageUrl={locationImageUrl}
                    locationTokens={locationTokens}
                    spark={spark}
                    friction={friction}
                    sparkAnimClassName={
                      sparkAnim?.type === "gain"
                        ? "spark-stat-gain"
                        : sparkAnim?.type === "loss"
                          ? "spark-stat-loss"
                          : undefined
                    }
                    frictionAnimClassName={
                      frictionAnim?.type === "up"
                        ? "friction-stat-up"
                        : frictionAnim?.type === "down"
                          ? "friction-stat-down"
                          : undefined
                    }
                    terrainDeckLength={terrainDeck.length}
                    terrainRemaining={terrainRemaining}
                    canPeekTerrainDeck={
                      !isPreSelection && SLOTS.some((s) => seatHasEffect(s, "peek_terrain_deck"))
                    }
                    onOpenTerrainDeck={() => setShowTerrainModal(true)}
                    terrain={terrain}
                    terrainHiddenState={
                      isPreSelection
                        ? "pre_selection"
                        : selectedHasEffect("hide_terrain_until_played") &&
                            pulsePhase === "selection" &&
                            !played[selectedSeat]?.card
                          ? "hidden_until_played"
                          : null
                    }
                    lastOutcomeResult={game.lastOutcome?.result}
                    reservoir={game.reservoir}
                    reservoir2={game.reservoir2}
                    pulsePhase={pulsePhase}
                    isHost={isHost}
                    busy={busy}
                    haveAllPlayed={haveAllPlayed}
                    exchangePending={exchangePending}
                    onEndActions={() =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await endActions(gameId, uid);
                      })
                    }
                    played={played}
                    players={players}
                    playerNames={game.playerNames}
                    isOwnOrControlledSeat={(seat) => {
                      const seatUid = players[seat] ?? "";
                      return Boolean(uid && (seatUid === uid || (isHost && isBotUid(seatUid) && activeSeat === seat)));
                    }}
                    canSwapR1Seat={(seat) =>
                      Boolean(
                        pulsePhase === "actions" && uid && gameId && game.reservoir && canControlSeat(game, uid, seat)
                      )
                    }
                    canSwapR2Seat={(seat) =>
                      Boolean(
                        pulsePhase === "actions" && uid && gameId && game.reservoir2 && canControlSeat(game, uid, seat)
                      )
                    }
                    canFuseSeat={(seat) => Boolean(fuseAvailable && played[seat]?.card && played[seat]?.valueOverride !== 0)}
                    onSwapR1={(seat) =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await swapWithReservoir(gameId, uid, seat, 1);
                      })
                    }
                    onSwapR2={(seat) =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await swapWithReservoir(gameId, uid, seat, 2);
                      })
                    }
                    onFuse={(seat) =>
                      void guarded(async () => {
                        if (!uid || !gameId || !fuseSeat) return;
                        await useFuse(gameId, uid, fuseSeat, seat);
                      })
                    }
                  />
                )}
              </div>
            </div>
          </section>

        {game.phase !== "choose_location" && game.phase !== "choose_parts" && (
          <PlayerBottomPanel
            mobileLayout={isMobileLayout}
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
            handCount={selectedHandRaw.length}
            busy={busy}
            icons={
              <>
                <button
                  type="button"
                  onClick={() => setShowFacultyModal(true)}
                  disabled={!selectedPartDetail}
                  className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10 text-sm font-extrabold text-white ring-1 ring-white/10 transition hover:bg-white/15 disabled:opacity-40"
                  title={selectedPartDetail ? selectedPartDetail.name : "No faculty"}
                  aria-haspopup="dialog"
                  aria-expanded={showFacultyModal}
                >
                  ✦
                </button>
                <button
                  type="button"
                  onClick={() => setShowDiscardModal(true)}
                  className="flex h-9 items-center gap-1 rounded-2xl bg-white/10 px-2 text-[11px] font-extrabold text-white ring-1 ring-white/10 hover:bg-white/15"
                  aria-label="Inspect discard pile"
                  title="Discard pile"
                >
                  🗑 <span className="font-semibold text-white/70">{discardAll.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogModal(true)}
                  className="flex h-9 items-center gap-1 rounded-2xl bg-white/10 px-2 text-[11px] font-extrabold text-white ring-1 ring-white/10 hover:bg-white/15"
                  aria-label="Inspect history"
                  title="History"
                >
                  📜 <span className="font-semibold text-white/70">{outcomeLog.length}</span>
                </button>
              </>
            }
            hiddenNote={
              !canSeeSelectedHand && selectedUid ? (
                <>Viewing another player — cards are hidden.</>
              ) : null
            }
          />
        )}
      </div>

      {showFacultyModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowFacultyModal(false);
          }}
        >
          <div className="w-full max-w-md rounded-3xl bg-slate-950 p-4 text-white shadow-2xl ring-1 ring-white/10">
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

      {showLocationInfoModal && isMobileLayout && location?.rule && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowLocationInfoModal(false);
          }}
        >
          <div className="w-full max-w-md rounded-3xl bg-slate-950 p-4 text-white shadow-2xl ring-1 ring-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-white/60">Location rule</div>
                <div className="mt-1 truncate text-sm font-extrabold text-white">{location.name}</div>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationInfoModal(false)}
                className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/15"
              >
                Close
              </button>
            </div>
            <div className="mt-3 rounded-2xl bg-white/5 p-3 text-[12px] leading-relaxed text-white/85 ring-1 ring-white/10">
              {location.rule}
            </div>
          </div>
        </div>
      )}

      <DiscardModal
        open={showDiscardModal}
        onClose={() => setShowDiscardModal(false)}
        discardAll={discardAll}
        lastDiscarded={lastDiscarded}
      />

      <TerrainDeckModal
        open={showTerrainModal}
        onClose={() => setShowTerrainModal(false)}
        terrainDeck={terrainDeck}
        terrainIndex={terrainIndex}
      />

      <OutcomeHistoryModal
        open={showLogModal}
        onClose={() => setShowLogModal(false)}
        outcomeLog={outcomeLog}
      />

      {/* Communion exchange now lives in the bottom hand panel (non-blocking). */}
    </div>
  );
}
