import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import type {
  GameDoc,
  GameStatus,
  GameMode,
  ChapterAbilityUsed,
  ChapterGlobalUsed,
  PendingDiscardSeatRequest,
  PendingDiscardState,
  PlayerSlot,
  Players,
  PulseCard,
  PulseSuit,
  SeatHands,
} from "../types";
import { getAllLocations, getAllSigils, getLocationById, getLocationsForStage, getPartById, getSigilById } from "../game/locations";
import {
  defaultTerrainDeckTypeForSphere,
  drawCardsWithReshuffle,
  makePulseDeck,
  makeTerrainDeck,
} from "./game/decks";
import { shuffleInPlace } from "./game/random";
import { bestFitSelection, pulseCardValueOptions } from "./game/scoring";

const GAMES = collection(db, "games");

const SLOTS: PlayerSlot[] = ["p1", "p2", "p3"];

function effectsForSeat(
  data: Pick<GameDoc, "locationId" | "partPicks"> & Partial<Pick<GameDoc, "seatSigils">>,
  seat: PlayerSlot
): any[] {
  const out: any[] = [];
  const partId = data.partPicks?.[seat] ?? null;
  const part = getPartById(partId);
  if (part?.effects?.length) out.push(...part.effects);
  const sigilIds = data.seatSigils?.[seat] ?? [];
  for (const sigilId of sigilIds) {
    const sigil = getSigilById(sigilId);
    if (sigil?.effects?.length) out.push(...sigil.effects);
  }
  const loc = getLocationById(data.locationId ?? null);
  if (loc?.effects?.length) out.push(...loc.effects);
  return out;
}

function hasEffect(effects: any[], type: string): boolean {
  return effects.some((e) => e && e.type === type);
}

function handCapacityForSeat(
  data: Pick<GameDoc, "baseHandCapacity" | "partPicks" | "locationId"> & Partial<Pick<GameDoc, "seatSigils">>,
  seat: PlayerSlot
): number {
  const base = data.baseHandCapacity ?? 5;
  const effects = effectsForSeat(data, seat);
  const delta = effects
    .filter((e) => e?.type === "hand_capacity_delta")
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  return Math.max(0, base + delta);
}

function seatHasPart(data: Pick<GameDoc, "partPicks">, seat: PlayerSlot, partId: string): boolean {
  return data.partPicks?.[seat] === partId;
}

function ensureChapterAbilityUsed(data: GameDoc): ChapterAbilityUsed {
  return { ...(data.chapterAbilityUsed ?? {}) };
}

function ensureChapterGlobalUsed(data: GameDoc): ChapterGlobalUsed {
  return { ...(data.chapterGlobalUsed ?? {}) };
}

function seatPlayedSuit(entry: { card: PulseCard; extraCard?: PulseCard } | undefined, suit: Exclude<PulseSuit, "prism">): boolean {
  if (!entry?.card) return false;
  const suits = [entry.card.suit, entry.extraCard?.suit].filter(Boolean) as PulseSuit[];
  return suits.includes(suit);
}

function effectiveValueOptionsForCard(
  data: Pick<GameDoc, "locationId" | "partPicks"> & Partial<Pick<GameDoc, "seatSigils">>,
  seat: PlayerSlot,
  card: PulseCard,
  valueOverride?: number
): number[] {
  if (typeof valueOverride === "number") return [valueOverride];
  const seatEffects = effectsForSeat(data, seat);
  const valueDelta = seatEffects
    .filter((e) => e?.type === "pulse_value_delta")
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  return pulseCardValueOptions(card, seatEffects).map((v) => v + valueDelta);
}

function preSelectionSeats(data: Pick<GameDoc, "locationId" | "partPicks">): PlayerSlot[] {
  return SLOTS.filter((seat) => hasEffect(effectsForSeat(data, seat), "hide_terrain_until_played"));
}

function mandatoryExchangeSeat(data: Pick<GameDoc, "locationId" | "partPicks">): PlayerSlot | null {
  return (
    SLOTS.find((seat) => hasEffect(effectsForSeat(data, seat), "mandatory_card_exchange_after_terrain_reveal")) ?? null
  );
}

function normalizePendingSelectionsForRequests(
  requests: Partial<Record<PlayerSlot, PendingDiscardSeatRequest>>,
  selections: Partial<Record<PlayerSlot, string[]>> | undefined
): Partial<Record<PlayerSlot, string[]>> {
  const out: Partial<Record<PlayerSlot, string[]>> = {};
  for (const seat of SLOTS) {
    const req = requests[seat];
    if (!req) continue;
    const values = selections?.[seat] ?? [];
    out[seat] = Array.from(new Set(values));
  }
  return out;
}

function normalizePendingConfirmedForRequests(
  requests: Partial<Record<PlayerSlot, PendingDiscardSeatRequest>>,
  confirmed: Partial<Record<PlayerSlot, boolean>> | undefined
): Partial<Record<PlayerSlot, boolean>> {
  const out: Partial<Record<PlayerSlot, boolean>> = {};
  for (const seat of SLOTS) {
    const req = requests[seat];
    if (!req) continue;
    out[seat] = Boolean(confirmed?.[seat]);
  }
  return out;
}

function normalizeName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  return (n || "Player").slice(0, 20);
}

function revealSigilsByTier(tier: number, count: number): string[] {
  const pool = getAllSigils().filter((sigil) => sigil.tier === tier);
  if (!pool.length) return [];
  const ids = pool.map((sigil) => sigil.id);
  shuffleInPlace(ids);
  return ids.slice(0, Math.max(0, Math.min(count, ids.length)));
}

export function playerCount(players: Players): number {
  return SLOTS.map((s) => players[s]).filter(Boolean).length;
}

export function getMySlot(players: Players, uid: string): PlayerSlot | null {
  for (const s of SLOTS) if (players[s] === uid) return s;
  return null;
}

function pickEmptySlot(players: Players): PlayerSlot | null {
  for (const s of SLOTS) if (!players[s]) return s;
  return null;
}

function playerUidsFromPlayers(players: Players): string[] {
  const values = SLOTS.map((s) => players[s]).filter(Boolean) as string[];
  return Array.from(new Set(values));
}

function isBotUid(uid: string): boolean {
  return uid.startsWith("bot:");
}

