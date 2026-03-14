import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addBot,
  confirmLocation,
  confirmSigils,
  confirmParts,
  completeGame,
  surrenderGame,
  confirmSelection,
  endActions,
  getMySlot,
  invitePlayer,
  joinGame,
  leaveGame,
  offerExchangeCard,
  offerConductorExchangeCards,
  playDiscardSigilCard,
  playerCount,
  playCard,
  playAuxBatteryCard,
  passCardToConductor,
  returnExchangeCard,
  returnConductorExchangeCards,
  revokeInvite,
  removeBot,
  setLocationVote,
  setResonanceGiftSeat,
  setSigilDraftAssignment,
  setPlayedCardValueChoice,
  togglePendingDiscardSelection,
  confirmPendingDiscardSelection,
  setPendingRecoverSelection,
  confirmPendingRecoverSelection,
  setPartPick,
  setPseudoController,
  startGame,
  subscribeGame,
  swapWithReservoir,
  useBalancingScale,
  useHarmonicAmplifier,
  useBlackSeaSigilDraw,
  useChapterMulligan,
  useFuse,
  useLensOfTiphareth,
  useShatteredClayShift,
  skipChapterMulligan,
  useSteamSigilResonance,
  useTemperedCrucible,
  useSteamOvertonesZero,
  useAcidRecomposition,
  type GameSummary,
} from "../lib/firestoreGames";
import { useAuthUser } from "../lib/useAuth";
import {
  getAllLocations,
  getLocationById,
  getLocationsForStage,
  getPartById,
  getSigilById,
  type LocationCard,
  type SigilDef,
} from "../game/locations";
import {
  AssignedFacultyPanel,
  type AssignedSigilDetail,
} from "../components/game/AssignedFacultyPanel";
import { PlayerBottomPanel } from "../components/game/PlayerBottomPanel";
import { DiscardModal, GameNoticeToast, OutcomeHistoryModal, TerrainDeckModal } from "../components/game/GameModals";
import type { PlayerSlot, Players } from "../types";
import { bestFitSelection, pulseCardValueOptions } from "../lib/game/scoring";
import { GameLobbyView } from "./game/GameLobbyView";
import { ChooseLocationPhase } from "./game/phases/ChooseLocationPhase";
import { ChoosePartsPhase } from "./game/phases/ChoosePartsPhase";
import { ChooseSigilsPhase } from "./game/phases/ChooseSigilsPhase";
import { PlayPhase } from "./game/phases/PlayPhase";
import { useMobileLayout } from "./game/hooks/useMobileLayout";
import {
  SLOTS,
  canControlSeat,
  displayNameForUser,
  groupSeatsByValue,
  imgSrc,
  isBotUid,
  isSharedPseudoUid,
  playerLabel,
  seatLabel,
  seatOrder,
} from "./game/gameUtils";

type SeatValueChoiceInfo = {
  primaryOptions: number[];
  extraOptions: number[];
  primarySuggested?: number;
  extraSuggested?: number;
  primarySelected?: number;
  extraSelected?: number;
};

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
  const [discardModalMode, setDiscardModalMode] = useState<"inspect" | "play_from_discard" | "recover_from_discard">("inspect");
  const [showLogModal, setShowLogModal] = useState(false);
  const [showTerrainModal, setShowTerrainModal] = useState(false);
  const [showFacultyModal, setShowFacultyModal] = useState(false);
  const [showLocationInfoModal, setShowLocationInfoModal] = useState(false);
  const [activeNotice, setActiveNotice] = useState<GameSummary["uiNotice"] | null>(null);
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<string[]>([]);
  const [handActionMode, setHandActionMode] = useState<"black_sea" | "shattered_clay" | "mulligan" | null>(null);
  const [handActionSelectedIds, setHandActionSelectedIds] = useState<string[]>([]);
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
  const targetPlayers = (game?.targetPlayers ?? 3) as 2 | 3;
  const mySlot = useMemo(() => (uid && game ? getMySlot(players, uid) : null), [uid, game, players]);
  const isHost = Boolean(uid && game?.createdBy && uid === game.createdBy);
  const isPlayer = Boolean(mySlot);
  const full =
    targetPlayers === 2
      ? Boolean(players.p1) && Boolean(players.p2)
      : playerCount(players) >= 3;

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
    setHandActionMode(null);
    setHandActionSelectedIds([]);
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
    game?.exchange?.reason,
    game?.players?.p1,
    game?.players?.p2,
    game?.players?.p3,
    game?.createdBy,
    uid,
  ]);

  useEffect(() => {
    if (game?.exchange?.reason !== "conductor_trade") return;
    setSelectedCardId(null);
    setHandActionSelectedIds([]);
  }, [game?.exchange?.reason, game?.exchange?.status, game?.exchange?.from, game?.exchange?.to]);

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

  async function onSurrender() {
    return guarded(async () => {
      if (!uid || !gameId) return;
      await surrenderGame(gameId, uid);
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

  useEffect(() => {
    if (!handActionMode) return;
    if (!game || game.phase !== "play") {
      setHandActionMode(null);
      setHandActionSelectedIds([]);
      return;
    }
    const pulsePhaseNow = game.pulsePhase ?? "selection";
    if (handActionMode === "black_sea" && pulsePhaseNow !== "selection" && pulsePhaseNow !== "pre_selection") {
      setHandActionMode(null);
      setHandActionSelectedIds([]);
    }
    if (handActionMode === "shattered_clay" && pulsePhaseNow !== "actions") {
      setHandActionMode(null);
      setHandActionSelectedIds([]);
    }
    if (handActionMode === "mulligan") {
      const chapterMulliganLocked = Boolean(game.chapterGlobalUsed?.chapter_mulligan_locked);
      const playedNow = game.played ?? {};
      const anyPlayed = SLOTS.some((seat) => Boolean(playedNow[seat]?.card));
      const atChapterStart = (game.step ?? 1) === 1 && (game.terrainIndex ?? 0) === 0;
      const canStay = (pulsePhaseNow === "selection" || pulsePhaseNow === "pre_selection") && atChapterStart && !chapterMulliganLocked && !anyPlayed;
      if (!canStay) {
        setHandActionMode(null);
        setHandActionSelectedIds([]);
      }
    }
  }, [game, handActionMode]);

  useEffect(() => {
    if (!handActionMode || !activeSeat || !game) return;
    const validIds = new Set((game.hands?.[activeSeat] ?? []).map((card) => card.id));
    setHandActionSelectedIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [handActionMode, activeSeat, game]);

  useEffect(() => {
    if (discardModalMode !== "recover_from_discard") return;
    if (game?.pulsePhase === "recover_selection") return;
    setShowDiscardModal(false);
    setDiscardModalMode("inspect");
  }, [discardModalMode, game?.pulsePhase]);

  useEffect(() => {
    if (!game?.uiNotice) {
      setActiveNotice(null);
      return;
    }
    if (dismissedNoticeIds.includes(game.uiNotice.id)) return;
    const noticeAgeMs = Date.now() - Number(game.uiNotice.atMs ?? Date.now());
    if (noticeAgeMs > 15000) return;
    if (activeNotice?.id === game.uiNotice.id) return;
    setActiveNotice(game.uiNotice);
  }, [game?.uiNotice, activeNotice?.id, dismissedNoticeIds]);

  useEffect(() => {
    if (!activeNotice) return;
    const noticeId = activeNotice.id;
    const timer = window.setTimeout(() => {
      setActiveNotice(null);
      setDismissedNoticeIds((prev) => {
        if (prev.includes(noticeId)) return prev;
        const next = [...prev, noticeId];
        return next.length > 60 ? next.slice(next.length - 60) : next;
      });
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [activeNotice]);

  useEffect(() => {
    if (!game || !uid) return;
    if (handActionMode) return;
    if (game.phase !== "play") return;

    const pulsePhaseNow = game.pulsePhase ?? "selection";
    if (pulsePhaseNow !== "selection" && pulsePhaseNow !== "pre_selection") return;
    if ((game.step ?? 1) !== 1 || (game.terrainIndex ?? 0) !== 0) return;
    if (Boolean(game.chapterGlobalUsed?.chapter_mulligan_locked)) return;

    const playedNow = game.played ?? {};
    const anyPlayed = SLOTS.some((seat) => Boolean(playedNow[seat]?.card));
    if (anyPlayed) return;

    const targetSeat = activeSeat ?? mySlot;
    if (!targetSeat) return;
    if (!canControlSeat(game, uid, targetSeat)) return;

    setHandActionSelectedIds([]);
    setSelectedCardId(null);
    setHandActionMode("mulligan");
  }, [game, uid, activeSeat, mySlot, handActionMode]);

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
        targetPlayers={targetPlayers}
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

  const sigilDraftPool: SigilDef[] = (game.sigilDraftPool ?? [])
    .map((id) => getSigilById(id))
    .filter((sigil): sigil is SigilDef => Boolean(sigil));
  const sigilAssignments = (game.sigilDraftAssignments ?? {}) as Record<string, PlayerSlot>;
  const sigilAssignedBySeat = (() => {
    const out: Partial<Record<PlayerSlot, string[]>> = {};
    for (const [sigilId, seat] of Object.entries(sigilAssignments)) {
      if (!seat) continue;
      out[seat] = out[seat] ?? [];
      out[seat]!.push(sigilId);
    }
    return out;
  })();
  const sigilAssignedCount = Object.keys(sigilAssignments).length;
  const sigilMaxPicks = Math.max(0, Number(game.sigilDraftMaxPicks ?? sigilDraftPool.length) || 0);
  const canConfirmSigils = (() => {
    if (!isHost || game.phase !== "choose_sigils") return false;
    if (game.sigilDraftContext === "reward_tier_1" || game.sigilDraftContext === "reward_location") {
      return sigilAssignedCount === sigilMaxPicks;
    }
    return sigilAssignedCount <= sigilMaxPicks;
  })();

  const controllableSeats = uid ? SLOTS.filter((s) => canControlSeat(game, uid, s)) : [];

  const hands = game.hands ?? {};
  const selectedSeat = viewSeat;
  const selectedUid = players[selectedSeat] ?? "";
  const selectedHandRaw = hands[selectedSeat] ?? [];
  const sharedSeatPublicView =
    targetPlayers === 2 &&
    selectedSeat === "p3" &&
    isSharedPseudoUid(selectedUid) &&
    Boolean(uid && (players.p1 === uid || players.p2 === uid));
  const canSeeSelectedHand = Boolean(uid && selectedUid && (canControlSeat(game, uid, selectedSeat) || sharedSeatPublicView));
  const canActForSelected = Boolean(uid && canControlSeat(game, uid, selectedSeat));
  const selectedHand = canSeeSelectedHand ? selectedHandRaw : [];

  const selectedCard = selectedHand.find((c) => c.id === selectedCardId) ?? null;

  const played = game.played ?? {};
  const skipThisPulse = game.skipThisPulse ?? {};
  const selectedSeatSkipped = Boolean(skipThisPulse[selectedSeat]);
  const pulsePhase = game.pulsePhase ?? "selection";
  const chapterMulliganLocked = Boolean(game.chapterGlobalUsed?.chapter_mulligan_locked);
  const anySeatPlayedThisPulse = SLOTS.some((seat) => Boolean(played[seat]?.card));
  const chapterMulliganAvailable =
    game.phase === "play" &&
    (pulsePhase === "selection" || pulsePhase === "pre_selection") &&
    (game.step ?? 1) === 1 &&
    (game.terrainIndex ?? 0) === 0 &&
    !chapterMulliganLocked &&
    !anySeatPlayedThisPulse;
  const canUseChapterMulliganForSelected = Boolean(
    chapterMulliganAvailable &&
      uid &&
      actingSeat &&
      actingSeat === selectedSeat &&
      canActForSelected
  );

  const haveAllPlayed = SLOTS.every(
    (s) => Boolean(players[s]) && (Boolean(skipThisPulse[s]) || Boolean(played[s]?.card))
  );

  const discardAll = game.pulseDiscard ?? [];
  const lastDiscarded = game.lastDiscarded ?? [];
  const outcomeLog = game.outcomeLog ?? [];

  const terrainDeck = game.terrainDeck ?? [];
  const terrainIndex = game.terrainIndex ?? 0;
  const useThreeTerrains = Boolean(location?.effects?.some((e) => e?.type === "reveal_three_terrains"));
  const terrainSet = useThreeTerrains
    ? terrainDeck.slice(terrainIndex, Math.min(terrainDeck.length, terrainIndex + 3))
    : terrainDeck.slice(terrainIndex, Math.min(terrainDeck.length, terrainIndex + 1));
  const terrain = terrainSet[0] ?? null;
  const terrainRemaining = Math.max(0, terrainDeck.length - (terrainIndex + Math.max(1, terrainSet.length)));
  const currentPulseKey = `${Math.max(1, Number(game.chapter ?? 1))}:${Math.max(1, Number(game.step ?? 1))}:${Math.max(
    0,
    Number(game.terrainIndex ?? 0)
  )}:${Math.max(0, outcomeLog.length)}`;
  const temperedCrucibleActiveThisPulse = game.frictionIgnoredPulseKey === currentPulseKey;
  const conductorSeat = SLOTS.find((s) => game.partPicks?.[s] === "conductor_of_streams") ?? null;
  const locationConductorOnlyTerrain = Boolean(
    location?.effects?.some((e) => e?.type === "conductor_only_terrain_view" || e?.type === "suit_only_communication")
  );
  const canSelectedSeatSeeTerrainRange = !locationConductorOnlyTerrain || !conductorSeat || selectedSeat === conductorSeat;
  const isPreSelection = pulsePhase === "pre_selection";
  const isDiscardSelectionPhase = pulsePhase === "discard_selection";
  const manualSelectionReveal = Boolean(
    location?.effects?.some((e) => e?.type === "selection_unbounded_cards" || e?.type === "conductor_plays_three_cards")
  );
  const exchange = game.exchange ?? null;
  const exchangePending = Boolean(exchange);
  const pendingDiscard = game.pendingDiscard ?? null;
  const pendingDiscardRequests = pendingDiscard?.requests ?? {};
  const pendingDiscardRequest = pendingDiscardRequests[selectedSeat] ?? null;
  const pendingDiscardSelections = pendingDiscard?.selections ?? {};
  const pendingDiscardSelectedIds = pendingDiscardSelections[selectedSeat] ?? [];
  const pendingDiscardConfirmed = Boolean(pendingDiscard?.confirmed?.[selectedSeat]);
  const pendingDiscardSeats = SLOTS.filter((seat) => Boolean(pendingDiscardRequests[seat]));
  const allPendingDiscardsConfirmed =
    isDiscardSelectionPhase &&
    pendingDiscardSeats.length > 0 &&
    pendingDiscardSeats.every((seat) => Boolean(pendingDiscard?.confirmed?.[seat]));
  const isRecoverSelectionPhase = pulsePhase === "recover_selection";
  const pendingRecover = game.pendingRecover ?? null;
  const pendingRecoverSeats =
    pendingRecover?.reason === "recursive_form_recover" ? pendingRecover.seats : [];
  const pendingRecoverSelectedId =
    pendingRecover?.reason === "recursive_form_recover" ? (pendingRecover.selections?.[selectedSeat] ?? null) : null;
  const pendingRecoverConfirmed = Boolean(
    pendingRecover?.reason === "recursive_form_recover" && pendingRecover?.confirmed?.[selectedSeat]
  );
  const allPendingRecoverConfirmed =
    isRecoverSelectionPhase &&
    pendingRecoverSeats.length > 0 &&
    pendingRecoverSeats.every((seat) => Boolean(pendingRecover?.confirmed?.[seat]));
  const pendingRecoverSelectedCard =
    pendingRecoverSelectedId ? discardAll.find((card) => card.id === pendingRecoverSelectedId) ?? null : null;
  const pendingRecoverSelectedLabel = pendingRecoverSelectedCard
    ? `${pendingRecoverSelectedCard.suit.toUpperCase()} ${
        pendingRecoverSelectedCard.suit === "prism"
          ? pendingRecoverSelectedCard.prismRange ?? "?"
          : pendingRecoverSelectedCard.value ?? "?"
      }`
    : null;

  const selectedName = selectedUid ? playerLabel(selectedUid, game.playerNames) : "Empty";
  const selectedPartId = game.partPicks?.[selectedSeat] ?? null;
  const selectedPartDef = getPartById(selectedPartId);
  const selectedPartDetail = (() => {
    if (!location || !selectedPartId) return null;
    const all = [...location.compulsory, ...location.optional];
    const p = all.find((x) => x.id === selectedPartId);
    return p ? { name: p.name, effect: p.effect, type: p.type } : null;
  })();
  const selectedSeatSigils = (game.seatSigils?.[selectedSeat] ?? [])
    .map((id) => getSigilById(id))
    .filter((sigil): sigil is SigilDef => Boolean(sigil));
  const selectedSeatSigilDetails: AssignedSigilDetail[] = selectedSeatSigils.map((sigil) => {
    const oncePerChapterEffect = sigil.effects.find(
      (effect) => effect.type.startsWith("once_per_chapter_") || effect.type === "play_from_discard_once"
    );
    const used = oncePerChapterEffect
      ? Boolean(game.chapterAbilityUsed?.[selectedSeat]?.[oncePerChapterEffect.type])
      : false;
    return {
      id: sigil.id,
      name: sigil.name,
      tier: sigil.tier,
      text: sigil.text,
      color: sigil.color,
      oncePerChapterKey: oncePerChapterEffect?.type,
      used,
    };
  });

  const seatList = SLOTS;
  const canManagePendingDiscardForSelected = Boolean(
    isDiscardSelectionPhase && pendingDiscardRequest && uid && canControlSeat(game, uid, selectedSeat)
  );
  const canManagePendingRecoverForSelected = Boolean(
    isRecoverSelectionPhase &&
      pendingRecover?.reason === "recursive_form_recover" &&
      pendingRecoverSeats.includes(selectedSeat) &&
      uid &&
      canControlSeat(game, uid, selectedSeat)
  );
  const effectsForSeat = (seat: PlayerSlot): any[] => {
    if (game.gameMode === "tutorial") return [];
    const out: any[] = [];
    const pid = game.partPicks?.[seat] ?? null;
    const def = getPartById(pid);
    if (def?.effects?.length) out.push(...def.effects);
    const sigilIds = game.seatSigils?.[seat] ?? [];
    for (const sigilId of sigilIds) {
      const sigil = getSigilById(sigilId);
      if (sigil?.effects?.length) out.push(...sigil.effects);
    }
    if (location?.effects?.length) out.push(...location.effects);
    return out;
  };
  const seatHasEffect = (seat: PlayerSlot, effectType: string): boolean =>
    effectsForSeat(seat).some((e) => e && e.type === effectType);
  const seatHasBalancingAmount = (seat: PlayerSlot, amount: 1 | 2): boolean => {
    return effectsForSeat(seat).some((effect: any) => {
      if (!effect || effect.type !== ABILITY_SIGIL_BALANCING_SCALE) return false;
      const amounts = Array.isArray(effect.amount) ? effect.amount : [1, 2];
      return amounts.map((value: number) => Math.max(1, Number(value) || 0)).includes(amount);
    });
  };

  const playedValueChoicesBySeat: Partial<Record<PlayerSlot, SeatValueChoiceInfo>> = (() => {
    const info: Partial<Record<PlayerSlot, SeatValueChoiceInfo>> = {};
    const optionRows: number[][] = [];
    const rowMeta: Array<{ seat: PlayerSlot; target: "primary" | "extra" }> = [];
    const locationReservoirAmplifies = Boolean(
      location?.effects?.some((effect) => effect?.type === "manifested_cards_multiplier_from_reservoir_if_suit_match")
    );
    const reservoirSuit = game.reservoir?.suit ?? null;
    const reservoirMultiplier =
      game.reservoir?.suit === "prism" ? 3 : Math.max(0, Number(game.reservoir?.value ?? 0));

    for (const seat of SLOTS) {
      const entry = played[seat];
      if (!entry?.card) continue;

      const seatEffects = effectsForSeat(seat);
      const valueDelta = seatEffects
        .filter((e) => e?.type === "pulse_value_delta")
        .reduce((sum, e) => sum + (Number((e as any).amount) || 0), 0);
      const valueMultiplier = seatEffects
        .filter((e) => e?.type === "pulse_value_multiplier")
        .reduce((product, e) => product * Math.max(1, Number((e as any).amount) || 1), 1);

      const primaryOptions =
        typeof entry.valueOverride === "number"
          ? [entry.valueOverride]
          : pulseCardValueOptions(entry.card, seatEffects, { terrainSuit: terrain?.suit ?? null }).map(
              (v) => (v + valueDelta) * valueMultiplier
            );
      const primaryOptionsWithLocation =
        locationReservoirAmplifies &&
        reservoirMultiplier > 0 &&
        reservoirSuit &&
        entry.card.suit === reservoirSuit
          ? primaryOptions.map((value) => value * reservoirMultiplier)
          : primaryOptions;
      const postRevealValueDelta = Number(entry.postRevealValueDelta ?? 0);
      const primaryShiftedOptions = postRevealValueDelta
        ? primaryOptionsWithLocation.map((value) => value + postRevealValueDelta)
        : primaryOptionsWithLocation;

      const seatInfo: SeatValueChoiceInfo = {
        primaryOptions: primaryShiftedOptions,
        extraOptions: [],
      };
      if (typeof entry.valueChoice === "number" && primaryShiftedOptions.includes(entry.valueChoice)) {
        seatInfo.primarySelected = entry.valueChoice;
      }

      optionRows.push(primaryShiftedOptions);
      rowMeta.push({ seat, target: "primary" });

      if (entry.extraCard) {
        const extraOptions = pulseCardValueOptions(entry.extraCard, seatEffects, {
          terrainSuit: terrain?.suit ?? null,
        }).map((v) => (v + valueDelta) * valueMultiplier);
        const extraOptionsWithLocation =
          locationReservoirAmplifies &&
          reservoirMultiplier > 0 &&
          reservoirSuit &&
          entry.extraCard.suit === reservoirSuit
            ? extraOptions.map((value) => value * reservoirMultiplier)
            : extraOptions;
        seatInfo.extraOptions = extraOptionsWithLocation;
        if (typeof entry.extraValueChoice === "number" && extraOptionsWithLocation.includes(entry.extraValueChoice)) {
          seatInfo.extraSelected = entry.extraValueChoice;
        }
        optionRows.push(extraOptionsWithLocation);
        rowMeta.push({ seat, target: "extra" });
      }

      info[seat] = seatInfo;
    }

    if (terrain && optionRows.length) {
      const selection = bestFitSelection(optionRows, terrain.min, terrain.max);
      selection.chosenValues.forEach((value, index) => {
        const meta = rowMeta[index];
        if (!meta) return;
        const seatInfo = info[meta.seat];
        if (!seatInfo) return;
        if (meta.target === "primary") seatInfo.primarySuggested = value;
        else seatInfo.extraSuggested = value;
      });
    }

    for (const seat of SLOTS) {
      const seatInfo = info[seat];
      if (!seatInfo) continue;
      if (seatInfo.primarySuggested === undefined) seatInfo.primarySuggested = seatInfo.primaryOptions[0];
      if (seatInfo.extraOptions.length && seatInfo.extraSuggested === undefined) {
        seatInfo.extraSuggested = seatInfo.extraOptions[0];
      }
    }

    return info;
  })();
  const playedValueMultiplierBySeat: Partial<Record<PlayerSlot, number>> = (() => {
    const info: Partial<Record<PlayerSlot, number>> = {};
    for (const seat of SLOTS) {
      const seatEffects = effectsForSeat(seat);
      info[seat] = seatEffects
        .filter((e) => e?.type === "pulse_value_multiplier")
        .reduce((product, e) => product * Math.max(1, Number((e as any).amount) || 1), 1);
    }
    return info;
  })();

  const selectedSeatEffects = effectsForSeat(selectedSeat);
  const selectedHasEffect = (type: string) => selectedSeatEffects.some((e) => e && e.type === type);

  const preSelectionSeats = SLOTS.filter((s) => seatHasEffect(s, "hide_terrain_until_played"));
  const preSelectionDone = preSelectionSeats.every((s) => skipThisPulse[s] || Boolean(played[s]?.card));
  const pendingVeiledSeatReveal = preSelectionSeats.some((s) => !skipThisPulse[s] && !played[s]?.card);

  const ABILITY_EXTRA_CARD = "once_per_chapter_extra_card_after_reveal";
  const ABILITY_FUSE = "once_per_chapter_fuse_to_zero_after_reveal";
  const ABILITY_OVERSHOOT_SHIELD = "once_per_chapter_prevent_first_overshoot_damage";
  const ABILITY_TIPHARETH_SWAP = "swap_and_skip_turn";
  const ABILITY_ANCHOR = "prevent_stall_limited_refill";
  const ABILITY_HARMONIC_AMPLIFIER = "pay_friction_double_manifested_total";
  const ABILITY_SIGIL_PLAY_FROM_DISCARD = "play_from_discard_once";
  const ABILITY_SIGIL_BLACK_SEA = "discard_x_draw_x_for_friction";
  const ABILITY_SIGIL_SHATTERED_CLAY = "discard_to_shift_value";
  const ABILITY_SIGIL_RESONANCE_GIFT = "resonance_grants_ally_refill";
  const ABILITY_SIGIL_BALANCING_SCALE = "post_reveal_reduce_if_top";
  const ABILITY_SIGIL_TEMPERED_CRUCIBLE = "once_per_chapter_ignore_friction_pulse";
  const ABILITY_SIGIL_STEAM_OVERTONES = "steam_zero_other_after_reveal";
  const ABILITY_SIGIL_ACID_RECOMPOSITION = "acid_add_reservoir_value";
  const locationHasConductorPassRule = Boolean(location?.effects?.some((e) => e?.type === "pre_selection_pass_to_conductor"));
  const conductorOnlySelection = Boolean(location?.effects?.some((e) => e?.type === "conductor_plays_three_cards"));
  const handActionModeActive = Boolean(handActionMode);
  const selectedHasPassedToConductor = Boolean(game.conductorPasses?.[selectedSeat]);
  const selectedSeatShouldPassToConductor = Boolean(
    locationHasConductorPassRule && conductorOnlySelection && conductorSeat && selectedSeat !== conductorSeat
  );
  const canPassToConductorFromSelected = Boolean(
    selectedCardId &&
      gameId &&
      uid &&
      canActForSelected &&
      actingSeat &&
      actingSeat === selectedSeat &&
      !chapterMulliganAvailable &&
      !handActionModeActive &&
      locationHasConductorPassRule &&
      conductorOnlySelection &&
      conductorSeat &&
      selectedSeat !== conductorSeat &&
      !selectedHasPassedToConductor &&
      !exchangePending &&
      (pulsePhase === "selection" || pulsePhase === "pre_selection")
  );
  const canPlayFromSelected = Boolean(
    gameId &&
      uid &&
      canActForSelected &&
      actingSeat &&
      actingSeat === selectedSeat &&
      !selectedSeatSkipped &&
      !handActionModeActive &&
      (conductorOnlySelection ? selectedSeat === conductorSeat : true) &&
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
      !handActionModeActive &&
      Boolean(played[selectedSeat]?.card) &&
      !Boolean(played[selectedSeat]?.extraCard) &&
      !(game.chapterAbilityUsed?.[selectedSeat]?.[ABILITY_EXTRA_CARD] ?? false)
  );
  const canTipharethSwapFromSelected = Boolean(
    gameId &&
      uid &&
      actingSeat &&
      actingSeat === selectedSeat &&
      selectedHasEffect(ABILITY_TIPHARETH_SWAP) &&
      pulsePhase === "actions" &&
      !handActionModeActive &&
      Boolean(played[selectedSeat]?.card) &&
      !Boolean(game.skipNextPulse?.[selectedSeat])
  );
  const canPlayFromDiscardSigilFromSelected = Boolean(
    gameId &&
      uid &&
      actingSeat &&
      actingSeat === selectedSeat &&
      canActForSelected &&
      selectedHasEffect(ABILITY_SIGIL_PLAY_FROM_DISCARD) &&
      !chapterMulliganAvailable &&
      (pulsePhase === "selection" || pulsePhase === "pre_selection") &&
      !selectedSeatSkipped &&
      !played[selectedSeat]?.card &&
      !exchangePending &&
      !(game.chapterAbilityUsed?.[selectedSeat]?.[ABILITY_SIGIL_PLAY_FROM_DISCARD] ?? false) &&
      (game.pulseDiscard?.length ?? 0) > 0 &&
      !location?.effects?.some((e) => e?.type === "remove_success_cards_from_game")
  );
  const canUseBlackSeaSigilFromSelected = Boolean(
    gameId &&
      uid &&
      actingSeat &&
      actingSeat === selectedSeat &&
      canActForSelected &&
      selectedHasEffect(ABILITY_SIGIL_BLACK_SEA) &&
      !chapterMulliganAvailable &&
      (pulsePhase === "selection" || pulsePhase === "pre_selection") &&
      !selectedSeatSkipped &&
      !played[selectedSeat]?.card &&
      !exchangePending &&
      selectedHandRaw.length > 0
  );
  const selectedHasShatteredClayShift = typeof (played[selectedSeat] as any)?.postRevealValueDelta === "number";
  const canUseShatteredClayFromSelected = Boolean(
    gameId &&
      uid &&
      actingSeat &&
      actingSeat === selectedSeat &&
      canActForSelected &&
      selectedHasEffect(ABILITY_SIGIL_SHATTERED_CLAY) &&
      pulsePhase === "actions" &&
      Boolean(played[selectedSeat]?.card) &&
      !selectedHasShatteredClayShift &&
      selectedHandRaw.length >= 2
  );
  const canUseTemperedCrucibleFromSelected = Boolean(
    gameId &&
      uid &&
      actingSeat &&
      actingSeat === selectedSeat &&
      canActForSelected &&
      selectedHasEffect(ABILITY_SIGIL_TEMPERED_CRUCIBLE) &&
      ["pre_selection", "selection", "actions", "discard_selection"].includes(pulsePhase) &&
      !(game.chapterAbilityUsed?.[selectedSeat]?.[ABILITY_SIGIL_TEMPERED_CRUCIBLE] ?? false)
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
  const exchangeIsConductorTrade = exchange?.reason === "conductor_trade";
  const exchangeRequiredCount = Math.max(1, Number(exchange?.requiredCount ?? exchange?.offeredCards?.length ?? 1));
  const exchangeAnchorCardId =
    exchangeIsConductorTrade && handActionSelectedIds.length
      ? handActionSelectedIds[handActionSelectedIds.length - 1] ?? null
      : null;

  const exchangeStatusLine = (() => {
    if (!exchangePending || !exchange) return null;
    if (exchange.status === "awaiting_offer") {
      const fromUid = players[exchange.from] ?? "";
      const fromName = fromUid ? playerLabel(fromUid, game.playerNames) : seatLabel(exchange.from);
      if (exchangeIsConductorTrade) {
        return canOfferExchange
          ? "Torrent Exchange: choose one or more cards, then choose who receives them."
          : `Waiting for ${fromName} to offer cards…`;
      }
      return canOfferExchange ? "The Communion of Vessels: offer a card to a player." : `Waiting for ${fromName} to exchange…`;
    }
    if (exchange.status === "awaiting_return") {
      const toSeat = exchange.to ?? null;
      const toUid = toSeat ? (players[toSeat] ?? "") : "";
      const toName = toUid ? playerLabel(toUid, game.playerNames) : (toSeat ? seatLabel(toSeat) : "recipient");
      if (exchangeIsConductorTrade) {
        return canReturnExchange
          ? `Torrent Exchange: return ${exchangeRequiredCount} chosen card${exchangeRequiredCount === 1 ? "" : "s"}.`
          : `Waiting for ${toName} to return ${exchangeRequiredCount} card${exchangeRequiredCount === 1 ? "" : "s"}…`;
      }
      return canReturnExchange ? "The Communion of Vessels: return a card to finish the exchange." : `Waiting for ${toName} to return a card…`;
    }
    return null;
  })();

  const discardStatusLine = (() => {
    if (!isDiscardSelectionPhase || !pendingDiscard) return null;
    const remaining = pendingDiscardSeats.filter((seat) => !pendingDiscard?.confirmed?.[seat]).length;
    const reasonLabel =
      pendingDiscard.reason === "acid_resonance"
        ? "Sigil discard selection"
        : pendingDiscard.reason === "undershoot_penalty"
          ? "Undershoot discard selection"
          : "Discard selection";
    if (remaining <= 0) {
      return isHost ? `${reasonLabel}: ready to resolve.` : `${reasonLabel}: waiting for host.`;
    }
    return `${reasonLabel}: ${remaining} seat${remaining === 1 ? "" : "s"} still choosing.`;
  })();
  const recoverStatusLine = (() => {
    if (!isRecoverSelectionPhase || pendingRecover?.reason !== "recursive_form_recover") return null;
    const remaining = pendingRecoverSeats.filter((seat) => !pendingRecover?.confirmed?.[seat]).length;
    if (remaining <= 0) {
      return isHost ? "Recursive Form: ready to resolve." : "Recursive Form: waiting for host.";
    }
    return `Recursive Form: ${remaining} seat${remaining === 1 ? "" : "s"} still choosing.`;
  })();

  const exchangeRecipients = (() => {
    if (!exchange || exchange.status !== "awaiting_offer") return [];
    return SLOTS.filter((s) => s !== exchange.from).map((s) => {
      const u = players[s];
      return { seat: s, name: u ? playerLabel(u, game.playerNames) : "Empty", enabled: Boolean(u) };
    });
  })();
  const exchangeCardActions = (() => {
    if (!exchangePending || !exchange) return [] as Array<{
      key: string;
      label: string;
      onClick: () => void;
      disabled?: boolean;
      className?: string;
      anchorCardId?: string;
    }>;
    if (exchangeIsConductorTrade && exchange.status === "awaiting_offer" && canOfferExchange) {
      const selectedIds = handActionSelectedIds.filter((cardId) => (hands[exchange.from] ?? []).some((card) => card.id === cardId));
      return exchangeRecipients.map((recipient) => ({
        key: `offer-many-${recipient.seat}`,
        label: `Offer ${selectedIds.length || "…"} to ${recipient.name}`,
        onClick: () =>
          void guarded(async () => {
            if (!uid || !gameId || !exchange?.from || !selectedIds.length) return;
            await offerConductorExchangeCards(gameId, uid, exchange.from, recipient.seat, selectedIds);
            setHandActionSelectedIds([]);
          }),
        disabled: !recipient.enabled || !selectedIds.length,
        anchorCardId: exchangeAnchorCardId ?? undefined,
      }));
    }
    if (exchangeIsConductorTrade && exchange.status === "awaiting_return" && canReturnExchange && exchange.to) {
      const selectedIds = handActionSelectedIds.filter((cardId) => (hands[exchange.to!] ?? []).some((card) => card.id === cardId));
      return [
        {
          key: "return-many",
          label: `Return ${exchangeRequiredCount} card${exchangeRequiredCount === 1 ? "" : "s"}`,
          onClick: () =>
            void guarded(async () => {
              if (!uid || !gameId || !exchange?.to) return;
              await returnConductorExchangeCards(gameId, uid, exchange.to, selectedIds);
              setHandActionSelectedIds([]);
            }),
          disabled: selectedIds.length !== exchangeRequiredCount,
          anchorCardId: exchangeAnchorCardId ?? undefined,
        },
      ];
    }
    if (!selectedCardId) return [];
    if (exchange.status === "awaiting_offer" && canOfferExchange) {
      const canUseCard = Boolean(exchange.from && (hands[exchange.from] ?? []).some((c) => c.id === selectedCardId));
      return exchangeRecipients.map((recipient) => ({
        key: `offer-${recipient.seat}`,
        label: `Offer to ${recipient.name}`,
        onClick: () =>
          void guarded(async () => {
            if (!uid || !gameId || !exchange?.from) return;
            await offerExchangeCard(gameId, uid, exchange.from, recipient.seat, selectedCardId);
          }),
        disabled: !recipient.enabled || !canUseCard,
      }));
    }
    if (exchange.status === "awaiting_return" && canReturnExchange && exchange.to) {
      const canUseCard = Boolean((hands[exchange.to] ?? []).some((c) => c.id === selectedCardId));
      return [
        {
          key: "return",
          label: "Return card",
          onClick: () =>
            void guarded(async () => {
            if (!uid || !gameId || !exchange?.to) return;
            await returnExchangeCard(gameId, uid, exchange.to, selectedCardId);
          }),
        disabled: !canUseCard,
      },
      ];
    }
    return [];
  })();
  const mulliganAnchorCardId = handActionMode === "mulligan" ? handActionSelectedIds[handActionSelectedIds.length - 1] ?? null : null;
  const mulliganCardActions = (() => {
    if (handActionMode !== "mulligan") return [] as Array<{
      key: string;
      label: string;
      onClick: () => void;
      disabled?: boolean;
      className?: string;
      anchorCardId?: string;
    }>;
    if (!mulliganAnchorCardId) return [];
    return [
      {
        key: "mulligan-confirm",
        label: "Mulligan",
        onClick: () =>
          void guarded(async () => {
            if (!uid || !gameId || !actingSeat) return;
            if (!handActionSelectedIds.length) return;
            await useChapterMulligan(gameId, uid, actingSeat, handActionSelectedIds);
            setHandActionSelectedIds([]);
            setHandActionMode(null);
          }),
        disabled: !canUseChapterMulliganForSelected || !handActionSelectedIds.length,
        anchorCardId: mulliganAnchorCardId,
      },
    ];
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
    if (selectedHasEffect(ABILITY_ANCHOR)) {
      const locked = Boolean(selectedAbilityUsed[ABILITY_ANCHOR]);
      return { label: locked ? "Anchor lock active" : "Anchor stable", tone: locked ? "muted" : "good" } as const;
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
  const showBottomHandPanel =
    game.phase !== "choose_location" && game.phase !== "choose_parts" && game.phase !== "choose_sigils";
  const isTwoPlayerSharedRun = targetPlayers === 2 && isSharedPseudoUid(players.p3 ?? null);
  const pseudoControllerUid = game.pseudoControllerUid ?? game.createdBy ?? null;
  const pseudoControllerName = pseudoControllerUid
    ? playerLabel(pseudoControllerUid, game.playerNames)
    : "Unassigned";
  const pseudoControllerOptions = (["p1", "p2"] as PlayerSlot[])
    .map((seat) => players[seat])
    .filter(Boolean) as string[];
  const canSetPseudoController = Boolean(uid && isTwoPlayerSharedRun && pseudoControllerOptions.includes(uid));
  const layoutRowsClass = isMobileLayout
    ? showBottomHandPanel
      ? "grid-rows-[7%_6%_minmax(0,1fr)_23%]"
      : "grid-rows-[7%_6%_minmax(0,1fr)]"
    : showBottomHandPanel
      ? "grid-rows-[5%_5%_minmax(0,1fr)_26%]"
      : "grid-rows-[5%_5%_minmax(0,1fr)]";

  async function onLocationResolveAnimationDone() {
    if (!uid || !gameId || !isPlayer || !resolvingLocationId || confirmingLocationRef.current) return;
    confirmingLocationRef.current = true;
    await guarded(async () => {
      if (!uid || !gameId || !resolvingLocationId) return;
      await confirmLocation(gameId, uid, resolvingLocationId);
    });
    confirmingLocationRef.current = false;
    setResolvingLocationId(null);
  }

  async function onCyclePlayedCardValue(seat: PlayerSlot, target: "primary" | "extra") {
    return guarded(async () => {
      if (!uid || !gameId) return;
      const seatInfo = playedValueChoicesBySeat[seat];
      if (!seatInfo) return;
      const options = target === "primary" ? seatInfo.primaryOptions : seatInfo.extraOptions;
      if (!options.length) return;
      const current =
        target === "primary"
          ? seatInfo.primarySelected ?? seatInfo.primarySuggested ?? options[0]
          : seatInfo.extraSelected ?? seatInfo.extraSuggested ?? options[0];
      const currentIndex = Math.max(0, options.indexOf(current));
      const nextValue = options[(currentIndex + 1) % options.length] ?? options[0];
      await setPlayedCardValueChoice(gameId, uid, seat, target, nextValue);
    });
  }

  const quickActionButtons = !handActionModeActive
    ? [
        ...(canPlayFromDiscardSigilFromSelected
          ? [
              {
                key: "play-from-discard",
                label: "Manifest from discard",
                className: "bg-violet-400 text-slate-950",
                onClick: () => {
                  setDiscardModalMode("play_from_discard");
                  setShowDiscardModal(true);
                },
              },
            ]
          : []),
        ...(canUseBlackSeaSigilFromSelected
          ? [
              {
                key: "black-sea",
                label: "Sigil of the Black Sea",
                className: "bg-sky-400 text-slate-950",
                onClick: () => {
                  setSelectedCardId(null);
                  setHandActionSelectedIds([]);
                  setHandActionMode("black_sea");
                },
              },
            ]
          : []),
        ...(canUseShatteredClayFromSelected
          ? [
              {
                key: "shattered-clay",
                label: "Shattered Clay ±3",
                className:
                  handActionMode === "shattered_clay"
                    ? "bg-amber-200 text-slate-950"
                    : "bg-amber-300 text-slate-950",
                onClick: () => {
                  setSelectedCardId(null);
                  setHandActionSelectedIds([]);
                  setHandActionMode((prev) => (prev === "shattered_clay" ? null : "shattered_clay"));
                },
              },
            ]
          : []),
        ...((selectedHasEffect(ABILITY_SIGIL_TEMPERED_CRUCIBLE) &&
        ["pre_selection", "selection", "actions", "discard_selection"].includes(pulsePhase) &&
        (canUseTemperedCrucibleFromSelected ||
          (temperedCrucibleActiveThisPulse &&
            Boolean(game.chapterAbilityUsed?.[selectedSeat]?.[ABILITY_SIGIL_TEMPERED_CRUCIBLE]))))
          ? [
              {
                key: "tempered-crucible",
                label: temperedCrucibleActiveThisPulse
                  ? "Tempered Crucible active (this Pulse)"
                  : "Activate Tempered Crucible",
                className: temperedCrucibleActiveThisPulse
                  ? "bg-rose-200 text-rose-950"
                  : "bg-rose-300 text-slate-950",
                disabled: !canUseTemperedCrucibleFromSelected,
                onClick: () =>
                  void guarded(async () => {
                    if (!uid || !gameId || !actingSeat) return;
                    await useTemperedCrucible(gameId, uid, actingSeat);
                  }),
              },
            ]
          : []),
      ]
    : [];

  const bottomMessage = isRecoverSelectionPhase ? (
    pendingRecover?.reason === "recursive_form_recover" && pendingRecoverSeats.includes(selectedSeat) ? (
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-white/80">
          Sigil of Recursive Form: choose 1 card from the discard pile to recover, or skip.
        </div>
        <div className="text-[11px] text-white/65">
          {pendingRecoverSelectedLabel ? `Selected card: ${pendingRecoverSelectedLabel}` : "No card selected."}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setDiscardModalMode("recover_from_discard");
              setShowDiscardModal(true);
            }}
            disabled={busy || !canManagePendingRecoverForSelected}
            className="rounded-2xl bg-violet-400 px-3 py-1.5 text-[11px] font-extrabold text-slate-950 shadow-sm disabled:opacity-40"
          >
            Open discard pile
          </button>
          <button
            type="button"
            onClick={() =>
              void guarded(async () => {
                if (!uid || !gameId) return;
                await confirmPendingRecoverSelection(gameId, uid, selectedSeat, true);
                await endActions(gameId, uid);
                setShowDiscardModal(false);
                setDiscardModalMode("inspect");
              })
            }
            disabled={busy || !canManagePendingRecoverForSelected || pendingRecoverConfirmed}
            className="rounded-2xl bg-white/20 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm disabled:opacity-40"
          >
            Skip
          </button>
        </div>
      </div>
    ) : (
      <div className="text-[11px] text-white/60">
        {allPendingRecoverConfirmed
          ? "All recursive recover choices are confirmed. Resolving…"
          : "Wait while the recursive recovery is decided."}
      </div>
    )
  ) : isDiscardSelectionPhase ? (
    pendingDiscardRequest ? (
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-white/80">{pendingDiscardRequest.label}</div>
        <div className="text-[11px] text-white/65">
          Selected {pendingDiscardSelectedIds.length} / required {pendingDiscardRequest.required}
          {pendingDiscardRequest.optional > 0 ? ` (+${pendingDiscardRequest.optional} optional)` : ""}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              void guarded(async () => {
                if (!uid || !gameId) return;
                await confirmPendingDiscardSelection(gameId, uid, selectedSeat, false);
              })
            }
            disabled={
              busy ||
              !canManagePendingDiscardForSelected ||
              pendingDiscardConfirmed ||
              pendingDiscardSelectedIds.length < pendingDiscardRequest.required
            }
            className="rounded-2xl bg-emerald-500 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm disabled:opacity-40"
          >
            {pendingDiscardConfirmed ? "Confirmed" : "Confirm discard"}
          </button>
          {pendingDiscardRequest.allowSkip && pendingDiscardRequest.required === 0 && (
            <button
              type="button"
              onClick={() =>
                void guarded(async () => {
                  if (!uid || !gameId) return;
                  await confirmPendingDiscardSelection(gameId, uid, selectedSeat, true);
                })
              }
              disabled={busy || !canManagePendingDiscardForSelected || pendingDiscardConfirmed}
              className="rounded-2xl bg-white/20 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm disabled:opacity-40"
            >
              Skip
            </button>
          )}
          {isHost && (
            <button
              type="button"
              onClick={() =>
                void guarded(async () => {
                  if (!uid || !gameId) return;
                  await endActions(gameId, uid);
                })
              }
              disabled={busy || !allPendingDiscardsConfirmed}
              className="rounded-2xl bg-sky-400 px-3 py-1.5 text-[11px] font-extrabold text-slate-950 shadow-sm disabled:opacity-40"
            >
              Resolve pulse
            </button>
          )}
        </div>
      </div>
    ) : (
      <div className="text-[11px] text-white/60">
        This seat has no discard choice.{" "}
        {isHost
          ? allPendingDiscardsConfirmed
            ? "You can resolve the pulse."
            : "Wait for other seats to confirm."
          : "Wait for other seats."}
      </div>
    )
  ) : exchangePending ? (
    <div className="text-[11px] text-white/75">
      {exchangeIsConductorTrade
        ? exchange?.status === "awaiting_offer"
          ? canOfferExchange
            ? "Torrent Exchange: select one or more cards, then choose the recipient using the button above the last selected card."
            : "Torrent Exchange: wait while the Conductor chooses cards."
          : canReturnExchange
            ? `Torrent Exchange: select exactly ${exchangeRequiredCount} card${exchangeRequiredCount === 1 ? "" : "s"}, then return them from the button above the last selected card.`
            : "Torrent Exchange: wait while the recipient returns cards."
        : exchange?.status === "awaiting_offer"
          ? canOfferExchange
            ? "The Communion of Vessels: select a card, then choose who receives it using the button above the selected card."
            : "The Communion of Vessels: wait while the offering player chooses a card."
          : canReturnExchange
            ? "The Communion of Vessels: select a card, then use Return above the selected card."
            : "The Communion of Vessels: wait while the recipient returns a card."}
    </div>
  ) : handActionMode === "mulligan" ? (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-white/80">
        Global chapter mulligan (pre-game): select any number of cards, then confirm from the button above the last selected card.
      </div>
      <div className="text-[11px] text-white/65">Selected {handActionSelectedIds.length} card(s).</div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            void guarded(async () => {
              if (!uid || !gameId || !actingSeat) return;
              await skipChapterMulligan(gameId, uid, actingSeat);
              setHandActionSelectedIds([]);
              setHandActionMode(null);
            })
          }
          disabled={busy || !canUseChapterMulliganForSelected}
          className="rounded-2xl bg-white/20 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm disabled:opacity-40"
        >
          Skip mulligan
        </button>
        <button
          type="button"
          onClick={() => {
            setHandActionSelectedIds([]);
            setHandActionMode(null);
            }}
          className="rounded-2xl bg-white/15 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm disabled:opacity-40"
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </div>
  ) : handActionMode === "black_sea" ? (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-white/80">
        Sigil of the Black Sea: select cards to discard, then draw the same amount (+1 Friction).
      </div>
      <div className="text-[11px] text-white/65">Selected {handActionSelectedIds.length} card(s).</div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            void guarded(async () => {
              if (!uid || !gameId || !actingSeat) return;
              if (!handActionSelectedIds.length) return;
              await useBlackSeaSigilDraw(gameId, uid, actingSeat, handActionSelectedIds);
              setHandActionSelectedIds([]);
              setHandActionMode(null);
            })
          }
          disabled={busy || !handActionSelectedIds.length}
          className="rounded-2xl bg-sky-400 px-3 py-1.5 text-[11px] font-extrabold text-slate-950 shadow-sm disabled:opacity-40"
        >
          Discard & draw
        </button>
        <button
          type="button"
          onClick={() => {
            setHandActionSelectedIds([]);
            setHandActionMode(null);
          }}
          className="rounded-2xl bg-white/20 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  ) : handActionMode === "shattered_clay" ? (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-white/80">
        Sigil of Shattered Clay: choose 2 cards of the same suit, then shift manifested value by ±3.
      </div>
      <div className="text-[11px] text-white/65">Selected {handActionSelectedIds.length} / 2.</div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            void guarded(async () => {
              if (!uid || !gameId || !actingSeat) return;
              if (handActionSelectedIds.length !== 2) return;
              await useShatteredClayShift(gameId, uid, actingSeat, handActionSelectedIds[0]!, handActionSelectedIds[1]!, 1);
              setHandActionSelectedIds([]);
              setHandActionMode(null);
            })
          }
          disabled={
            busy ||
            handActionSelectedIds.length !== 2 ||
            (() => {
              const cards = selectedHandRaw.filter((card) => handActionSelectedIds.includes(card.id));
              return cards.length !== 2 || cards[0]!.suit !== cards[1]!.suit;
            })()
          }
          className="rounded-2xl bg-emerald-500 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm disabled:opacity-40"
        >
          +3
        </button>
        <button
          type="button"
          onClick={() =>
            void guarded(async () => {
              if (!uid || !gameId || !actingSeat) return;
              if (handActionSelectedIds.length !== 2) return;
              await useShatteredClayShift(gameId, uid, actingSeat, handActionSelectedIds[0]!, handActionSelectedIds[1]!, -1);
              setHandActionSelectedIds([]);
              setHandActionMode(null);
            })
          }
          disabled={
            busy ||
            handActionSelectedIds.length !== 2 ||
            (() => {
              const cards = selectedHandRaw.filter((card) => handActionSelectedIds.includes(card.id));
              return cards.length !== 2 || cards[0]!.suit !== cards[1]!.suit;
            })()
          }
          className="rounded-2xl bg-rose-500 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm disabled:opacity-40"
        >
          -3
        </button>
        <button
          type="button"
          onClick={() => {
            setHandActionSelectedIds([]);
            setHandActionMode(null);
          }}
          className="rounded-2xl bg-white/20 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  ) : chapterMulliganAvailable && !handActionModeActive ? (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-white/80">
        Chapter mulligan available: one controlled seat may mulligan once before the first manifestation.
      </div>
      <button
        type="button"
        onClick={() => {
          setSelectedCardId(null);
          setHandActionSelectedIds([]);
          setHandActionMode("mulligan");
        }}
        disabled={!canUseChapterMulliganForSelected}
        className="rounded-2xl bg-sky-400 px-3 py-1.5 text-[11px] font-extrabold text-slate-950 shadow-sm disabled:opacity-40"
      >
        Open mulligan
      </button>
    </div>
  ) : quickActionButtons.length > 0 ? (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold text-white/80">
        Available actions for this seat:
      </div>
      <div className="flex flex-wrap gap-2">
        {quickActionButtons.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            disabled={busy || action.disabled}
            className={`rounded-2xl px-3 py-1.5 text-[11px] font-extrabold shadow-sm disabled:opacity-40 ${action.className}`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  ) : null;
  return (
    <div className="h-full w-full text-white">
      <div className={`grid h-full gap-1 ${layoutRowsClass}`}>
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
              ) : recoverStatusLine ? (
                <span className="text-violet-100/95">{recoverStatusLine}</span>
              ) : discardStatusLine ? (
                <span className="text-amber-100/90">{discardStatusLine}</span>
              ) : exchangeStatusLine ? (
                <span className="text-amber-100/90">{exchangeStatusLine}</span>
              ) : (
                `Phase: ${game.phase ?? "—"}`
              )}
            </div>
            {isTwoPlayerSharedRun && (
              <div className="flex shrink-0 items-center gap-1 rounded-xl bg-white/5 px-2 py-1 text-[10px] ring-1 ring-white/10">
                <span className="text-white/60">P3:</span>
                {canSetPseudoController ? (
                  pseudoControllerOptions.map((optionUid) => {
                    const active = optionUid === pseudoControllerUid;
                    return (
                      <button
                        key={optionUid}
                        type="button"
                        onClick={() =>
                          void guarded(async () => {
                            if (!uid || !gameId) return;
                            await setPseudoController(gameId, uid, optionUid);
                          })
                        }
                        disabled={busy}
                        className={`rounded-full px-2 py-0.5 font-extrabold ${
                          active ? "bg-emerald-400 text-slate-950" : "bg-white/10 text-white/80 hover:bg-white/20"
                        } disabled:opacity-40`}
                        title={`Set shared seat controller to ${playerLabel(optionUid, game.playerNames)}`}
                      >
                        {playerLabel(optionUid, game.playerNames)}
                      </button>
                    );
                  })
                ) : (
                  <span className="font-semibold text-white/85">{pseudoControllerName}</span>
                )}
              </div>
            )}
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
            {isPlayer && (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("Surrender this run? This immediately ends the game as a loss.")) return;
                  void onSurrender();
                }}
                disabled={busy}
                className="shrink-0 rounded-xl bg-rose-500/90 px-2 py-1 text-[11px] font-extrabold text-white ring-1 ring-rose-200/30 hover:bg-rose-400 disabled:opacity-50"
                title="Surrender game"
              >
                Surrender
              </button>
            )}
          </div>
        </div>

        <section className="relative z-10 min-h-0 rounded-2xl bg-white/5 p-1 ring-1 ring-white/10">
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] grid-cols-1 gap-0">
            <div className="min-h-0 space-y-1">
              {game.phase !== "choose_location" &&
                game.phase !== "choose_parts" &&
                game.phase !== "choose_sigils" &&
                game.phase !== "play" && (
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
                    isMobileLayout={isMobileLayout}
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
                    isMobileLayout={isMobileLayout}
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

                {game.phase === "choose_sigils" && (
                  <ChooseSigilsPhase
                    isMobileLayout={isMobileLayout}
                    selectedSeat={selectedSeat}
                    assigningSeat={selectedSeat}
                    canActForSelected={isHost || canActForSelected}
                    sigils={sigilDraftPool}
                    assignments={sigilAssignments}
                    assignedBySeat={sigilAssignedBySeat}
                    context={game.sigilDraftContext ?? null}
                    maxPicks={sigilMaxPicks}
                    isHost={isHost}
                    busy={busy}
                    canConfirm={canConfirmSigils}
                    onAssignSigil={(sigilId, seat) =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await setSigilDraftAssignment(gameId, uid, sigilId, seat);
                      })
                    }
                    onConfirm={() =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await confirmSigils(gameId, uid);
                      })
                    }
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
                      !pendingVeiledSeatReveal &&
                      (locationConductorOnlyTerrain
                        ? !conductorSeat || selectedSeat === conductorSeat
                        : SLOTS.some((s) => seatHasEffect(s, "peek_terrain_deck")))
                    }
                    onOpenTerrainDeck={() => setShowTerrainModal(true)}
                    terrain={terrain}
                    terrainSet={terrainSet}
                    terrainHiddenState={
                      pendingVeiledSeatReveal
                        ? "pre_selection"
                        : !canSelectedSeatSeeTerrainRange
                          ? "suit_only"
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
                    canConfirmSelection={Boolean(
                      pulsePhase === "selection" && isHost && manualSelectionReveal && haveAllPlayed && !exchangePending
                    )}
                    onConfirmSelection={() =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await confirmSelection(gameId, uid);
                      })
                    }
                    onEndActions={() =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await endActions(gameId, uid);
                      })
                    }
                    actionSeatHint={selectedSeat}
                    played={played}
                    valueChoicesBySeat={playedValueChoicesBySeat}
                    valueMultiplierBySeat={playedValueMultiplierBySeat}
                    players={players}
                    playerNames={game.playerNames}
                    isOwnOrControlledSeat={(seat) => {
                      const seatUid = players[seat] ?? "";
                      if (
                        targetPlayers === 2 &&
                        seat === "p3" &&
                        isSharedPseudoUid(seatUid) &&
                        uid &&
                        (players.p1 === uid || players.p2 === uid)
                      ) {
                        return true;
                      }
                      return Boolean(uid && (seatUid === uid || (isHost && isBotUid(seatUid) && activeSeat === seat)));
                    }}
                    canSetValueSeat={(seat) =>
                      Boolean(
                        pulsePhase === "actions" &&
                          uid &&
                          gameId &&
                          canControlSeat(game, uid, seat)
                      )
                    }
                    onCycleCardValue={(seat, target) => void onCyclePlayedCardValue(seat, target)}
                    canSteamSigilSeat={(seat) =>
                      Boolean(
                        pulsePhase === "actions" &&
                          uid &&
                          gameId &&
                          canControlSeat(game, uid, seat) &&
                          seatHasEffect(seat, "once_per_chapter_resonance_as_steam") &&
                          played[seat]?.card &&
                          !(game.chapterAbilityUsed?.[seat]?.["once_per_chapter_resonance_as_steam"] ?? false)
                      )
                    }
                    canBalancingScaleMinus1Seat={(seat) =>
                      Boolean(
                        pulsePhase === "actions" &&
                          uid &&
                          gameId &&
                          canControlSeat(game, uid, seat) &&
                          seatHasBalancingAmount(seat, 1) &&
                          played[seat]?.card &&
                          Number((played[seat] as any)?.postRevealValueDelta ?? 0) >= 0
                      )
                    }
                    canBalancingScaleMinus2Seat={(seat) =>
                      Boolean(
                        pulsePhase === "actions" &&
                          uid &&
                          gameId &&
                          canControlSeat(game, uid, seat) &&
                          seatHasBalancingAmount(seat, 2) &&
                          played[seat]?.card &&
                          Number((played[seat] as any)?.postRevealValueDelta ?? 0) >= 0
                      )
                    }
                    canTemperedCrucibleSeat={(seat) =>
                      Boolean(
                        pulsePhase === "actions" &&
                          uid &&
                          gameId &&
                          canControlSeat(game, uid, seat) &&
                          seatHasEffect(seat, ABILITY_SIGIL_TEMPERED_CRUCIBLE) &&
                          !(game.chapterAbilityUsed?.[seat]?.[ABILITY_SIGIL_TEMPERED_CRUCIBLE] ?? false)
                      )
                    }
                    canSteamOvertonesSourceSeat={(seat) =>
                      Boolean(
                        pulsePhase === "actions" &&
                          uid &&
                          gameId &&
                          canControlSeat(game, uid, seat) &&
                          seatHasEffect(seat, ABILITY_SIGIL_STEAM_OVERTONES) &&
                          played[seat]?.card &&
                          !Boolean((played[seat] as any)?.steamOvertonesUsed) &&
                          (() => {
                            const manifested = [
                              (played[seat] as any)?.card,
                              ...((played[seat] as any)?.additionalCards ?? []),
                              ...((played[seat] as any)?.extraCard ? [(played[seat] as any)?.extraCard] : []),
                            ].filter(Boolean);
                            return manifested.some((card: any) => card?.suit === "steam");
                          })()
                      )
                    }
                    canAcidRecompositionSeat={(seat) =>
                      Boolean(
                        pulsePhase === "actions" &&
                          uid &&
                          gameId &&
                          canControlSeat(game, uid, seat) &&
                          seatHasEffect(seat, ABILITY_SIGIL_ACID_RECOMPOSITION) &&
                          played[seat]?.card &&
                          !Boolean((played[seat] as any)?.acidRecompositionUsed) &&
                          Boolean(game.reservoir) &&
                          (() => {
                            const manifested = [
                              (played[seat] as any)?.card,
                              ...((played[seat] as any)?.additionalCards ?? []),
                              ...((played[seat] as any)?.extraCard ? [(played[seat] as any)?.extraCard] : []),
                            ].filter(Boolean);
                            return manifested.some((card: any) => card?.suit === "acid");
                          })()
                      )
                    }
                    onSteamSigil={(seat) =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await useSteamSigilResonance(gameId, uid, seat);
                      })
                    }
                    onBalancingScale={(seat, amount) =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await useBalancingScale(gameId, uid, seat, amount);
                      })
                    }
                    onTemperedCrucible={(seat) =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await useTemperedCrucible(gameId, uid, seat);
                      })
                    }
                    onSteamOvertonesTarget={(sourceSeat, targetSeat) =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await useSteamOvertonesZero(gameId, uid, sourceSeat, targetSeat);
                      })
                    }
                    onAcidRecomposition={(seat) =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await useAcidRecomposition(gameId, uid, seat);
                      })
                    }
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
                    canAmplifySeat={(seat) =>
                      Boolean(
                        pulsePhase === "actions" &&
                          uid &&
                          gameId &&
                          canControlSeat(game, uid, seat) &&
                          seatHasEffect(seat, ABILITY_HARMONIC_AMPLIFIER) &&
                          played[seat]?.card &&
                          !played[seat]?.totalMultiplier
                      )
                    }
                    canResonanceGiftSeat={(seat) =>
                      Boolean(
                        pulsePhase === "actions" &&
                          uid &&
                          gameId &&
                          canControlSeat(game, uid, seat) &&
                          seatHasEffect(seat, ABILITY_SIGIL_RESONANCE_GIFT) &&
                          played[seat]?.card
                      )
                    }
                    resonanceGiftTargetBySeat={SLOTS.reduce((acc, seat) => {
                      const entry = played[seat] as any;
                      acc[seat] = (entry?.resonanceGiftSeat as PlayerSlot | null | undefined) ?? null;
                      return acc;
                    }, {} as Partial<Record<PlayerSlot, PlayerSlot | null>>)}
                    onSwapR1={(seat, manifestedCardId) =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await swapWithReservoir(gameId, uid, seat, 1, manifestedCardId);
                      })
                    }
                    onSwapR2={(seat, manifestedCardId) =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await swapWithReservoir(gameId, uid, seat, 2, manifestedCardId);
                      })
                    }
                    onFuse={(seat) =>
                      void guarded(async () => {
                        if (!uid || !gameId || !fuseSeat) return;
                        await useFuse(gameId, uid, fuseSeat, seat);
                      })
                    }
                    onAmplify={(seat) =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await useHarmonicAmplifier(gameId, uid, seat);
                      })
                    }
                    onSetResonanceGiftSeat={(seat, target) =>
                      void guarded(async () => {
                        if (!uid || !gameId) return;
                        await setResonanceGiftSeat(gameId, uid, seat, target);
                      })
                    }
                    tablePart={selectedPartDetail}
                    tablePartToken={selectedPartToken}
                    tableSigils={selectedSeatSigilDetails}
                  />
                )}
              </div>
            </div>
          </section>

        {showBottomHandPanel && (
          <PlayerBottomPanel
            mobileLayout={isMobileLayout}
            seatTag={seatLabel(selectedSeat)}
            playerName={selectedName}
            viewOnly={Boolean(selectedUid && !canActForSelected)}
            message={bottomMessage}
            canSeeHand={canSeeSelectedHand}
            hand={canSeeSelectedHand ? selectedHand : selectedHandRaw}
            selectedCardIds={
              isDiscardSelectionPhase
                ? pendingDiscardSelectedIds
                : exchangeIsConductorTrade
                  ? handActionSelectedIds
                : handActionModeActive
                  ? handActionSelectedIds
                  : undefined
            }
            selectedCardId={handActionModeActive || exchangeIsConductorTrade ? null : selectedCardId}
            onToggleSelectCard={(cardId) => {
              if (isDiscardSelectionPhase) {
                void guarded(async () => {
                  if (!uid || !gameId || !canManagePendingDiscardForSelected) return;
                  await togglePendingDiscardSelection(gameId, uid, selectedSeat, cardId);
                });
                return;
              }
              if (exchangeIsConductorTrade) {
                setHandActionSelectedIds((prev) => {
                  if (prev.includes(cardId)) return prev.filter((id) => id !== cardId);
                  if (exchange?.status === "awaiting_return" && prev.length >= exchangeRequiredCount) return prev;
                  return [...prev, cardId];
                });
                return;
              }
              if (handActionMode === "black_sea") {
                setHandActionSelectedIds((prev) => (prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]));
                return;
              }
              if (handActionMode === "shattered_clay") {
                setHandActionSelectedIds((prev) => {
                  if (prev.includes(cardId)) return prev.filter((id) => id !== cardId);
                  if (prev.length >= 2) return prev;
                  return [...prev, cardId];
                });
                return;
              }
              if (handActionMode === "mulligan") {
                setHandActionSelectedIds((prev) => (prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]));
                return;
              }
              setSelectedCardId((prev) => (prev === cardId ? null : cardId));
            }}
            canPlaySelected={Boolean(selectedCardId && (canPlayFromSelected || canPassToConductorFromSelected))}
            playButtonLabel={canPassToConductorFromSelected && !canPlayFromSelected ? "Pass" : "Play"}
            onPlaySelected={() =>
              void guarded(async () => {
                if (!uid || !gameId || !actingSeat || !selectedCardId) return;
                if (canPassToConductorFromSelected && !canPlayFromSelected) {
                  await passCardToConductor(gameId, uid, actingSeat, selectedCardId);
                  return;
                }
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
            canSwapSkipSelected={Boolean(selectedCardId && canTipharethSwapFromSelected)}
            onSwapSkipSelected={() =>
              void guarded(async () => {
                if (!uid || !gameId || !actingSeat || !selectedCardId) return;
                await useLensOfTiphareth(gameId, uid, actingSeat, selectedCardId);
              })
            }
            selectedCardActionButtons={[...exchangeCardActions, ...mulliganCardActions]}
            highlightSelectedCards={handActionMode === "mulligan"}
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
                  onClick={() => {
                    setDiscardModalMode("inspect");
                    setShowDiscardModal(true);
                  }}
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
              ) : selectedSeatShouldPassToConductor ? (
                selectedHasPassedToConductor ? (
                  <>Card passed to Conductor for this Pulse.</>
                ) : (
                  <>Choose a card and press Pass to send it to the Conductor.</>
                )
              ) : selectedSeatSkipped ? (
                <>This seat skips this Pulse.</>
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

            <div className="mt-3">
              <AssignedFacultyPanel part={selectedPartDetail} token={selectedPartToken} sigils={selectedSeatSigilDetails} />
            </div>
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
        onClose={() => {
          setShowDiscardModal(false);
          setDiscardModalMode("inspect");
        }}
        discardAll={discardAll}
        lastDiscarded={lastDiscarded}
        selectable={
          discardModalMode === "play_from_discard" ||
          (discardModalMode === "recover_from_discard" && canManagePendingRecoverForSelected)
        }
        selectionLabel={
          discardModalMode === "play_from_discard"
            ? "Tap a card to manifest it"
            : discardModalMode === "recover_from_discard"
              ? "Tap a card, then confirm with the white button above it"
              : "Select from discard"
        }
        selectedCardId={discardModalMode === "recover_from_discard" ? pendingRecoverSelectedId : null}
        confirmSelectedLabel={discardModalMode === "recover_from_discard" ? "Recover" : undefined}
        confirmSelectedDisabled={
          discardModalMode !== "recover_from_discard" ||
          busy ||
          !canManagePendingRecoverForSelected ||
          pendingRecoverConfirmed ||
          !pendingRecoverSelectedId
        }
        onConfirmSelected={
          discardModalMode === "recover_from_discard"
            ? () =>
                void guarded(async () => {
                  if (!uid || !gameId) return;
                  await confirmPendingRecoverSelection(gameId, uid, selectedSeat, false);
                  await endActions(gameId, uid);
                  setShowDiscardModal(false);
                  setDiscardModalMode("inspect");
                })
            : undefined
        }
        onSelectCard={
          discardModalMode === "play_from_discard"
            ? (cardId) =>
                void guarded(async () => {
                  if (!uid || !gameId || !actingSeat) return;
                  await playDiscardSigilCard(gameId, uid, actingSeat, cardId);
                  setShowDiscardModal(false);
                  setDiscardModalMode("inspect");
                })
            : discardModalMode === "recover_from_discard" && canManagePendingRecoverForSelected
              ? (cardId) =>
                  void guarded(async () => {
                    if (!uid || !gameId) return;
                    await setPendingRecoverSelection(
                      gameId,
                      uid,
                      selectedSeat,
                      pendingRecoverSelectedId === cardId ? null : cardId
                    );
                  })
              : undefined
        }
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

      <GameNoticeToast notice={activeNotice} />

      {/* Communion exchange now lives in the bottom hand panel (non-blocking). */}
    </div>
  );
}