function nextBotName(players: Players, playerNames: Record<string, string>): string {
  const existing = new Set<string>();
  Object.values(players).forEach((u) => {
    if (!u) return;
    if (!isBotUid(u)) return;
    existing.add(playerNames[u] ?? "");
  });
  for (let i = 1; i <= 99; i++) {
    const candidate = `Bot ${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return "Bot";
}

export async function createGameAndJoin(
  uid: string,
  name: string,
  visibility: "public" | "private" = "public",
  gameMode: GameMode = "campaign"
) {
  const initial: GameDoc = {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    status: "lobby",
    visibility,
    gameMode,
    maxPlayers: 3,
    players: { p1: uid },
    playerNames: { [uid]: normalizeName(name) },
    playerUids: [uid],
    invitedUids: [],
    phase: "setup",
    seatSigils: {},
    chapter: 1,
    step: 1,
    golem: { hp: 5, heat: 0 },
  };

  const ref = await addDoc(GAMES, initial);
  return ref.id;
}

export type GameSummary = GameDoc & { id: string };

export function subscribeLobbyGames(onUpdate: (games: GameSummary[]) => void) {
  const q = query(GAMES, where("status", "==", "lobby"));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as GameDoc) }));
    onUpdate(items);
  });
}

export function subscribeOpenGames(onUpdate: (games: GameSummary[]) => void) {
  const q = query(GAMES, where("status", "in", ["lobby", "active"]));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as GameDoc) }));
    onUpdate(items);
  });
}

export function subscribeMyGames(uid: string, onUpdate: (games: GameSummary[]) => void) {
  const q = query(GAMES, where("playerUids", "array-contains", uid));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as GameDoc) }));
    onUpdate(items);
  });
}

export function subscribeGame(gameId: string, onUpdate: (game: GameSummary | null) => void, onError?: (e: Error) => void) {
  const ref = doc(db, "games", gameId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      onUpdate({ id: snap.id, ...(snap.data() as GameDoc) });
    },
    (err) => onError?.(err as any)
  );
}

export async function joinGame(gameId: string, uid: string, name: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "lobby") throw new Error("This room already started.");
    if (data.visibility === "private" && !(data.invitedUids ?? []).includes(uid)) {
      throw new Error("This room is private (invite required).");
    }

    const players: Players = { ...(data.players ?? {}) };
    const playerNames = { ...(data.playerNames ?? {}) };
    const invitedUids = (data.invitedUids ?? []).filter((u) => u !== uid);

    const already = getMySlot(players, uid);
    if (already) {
      playerNames[uid] = normalizeName(name);
      const nextUids = playerUidsFromPlayers(players);
      tx.update(gameRef, {
        playerNames,
        playerUids: nextUids,
        invitedUids,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const slot = pickEmptySlot(players);
    if (!slot) throw new Error("Room is full.");

    players[slot] = uid;
    playerNames[uid] = normalizeName(name);
    const nextUids = playerUidsFromPlayers(players);

    tx.update(gameRef, {
      players,
      playerNames,
      playerUids: nextUids,
      invitedUids,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function leaveGame(gameId: string, uid: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) return;
    const data = snap.data() as GameDoc;

    if (data.status !== "lobby") throw new Error("You can only leave while in lobby.");

    if (data.createdBy === uid) {
      tx.delete(gameRef);
      return;
    }

    const players: Players = { ...(data.players ?? {}) };
    const mySlot = getMySlot(players, uid);
    if (!mySlot) return;
    delete players[mySlot];
    const nextUids = playerUidsFromPlayers(players);

    tx.update(gameRef, {
      players,
      playerUids: nextUids,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function addBot(gameId: string, hostUid: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "lobby") throw new Error("Bots can only be added in lobby.");
    if (data.createdBy !== hostUid) throw new Error("Only the host can add bots.");

    const players: Players = { ...(data.players ?? {}) };
    const slot = pickEmptySlot(players);
    if (!slot) throw new Error("Room is full.");

    const botUid = `bot:${crypto.randomUUID()}`;
    const playerNames = { ...(data.playerNames ?? {}) };
    playerNames[botUid] = nextBotName(players, playerNames);
    players[slot] = botUid;

    tx.update(gameRef, {
      players,
      playerNames,
      playerUids: playerUidsFromPlayers(players),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function removeBot(gameId: string, hostUid: string, botUid: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "lobby") throw new Error("Bots can only be removed in lobby.");
    if (data.createdBy !== hostUid) throw new Error("Only the host can remove bots.");

    const players: Players = { ...(data.players ?? {}) };
    const slot = SLOTS.find((s) => players[s] === botUid);
    if (!slot) return;

    delete players[slot];
    tx.update(gameRef, {
      players,
      playerUids: playerUidsFromPlayers(players),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function startGame(gameId: string, hostUid: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "lobby") throw new Error("Game already started.");
    if (data.createdBy !== hostUid) throw new Error("Only the host can start the game.");

    const players: Players = { ...(data.players ?? {}) };
    const full = SLOTS.every((s) => Boolean(players[s]));
    if (!full) throw new Error("Need 3 players (add bots or wait for friends).");

    const gameMode = (data.gameMode ?? "campaign") as GameMode;
    const locationOptions =
      gameMode === "single_location"
        ? getAllLocations().map((l) => l.id)
        : getLocationsForStage(1).map((l) => l.id);

    tx.update(gameRef, {
      status: "active" as GameStatus,
      startedAt: serverTimestamp(),
      startedBy: hostUid,
      updatedAt: serverTimestamp(),
      locationId: null,
      locationOptions,
      locationVotes: {},
      phase: "choose_location",
      sigilDraftPool: [],
      sigilDraftAssignments: {},
      sigilDraftTier: null,
      sigilDraftMaxPicks: 0,
      sigilDraftContext: deleteField(),
      pendingDiscard: deleteField(),
      partPicks: {},
      optionalPartId: null,
      partAssignments: {},
      seatSigils: data.seatSigils ?? {},
      chapter: 1,
      step: 1,
      golem: { hp: 5, heat: 0 },
    });
  });
}

export async function setLocationVote(
  gameId: string,
  actorUid: string,
  seat: PlayerSlot,
  locationId: string
) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "choose_location") throw new Error("Not in location selection.");

    const options = data.locationOptions ?? getLocationsForStage(data.chapter ?? 1).map((l) => l.id);
    if (!options.includes(locationId)) throw new Error("Invalid location.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (seatUid !== actorUid && !(isHost && isBot)) {
      throw new Error("You can't vote for that seat.");
    }

    tx.update(gameRef, { [`locationVotes.${seat}`]: locationId, updatedAt: serverTimestamp() });
  });
}

export async function autoVoteBots(gameId: string, hostUid: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "choose_location") throw new Error("Not in location selection.");
    if (data.createdBy !== hostUid) throw new Error("Only the host can do this.");

    const options = data.locationOptions ?? getLocationsForStage(data.chapter ?? 1).map((l) => l.id);
    if (options.length === 0) throw new Error("No locations available.");

    const players = data.players ?? {};
    const votes = { ...(data.locationVotes ?? {}) };

    const patch: Record<string, any> = { updatedAt: serverTimestamp() };
    for (const seat of SLOTS) {
      const u = players[seat];
      if (!u) continue;
      if (!isBotUid(u)) continue;
      if (votes[seat]) continue;
      const idx = Math.floor(Math.random() * options.length);
      patch[`locationVotes.${seat}`] = options[idx]!;
    }

    tx.update(gameRef, patch);
  });
}

export async function confirmLocation(gameId: string, actorUid: string, preferredLocationId?: string | null) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "choose_location") throw new Error("Not in location selection.");
    if (data.locationId) return;

    const players = data.players ?? {};
    if (!getMySlot(players, actorUid)) throw new Error("Only seated players can confirm.");

    const votes = data.locationVotes ?? {};
    for (const seat of SLOTS) {
      if (!players[seat]) throw new Error("Seat is empty.");
      if (!votes[seat]) throw new Error("All seats must vote.");
    }

    const counts = new Map<string, number>();
    for (const seat of SLOTS) {
      const v = votes[seat];
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
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

    if (tied.length === 0) throw new Error("No votes.");
    const chosen =
      preferredLocationId && tied.includes(preferredLocationId)
        ? preferredLocationId
        : tied[Math.floor(Math.random() * tied.length)]!;
    const chosenLocation = getLocationById(chosen);
    const gameMode = (data.gameMode ?? "campaign") as GameMode;
    const allSigilIds = getAllSigils().map((sigil) => sigil.id);

    if (gameMode === "single_location") {
      tx.update(gameRef, {
        locationId: chosen,
        chapter: chosenLocation?.sphere ?? data.chapter ?? 1,
        phase: "choose_sigils",
        sigilDraftContext: "single_location_setup" as const,
        sigilDraftTier: null,
        sigilDraftPool: allSigilIds,
        sigilDraftAssignments: {},
        sigilDraftMaxPicks: allSigilIds.length,
        pendingDiscard: deleteField(),
        partPicks: {},
        updatedAt: serverTimestamp(),
      });
      return;
    }

    tx.update(gameRef, {
      locationId: chosen,
      chapter: chosenLocation?.sphere ?? data.chapter ?? 1,
      phase: "choose_parts",
      sigilDraftContext: deleteField(),
      sigilDraftTier: deleteField(),
      sigilDraftPool: deleteField(),
      sigilDraftAssignments: deleteField(),
      sigilDraftMaxPicks: deleteField(),
      pendingDiscard: deleteField(),
      partPicks: {},
      updatedAt: serverTimestamp(),
    });
  });
}

export async function setPartPick(
  gameId: string,
  actorUid: string,
  seat: PlayerSlot,
  partId: string | null
) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "choose_parts") throw new Error("Not in part selection.");

    const location = getLocationById(data.locationId ?? null);
    if (!location) throw new Error("Location not set.");

    const allowedParts = [...location.compulsory, ...location.optional].map((p) => p.id);
    if (partId && !allowedParts.includes(partId)) throw new Error("Invalid part.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (seatUid !== actorUid && !(isHost && isBot)) {
      throw new Error("You can't pick for that seat.");
    }

    const picks = { ...(data.partPicks ?? {}) };
    if (partId) {
      for (const s of SLOTS) {
        if (s === seat) continue;
        if (picks[s] === partId) throw new Error("That part is already taken.");
      }
    }

    if (partId) {
      tx.update(gameRef, { [`partPicks.${seat}`]: partId, updatedAt: serverTimestamp() });
    } else {
      tx.update(gameRef, { [`partPicks.${seat}`]: deleteField(), updatedAt: serverTimestamp() });
    }
  });
}

export async function setSigilDraftAssignment(
  gameId: string,
  actorUid: string,
  sigilId: string,
  seat: PlayerSlot | null
) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "choose_sigils") throw new Error("Not in sigil draft.");
    if (data.createdBy !== actorUid) throw new Error("Only the host can assign sigils.");

    const pool = data.sigilDraftPool ?? [];
    if (!pool.includes(sigilId)) throw new Error("Sigil not available in this draft.");
    if (seat && !data.players?.[seat]) throw new Error("Seat is empty.");

    const assignments = { ...(data.sigilDraftAssignments ?? {}) } as Record<string, PlayerSlot>;
    const maxPicks = Math.max(0, Number(data.sigilDraftMaxPicks ?? pool.length) || 0);
    const hadAssignment = Boolean(assignments[sigilId]);
    if (seat) {
      if (!hadAssignment && Object.keys(assignments).length >= maxPicks) {
        throw new Error("Maximum picks reached.");
      }
      assignments[sigilId] = seat;
    } else {
      delete assignments[sigilId];
    }

    tx.update(gameRef, {
      sigilDraftAssignments: assignments,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function confirmSigils(gameId: string, actorUid: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "choose_sigils") throw new Error("Not in sigil draft.");
    if (data.createdBy !== actorUid) throw new Error("Only the host can confirm sigils.");

    const context = data.sigilDraftContext;
    const pool = data.sigilDraftPool ?? [];
    const maxPicks = Math.max(0, Number(data.sigilDraftMaxPicks ?? pool.length) || 0);
    const assignmentsRaw = { ...(data.sigilDraftAssignments ?? {}) } as Record<string, PlayerSlot>;
    const picks = Object.entries(assignmentsRaw).filter(([sigilId, seat]) => pool.includes(sigilId) && Boolean(seat));
    if (picks.length > maxPicks) throw new Error("Too many sigils assigned.");
    const isRewardDraft = context === "reward_tier_1" || context === "reward_location";
    if (isRewardDraft && picks.length !== maxPicks) {
      throw new Error(`Assign exactly ${maxPicks} rewarded sigil${maxPicks === 1 ? "" : "s"}.`);
    }

    const seatSigils: Partial<Record<PlayerSlot, string[]>> = { ...(data.seatSigils ?? {}) };
    for (const [sigilId, seat] of picks) {
      for (const slot of SLOTS) {
        const existing = seatSigils[slot] ?? [];
        if (!existing.includes(sigilId)) continue;
        seatSigils[slot] = existing.filter((id) => id !== sigilId);
      }
      const next = new Set(seatSigils[seat] ?? []);
      next.add(sigilId);
      seatSigils[seat] = Array.from(next);
    }

    if (context === "single_location_setup") {
      tx.update(gameRef, {
        seatSigils,
        phase: "choose_parts" as const,
        sigilDraftContext: deleteField(),
        sigilDraftTier: deleteField(),
        sigilDraftPool: deleteField(),
        sigilDraftAssignments: deleteField(),
        sigilDraftMaxPicks: deleteField(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    if (isRewardDraft) {
      tx.update(gameRef, {
        seatSigils,
        phase: "choose_location" as const,
        locationId: null,
        locationVotes: {},
        partPicks: {},
        partAssignments: {},
        sigilDraftContext: deleteField(),
        sigilDraftTier: deleteField(),
        sigilDraftPool: deleteField(),
        sigilDraftAssignments: deleteField(),
        sigilDraftMaxPicks: deleteField(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    tx.update(gameRef, {
      seatSigils,
      sigilDraftContext: deleteField(),
      sigilDraftTier: deleteField(),
      sigilDraftPool: deleteField(),
      sigilDraftAssignments: deleteField(),
      sigilDraftMaxPicks: deleteField(),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function confirmParts(gameId: string, hostUid: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "choose_parts") throw new Error("Not in part selection.");
    if (data.createdBy !== hostUid) throw new Error("Only the host can confirm.");

    const location = getLocationById(data.locationId ?? null);
    if (!location) throw new Error("Location not set.");

    const picks = data.partPicks ?? {};
    const pickedIds = SLOTS.map((s) => picks[s]).filter(Boolean) as string[];
    if (pickedIds.length !== SLOTS.length) throw new Error("Each seat must pick a part.");

    const uniq = new Set(pickedIds);
    if (uniq.size !== pickedIds.length) throw new Error("Each part can be taken only once.");

    const compulsory = new Set(location.compulsory.map((p) => p.id));
    for (const c of compulsory) if (!uniq.has(c)) throw new Error("All compulsory parts must be assigned.");

    const players = data.players ?? {};
    const assignments: Record<string, string> = {};
    for (const seat of SLOTS) {
      const part = picks[seat];
      const seatUid = players[seat];
      if (!part || !seatUid) throw new Error("Invalid selection.");
      assignments[part] = seatUid;
    }

    const deck = makePulseDeck();
    shuffleInPlace(deck);

    const baseHandCapacity = data.baseHandCapacity ?? 5;
    const hands: SeatHands = {};
    for (const seat of SLOTS) {
      const cap = handCapacityForSeat(
        { baseHandCapacity, partPicks: picks, locationId: data.locationId ?? undefined, seatSigils: data.seatSigils },
        seat
      );
      hands[seat] = deck.splice(0, cap);
    }

    const reservoirCountEffect = location.effects?.find((e) => e?.type === "reservoir_count") as any;
    const reservoirCount = Math.min(2, Math.max(1, Number(reservoirCountEffect?.count) || 1));
    const reservoir = deck.shift() ?? null;
    const reservoir2 = reservoirCount >= 2 ? (deck.shift() ?? null) : null;

    const terrainDeckType = location.terrainDeckType ?? defaultTerrainDeckTypeForSphere(location.sphere ?? 1);
    const terrainCardsPerRun = Math.max(1, Number(data.terrainCardsPerRun ?? 5));
    const terrainDeck = makeTerrainDeck(terrainDeckType, terrainCardsPerRun);
    const preSeats = preSelectionSeats({ locationId: data.locationId, partPicks: picks });
    const exchangeFrom = mandatoryExchangeSeat({ locationId: data.locationId, partPicks: picks });
    const exchange = !preSeats.length && exchangeFrom ? { from: exchangeFrom, status: "awaiting_offer" as const } : null;

    tx.update(gameRef, {
      phase: "play",
      partAssignments: assignments,
      hands,
      pulseDeck: deck,
      pulseDiscard: [],
      lastDiscarded: [],
      reservoir,
      reservoir2,
      baseHandCapacity,
      terrainDeck,
      terrainDeckType,
      terrainCardsPerRun,
      terrainIndex: 0,
      step: 1,
      pulsePhase: preSeats.length ? "pre_selection" : "selection",
      exchange,
      skipThisPulse: {},
      skipNextPulse: {},
      played: {},
      chapterAbilityUsed: {},
      chapterGlobalUsed: {},
      pendingDiscard: deleteField(),
      outcomeLog: [],
      updatedAt: serverTimestamp(),
    });
  });
}

export async function playCard(gameId: string, actorUid: string, seat: PlayerSlot, cardId: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    const pulsePhase = (data.pulsePhase ?? "selection") as any;
    if (pulsePhase !== "selection" && pulsePhase !== "pre_selection") throw new Error("Not in selection phase.");
    if (pulsePhase === "selection" && data.exchange) throw new Error("Resolve the Communion exchange first.");
    const skipThisPulse = data.skipThisPulse ?? {};
    if (skipThisPulse[seat]) throw new Error("This seat skips this Pulse.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (seatUid !== actorUid && !(isHost && isBot)) throw new Error("You can't play for that seat.");

    if (data.played?.[seat]) throw new Error("That seat already played a card.");

    const hands = { ...(data.hands ?? {}) } as SeatHands;
    const hand = [...(hands[seat] ?? [])];
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error("Card not found in hand.");
    const [card] = hand.splice(idx, 1);
    hands[seat] = hand;

    const played = { ...(data.played ?? {}) } as any;
    played[seat] = {
      card,
      bySeat: seat,
      at: serverTimestamp(),
      ...(hasEffect(effectsForSeat(data, seat), "reveal_card_during_selection") ? { revealedDuringSelection: true } : {}),
    };

    const activeSeats = SLOTS.filter((s) => Boolean(data.players?.[s]) && !skipThisPulse[s]);
    const full = activeSeats.every((s) => Boolean(played[s]));
    const preSeats = preSelectionSeats({ locationId: data.locationId, partPicks: data.partPicks });
    const preDone = preSeats.every((s) => skipThisPulse[s] || Boolean(played[s]));

    if (pulsePhase === "pre_selection" && preSeats.length && !preSeats.includes(seat)) {
      throw new Error("That seat can't play before the terrain is revealed.");
    }

    const nextPulsePhase = full ? "actions" : preSeats.length && !preDone ? "pre_selection" : "selection";
    let exchange = (data.exchange ?? null) as any;
    if (pulsePhase === "pre_selection" && nextPulsePhase !== "pre_selection" && !exchange) {
      const exchangeFrom = mandatoryExchangeSeat({ locationId: data.locationId, partPicks: data.partPicks });
      if (exchangeFrom) exchange = { from: exchangeFrom, status: "awaiting_offer" as const };
    }

    tx.update(gameRef, {
      hands,
      played,
      pulsePhase: nextPulsePhase,
      exchange,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function offerExchangeCard(
  gameId: string,
  actorUid: string,
  fromSeat: PlayerSlot,
  toSeat: PlayerSlot,
  cardId: string
) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if (data.pulsePhase === "pre_selection") throw new Error("Terrain is not revealed yet.");

    const ex = data.exchange ?? null;
    if (!ex || ex.status !== "awaiting_offer") throw new Error("No pending exchange offer.");
    if (ex.from !== fromSeat) throw new Error("Only the exchanging seat can offer a card.");
    if (fromSeat === toSeat) throw new Error("Choose a different seat.");

    const fromUid = data.players?.[fromSeat];
    if (!fromUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(fromUid);
    const isHost = data.createdBy === actorUid;
    if (fromUid !== actorUid && !(isHost && isBot)) throw new Error("You can't act for that seat.");

    const toUid = data.players?.[toSeat];
    if (!toUid) throw new Error("Recipient seat is empty.");

    const hands = { ...(data.hands ?? {}) } as SeatHands;
    const fromHand = [...(hands[fromSeat] ?? [])];
    const idx = fromHand.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error("Card not found in hand.");
    const [card] = fromHand.splice(idx, 1);
    hands[fromSeat] = fromHand;

    const toHand = [...(hands[toSeat] ?? [])];
    toHand.push(card);
    hands[toSeat] = toHand;

    tx.update(gameRef, {
      hands,
      exchange: { from: fromSeat, to: toSeat, offered: card, status: "awaiting_return" },
      updatedAt: serverTimestamp(),
    });
  });
}

export async function returnExchangeCard(gameId: string, actorUid: string, seat: PlayerSlot, cardId: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if (data.pulsePhase === "pre_selection") throw new Error("Terrain is not revealed yet.");

    const ex = data.exchange ?? null;
    if (!ex || ex.status !== "awaiting_return") throw new Error("No exchange awaiting return.");
    if (ex.to !== seat) throw new Error("Only the recipient seat can return a card.");
    if (!ex.from) throw new Error("Invalid exchange state.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (seatUid !== actorUid && !(isHost && isBot)) throw new Error("You can't act for that seat.");

    const hands = { ...(data.hands ?? {}) } as SeatHands;
    const myHand = [...(hands[seat] ?? [])];
    const idx = myHand.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error("Card not found in hand.");
    const [card] = myHand.splice(idx, 1);
    hands[seat] = myHand;

    const fromHand = [...(hands[ex.from] ?? [])];
    fromHand.push(card);
    hands[ex.from] = fromHand;

    tx.update(gameRef, {
      hands,
      exchange: null,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function playAuxBatteryCard(gameId: string, actorUid: string, seat: PlayerSlot, cardId: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if ((data.pulsePhase ?? "selection") !== "actions") throw new Error("Only after reveal.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (seatUid !== actorUid && !(isHost && isBot)) throw new Error("You can't act for that seat.");

    const abilityKey = "once_per_chapter_extra_card_after_reveal";
    if (!hasEffect(effectsForSeat(data, seat), abilityKey)) {
      throw new Error("That seat cannot manifest an additional card.");
    }

    const chapterAbilityUsed = ensureChapterAbilityUsed(data);
    const usedForSeat = { ...(chapterAbilityUsed[seat] ?? {}) };
    if (usedForSeat[abilityKey]) throw new Error("This ability was already used this Sphere.");

    const played = { ...(data.played ?? {}) } as any;
    const entry = played[seat];
    if (!entry?.card) throw new Error("Seat has not played a card.");
    if (entry.extraCard) throw new Error("Extra card already contributed.");

    const hands = { ...(data.hands ?? {}) } as SeatHands;
    const hand = [...(hands[seat] ?? [])];
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error("Card not found in hand.");
    const [card] = hand.splice(idx, 1);
    hands[seat] = hand;

    const { extraValueChoice: _oldExtraChoice, ...entryRest } = entry;
    played[seat] = { ...entryRest, extraCard: card };
    usedForSeat[abilityKey] = true;
    chapterAbilityUsed[seat] = usedForSeat;

    tx.update(gameRef, {
      hands,
      played,
      chapterAbilityUsed,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function setPlayedCardValueChoice(
  gameId: string,
  actorUid: string,
  seat: PlayerSlot,
  target: "primary" | "extra",
  value: number | null
) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if ((data.pulsePhase ?? "selection") !== "actions") throw new Error("Card values can be chosen only after reveal.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (seatUid !== actorUid && !(isHost && isBot)) throw new Error("You can't act for that seat.");

    const played = { ...(data.played ?? {}) } as any;
    const entry = played[seat];
    if (!entry?.card) throw new Error("Seat has not played a card.");

    const card = target === "primary" ? entry.card : entry.extraCard;
    if (!card) throw new Error("No card available for that choice.");

    const options = effectiveValueOptionsForCard(
      { locationId: data.locationId, partPicks: data.partPicks, seatSigils: data.seatSigils },
      seat,
      card,
      target === "primary" ? entry.valueOverride : undefined
    );
    if (options.length <= 1) throw new Error("This card has a fixed value.");

    const field = target === "primary" ? "valueChoice" : "extraValueChoice";
    if (value === null) {
      const { [field]: _ignore, ...rest } = entry;
      played[seat] = rest;
    } else {
      if (!options.includes(value)) throw new Error("Invalid value for this card.");
      played[seat] = { ...entry, [field]: value };
    }

    tx.update(gameRef, {
      played,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function useSteamSigilResonance(gameId: string, actorUid: string, seat: PlayerSlot) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if ((data.pulsePhase ?? "selection") !== "actions") throw new Error("Only after reveal.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (seatUid !== actorUid && !(isHost && isBot)) throw new Error("You can't act for that seat.");

    const abilityKey = "once_per_chapter_resonance_as_steam";
    if (!hasEffect(effectsForSeat(data, seat), abilityKey)) {
      throw new Error("That seat cannot force Steam resonance.");
    }

    const chapterAbilityUsed = ensureChapterAbilityUsed(data);
    const usedForSeat = { ...(chapterAbilityUsed[seat] ?? {}) };
    if (usedForSeat[abilityKey]) throw new Error("This sigil was already used this Sphere.");

    const played = { ...(data.played ?? {}) } as any;
    const entry = played[seat];
    if (!entry?.card) throw new Error("Seat has not played a card.");
    played[seat] = { ...entry, resonanceSuitOverride: "steam" };
    usedForSeat[abilityKey] = true;
    chapterAbilityUsed[seat] = usedForSeat;

    tx.update(gameRef, {
      played,
      chapterAbilityUsed,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function useLensOfTiphareth(gameId: string, actorUid: string, seat: PlayerSlot, cardId: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if ((data.pulsePhase ?? "selection") !== "actions") throw new Error("Only after reveal.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (seatUid !== actorUid && !(isHost && isBot)) throw new Error("You can't act for that seat.");

    const abilityKey = "swap_and_skip_turn";
    if (!hasEffect(effectsForSeat(data, seat), abilityKey)) {
      throw new Error("That seat cannot use this action.");
    }

    const skipNextPulse = { ...(data.skipNextPulse ?? {}) };
    if (skipNextPulse[seat]) throw new Error("This action was already used for the next Pulse.");

    const played = { ...(data.played ?? {}) } as any;
    const entry = played[seat];
    if (!entry?.card) throw new Error("Seat has not played a card.");

    const hands = { ...(data.hands ?? {}) } as SeatHands;
    const hand = [...(hands[seat] ?? [])];
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error("Card not found in hand.");

    const handCard = hand[idx]!;
    hand[idx] = entry.card;
    const { valueChoice: _oldChoice, ...entryRest } = entry;
    played[seat] = { ...entryRest, card: handCard };
    hands[seat] = hand;
    skipNextPulse[seat] = true;

    tx.update(gameRef, {
      hands,
      played,
      skipNextPulse,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function useFuse(gameId: string, actorUid: string, seat: PlayerSlot, targetSeat: PlayerSlot) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if ((data.pulsePhase ?? "selection") !== "actions") throw new Error("Only after reveal.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (seatUid !== actorUid && !(isHost && isBot)) throw new Error("You can't act for that seat.");

    const abilityKey = "once_per_chapter_fuse_to_zero_after_reveal";
    if (!hasEffect(effectsForSeat(data, seat), abilityKey)) {
      throw new Error("That seat cannot reduce a manifested card to 0.");
    }

    const chapterAbilityUsed = ensureChapterAbilityUsed(data);
    const usedForSeat = { ...(chapterAbilityUsed[seat] ?? {}) };
    if (usedForSeat[abilityKey]) throw new Error("This ability was already used this Sphere.");

    const played = { ...(data.played ?? {}) } as any;
    const entry = played[targetSeat];
    if (!entry?.card) throw new Error("Target seat has not played a card.");
    if (entry.valueOverride === 0) throw new Error("That card is already reduced to 0.");

    const { valueChoice: _oldChoice, ...entryRest } = entry;
    played[targetSeat] = { ...entryRest, valueOverride: 0 };
    usedForSeat[abilityKey] = true;
    chapterAbilityUsed[seat] = usedForSeat;

    tx.update(gameRef, {
      played,
      chapterAbilityUsed,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function swapWithReservoir(gameId: string, actorUid: string, seat: PlayerSlot, reservoirSlot: 1 | 2 = 1) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if (data.pulsePhase !== "actions") throw new Error("Not in actions phase.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (seatUid !== actorUid && !(isHost && isBot)) throw new Error("You can't act for that seat.");

    const reservoirKey = reservoirSlot === 2 ? ("reservoir2" as const) : ("reservoir" as const);
    const reservoir = (reservoirSlot === 2 ? data.reservoir2 : data.reservoir) ?? null;
    if (!reservoir) throw new Error("No reservoir card.");

    const played = { ...(data.played ?? {}) } as any;
    const entry = played[seat];
    if (!entry?.card) throw new Error("Seat has not played a card.");

    const nextReservoir = entry.card as PulseCard;
    const { valueOverride: _oldOverride, valueChoice: _oldChoice, ...rest } = entry;
    played[seat] = { ...rest, card: reservoir };

    const location = getLocationById(data.locationId ?? null);
    const locationEffects = location?.effects ?? [];
    const swapCostEffect = locationEffects.find((e) => e?.type === "swap_friction_cost");
    let cost = swapCostEffect ? Math.max(0, Number((swapCostEffect as any).amount) || 0) : 1;
    if (hasEffect(effectsForSeat(data, seat), "free_swap_on_suit_resonance") && entry.card?.suit === reservoir.suit) {
      cost = 0;
    }
    const sigilZeroSwap = effectsForSeat(data, seat).find((e) => e?.type === "swap_friction_zero_if_replaced_suit") as any;
    if (sigilZeroSwap?.suit && entry.card?.suit === sigilZeroSwap.suit) {
      cost = 0;
    }

    let heat = data.golem?.heat ?? 0;
    let hp = data.golem?.hp ?? 5;
    heat += cost;
    if (heat >= 3) {
      hp = Math.max(0, hp - 1);
      heat = 0;
    }

    tx.update(gameRef, {
      [reservoirKey]: nextReservoir,
      played,
      golem: { hp, heat },
      ...(hp <= 0
        ? {
            status: "completed" as GameStatus,
            endedReason: "loss" as const,
            completedAt: serverTimestamp(),
          }
        : {}),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function togglePendingDiscardSelection(gameId: string, actorUid: string, seat: PlayerSlot, cardId: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if (data.pulsePhase !== "discard_selection") throw new Error("No discard selection pending.");

    const pending = data.pendingDiscard;
    if (!pending) throw new Error("No discard selection pending.");
    const request = pending.requests?.[seat];
    if (!request) throw new Error("This seat has no discard request.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (seatUid !== actorUid && !(isHost && isBot)) throw new Error("You can't act for that seat.");

    const hand = data.hands?.[seat] ?? [];
    if (!hand.some((card) => card.id === cardId)) throw new Error("Card not found in hand.");

    const maxSelectable = Math.max(0, Number(request.required) || 0) + Math.max(0, Number(request.optional) || 0);
    const selections = { ...(pending.selections ?? {}) } as Partial<Record<PlayerSlot, string[]>>;
    const current = Array.from(new Set(selections[seat] ?? []));
    const idx = current.indexOf(cardId);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      if (current.length >= maxSelectable) throw new Error("Maximum selectable cards reached.");
      current.push(cardId);
    }
    selections[seat] = current;

    const confirmed = { ...(pending.confirmed ?? {}) } as Partial<Record<PlayerSlot, boolean>>;
    confirmed[seat] = false;

    tx.update(gameRef, {
      pendingDiscard: {
        ...pending,
        selections,
        confirmed,
      } satisfies PendingDiscardState,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function confirmPendingDiscardSelection(
  gameId: string,
  actorUid: string,
  seat: PlayerSlot,
  skip: boolean = false
) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if (data.pulsePhase !== "discard_selection") throw new Error("No discard selection pending.");

    const pending = data.pendingDiscard;
    if (!pending) throw new Error("No discard selection pending.");
    const request = pending.requests?.[seat];
    if (!request) throw new Error("This seat has no discard request.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (seatUid !== actorUid && !(isHost && isBot)) throw new Error("You can't act for that seat.");

    const required = Math.max(0, Number(request.required) || 0);
    const optional = Math.max(0, Number(request.optional) || 0);
    const maxSelectable = required + optional;
    const hand = data.hands?.[seat] ?? [];

    const selections = { ...(pending.selections ?? {}) } as Partial<Record<PlayerSlot, string[]>>;
    const uniqueSelection = Array.from(new Set(selections[seat] ?? []));
    if (uniqueSelection.some((id) => !hand.some((card) => card.id === id))) {
      throw new Error("Discard selection is no longer valid.");
    }
    if (uniqueSelection.length > maxSelectable) throw new Error("Too many cards selected.");

    if (skip) {
      if (!request.allowSkip || required > 0) throw new Error("Skipping is not allowed for this discard.");
      selections[seat] = [];
    } else if (uniqueSelection.length < required) {
      throw new Error(`Select at least ${required} card${required === 1 ? "" : "s"}.`);
    } else {
      selections[seat] = uniqueSelection;
    }

    const confirmed = { ...(pending.confirmed ?? {}) } as Partial<Record<PlayerSlot, boolean>>;
    confirmed[seat] = true;

    tx.update(gameRef, {
      pendingDiscard: {
        ...pending,
        selections,
        confirmed,
      } satisfies PendingDiscardState,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function endActions(gameId: string, actorUid: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if (data.pulsePhase !== "actions" && data.pulsePhase !== "discard_selection") {
      throw new Error("Not in actions/discard phase.");
    }

    const isHost = data.createdBy === actorUid;
    if (!isHost) throw new Error("Only the host can end actions (v0).");
    if (data.exchange) throw new Error("Resolve the Communion exchange first.");
    if (data.pulsePhase === "discard_selection" && !data.pendingDiscard) {
      throw new Error("Discard selection is not initialized.");
    }

    const pendingDiscard = data.pendingDiscard ?? null;
    const pendingReason = pendingDiscard?.reason ?? null;
    const pendingSelections = { ...(pendingDiscard?.selections ?? {}) } as Partial<Record<PlayerSlot, string[]>>;
    const pendingConfirmed = { ...(pendingDiscard?.confirmed ?? {}) } as Partial<Record<PlayerSlot, boolean>>;

    const requestSelection = (
      seat: PlayerSlot,
      request: PendingDiscardSeatRequest,
      hand: PulseCard[]
    ): string[] | null => {
      const required = Math.max(0, Number(request.required) || 0);
      const optional = Math.max(0, Number(request.optional) || 0);
      const maxSelectable = required + optional;
      const values = Array.from(new Set(pendingSelections[seat] ?? []));
      if (values.length > maxSelectable) throw new Error("Too many cards selected for discard.");
      if (values.some((id) => !hand.some((card) => card.id === id))) {
        throw new Error("Discard selection is not valid for current hand.");
      }
      if (!pendingConfirmed[seat]) return null;
      if (values.length < required) return null;
      return values;
    };

    const promptDiscardSelection = (
      reason: PendingDiscardState["reason"],
      requests: Partial<Record<PlayerSlot, PendingDiscardSeatRequest>>
    ) => {
      const carrySelections =
        pendingReason === reason
          ? normalizePendingSelectionsForRequests(requests, pendingSelections)
          : normalizePendingSelectionsForRequests(requests, undefined);
      const carryConfirmed =
        pendingReason === reason
          ? normalizePendingConfirmedForRequests(requests, pendingConfirmed)
          : normalizePendingConfirmedForRequests(requests, undefined);
      tx.update(gameRef, {
        pulsePhase: "discard_selection" as const,
        pendingDiscard: {
          reason,
          requests,
          selections: carrySelections,
          confirmed: carryConfirmed,
        } satisfies PendingDiscardState,
        updatedAt: serverTimestamp(),
      });
    };

    const terrainDeck = data.terrainDeck ?? [];
    const terrainIndex = data.terrainIndex ?? 0;
    const terrain = terrainDeck[terrainIndex];
    if (!terrain) throw new Error("No terrain card.");

    const skipThisPulse = { ...(data.skipThisPulse ?? {}) };
    const activeSeats = SLOTS.filter((seat) => Boolean(data.players?.[seat]) && !skipThisPulse[seat]);
    if (activeSeats.length === 0) throw new Error("No active seats for this Pulse.");

    const played = data.played ?? {};
    for (const seat of activeSeats) {
      if (!played[seat]?.card) throw new Error("Not all seats played.");
    }

    const location = getLocationById(data.locationId ?? null);
    const locationEffects = location?.effects ?? [];
    const chapterAbilityUsed = ensureChapterAbilityUsed(data);
    const chapterGlobalUsed = ensureChapterGlobalUsed(data);

    const options: number[][] = [];
    const optionSeat: PlayerSlot[] = [];
    for (const seat of activeSeats) {
      const entry = played[seat]!;
      const primaryOptions = effectiveValueOptionsForCard(
        { locationId: data.locationId, partPicks: data.partPicks, seatSigils: data.seatSigils },
        seat,
        entry.card,
        entry.valueOverride
      );
      const primaryChoice =
        typeof entry.valueChoice === "number" && primaryOptions.includes(entry.valueChoice)
          ? entry.valueChoice
          : null;
      options.push(primaryChoice === null ? primaryOptions : [primaryChoice]);
      optionSeat.push(seat);
      if (entry.extraCard) {
        const extraOptions = effectiveValueOptionsForCard(
          { locationId: data.locationId, partPicks: data.partPicks, seatSigils: data.seatSigils },
          seat,
          entry.extraCard
        );
        const extraChoice =
          typeof entry.extraValueChoice === "number" && extraOptions.includes(entry.extraValueChoice)
            ? entry.extraValueChoice
            : null;
        options.push(extraChoice === null ? extraOptions : [extraChoice]);
        optionSeat.push(seat);
      }
    }
    const selection = bestFitSelection(options, terrain.min, terrain.max);
    const total = selection.total;
    const seatManifestedValues: Partial<Record<PlayerSlot, number[]>> = {};
    selection.chosenValues.forEach((value, index) => {
      const seat = optionSeat[index];
      if (!seat) return;
      const prev = seatManifestedValues[seat] ?? [];
      prev.push(value);
      seatManifestedValues[seat] = prev;
    });

    let result: "success" | "undershoot" | "overshoot" = "success";
    if (total < terrain.min) result = "undershoot";
    else if (total > terrain.max) result = "overshoot";

    if (result === "undershoot" && locationEffects.some((e) => e?.type === "undershoot_counts_as_overshoot")) {
      result = "overshoot";
    }

    const anchorEffectKey = "prevent_stall_limited_refill";
    if (result === "undershoot" && terrain.min - total <= 3) {
      const anchorSeat = activeSeats.find((seat) => {
        if (!hasEffect(effectsForSeat(data, seat), anchorEffectKey)) return false;
        return !Boolean(chapterAbilityUsed?.[seat]?.[anchorEffectKey]);
      });
      if (anchorSeat) {
        chapterAbilityUsed[anchorSeat] = { ...(chapterAbilityUsed[anchorSeat] ?? {}), [anchorEffectKey]: true };
        result = "success";
      }
    }

    let hp = data.golem?.hp ?? 5;
    let heat = data.golem?.heat ?? 0;
    if (result === "overshoot") {
      const shieldEffectKey = "once_per_chapter_prevent_first_overshoot_damage";
      const shieldSeat = SLOTS.find((seat) => {
        if (!hasEffect(effectsForSeat(data, seat), shieldEffectKey)) return false;
        return !Boolean(chapterAbilityUsed?.[seat]?.[shieldEffectKey]);
      });
      if (shieldSeat) {
        chapterAbilityUsed[shieldSeat] = { ...(chapterAbilityUsed[shieldSeat] ?? {}), [shieldEffectKey]: true };
      } else {
        const stoneShieldKey = "once_per_chapter_overshoot_stone_to_friction";
        const stoneShieldSeat = activeSeats.find((seat) => {
          if (!hasEffect(effectsForSeat(data, seat), stoneShieldKey)) return false;
          if (chapterAbilityUsed?.[seat]?.[stoneShieldKey]) return false;
          const entry = played[seat];
          return seatPlayedSuit(entry as any, "stone");
        });

        if (stoneShieldSeat) {
          chapterAbilityUsed[stoneShieldSeat] = { ...(chapterAbilityUsed[stoneShieldSeat] ?? {}), [stoneShieldKey]: true };
          heat += 1;
        } else {
          let damage = 1;
          const highRiskSeats = activeSeats.filter((seat) =>
            hasEffect(effectsForSeat(data, seat), "high_value_double_damage_risk")
          );
          if (highRiskSeats.length) {
            const maxima = activeSeats.map((seat) =>
              Math.max(...(seatManifestedValues[seat] ?? [Number.NEGATIVE_INFINITY]))
            );
            const overallMax = Math.max(...maxima);
            const hasTopRisk = highRiskSeats.some((seat) => {
              const seatMax = Math.max(...(seatManifestedValues[seat] ?? [Number.NEGATIVE_INFINITY]));
              return Number.isFinite(seatMax) && seatMax === overallMax;
            });
            if (hasTopRisk) damage = 2;
          }
          hp = Math.max(0, hp - damage);
        }
      }
    }

    const deck = [...(data.pulseDeck ?? [])];
    const discard = [...(data.pulseDiscard ?? [])];
    const hands = { ...(data.hands ?? {}) } as SeatHands;

    // Discard played cards (public v0).
    const discardedThisPulse: PulseCard[] = [];
    for (const seat of activeSeats) {
      const entry = played[seat]!;
      discard.push(entry.card);
      discardedThisPulse.push(entry.card);
      if (entry.extraCard) {
        discard.push(entry.extraCard);
        discardedThisPulse.push(entry.extraCard);
      }
    }

    const anyMatchedTerrain = activeSeats.some((seat) => {
      const entry = played[seat]!;
      const suits = [entry.card.suit, entry.extraCard?.suit].filter(Boolean) as PulseSuit[];
      return suits.some((s) => s !== "prism" && s === terrain.suit);
    });

    // Location rule: add friction if nobody matched the terrain suit.
    const frictionIfNoMatch = locationEffects.find((e) => e?.type === "friction_if_no_terrain_match");
    if (frictionIfNoMatch && !anyMatchedTerrain) {
      heat += Number((frictionIfNoMatch as any).amount) || 0;
    }

    const parityEffect = locationEffects.find((e) => e?.type === "friction_by_total_parity") as any;
    if (parityEffect) {
      if (total % 2 === 0) heat += Number(parityEffect.evenAmount) || 0;
      else heat += Number(parityEffect.oddAmount) || 0;
    }

    // Faculty rule: friction delta when playing a specific suit.
    for (const seat of activeSeats) {
      const entry = played[seat]!;
      const frictionEffects = effectsForSeat(data, seat).filter((e) => e?.type === "friction_delta_if_played_suit");
      for (const e of frictionEffects) {
        const suit = e?.suit as any;
        if (!suit) continue;
        if (seatPlayedSuit(entry, suit)) {
          heat += Number(e.amount) || 0;
        }
      }
    }

    const frictionUnlessEtherOrPrism = locationEffects.find((e) => e?.type === "friction_unless_two_ether_or_prism") as any;
    if (frictionUnlessEtherOrPrism) {
      const threshold = Math.max(1, Number(frictionUnlessEtherOrPrism.threshold) || 2);
      const amount = Number(frictionUnlessEtherOrPrism.amount) || 0;
      const etherOrPrismCount = activeSeats.reduce((count, seat) => {
        const entry = played[seat]!;
        const suits = [entry.card.suit, entry.extraCard?.suit].filter(Boolean) as PulseSuit[];
        return count + suits.filter((s) => s === "ether" || s === "prism").length;
      }, 0);
      if (etherOrPrismCount < threshold) heat += amount;
    }

    const dualityEffect = activeSeats.some((seat) => hasEffect(effectsForSeat(data, seat), "median_heal_boundary_friction"));
    if (dualityEffect) {
      const median = Math.floor((terrain.min + terrain.max) / 2);
      if (total === median) heat = 0;
      if (total === terrain.min || total === terrain.max) heat += 1;
    }

    heat = Math.max(0, heat);
    if (heat >= 3) {
      hp = Math.max(0, hp - 1);
      heat = 0;
    }

	    const baseHandCapacity = data.baseHandCapacity ?? 5;
	    const refill = (seat: PlayerSlot) => {
	      const cap = handCapacityForSeat(
	        { baseHandCapacity, partPicks: data.partPicks, locationId: data.locationId, seatSigils: data.seatSigils },
	        seat
	      );
      const h = [...(hands[seat] ?? [])];
      if (h.length >= cap) {
        hands[seat] = h;
        return;
      }

      const res = drawCardsWithReshuffle(deck, discard, cap - h.length);
      deck.splice(0, deck.length, ...res.deck);
      discard.splice(0, discard.length, ...res.discard);
      h.push(...res.drawn);
      while (h.length > cap) h.pop();
      hands[seat] = h;
      return;
    };

    const resonanceDisabled = locationEffects.some((e) => e?.type === "disable_resonance_refill");
    const matchesTerrainSuit = (seat: PlayerSlot) => {
      if (resonanceDisabled) return false;
      if (hasEffect(effectsForSeat(data, seat), "disable_match_refill_on_failure")) return false;
      const entry = played[seat];
      if (!entry?.card) return false;
      const suits = [entry.card.suit, entry.extraCard?.suit].filter(Boolean) as PulseSuit[];
      if (entry.resonanceSuitOverride) suits.push(entry.resonanceSuitOverride);
      return suits.some((s) => s !== "prism" && s === terrain.suit);
    };

    const noRefillSuitEffects = locationEffects.filter((e) => e?.type === "no_refill_if_played_suit") as any[];
    const blocksRefill = (seat: PlayerSlot) => {
      if (!noRefillSuitEffects.length) return false;
      const entry = played[seat];
      if (!entry?.card) return false;
      return noRefillSuitEffects.some((e) => e?.suit && seatPlayedSuit(entry, e.suit));
    };

    const warmupActive = locationEffects.some((e) => e?.type === "first_stall_refill_all");
    const warmupAvailable = warmupActive && !chapterGlobalUsed.first_stall_refill_all;
    const treatUndershootAsRefillAll = result === "undershoot" && warmupAvailable;
    if (treatUndershootAsRefillAll) chapterGlobalUsed.first_stall_refill_all = true;

    const acidDiscardRequests: Partial<Record<PlayerSlot, PendingDiscardSeatRequest>> = {};
    let needsAcidPrompt = false;
    const anchorLocked = (seat: PlayerSlot) => Boolean(chapterAbilityUsed?.[seat]?.[anchorEffectKey]);
    const refillIfAllowed = (seat: PlayerSlot, source: "success" | "resonance" | "other") => {
      if ((source === "success" || source === "resonance") && anchorLocked(seat)) return;
      if (blocksRefill(seat)) return;

      if (source === "resonance") {
        const seatEffects = effectsForSeat(data, seat);
        const entry = played[seat];
        const acidResonanceSigil = hasEffect(seatEffects, "acid_resonance_discard_two_then_refill");
        if (acidResonanceSigil && entry && seatPlayedSuit(entry as any, "acid")) {
          const h = [...(hands[seat] ?? [])];
          const discardCount = Math.min(2, h.length);
          if (discardCount > 0) {
            const request: PendingDiscardSeatRequest = {
              required: discardCount,
              optional: 0,
              allowSkip: false,
              label: "Sigil of Acid: choose cards to discard before Resonance refill.",
            };
            acidDiscardRequests[seat] = request;
            if (pendingReason !== "acid_resonance") {
              needsAcidPrompt = true;
              return;
            }
            const selected = requestSelection(seat, request, h);
            if (!selected) {
              needsAcidPrompt = true;
              return;
            }
            const selectedSet = new Set(selected);
            const kept: PulseCard[] = [];
            for (const card of h) {
              if (selectedSet.has(card.id)) {
                discard.push(card);
                discardedThisPulse.push(card);
              } else {
                kept.push(card);
              }
            }
            hands[seat] = kept;
          } else {
            hands[seat] = h;
          }
        }
      }

      refill(seat);
    };

    const successHighestResonance = locationEffects.some((e) => e?.type === "success_refill_highest_else_resonance");

    // Draw step:
    // - Success: everyone refills.
    // - Overshoot: everyone refills (damage still applies).
    // - Undershoot: only matching-suit players refill (unless effects disable Resonance).
    if (result === "success") {
      if (successHighestResonance) {
        const maxima = activeSeats.map((seat) => Math.max(...(seatManifestedValues[seat] ?? [Number.NEGATIVE_INFINITY])));
        const overallMax = Math.max(...maxima);
        const topSeats = activeSeats.filter((seat) => {
          const seatMax = Math.max(...(seatManifestedValues[seat] ?? [Number.NEGATIVE_INFINITY]));
          return Number.isFinite(seatMax) && seatMax === overallMax;
        });

        for (const seat of SLOTS) {
          if (topSeats.includes(seat)) {
            refillIfAllowed(seat, "success");
          } else if (matchesTerrainSuit(seat)) {
            refillIfAllowed(seat, "resonance");
          }
        }
      } else {
        for (const seat of SLOTS) refillIfAllowed(seat, "success");
      }
    } else if (result === "overshoot" || treatUndershootAsRefillAll) {
      for (const seat of SLOTS) refillIfAllowed(seat, "other");
    } else {
      for (const seat of SLOTS) {
        if (matchesTerrainSuit(seat)) refillIfAllowed(seat, "resonance");
      }
    }

    if (needsAcidPrompt) {
      promptDiscardSelection("acid_resonance", acidDiscardRequests);
      return;
    }

    // Part rule: discard extra cards on undershoot (e.g., Fractured Pillar).
    // This resolves after draw/refill effects (including Resonance).
    if (result === "undershoot") {
      const undershootDiscardRequests: Partial<Record<PlayerSlot, PendingDiscardSeatRequest>> = {};
      let needsUndershootPrompt = false;
      for (const seat of SLOTS) {
        const discardCount = effectsForSeat(data, seat)
          .filter((e) => e?.type === "discard_cards_on_undershoot")
          .reduce((sum, e) => sum + (Number(e.count) || 0), 0);
        if (!discardCount) continue;
        const h = [...(hands[seat] ?? [])];
        const required = Math.min(discardCount, h.length);
        if (!required) continue;
        const request: PendingDiscardSeatRequest = {
          required,
          optional: 0,
          allowSkip: false,
          label: "Undershoot penalty: choose cards to discard.",
        };
        undershootDiscardRequests[seat] = request;
        if (pendingReason !== "undershoot_penalty") {
          needsUndershootPrompt = true;
          continue;
        }
        const selected = requestSelection(seat, request, h);
        if (!selected) {
          needsUndershootPrompt = true;
          continue;
        }
        const selectedSet = new Set(selected);
        const kept: PulseCard[] = [];
        for (const card of h) {
          if (selectedSet.has(card.id)) {
            discard.push(card);
            discardedThisPulse.push(card);
          } else {
            kept.push(card);
          }
        }
        hands[seat] = kept;
      }
      if (needsUndershootPrompt) {
        promptDiscardSelection("undershoot_penalty", undershootDiscardRequests);
        return;
      }
    }

    // Desperation Surge: if anyone is out of cards when the next selection begins,
    // the Vessel takes 1 damage and everyone refills to capacity.
    const desperation = SLOTS.some((seat) => (hands[seat] ?? []).length === 0);
    if (desperation) {
      hp = Math.max(0, hp - 1);
      for (const seat of SLOTS) refill(seat);
    }

    const advance = result !== "undershoot";
    const nextIndex = advance ? terrainIndex + 1 : terrainIndex;
    const nextStep = advance ? (data.step ?? 1) + 1 : (data.step ?? 1);
    const gameMode = (data.gameMode ?? "campaign") as GameMode;
    const chapter = data.chapter ?? 1;

    const nextLog = {
      chapter,
      step: data.step ?? 1,
      terrainSuit: terrain.suit,
      min: terrain.min,
      max: terrain.max,
      total,
      result,
      atMs: Date.now(),
    };
    const prevLog = data.outcomeLog ?? [];
    const outcomeLog = [...prevLog.slice(Math.max(0, prevLog.length - 49)), nextLog];

    const endedByDamage = hp <= 0;
    const completedChapter = advance && nextIndex >= terrainDeck.length;
    const completedSingleLocationRun = completedChapter && gameMode === "single_location";
    const locationSigilReward = completedChapter && gameMode === "campaign" ? location?.sigilReward : null;
    const rewardTier = Math.max(1, Number(locationSigilReward?.tier) || 1);
    const rewardReveal = Math.max(0, Number(locationSigilReward?.reveal) || 0);
    const rewardChoose = Math.max(0, Number(locationSigilReward?.choose) || 0);
    const shouldLocationSigilReward = Boolean(locationSigilReward && rewardReveal > 0 && rewardChoose > 0);
    const nextStage = chapter + 1;
    const nextLocations =
      completedChapter && gameMode === "campaign" ? getLocationsForStage(nextStage).map((l) => l.id) : [];
    const nextPulsePhase = preSelectionSeats({ locationId: data.locationId, partPicks: data.partPicks }).length
      ? ("pre_selection" as const)
      : ("selection" as const);
    const nextExchangeFrom = mandatoryExchangeSeat({ locationId: data.locationId, partPicks: data.partPicks });
    const nextExchange =
      nextPulsePhase !== "pre_selection" && nextExchangeFrom
        ? { from: nextExchangeFrom, status: "awaiting_offer" as const }
        : null;
    const nextSkipThisPulse = { ...(data.skipNextPulse ?? {}) };

    const basePatch: Record<string, any> = {
      golem: { hp, heat },
      pulseDeck: deck,
      pulseDiscard: discard,
      lastDiscarded: discardedThisPulse,
      hands,
      played: {},
      terrainIndex: advance ? (nextIndex >= terrainDeck.length ? 0 : nextIndex) : terrainIndex,
      step: nextStep,
      pulsePhase: nextPulsePhase,
      exchange: nextExchange,
      skipThisPulse: nextSkipThisPulse,
      skipNextPulse: {},
      lastOutcome: {
        result,
        total,
        min: terrain.min,
        max: terrain.max,
        at: serverTimestamp(),
      },
      outcomeLog,
      chapterAbilityUsed,
      chapterGlobalUsed,
      pendingDiscard: deleteField(),
      updatedAt: serverTimestamp(),
    };

    if (endedByDamage) {
      basePatch.status = "completed" as GameStatus;
      basePatch.endedReason = "loss" as const;
      basePatch.completedAt = serverTimestamp();
      basePatch.exchange = null;
      tx.update(gameRef, basePatch);
      return;
    }

    if (completedSingleLocationRun) {
      tx.update(gameRef, {
        ...basePatch,
        status: "completed" as GameStatus,
        endedReason: "win" as const,
        completedAt: serverTimestamp(),
        exchange: null,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    if (completedChapter) {
      if (shouldLocationSigilReward) {
        const rewardPool = revealSigilsByTier(rewardTier, rewardReveal);
        const rewardMaxPicks = Math.min(Math.max(1, rewardChoose), rewardPool.length);
        if (!rewardPool.length) {
          tx.update(gameRef, {
            ...basePatch,
            // Start next stage at location selection; re-deal happens after part confirmation.
            chapter: nextStage,
            step: 1,
            phase: "choose_location" as const,
            locationId: null,
            locationOptions: nextLocations,
            locationVotes: {},
            partPicks: {},
            optionalPartId: null,
            partAssignments: {},
            chapterAbilityUsed: {},
            chapterGlobalUsed: {},
            pulseDeck: [],
            pulseDiscard: discard,
            lastDiscarded: discardedThisPulse,
            hands: {},
            reservoir: null,
            reservoir2: null,
            exchange: null,
            skipThisPulse: {},
            skipNextPulse: {},
            terrainDeck: [],
            terrainDeckType: deleteField(),
            terrainIndex: 0,
            played: {},
            pulsePhase: "selection" as const,
            sigilDraftContext: deleteField(),
            sigilDraftTier: deleteField(),
            sigilDraftPool: deleteField(),
            sigilDraftAssignments: deleteField(),
            sigilDraftMaxPicks: deleteField(),
            updatedAt: serverTimestamp(),
          });
          return;
        }
        tx.update(gameRef, {
          ...basePatch,
          chapter: nextStage,
          step: 1,
          phase: "choose_sigils" as const,
          locationId: null,
          locationOptions: nextLocations,
          locationVotes: {},
          partPicks: {},
          optionalPartId: null,
          partAssignments: {},
          chapterAbilityUsed: {},
          chapterGlobalUsed: {},
          pulseDeck: [],
          pulseDiscard: discard,
          lastDiscarded: discardedThisPulse,
          hands: {},
          reservoir: null,
          reservoir2: null,
          exchange: null,
          skipThisPulse: {},
          skipNextPulse: {},
          terrainDeck: [],
          terrainDeckType: deleteField(),
          terrainIndex: 0,
          played: {},
          pulsePhase: "selection" as const,
          sigilDraftContext: "reward_location" as const,
          sigilDraftTier: rewardTier,
          sigilDraftPool: rewardPool,
          sigilDraftAssignments: {},
          sigilDraftMaxPicks: rewardMaxPicks,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      if (nextLocations.length) {
        tx.update(gameRef, {
          ...basePatch,
          // Start next stage at location selection; re-deal happens after part confirmation.
          chapter: nextStage,
          step: 1,
          phase: "choose_location" as const,
          locationId: null,
          locationOptions: nextLocations,
          locationVotes: {},
          partPicks: {},
          optionalPartId: null,
          partAssignments: {},
          chapterAbilityUsed: {},
          chapterGlobalUsed: {},
          pulseDeck: [],
          pulseDiscard: discard,
          lastDiscarded: discardedThisPulse,
          hands: {},
          reservoir: null,
          reservoir2: null,
          exchange: null,
          skipThisPulse: {},
          skipNextPulse: {},
          terrainDeck: [],
          terrainDeckType: deleteField(),
          terrainIndex: 0,
          played: {},
          pulsePhase: "selection" as const,
          sigilDraftContext: deleteField(),
          sigilDraftTier: deleteField(),
          sigilDraftPool: deleteField(),
          sigilDraftAssignments: deleteField(),
          sigilDraftMaxPicks: deleteField(),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.update(gameRef, {
          ...basePatch,
          status: "completed" as GameStatus,
          endedReason: "win" as const,
          completedAt: serverTimestamp(),
          exchange: null,
          updatedAt: serverTimestamp(),
        });
      }
      return;
    }

    tx.update(gameRef, basePatch);
  });
}

export async function completeGame(gameId: string, hostUid: string) {
  const gameRef = doc(db, "games", gameId);
  const snap = await getDoc(gameRef);
  if (!snap.exists()) throw new Error("Game not found.");
  const data = snap.data() as GameDoc;
  if (data.createdBy !== hostUid) throw new Error("Only the host can complete the game.");
  await updateDoc(gameRef, {
    status: "completed",
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function invitePlayer(gameId: string, hostUid: string, targetUid: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.createdBy !== hostUid) throw new Error("Only the host can invite.");

    const players = data.players ?? {};
    const alreadyIn = Object.values(players).includes(targetUid);
    if (alreadyIn) throw new Error("That player is already in the room.");

    const invited = new Set(data.invitedUids ?? []);
    invited.add(targetUid);

    tx.update(gameRef, { invitedUids: Array.from(invited), updatedAt: serverTimestamp() });
  });
}

export async function revokeInvite(gameId: string, hostUid: string, targetUid: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.createdBy !== hostUid) throw new Error("Only the host can revoke invites.");

    const invited = new Set(data.invitedUids ?? []);
    invited.delete(targetUid);
    tx.update(gameRef, { invitedUids: Array.from(invited), updatedAt: serverTimestamp() });
  });
}
