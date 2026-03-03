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
  CampaignVariant,
  GameDoc,
  GameStatus,
  GameMode,
  ChapterAbilityUsed,
  ChapterGlobalUsed,
  PendingDiscardSeatRequest,
  PendingDiscardState,
  PendingRecoverState,
  PlayerSlot,
  Players,
  PulseCard,
  PulseSuit,
  SeatHands,
} from "../types";
import {
  getAllCampaignPaths,
  getAllLocations,
  getAllSigils,
  getCampaignPathLocationForSphere,
  getLocationById,
  getLocationsForStage,
  getPartById,
  getSigilById,
} from "../game/locations";
import {
  defaultTerrainDeckTypeForSphere,
  makePulseDeck,
  makeTerrainDeck,
} from "./game/decks";
import { shuffleInPlace } from "./game/random";
import { bestFitSelection, pulseCardValueOptions } from "./game/scoring";

const GAMES = collection(db, "games");

const SLOTS: PlayerSlot[] = ["p1", "p2", "p3"];
const TUTORIAL_LOCATION_ID = "TUTORIAL_MALKUTH_AWAKENING";
const SHARED_PSEUDO_UID = "shared:p3";
const SHARED_PSEUDO_NAME = "Shared Vessel";

function effectsForSeat(
  data: Pick<GameDoc, "locationId" | "partPicks"> & Partial<Pick<GameDoc, "seatSigils" | "gameMode">>,
  seat: PlayerSlot
): any[] {
  if (data.gameMode === "tutorial") return [];
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
  data: Pick<GameDoc, "baseHandCapacity" | "partPicks" | "locationId"> &
    Partial<Pick<GameDoc, "seatSigils" | "gameMode" | "targetPlayers" | "players">>,
  seat: PlayerSlot
): number {
  const sharedSeatBaseline =
    targetPlayersForGame(data) === 2 && seat === "p3" && isSharedPseudoUid(data.players?.p3) ? 3 : null;
  const base = sharedSeatBaseline ?? data.baseHandCapacity ?? 5;
  const effects = effectsForSeat(data, seat);
  const fixed = effects.find((e) => e?.type === "hand_capacity_set");
  const baseCap = fixed ? Math.max(0, Number(fixed.amount) || 0) : base;
  const delta = effects
    .filter((e) => e?.type === "hand_capacity_delta")
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  return Math.max(0, baseCap + delta);
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
  const suits = manifestedCards(entry as any).map((c) => c.suit);
  return suits.includes(suit);
}

function manifestedCards(entry: { card?: PulseCard; extraCard?: PulseCard; additionalCards?: PulseCard[] } | undefined): PulseCard[] {
  if (!entry?.card) return [];
  const extras = Array.isArray(entry.additionalCards)
    ? entry.additionalCards
    : entry.extraCard
      ? [entry.extraCard]
      : [];
  return [entry.card, ...extras];
}

function manifestedCount(entry: { card?: PulseCard; extraCard?: PulseCard; additionalCards?: PulseCard[] } | undefined): number {
  return manifestedCards(entry).length;
}

function conductorSeat(data: Pick<GameDoc, "partPicks">): PlayerSlot | null {
  return SLOTS.find((seat) => seatHasPart(data, seat, "conductor_of_streams")) ?? null;
}

function applyConductorTransfersForPulse(
  data: Pick<GameDoc, "locationId" | "partPicks" | "players"> & Partial<Pick<GameDoc, "gameMode">>,
  handsRaw: SeatHands
): {
  hands: SeatHands;
  skipThisPulse: Partial<Record<PlayerSlot, boolean>>;
  conductorPasses: Partial<Record<PlayerSlot, boolean>>;
} {
  const location = getLocationById(data.locationId ?? null);
  const locationEffects = location?.effects ?? [];
  const hasPassRule = locationEffects.some((e) => e?.type === "pre_selection_pass_to_conductor");
  const hasConductorRule = locationEffects.some((e) => e?.type === "conductor_plays_three_cards");
  if (!hasPassRule || !hasConductorRule) return { hands: handsRaw, skipThisPulse: {}, conductorPasses: {} };

  const conductor = conductorSeat(data);
  if (!conductor || !data.players?.[conductor]) return { hands: handsRaw, skipThisPulse: {}, conductorPasses: {} };

  const skipThisPulse: Partial<Record<PlayerSlot, boolean>> = {};
  const conductorPasses: Partial<Record<PlayerSlot, boolean>> = {};
  for (const seat of SLOTS) {
    if (!data.players?.[seat]) continue;
    skipThisPulse[seat] = seat !== conductor;
    if (seat !== conductor) conductorPasses[seat] = false;
  }

  return { hands: handsRaw, skipThisPulse, conductorPasses };
}

function effectiveValueOptionsForCard(
  data: Pick<GameDoc, "locationId" | "partPicks"> & Partial<Pick<GameDoc, "seatSigils" | "gameMode">>,
  seat: PlayerSlot,
  card: PulseCard,
  valueOverride?: number,
  terrainSuit?: Exclude<PulseSuit, "prism"> | null
): number[] {
  if (typeof valueOverride === "number") return [valueOverride];
  const seatEffects = effectsForSeat(data, seat);
  const valueDelta = seatEffects
    .filter((e) => e?.type === "pulse_value_delta")
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const valueMultiplier = seatEffects
    .filter((e) => e?.type === "pulse_value_multiplier")
    .reduce((product, e) => product * Math.max(1, Number(e.amount) || 1), 1);
  return pulseCardValueOptions(card, seatEffects, { terrainSuit: terrainSuit ?? null }).map(
    (v) => (v + valueDelta) * valueMultiplier
  );
}

function preSelectionSeats(data: Pick<GameDoc, "locationId" | "partPicks"> & Partial<Pick<GameDoc, "gameMode">>): PlayerSlot[] {
  if (data.gameMode === "tutorial") return [];
  return SLOTS.filter((seat) => hasEffect(effectsForSeat(data, seat), "hide_terrain_until_played"));
}

function mandatoryExchangeSeat(
  data: Pick<GameDoc, "locationId" | "partPicks"> & Partial<Pick<GameDoc, "gameMode">>
): PlayerSlot | null {
  if (data.gameMode === "tutorial") return null;
  return (
    SLOTS.find((seat) => hasEffect(effectsForSeat(data, seat), "mandatory_card_exchange_after_terrain_reveal")) ?? null
  );
}

function locationHasEffect(locationId: string | null | undefined, effectType: string): boolean {
  const location = getLocationById(locationId ?? null);
  return Boolean(location?.effects?.some((effect) => effect?.type === effectType));
}

function drawCardsWithLocationRules(
  deck: PulseCard[],
  discard: PulseCard[],
  count: number,
  options?: {
    primordialSeaActive?: boolean;
    onPrimordialSeaReshuffle?: () => boolean | void;
  }
): PulseCard[] {
  const drawn: PulseCard[] = [];
  while (drawn.length < count) {
    if (deck.length === 0) {
      if (discard.length === 0) break;
      if (options?.primordialSeaActive && options.onPrimordialSeaReshuffle) {
        const keepDrawing = options.onPrimordialSeaReshuffle();
        if (keepDrawing === false) break;
      }
      shuffleInPlace(discard);
      deck.push(...discard);
      discard.splice(0, discard.length);
    }
    const next = deck.shift();
    if (!next) break;
    drawn.push(next);
  }
  return drawn;
}

function pulseKey(chapter: number, step: number, terrainIndex: number, outcomeLogLength: number): string {
  return `${chapter}:${step}:${terrainIndex}:${outcomeLogLength}`;
}

function reservoirCardMultiplierValue(card: PulseCard | null | undefined): number {
  if (!card) return 0;
  if (card.suit !== "prism") return Math.max(0, Number(card.value ?? 0));
  return 3;
}

function pulseKeyFromData(data: Pick<GameDoc, "chapter" | "step" | "terrainIndex" | "outcomeLog">): string {
  const chapter = Math.max(1, Number(data.chapter ?? 1));
  const step = Math.max(1, Number(data.step ?? 1));
  const terrainIndex = Math.max(0, Number(data.terrainIndex ?? 0));
  const outcomeLogLength = Math.max(0, (data.outcomeLog ?? []).length);
  return pulseKey(chapter, step, terrainIndex, outcomeLogLength);
}

function pulseFrictionAnchorForCurrentPulse(data: Pick<GameDoc, "golem" | "pulseFrictionAnchor" | "chapter" | "step" | "terrainIndex" | "outcomeLog">) {
  const key = pulseKeyFromData(data);
  const existing = data.pulseFrictionAnchor;
  if (existing && existing.key === key) {
    return { key, hp: Number(existing.hp ?? 0), heat: Number(existing.heat ?? 0) };
  }
  return {
    key,
    hp: data.golem?.hp ?? 5,
    heat: data.golem?.heat ?? 0,
  };
}

function isFrictionIgnoredForCurrentPulse(data: Pick<GameDoc, "frictionIgnoredPulseKey" | "chapter" | "step" | "terrainIndex" | "outcomeLog">) {
  return data.frictionIgnoredPulseKey === pulseKeyFromData(data);
}

function applyFrictionDelta(
  hp: number,
  heat: number,
  delta: number,
  options?: { ignorePositive?: boolean }
): { hp: number; heat: number } {
  const amount = Number(delta) || 0;
  if (amount > 0 && options?.ignorePositive) return { hp, heat };

  let nextHp = hp;
  let nextHeat = heat + amount;
  if (nextHeat < 0) nextHeat = 0;

  if (amount > 0 && nextHeat >= 3) {
    nextHp = Math.max(0, nextHp - 1);
    nextHeat = 0;
  }

  return { hp: nextHp, heat: nextHeat };
}

function normalizeCampaignVariant(data: Partial<Pick<GameDoc, "campaignVariant">>): CampaignVariant {
  const variant = data.campaignVariant;
  if (variant === "random_choice" || variant === "preset_path") return variant;
  return "free_choice";
}

function normalizeCampaignRandomFaculties(data: Partial<Pick<GameDoc, "campaignRandomFaculties">>): boolean {
  return Boolean(data.campaignRandomFaculties);
}

function normalizeCampaignPathId(data: Partial<Pick<GameDoc, "campaignPathId">>): string | null {
  const id = data.campaignPathId?.trim();
  return id ? id : null;
}

function pickRandom<T>(items: T[]): T | null {
  if (!items.length) return null;
  const idx = Math.floor(Math.random() * items.length);
  return items[idx] ?? null;
}

function campaignLocationOptionsForChapter(
  chapter: number,
  campaignVariant: CampaignVariant,
  campaignPathId: string | null
): string[] {
  const all = getLocationsForStage(chapter).map((l) => l.id);
  if (campaignVariant === "random_choice") {
    const picked = pickRandom(all);
    return picked ? [picked] : [];
  }
  if (campaignVariant === "preset_path") {
    const loc = getCampaignPathLocationForSphere(campaignPathId, chapter);
    return loc ? [loc] : [];
  }
  return all;
}

function randomPartPicksForLocation(locationId: string): Record<PlayerSlot, string> | null {
  const location = getLocationById(locationId);
  if (!location) return null;
  const compulsory = [...location.compulsory.map((p) => p.id)];
  const optional = [...location.optional.map((p) => p.id)];
  const pool = Array.from(new Set([...compulsory, ...optional]));
  if (compulsory.length > SLOTS.length) return null;
  if (pool.length < SLOTS.length) return null;

  shuffleInPlace(compulsory);
  const seats = [...SLOTS];
  shuffleInPlace(seats);

  const picks: Partial<Record<PlayerSlot, string>> = {};
  const used = new Set<string>();
  for (let i = 0; i < compulsory.length; i += 1) {
    const seat = seats[i];
    const partId = compulsory[i];
    if (!seat || !partId) continue;
    picks[seat] = partId;
    used.add(partId);
  }

  const restSeats = seats.filter((s) => !picks[s]);
  const candidates = pool.filter((id) => !used.has(id));
  shuffleInPlace(candidates);
  if (candidates.length < restSeats.length) return null;

  for (let i = 0; i < restSeats.length; i += 1) {
    const seat = restSeats[i];
    const partId = candidates[i];
    if (!seat || !partId) return null;
    picks[seat] = partId;
  }

  if (!SLOTS.every((seat) => Boolean(picks[seat]))) return null;
  return picks as Record<PlayerSlot, string>;
}

function buildPlayPhasePatchFromPicks(data: GameDoc, picks: Record<PlayerSlot, string>) {
  const location = getLocationById(data.locationId ?? null);
  if (!location) throw new Error("Location not set.");

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
      {
        baseHandCapacity,
        partPicks: picks,
        locationId: data.locationId ?? undefined,
        seatSigils: data.seatSigils,
        gameMode: data.gameMode,
        targetPlayers: data.targetPlayers,
        players: data.players,
      },
      seat
    );
    hands[seat] = deck.splice(0, cap);
  }

  const conductorSetup = applyConductorTransfersForPulse(
    { locationId: data.locationId, partPicks: picks, players: data.players, gameMode: data.gameMode },
    hands
  );
  const startingHands = conductorSetup.hands;
  const startingSkip = conductorSetup.skipThisPulse;
  const startingPasses = conductorSetup.conductorPasses;

  const reservoirCountEffect = location.effects?.find((e) => e?.type === "reservoir_count") as any;
  const reservoirCount = Math.min(2, Math.max(1, Number(reservoirCountEffect?.count) || 1));
  const reservoir = deck.shift() ?? null;
  const reservoir2 = reservoirCount >= 2 ? (deck.shift() ?? null) : null;

  const terrainDeckType = location.terrainDeckType ?? defaultTerrainDeckTypeForSphere(location.sphere ?? 1);
  const terrainCardsPerRun = Math.max(1, Number(location.terrainCardsPerRun ?? 5));
  const terrainDeck = makeTerrainDeck(terrainDeckType, terrainCardsPerRun);
  const chapter = Math.max(1, Number(data.chapter ?? location.sphere ?? 1));
  const initialPulseKey = pulseKey(chapter, 1, 0, 0);
  const preSeats = preSelectionSeats({ locationId: data.locationId, partPicks: picks, gameMode: data.gameMode });
  const exchangeFrom = mandatoryExchangeSeat({ locationId: data.locationId, partPicks: picks, gameMode: data.gameMode });
  const exchange = !preSeats.length && exchangeFrom ? { from: exchangeFrom, status: "awaiting_offer" as const } : null;

  return {
    phase: "play" as const,
    partPicks: picks,
    partAssignments: assignments,
    hands: startingHands,
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
    pulsePhase: preSeats.length ? ("pre_selection" as const) : ("selection" as const),
    exchange,
    skipThisPulse: startingSkip,
    skipNextPulse: {},
    conductorPasses: startingPasses,
    played: {},
    chapterAbilityUsed: {},
    chapterGlobalUsed: {},
    pulseFrictionAnchor: { key: initialPulseKey, hp: data.golem?.hp ?? 5, heat: data.golem?.heat ?? 0 },
    frictionIgnoredPulseKey: null,
    pendingDiscard: deleteField(),
    pendingRecover: deleteField(),
  };
}

function buildTutorialPlayPatch(data: GameDoc, locationId: string) {
  const location = getLocationById(locationId);
  if (!location) throw new Error("Tutorial location is not configured.");

  const deck = makePulseDeck();
  shuffleInPlace(deck);

  const baseHandCapacity = data.baseHandCapacity ?? 5;
  const hands: SeatHands = {};
  for (const seat of SLOTS) {
    if (!data.players?.[seat]) continue;
    hands[seat] = deck.splice(0, baseHandCapacity);
  }

  const reservoirCountEffect = location.effects?.find((e) => e?.type === "reservoir_count") as any;
  const reservoirCount = Math.min(2, Math.max(1, Number(reservoirCountEffect?.count) || 1));
  const reservoir = deck.shift() ?? null;
  const reservoir2 = reservoirCount >= 2 ? (deck.shift() ?? null) : null;

  const terrainDeckType = location.terrainDeckType ?? defaultTerrainDeckTypeForSphere(location.sphere ?? 1);
  const terrainCardsPerRun = Math.max(1, Number(location.terrainCardsPerRun ?? 5));
  const terrainDeck = makeTerrainDeck(terrainDeckType, terrainCardsPerRun);
  const chapter = Math.max(1, Number(data.chapter ?? location.sphere ?? 1));
  const initialPulseKey = pulseKey(chapter, 1, 0, 0);

  return {
    phase: "play" as const,
    partPicks: {},
    partAssignments: {},
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
    pulsePhase: "selection" as const,
    exchange: null,
    skipThisPulse: {},
    skipNextPulse: {},
    conductorPasses: deleteField(),
    played: {},
    chapterAbilityUsed: {},
    chapterGlobalUsed: {},
    pulseFrictionAnchor: { key: initialPulseKey, hp: data.golem?.hp ?? 5, heat: data.golem?.heat ?? 0 },
    frictionIgnoredPulseKey: null,
    pendingDiscard: deleteField(),
    pendingRecover: deleteField(),
  };
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

function targetPlayersForGame(data: Partial<Pick<GameDoc, "targetPlayers">>): 2 | 3 {
  return data.targetPlayers === 2 ? 2 : 3;
}

function joinableSlotsForTarget(targetPlayers: 2 | 3): PlayerSlot[] {
  return targetPlayers === 2 ? (["p1", "p2"] as PlayerSlot[]) : SLOTS;
}

export function getMySlot(players: Players, uid: string): PlayerSlot | null {
  for (const s of SLOTS) if (players[s] === uid) return s;
  return null;
}

function pickEmptySlot(players: Players, slots: PlayerSlot[] = SLOTS): PlayerSlot | null {
  for (const s of slots) if (!players[s]) return s;
  return null;
}

function playerUidsFromPlayers(players: Players): string[] {
  const values = SLOTS.map((s) => players[s]).filter(Boolean) as string[];
  return Array.from(new Set(values));
}

function isBotUid(uid: string): boolean {
  return uid.startsWith("bot:");
}

function isSharedPseudoUid(uid: string | undefined | null): boolean {
  return Boolean(uid && uid.startsWith("shared:"));
}

function canActorControlSeat(
  data: Pick<GameDoc, "players" | "createdBy" | "pseudoControllerUid">,
  actorUid: string,
  seat: PlayerSlot
): boolean {
  const seatUid = data.players?.[seat];
  if (!seatUid) return false;
  if (seatUid === actorUid) return true;
  if (isSharedPseudoUid(seatUid)) {
    const controller = data.pseudoControllerUid ?? data.createdBy ?? null;
    if (controller === actorUid) return true;
    return Boolean(data.createdBy === actorUid && controller && isBotUid(controller));
  }
  return Boolean(data.createdBy === actorUid && isBotUid(seatUid));
}

export type CreateGameOptions = {
  campaignVariant?: CampaignVariant;
  campaignRandomFaculties?: boolean;
  campaignPathId?: string | null;
  targetPlayers?: 2 | 3;
};

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
  gameMode: GameMode = "campaign",
  options: CreateGameOptions = {}
) {
  const campaignVariant = normalizeCampaignVariant(options);
  const campaignRandomFaculties = normalizeCampaignRandomFaculties(options);
  const campaignPathId = normalizeCampaignPathId(options);
  const targetPlayers = targetPlayersForGame(options);
  const initial: GameDoc = {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
    status: "lobby",
    visibility,
    targetPlayers,
    gameMode,
    campaignVariant,
    campaignRandomFaculties,
    campaignPathId,
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
    pseudoControllerUid: uid,
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
    const targetPlayers = targetPlayersForGame(data);
    const joinableSlots = joinableSlotsForTarget(targetPlayers);

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

    const slot = pickEmptySlot(players, joinableSlots);
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
    const targetPlayers = targetPlayersForGame(data);
    const players: Players = { ...(data.players ?? {}) };
    const slot = pickEmptySlot(players, joinableSlotsForTarget(targetPlayers));
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

    const targetPlayers = targetPlayersForGame(data);
    const players: Players = { ...(data.players ?? {}) };
    const joinableSlots = joinableSlotsForTarget(targetPlayers);
    const full = joinableSlots.every((s) => Boolean(players[s]));
    if (!full) throw new Error(`Need ${targetPlayers} players${targetPlayers === 3 ? " (add bots or wait for friends)." : "."}`);

    const playerNames = { ...(data.playerNames ?? {}) };
    let pseudoControllerUid = data.pseudoControllerUid ?? data.createdBy ?? null;
    if (targetPlayers === 2) {
      players.p3 = SHARED_PSEUDO_UID;
      playerNames[SHARED_PSEUDO_UID] = playerNames[SHARED_PSEUDO_UID] ?? SHARED_PSEUDO_NAME;
      if (!pseudoControllerUid || !(players.p1 === pseudoControllerUid || players.p2 === pseudoControllerUid)) {
        pseudoControllerUid = players.p1 ?? players.p2 ?? data.createdBy ?? null;
      }
    }

    const gameMode = (data.gameMode ?? "campaign") as GameMode;
    const campaignVariant = normalizeCampaignVariant(data);
    const campaignRandomFaculties = normalizeCampaignRandomFaculties(data);
    const campaignPathId = normalizeCampaignPathId(data);

    if (gameMode === "campaign" && campaignVariant === "preset_path") {
      const pathExists = getAllCampaignPaths().some((path) => path.id === campaignPathId);
      if (!pathExists) throw new Error("Campaign path not found.");
    }

    const locationOptions =
      gameMode === "single_location"
        ? getAllLocations().map((l) => l.id)
        : gameMode === "campaign"
          ? campaignLocationOptionsForChapter(1, campaignVariant, campaignPathId)
          : getLocationsForStage(1).map((l) => l.id);

    if (!locationOptions.length) throw new Error("No locations available for this run setup.");

    const basePatch: Record<string, any> = {
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
      pendingRecover: deleteField(),
      conductorPasses: deleteField(),
      partPicks: {},
      optionalPartId: null,
      partAssignments: {},
      seatSigils: data.seatSigils ?? {},
      chapter: 1,
      step: 1,
      golem: { hp: 5, heat: 0 },
      players,
      playerNames,
      pseudoControllerUid: targetPlayers === 2 ? pseudoControllerUid : null,
    };

    const autoLocationCampaign = gameMode === "campaign" && campaignVariant !== "free_choice" && locationOptions.length === 1;
    if (gameMode === "tutorial") {
      const patch = buildTutorialPlayPatch(
        { ...data, players, playerNames, pseudoControllerUid, locationId: TUTORIAL_LOCATION_ID, gameMode },
        TUTORIAL_LOCATION_ID
      );
      tx.update(gameRef, {
        ...basePatch,
        locationId: TUTORIAL_LOCATION_ID,
        locationOptions: [TUTORIAL_LOCATION_ID],
        locationVotes: {},
        ...patch,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    if (autoLocationCampaign) {
      const chosenLocation = locationOptions[0]!;
      if (campaignRandomFaculties) {
        const picks = randomPartPicksForLocation(chosenLocation);
        if (!picks) throw new Error("Unable to generate random faculty assignment for selected location.");
        const patch = buildPlayPhasePatchFromPicks(
          { ...data, players, playerNames, pseudoControllerUid, locationId: chosenLocation, gameMode },
          picks
        );
        tx.update(gameRef, {
          ...basePatch,
          locationId: chosenLocation,
          locationVotes: {},
          ...patch,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      tx.update(gameRef, {
        ...basePatch,
        locationId: chosenLocation,
        locationVotes: {},
        phase: "choose_parts" as const,
        partPicks: {},
        updatedAt: serverTimestamp(),
      });
      return;
    }

    tx.update(gameRef, basePatch);
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
    if (!canActorControlSeat(data, actorUid, seat)) {
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
        pendingRecover: deleteField(),
        conductorPasses: deleteField(),
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
      pendingRecover: deleteField(),
      conductorPasses: deleteField(),
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
    if (!canActorControlSeat(data, actorUid, seat)) {
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

export async function setPseudoController(gameId: string, actorUid: string, controllerUid: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (targetPlayersForGame(data) !== 2) throw new Error("Pseudo-controller is used only in 2-player rooms.");

    const p1 = data.players?.p1 ?? null;
    const p2 = data.players?.p2 ?? null;
    if (!p1 || !p2) throw new Error("Both player seats must be occupied.");
    if (actorUid !== p1 && actorUid !== p2) throw new Error("Only seated players can set pseudo-controller.");
    if (controllerUid !== p1 && controllerUid !== p2) throw new Error("Controller must be one of the two seated players.");

    tx.update(gameRef, {
      pseudoControllerUid: controllerUid,
      updatedAt: serverTimestamp(),
    });
  });
}

function canUseChapterMulligan(data: GameDoc): boolean {
  if (data.status !== "active" || data.phase !== "play") return false;
  const pulsePhase = (data.pulsePhase ?? "selection") as GameDoc["pulsePhase"];
  if (pulsePhase !== "selection" && pulsePhase !== "pre_selection") return false;
  if ((data.step ?? 1) !== 1) return false;
  if ((data.terrainIndex ?? 0) !== 0) return false;
  if (Boolean(data.chapterGlobalUsed?.chapter_mulligan_locked)) return false;
  const played = data.played ?? {};
  if (SLOTS.some((seat) => Boolean(played[seat]?.card))) return false;
  return true;
}

export async function useChapterMulligan(gameId: string, actorUid: string, seat: PlayerSlot, cardIds: string[]) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (!canUseChapterMulligan(data)) throw new Error("Global mulligan is not available now.");
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    const uniqueIds = Array.from(new Set(cardIds.filter(Boolean)));
    if (!uniqueIds.length) throw new Error("Select at least one card.");

    const hands = { ...(data.hands ?? {}) } as SeatHands;
    const hand = [...(hands[seat] ?? [])];
    if (!hand.length) throw new Error("No cards in hand.");

    const selectedSet = new Set(uniqueIds);
    const selectedCardsInHand = hand.filter((card) => selectedSet.has(card.id));
    if (selectedCardsInHand.length !== uniqueIds.length) throw new Error("Some selected cards are no longer in hand.");

    const keptHand = hand.filter((card) => !selectedSet.has(card.id));
    const selectedByChoiceOrder = uniqueIds
      .map((id) => selectedCardsInHand.find((card) => card.id === id))
      .filter((card): card is PulseCard => Boolean(card));

    const deck = [...(data.pulseDeck ?? [])];
    const discard = [...(data.pulseDiscard ?? [])];
    deck.push(...selectedByChoiceOrder);
    const drawn = drawCardsWithLocationRules(deck, discard, selectedByChoiceOrder.length);
    hands[seat] = [...keptHand, ...drawn];

    const chapterGlobalUsed = ensureChapterGlobalUsed(data);
    chapterGlobalUsed.chapter_mulligan_locked = true;

    tx.update(gameRef, {
      hands,
      pulseDeck: deck,
      pulseDiscard: discard,
      lastDiscarded: [],
      chapterGlobalUsed,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function skipChapterMulligan(gameId: string, actorUid: string, seat: PlayerSlot) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (!canUseChapterMulligan(data)) throw new Error("Global mulligan is not available now.");
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    const chapterGlobalUsed = ensureChapterGlobalUsed(data);
    chapterGlobalUsed.chapter_mulligan_locked = true;

    tx.update(gameRef, {
      chapterGlobalUsed,
      updatedAt: serverTimestamp(),
    });
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
    const isHost = data.createdBy === actorUid;

    const pool = data.sigilDraftPool ?? [];
    if (!pool.includes(sigilId)) throw new Error("Sigil not available in this draft.");
    if (seat && !data.players?.[seat]) throw new Error("Seat is empty.");

    const assignments = { ...(data.sigilDraftAssignments ?? {}) } as Record<string, PlayerSlot>;
    const maxPicks = Math.max(0, Number(data.sigilDraftMaxPicks ?? pool.length) || 0);
    const hadAssignment = Boolean(assignments[sigilId]);
    const currentSeat = assignments[sigilId] ?? null;

    const canControlSeat = (slot: PlayerSlot | null): boolean => {
      if (!slot) return false;
      if (isHost) return true;
      return canActorControlSeat(data, actorUid, slot);
    };

    if (!isHost) {
      if (seat) {
        if (!canControlSeat(seat)) throw new Error("You can assign sigils only for your seat.");
        if (currentSeat && currentSeat !== seat) {
          throw new Error("This sigil is already selected by another seat.");
        }
      } else {
        if (!currentSeat || !canControlSeat(currentSeat)) {
          throw new Error("You can deselect only sigils selected by your seat.");
        }
      }
    }

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
        conductorPasses: deleteField(),
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
      const gameMode = (data.gameMode ?? "campaign") as GameMode;
      const campaignVariant = normalizeCampaignVariant(data);
      const campaignRandomFaculties = normalizeCampaignRandomFaculties(data);
      const nextLocations = data.locationOptions ?? [];
      const autoLocationCampaign = gameMode === "campaign" && campaignVariant !== "free_choice" && nextLocations.length === 1;
      const nextAutoLocationId = autoLocationCampaign ? nextLocations[0] ?? null : null;

      if (nextAutoLocationId) {
        if (campaignRandomFaculties) {
          const randomPicks = randomPartPicksForLocation(nextAutoLocationId);
          if (!randomPicks) throw new Error("Unable to generate random faculty assignment for next chapter.");
          const playPatch = buildPlayPhasePatchFromPicks(
            { ...data, locationId: nextAutoLocationId, seatSigils, gameMode },
            randomPicks
          );
          tx.update(gameRef, {
            seatSigils,
            locationId: nextAutoLocationId,
            locationVotes: {},
            ...playPatch,
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
          phase: "choose_parts" as const,
          locationId: nextAutoLocationId,
          locationVotes: {},
          partPicks: {},
          partAssignments: {},
          conductorPasses: deleteField(),
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
        phase: "choose_location" as const,
        locationId: null,
        locationVotes: {},
        partPicks: {},
        partAssignments: {},
        conductorPasses: deleteField(),
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

    const patch = buildPlayPhasePatchFromPicks({ ...data, gameMode: data.gameMode }, picks as Record<PlayerSlot, string>);

    tx.update(gameRef, {
      ...patch,
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
    if (canUseChapterMulligan(data)) throw new Error("Use or skip the chapter mulligan before the first manifestation.");
    const pulsePhase = (data.pulsePhase ?? "selection") as any;
    if (pulsePhase !== "selection" && pulsePhase !== "pre_selection") throw new Error("Not in selection phase.");
    if (pulsePhase === "selection" && data.exchange) throw new Error("Resolve the Communion exchange first.");
    const skipThisPulse = data.skipThisPulse ?? {};
    if (skipThisPulse[seat]) throw new Error("This seat skips this Pulse.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't play for that seat.");
    const location = getLocationById(data.locationId ?? null);
    const locationEffects = location?.effects ?? [];
    const hasUnboundedSelection = locationEffects.some((e) => e?.type === "selection_unbounded_cards");
    const hasConductorRule = locationEffects.some((e) => e?.type === "conductor_plays_three_cards");
    const conductor = hasConductorRule ? conductorSeat(data) : null;
    if (hasConductorRule && conductor && seat !== conductor) {
      throw new Error("Only the Conductor can manifest in this location.");
    }

    const hands = { ...(data.hands ?? {}) } as SeatHands;
    const hand = [...(hands[seat] ?? [])];
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error("Card not found in hand.");
    const [card] = hand.splice(idx, 1);
    hands[seat] = hand;

    const activeSeats = SLOTS.filter((s) => Boolean(data.players?.[s]) && !skipThisPulse[s]);
    const played = { ...(data.played ?? {}) } as any;
    const heraldSeat =
      pulsePhase === "selection"
        ? activeSeats.find((s) => hasEffect(effectsForSeat(data, s), "must_play_first_faceup")) ?? null
        : null;
    if (heraldSeat && seat !== heraldSeat && !played[heraldSeat]?.card) {
      throw new Error("The Herald must manifest first.");
    }

    const seatEffects = effectsForSeat(data, seat);
    const revealDuringSelection =
      hasEffect(seatEffects, "reveal_card_during_selection") || (heraldSeat !== null && seat === heraldSeat);

    const existingEntry = played[seat];
    if (!existingEntry?.card) {
      played[seat] = {
        card,
        additionalCards: [],
        bySeat: seat,
        at: serverTimestamp(),
        ...(revealDuringSelection ? { revealedDuringSelection: true } : {}),
      };
    } else {
      const allowMulti = hasUnboundedSelection || (hasConductorRule && conductor === seat);
      if (!allowMulti) throw new Error("That seat already played a card.");

      const current = manifestedCards(existingEntry as any);
      const maxCards = hasConductorRule && conductor === seat ? 3 : Number.POSITIVE_INFINITY;
      if (current.length >= maxCards) throw new Error("Maximum manifested cards reached for this seat.");

      const additional = Array.isArray(existingEntry.additionalCards)
        ? [...existingEntry.additionalCards]
        : existingEntry.extraCard
          ? [existingEntry.extraCard]
          : [];
      additional.push(card);
      played[seat] = {
        ...existingEntry,
        additionalCards: additional,
        extraCard: additional[0],
      };
      if (additional.length === 1) {
        const { extraValueChoice: _unused, ...rest } = played[seat];
        played[seat] = rest;
      }
    }

    let full = activeSeats.every((s) => Boolean(played[s]?.card));
    if (hasConductorRule && conductor && activeSeats.includes(conductor)) {
      const conductorEntry = played[conductor];
      const count = manifestedCount(conductorEntry);
      const remaining = (hands[conductor] ?? []).length;
      const needed = Math.min(3, count + remaining);
      full = full && count >= needed;
    }
    const preSeats = preSelectionSeats({ locationId: data.locationId, partPicks: data.partPicks, gameMode: data.gameMode });
    const preDoneBase = preSeats.every((s) => skipThisPulse[s] || Boolean(played[s]));
    const sharedSeatMustAlsoPlayInPreSelection =
      targetPlayersForGame(data) === 2 &&
      isSharedPseudoUid(data.players?.p3) &&
      !skipThisPulse.p3 &&
      !Boolean(played.p3?.card);
    const preDone = preDoneBase && !sharedSeatMustAlsoPlayInPreSelection;

    if (pulsePhase === "pre_selection" && preSeats.length && !preSeats.includes(seat)) {
      throw new Error("That seat can't play before the terrain is revealed.");
    }

    const manualReveal = pulsePhase === "selection" && (hasUnboundedSelection || hasConductorRule);
    const nextPulsePhase = manualReveal
      ? preSeats.length && !preDone
        ? "pre_selection"
        : "selection"
      : full
        ? "actions"
        : preSeats.length && !preDone
          ? "pre_selection"
          : "selection";
    let exchange = (data.exchange ?? null) as any;
    if (pulsePhase === "pre_selection" && nextPulsePhase !== "pre_selection" && !exchange) {
      const exchangeFrom = mandatoryExchangeSeat({
        locationId: data.locationId,
        partPicks: data.partPicks,
        gameMode: data.gameMode,
      });
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

export async function playDiscardSigilCard(gameId: string, actorUid: string, seat: PlayerSlot, discardCardId: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if (canUseChapterMulligan(data)) throw new Error("Use or skip the chapter mulligan before the first manifestation.");
    const pulsePhase = (data.pulsePhase ?? "selection") as any;
    if (pulsePhase !== "selection" && pulsePhase !== "pre_selection") throw new Error("Not in selection phase.");
    if (pulsePhase === "selection" && data.exchange) throw new Error("Resolve the Communion exchange first.");

    const skipThisPulse = data.skipThisPulse ?? {};
    if (skipThisPulse[seat]) throw new Error("This seat skips this Pulse.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't play for that seat.");

    const abilityKey = "play_from_discard_once";
    if (!hasEffect(effectsForSeat(data, seat), abilityKey)) {
      throw new Error("That seat cannot manifest from the discard pile.");
    }
    const chapterAbilityUsed = ensureChapterAbilityUsed(data);
    const usedForSeat = { ...(chapterAbilityUsed[seat] ?? {}) };
    if (usedForSeat[abilityKey]) throw new Error("This sigil was already used this Sphere.");

    if (locationHasEffect(data.locationId, "remove_success_cards_from_game")) {
      throw new Error("Discard manifestations are sealed in this location.");
    }

    const location = getLocationById(data.locationId ?? null);
    const locationEffects = location?.effects ?? [];
    const hasUnboundedSelection = locationEffects.some((e) => e?.type === "selection_unbounded_cards");
    const hasConductorRule = locationEffects.some((e) => e?.type === "conductor_plays_three_cards");
    const conductor = hasConductorRule ? conductorSeat(data) : null;
    if (hasConductorRule && conductor && seat !== conductor) {
      throw new Error("Only the Conductor can manifest in this location.");
    }

    const discard = [...(data.pulseDiscard ?? [])];
    const discardIndex = discard.findIndex((card) => card.id === discardCardId);
    if (discardIndex < 0) throw new Error("Card not found in discard pile.");
    const [card] = discard.splice(discardIndex, 1);

    const activeSeats = SLOTS.filter((s) => Boolean(data.players?.[s]) && !skipThisPulse[s]);
    const played = { ...(data.played ?? {}) } as any;
    const heraldSeat =
      pulsePhase === "selection"
        ? activeSeats.find((s) => hasEffect(effectsForSeat(data, s), "must_play_first_faceup")) ?? null
        : null;
    if (heraldSeat && seat !== heraldSeat && !played[heraldSeat]?.card) {
      throw new Error("The Herald must manifest first.");
    }
    if (played[seat]?.card) throw new Error("That seat already manifested this Pulse.");

    played[seat] = {
      card,
      additionalCards: [],
      bySeat: seat,
      at: serverTimestamp(),
      revealedDuringSelection: true,
      disableResonanceRefill: true,
    };
    usedForSeat[abilityKey] = true;
    chapterAbilityUsed[seat] = usedForSeat;

    let full = activeSeats.every((s) => Boolean(played[s]?.card));
    if (hasConductorRule && conductor && activeSeats.includes(conductor)) {
      const conductorEntry = played[conductor];
      const count = manifestedCount(conductorEntry);
      const remaining = (data.hands?.[conductor] ?? []).length;
      const needed = Math.min(3, count + remaining);
      full = full && count >= needed;
    }
    const preSeats = preSelectionSeats({ locationId: data.locationId, partPicks: data.partPicks, gameMode: data.gameMode });
    const preDoneBase = preSeats.every((s) => skipThisPulse[s] || Boolean(played[s]));
    const sharedSeatMustAlsoPlayInPreSelection =
      targetPlayersForGame(data) === 2 &&
      isSharedPseudoUid(data.players?.p3) &&
      !skipThisPulse.p3 &&
      !Boolean(played.p3?.card);
    const preDone = preDoneBase && !sharedSeatMustAlsoPlayInPreSelection;

    if (pulsePhase === "pre_selection" && preSeats.length && !preSeats.includes(seat)) {
      throw new Error("That seat can't play before the terrain is revealed.");
    }

    const manualReveal = pulsePhase === "selection" && (hasUnboundedSelection || hasConductorRule);
    const nextPulsePhase = manualReveal
      ? preSeats.length && !preDone
        ? "pre_selection"
        : "selection"
      : full
        ? "actions"
        : preSeats.length && !preDone
          ? "pre_selection"
          : "selection";
    let exchange = (data.exchange ?? null) as any;
    if (pulsePhase === "pre_selection" && nextPulsePhase !== "pre_selection" && !exchange) {
      const exchangeFrom = mandatoryExchangeSeat({
        locationId: data.locationId,
        partPicks: data.partPicks,
        gameMode: data.gameMode,
      });
      if (exchangeFrom) exchange = { from: exchangeFrom, status: "awaiting_offer" as const };
    }

    tx.update(gameRef, {
      pulseDiscard: discard,
      played,
      chapterAbilityUsed,
      pulsePhase: nextPulsePhase,
      exchange,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function useBlackSeaSigilDraw(gameId: string, actorUid: string, seat: PlayerSlot, cardIds: string[]) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    const pulsePhase = data.pulsePhase ?? "selection";
    if (pulsePhase !== "selection" && pulsePhase !== "pre_selection") {
      throw new Error("This sigil can be used only during selection.");
    }
    if (data.exchange) throw new Error("Resolve the Communion exchange first.");
    if ((data.skipThisPulse ?? {})[seat]) throw new Error("This seat skips this Pulse.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    if (!hasEffect(effectsForSeat(data, seat), "discard_x_draw_x_for_friction")) {
      throw new Error("That seat cannot invoke this sigil.");
    }

    if (data.played?.[seat]?.card) {
      throw new Error("Use this sigil before manifesting.");
    }

    const uniqueIds = Array.from(new Set(cardIds.filter(Boolean)));
    if (!uniqueIds.length) throw new Error("Select at least one card.");

    const hands = { ...(data.hands ?? {}) } as SeatHands;
    const hand = [...(hands[seat] ?? [])];
    const selectedSet = new Set(uniqueIds);
    if (uniqueIds.some((id) => !hand.some((card) => card.id === id))) {
      throw new Error("One or more selected cards are no longer in hand.");
    }

    const kept: PulseCard[] = [];
    const discardedNow: PulseCard[] = [];
    for (const card of hand) {
      if (selectedSet.has(card.id)) discardedNow.push(card);
      else kept.push(card);
    }

    const deck = [...(data.pulseDeck ?? [])];
    const discard = [...(data.pulseDiscard ?? [])];
    discard.push(...discardedNow);

    const primordialSeaActive = locationHasEffect(data.locationId, "remove_success_cards_from_game");
    let hp = data.golem?.hp ?? 5;
    let heat = data.golem?.heat ?? 0;
    const drawn = drawCardsWithLocationRules(deck, discard, discardedNow.length, {
      primordialSeaActive,
      onPrimordialSeaReshuffle: () => {
        hp = Math.max(0, hp - 2);
        return hp > 0;
      },
    });
    kept.push(...drawn);
    hands[seat] = kept;

    const ignoreFriction = isFrictionIgnoredForCurrentPulse(data);
    const nextFriction = applyFrictionDelta(hp, heat, 1, { ignorePositive: ignoreFriction });
    hp = nextFriction.hp;
    heat = nextFriction.heat;

    tx.update(gameRef, {
      hands,
      pulseDeck: deck,
      pulseDiscard: discard,
      lastDiscarded: discardedNow,
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

export async function useShatteredClayShift(
  gameId: string,
  actorUid: string,
  seat: PlayerSlot,
  cardAId: string,
  cardBId: string,
  direction: 1 | -1
) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if ((data.pulsePhase ?? "selection") !== "actions") throw new Error("This sigil can be used only after reveal.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    const sigilEffect = effectsForSeat(data, seat).find((effect) => effect?.type === "discard_to_shift_value") as any;
    if (!sigilEffect) throw new Error("That seat cannot invoke this sigil.");
    const amount = Math.max(1, Number(sigilEffect.amount) || 0);

    const played = { ...(data.played ?? {}) } as any;
    const entry = played[seat];
    if (!entry?.card) throw new Error("Seat has not manifested a card.");
    if (typeof entry.postRevealValueDelta === "number") throw new Error("This sigil was already used this Pulse.");

    const hands = { ...(data.hands ?? {}) } as SeatHands;
    const hand = [...(hands[seat] ?? [])];
    if (!cardAId || !cardBId || cardAId === cardBId) {
      throw new Error("Select two different cards.");
    }

    const cardA = hand.find((card) => card.id === cardAId);
    const cardB = hand.find((card) => card.id === cardBId);
    if (!cardA || !cardB) throw new Error("Selected cards are no longer in hand.");
    if (cardA.suit !== cardB.suit) throw new Error("Selected cards must share the same suit.");

    const selected = new Set([cardAId, cardBId]);
    const kept = hand.filter((card) => !selected.has(card.id));
    const discardedNow = hand.filter((card) => selected.has(card.id));
    hands[seat] = kept;

    const discard = [...(data.pulseDiscard ?? []), ...discardedNow];
    const shift = direction < 0 ? -amount : amount;
    played[seat] = { ...entry, postRevealValueDelta: shift };

    tx.update(gameRef, {
      hands,
      played,
      pulseDiscard: discard,
      lastDiscarded: discardedNow,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function setResonanceGiftSeat(
  gameId: string,
  actorUid: string,
  seat: PlayerSlot,
  giftSeat: PlayerSlot | null
) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if ((data.pulsePhase ?? "selection") !== "actions") throw new Error("This sigil can be configured only after reveal.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    if (!hasEffect(effectsForSeat(data, seat), "resonance_grants_ally_refill")) {
      throw new Error("That seat does not have this sigil.");
    }

    const played = { ...(data.played ?? {}) } as any;
    const entry = played[seat];
    if (!entry?.card) throw new Error("Seat has not manifested a card.");

    if (giftSeat) {
      if (giftSeat === seat) throw new Error("Choose another seat.");
      if (!data.players?.[giftSeat]) throw new Error("Target seat is empty.");
      played[seat] = { ...entry, resonanceGiftSeat: giftSeat };
    } else {
      const { resonanceGiftSeat: _unused, ...rest } = entry;
      played[seat] = rest;
    }

    tx.update(gameRef, {
      played,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function confirmSelection(gameId: string, actorUid: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if ((data.pulsePhase ?? "selection") !== "selection") throw new Error("Selection is already resolved.");
    if (data.createdBy !== actorUid) throw new Error("Only the host can reveal selection for this location.");
    if (data.exchange) throw new Error("Resolve exchange before reveal.");

    const skipThisPulse = data.skipThisPulse ?? {};
    const activeSeats = SLOTS.filter((seat) => Boolean(data.players?.[seat]) && !skipThisPulse[seat]);
    const played = data.played ?? {};
    if (!activeSeats.length) throw new Error("No active seats this pulse.");
    for (const seat of activeSeats) {
      if (!played[seat]?.card) throw new Error("All active seats must manifest at least one card.");
    }

    const location = getLocationById(data.locationId ?? null);
    const locationEffects = location?.effects ?? [];
    const hasConductorRule = locationEffects.some((e) => e?.type === "conductor_plays_three_cards");
    if (hasConductorRule) {
      const conductor = conductorSeat(data);
      if (conductor && activeSeats.includes(conductor)) {
        const entry = played[conductor];
        const count = manifestedCount(entry as any);
        const remaining = (data.hands?.[conductor] ?? []).length;
        const needed = Math.min(3, count + remaining);
        if (count < needed) throw new Error("Conductor must manifest up to 3 cards before reveal.");
      }
    }

    tx.update(gameRef, {
      pulsePhase: "actions" as const,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function passCardToConductor(gameId: string, actorUid: string, seat: PlayerSlot, cardId: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    const pulsePhase = data.pulsePhase ?? "selection";
    if (pulsePhase !== "selection" && pulsePhase !== "pre_selection") {
      throw new Error("Cards can be passed to the Conductor only during selection.");
    }
    if (data.exchange) throw new Error("Resolve exchange before passing cards.");

    const location = getLocationById(data.locationId ?? null);
    const locationEffects = location?.effects ?? [];
    const hasPassRule = locationEffects.some((e) => e?.type === "pre_selection_pass_to_conductor");
    const hasConductorRule = locationEffects.some((e) => e?.type === "conductor_plays_three_cards");
    if (!hasPassRule || !hasConductorRule) throw new Error("This location does not use Conductor passing.");

    const conductor = conductorSeat(data);
    if (!conductor) throw new Error("No Conductor assigned.");
    if (seat === conductor) throw new Error("Conductor cannot pass to self.");
    if (data.played?.[conductor]?.card) throw new Error("Cannot pass after the Conductor started manifesting.");

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    const alreadyPassed = Boolean(data.conductorPasses?.[seat]);
    if (alreadyPassed) throw new Error("This seat already passed a card this pulse.");

    const hands = { ...(data.hands ?? {}) } as SeatHands;
    const donorHand = [...(hands[seat] ?? [])];
    const idx = donorHand.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error("Card not found in hand.");
    const [card] = donorHand.splice(idx, 1);
    hands[seat] = donorHand;

    const conductorHand = [...(hands[conductor] ?? [])];
    conductorHand.push(card);
    hands[conductor] = conductorHand;

    const conductorPasses = { ...(data.conductorPasses ?? {}) };
    conductorPasses[seat] = true;

    tx.update(gameRef, {
      hands,
      conductorPasses,
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
    if (!canActorControlSeat(data, actorUid, fromSeat)) throw new Error("You can't act for that seat.");

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
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

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
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

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
    if (entry.extraCard || (Array.isArray(entry.additionalCards) && entry.additionalCards.length > 0)) {
      throw new Error("Extra card already contributed.");
    }

    const hands = { ...(data.hands ?? {}) } as SeatHands;
    const hand = [...(hands[seat] ?? [])];
    const idx = hand.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error("Card not found in hand.");
    const [card] = hand.splice(idx, 1);
    hands[seat] = hand;

    const { extraValueChoice: _oldExtraChoice, ...entryRest } = entry;
    played[seat] = { ...entryRest, extraCard: card, additionalCards: [card] };
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
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    const played = { ...(data.played ?? {}) } as any;
    const entry = played[seat];
    if (!entry?.card) throw new Error("Seat has not played a card.");

    const card = target === "primary" ? entry.card : entry.extraCard;
    if (!card) throw new Error("No card available for that choice.");
    const terrainDeck = data.terrainDeck ?? [];
    const terrain = terrainDeck[data.terrainIndex ?? 0] ?? null;
    const location = getLocationById(data.locationId ?? null);
    const locationEffects = location?.effects ?? [];
    const locationReservoirAmplifies = locationEffects.some(
      (effect) => effect?.type === "manifested_cards_multiplier_from_reservoir_if_suit_match"
    );
    const reservoirSuit = data.reservoir?.suit ?? null;
    const reservoirMultiplier = reservoirCardMultiplierValue(data.reservoir);

    const optionsRaw = effectiveValueOptionsForCard(
      { locationId: data.locationId, partPicks: data.partPicks, seatSigils: data.seatSigils, gameMode: data.gameMode },
      seat,
      card,
      target === "primary" ? entry.valueOverride : undefined,
      terrain?.suit ?? null
    );
    const optionsWithLocation =
      locationReservoirAmplifies &&
      reservoirMultiplier > 0 &&
      reservoirSuit &&
      card.suit === reservoirSuit
        ? optionsRaw.map((option) => option * reservoirMultiplier)
        : optionsRaw;
    const postRevealDelta = target === "primary" ? Number(entry.postRevealValueDelta ?? 0) : 0;
    const options = postRevealDelta
      ? optionsWithLocation.map((option) => option + postRevealDelta)
      : optionsWithLocation;
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

export async function useBalancingScale(gameId: string, actorUid: string, seat: PlayerSlot, reduceBy: 1 | 2) {
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
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    const scaleEffect = effectsForSeat(data, seat).find((effect) => effect?.type === "post_reveal_reduce_if_top") as
      | { amount?: [number, number] }
      | undefined;
    if (!scaleEffect) throw new Error("That seat does not have the Balancing Scale.");

    const allowedRaw = Array.isArray(scaleEffect.amount) ? scaleEffect.amount : [1, 2];
    const allowed = new Set(allowedRaw.map((value) => Math.max(1, Number(value) || 0)));
    if (!allowed.has(reduceBy)) throw new Error("Invalid reduction value.");

    const played = { ...(data.played ?? {}) } as any;
    const entry = played[seat];
    if (!entry?.card) throw new Error("Seat has not played a card.");
    if (typeof entry.postRevealValueDelta === "number" && entry.postRevealValueDelta < 0) {
      throw new Error("Balancing Scale already used this Pulse.");
    }

    const skipThisPulse = data.skipThisPulse ?? {};
    const terrainDeck = data.terrainDeck ?? [];
    const terrain = terrainDeck[data.terrainIndex ?? 0] ?? null;
    if (!terrain) throw new Error("No terrain card.");
    const location = getLocationById(data.locationId ?? null);
    const locationEffects = location?.effects ?? [];
    const locationReservoirAmplifies = locationEffects.some(
      (effect) => effect?.type === "manifested_cards_multiplier_from_reservoir_if_suit_match"
    );
    const reservoirSuit = data.reservoir?.suit ?? null;
    const reservoirMultiplier = reservoirCardMultiplierValue(data.reservoir);

    const activeSeats = SLOTS.filter((s) => Boolean(data.players?.[s]) && !skipThisPulse[s] && Boolean(played[s]?.card));
    if (!activeSeats.includes(seat)) throw new Error("Seat is not active this Pulse.");

    const primaryValueForSeat = (targetSeat: PlayerSlot): number => {
      const targetEntry = played[targetSeat];
      const targetCard = targetEntry?.card as PulseCard | undefined;
      if (!targetCard) return Number.NEGATIVE_INFINITY;
      const optionsRaw = effectiveValueOptionsForCard(
        { locationId: data.locationId, partPicks: data.partPicks, seatSigils: data.seatSigils, gameMode: data.gameMode },
        targetSeat,
        targetCard,
        targetEntry?.valueOverride,
        terrain.suit
      );
      const optionsWithLocation =
        locationReservoirAmplifies &&
        reservoirMultiplier > 0 &&
        reservoirSuit &&
        targetCard.suit === reservoirSuit
          ? optionsRaw.map((value) => value * reservoirMultiplier)
          : optionsRaw;
      const postDelta = Number(targetEntry?.postRevealValueDelta ?? 0);
      const options = postDelta ? optionsWithLocation.map((value) => value + postDelta) : optionsWithLocation;
      const explicit = typeof targetEntry?.valueChoice === "number" && options.includes(targetEntry.valueChoice)
        ? targetEntry.valueChoice
        : null;
      return explicit ?? options[0] ?? Number.NEGATIVE_INFINITY;
    };

    const values = activeSeats.map((targetSeat) => primaryValueForSeat(targetSeat));
    const highest = Math.max(...values);
    const myValue = primaryValueForSeat(seat);
    if (!Number.isFinite(myValue) || myValue < highest) {
      throw new Error("Balancing Scale can be used only when your manifested value is tied for highest.");
    }

    const currentDelta = Number(entry.postRevealValueDelta ?? 0);
    const { valueChoice: _oldChoice, ...entryRest } = entry;
    played[seat] = { ...entryRest, postRevealValueDelta: currentDelta - reduceBy };

    tx.update(gameRef, {
      played,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function useTemperedCrucible(gameId: string, actorUid: string, seat: PlayerSlot) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    const pulsePhase = data.pulsePhase ?? "selection";
    if (!["pre_selection", "selection", "actions", "discard_selection"].includes(pulsePhase)) {
      throw new Error("This sigil can be activated only during a pulse.");
    }

    const seatUid = data.players?.[seat];
    if (!seatUid) throw new Error("Seat is empty.");
    const isBot = isBotUid(seatUid);
    const isHost = data.createdBy === actorUid;
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    const abilityKey = "once_per_chapter_ignore_friction_pulse";
    if (!hasEffect(effectsForSeat(data, seat), abilityKey)) {
      throw new Error("That seat does not have the Tempered Crucible.");
    }

    const chapterAbilityUsed = ensureChapterAbilityUsed(data);
    const usedForSeat = { ...(chapterAbilityUsed[seat] ?? {}) };
    if (usedForSeat[abilityKey]) throw new Error("This sigil was already used this Sphere.");

    const anchor = pulseFrictionAnchorForCurrentPulse(data);
    const currentKey = pulseKeyFromData(data);
    usedForSeat[abilityKey] = true;
    chapterAbilityUsed[seat] = usedForSeat;

    tx.update(gameRef, {
      chapterAbilityUsed,
      pulseFrictionAnchor: anchor,
      frictionIgnoredPulseKey: currentKey,
      golem: { hp: anchor.hp, heat: anchor.heat },
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
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

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

export async function useSteamOvertonesZero(
  gameId: string,
  actorUid: string,
  sourceSeat: PlayerSlot,
  targetSeat: PlayerSlot
) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if ((data.pulsePhase ?? "selection") !== "actions") throw new Error("Only after reveal.");
    if (sourceSeat === targetSeat) throw new Error("Choose another seat.");
    if (!canActorControlSeat(data, actorUid, sourceSeat)) throw new Error("You can't act for that seat.");

    const played = { ...(data.played ?? {}) } as any;
    const sourceEntry = played[sourceSeat];
    const targetEntry = played[targetSeat];
    if (!sourceEntry?.card) throw new Error("Source seat has not played a card.");
    if (!targetEntry?.card) throw new Error("Target seat has not played a card.");
    if (!hasEffect(effectsForSeat(data, sourceSeat), "steam_zero_other_after_reveal")) {
      throw new Error("That seat does not have Steam Overtones.");
    }
    if (!seatPlayedSuit(sourceEntry as any, "steam")) throw new Error("Manifest Steam to use Steam Overtones.");
    if (sourceEntry.steamOvertonesUsed) throw new Error("Steam Overtones already used this Pulse.");
    if (typeof targetEntry.valueOverride === "number" && targetEntry.valueOverride === 0) {
      throw new Error("Target is already set to 0.");
    }

    played[sourceSeat] = { ...sourceEntry, steamOvertonesUsed: true };
    played[targetSeat] = { ...targetEntry, valueOverride: 0 };

    tx.update(gameRef, {
      played,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function useAcidRecomposition(gameId: string, actorUid: string, seat: PlayerSlot) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if ((data.pulsePhase ?? "selection") !== "actions") throw new Error("Only after reveal.");
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    const played = { ...(data.played ?? {}) } as any;
    const entry = played[seat];
    if (!entry?.card) throw new Error("Seat has not played a card.");
    if (!hasEffect(effectsForSeat(data, seat), "acid_add_reservoir_value")) {
      throw new Error("That seat does not have Acid Recomposition.");
    }
    if (!seatPlayedSuit(entry as any, "acid")) throw new Error("Manifest Acid to use Acid Recomposition.");
    if (entry.acidRecompositionUsed) throw new Error("Acid Recomposition already used this Pulse.");

    const reservoirValue = reservoirCardMultiplierValue(data.reservoir);
    if (reservoirValue <= 0) throw new Error("Akashic Reservoir is empty.");
    const currentDelta = Number(entry.postRevealValueDelta ?? 0);
    played[seat] = {
      ...entry,
      postRevealValueDelta: currentDelta + reservoirValue,
      acidRecompositionUsed: true,
    };

    tx.update(gameRef, {
      played,
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
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

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
    const {
      valueChoice: _oldChoice,
      valueOverride: _oldOverride,
      postRevealValueDelta: _oldPostRevealDelta,
      disableResonanceRefill: _oldDisableResonanceRefill,
      ...entryRest
    } = entry;
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

export async function useHarmonicAmplifier(gameId: string, actorUid: string, seat: PlayerSlot) {
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
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    const abilityKey = "pay_friction_double_manifested_total";
    if (!hasEffect(effectsForSeat(data, seat), abilityKey)) {
      throw new Error("That seat cannot amplify the manifested total.");
    }

    const played = { ...(data.played ?? {}) } as any;
    const entry = played[seat];
    if (!entry?.card) throw new Error("Seat has not played a card.");
    if (Number(entry.totalMultiplier ?? 1) > 1) throw new Error("This action was already used this Pulse.");

    let heat = data.golem?.heat ?? 0;
    let hp = data.golem?.hp ?? 5;
    const ignoreFriction = isFrictionIgnoredForCurrentPulse(data);
    const nextFriction = applyFrictionDelta(hp, heat, 1, { ignorePositive: ignoreFriction });
    hp = nextFriction.hp;
    heat = nextFriction.heat;

    played[seat] = { ...entry, totalMultiplier: 2 };

    tx.update(gameRef, {
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
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

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

    const { valueChoice: _oldChoice, postRevealValueDelta: _oldPostRevealDelta, ...entryRest } = entry;
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

export async function swapWithReservoir(
  gameId: string,
  actorUid: string,
  seat: PlayerSlot,
  reservoirSlot: 1 | 2 = 1,
  manifestedCardId?: string
) {
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
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    const reservoirKey = reservoirSlot === 2 ? ("reservoir2" as const) : ("reservoir" as const);
    const reservoir = (reservoirSlot === 2 ? data.reservoir2 : data.reservoir) ?? null;
    if (!reservoir) throw new Error("No reservoir card.");

    const played = { ...(data.played ?? {}) } as any;
    const entry = played[seat];
    if (!entry?.card) throw new Error("Seat has not played a card.");

    const manifested = manifestedCards(entry as any);
    if (!manifested.length) throw new Error("Seat has no manifested cards.");
    const replacedCard = manifestedCardId ? manifested.find((card) => card.id === manifestedCardId) ?? null : manifested[0] ?? null;
    if (!replacedCard) throw new Error("Selected manifested card is no longer available.");

    const additionalCards = Array.isArray(entry.additionalCards)
      ? [...entry.additionalCards]
      : entry.extraCard
        ? [entry.extraCard]
        : [];
    const replacingPrimary = entry.card?.id === replacedCard.id;
    if (replacingPrimary) {
      const {
        valueOverride: _oldOverride,
        valueChoice: _oldChoice,
        postRevealValueDelta: _oldPostRevealDelta,
        disableResonanceRefill: _oldDisableResonanceRefill,
        ...rest
      } = entry;
      played[seat] = {
        ...rest,
        card: reservoir,
        extraCard: additionalCards[0],
        additionalCards,
      };
    } else {
      const targetIndex = additionalCards.findIndex((card) => card.id === replacedCard.id);
      if (targetIndex < 0) throw new Error("Selected manifested card cannot be swapped.");
      const nextAdditional = [...additionalCards];
      nextAdditional[targetIndex] = reservoir;
      const nextEntry = {
        ...entry,
        extraCard: nextAdditional[0],
        additionalCards: nextAdditional,
      } as any;
      if (targetIndex === 0 && typeof nextEntry.extraValueChoice === "number") {
        delete nextEntry.extraValueChoice;
      }
      played[seat] = nextEntry;
    }

    const nextReservoir = replacedCard as PulseCard;

    const location = getLocationById(data.locationId ?? null);
    const locationEffects = location?.effects ?? [];
    const swapCostEffect = locationEffects.find((e) => e?.type === "swap_friction_cost");
    let cost = swapCostEffect ? Math.max(0, Number((swapCostEffect as any).amount) || 0) : 1;
    if (hasEffect(effectsForSeat(data, seat), "free_swap_on_suit_resonance") && replacedCard.suit === reservoir.suit) {
      cost = 0;
    }
    const sigilZeroSwap = effectsForSeat(data, seat).find((e) => e?.type === "swap_friction_zero_if_replaced_suit") as any;
    if (sigilZeroSwap?.suit && replacedCard.suit === sigilZeroSwap.suit) {
      cost = 0;
    }

    let heat = data.golem?.heat ?? 0;
    let hp = data.golem?.hp ?? 5;
    const ignoreFriction = isFrictionIgnoredForCurrentPulse(data);
    const nextFriction = applyFrictionDelta(hp, heat, cost, { ignorePositive: ignoreFriction });
    hp = nextFriction.hp;
    heat = nextFriction.heat;

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
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

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
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

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

export async function setPendingRecoverSelection(
  gameId: string,
  actorUid: string,
  seat: PlayerSlot,
  cardId: string | null
) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Game is not active.");
    if (data.phase !== "play") throw new Error("Not in play phase.");
    if (data.pulsePhase !== "recover_selection") throw new Error("No recovery selection pending.");

    const pending = data.pendingRecover;
    if (!pending || pending.reason !== "recursive_form_recover") throw new Error("No recursive recovery pending.");
    if (!pending.seats.includes(seat)) throw new Error("This seat has no recovery selection.");
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    const discard = data.pulseDiscard ?? [];
    const selections = { ...(pending.selections ?? {}) } as Partial<Record<PlayerSlot, string | null>>;
    const confirmed = { ...(pending.confirmed ?? {}) } as Partial<Record<PlayerSlot, boolean>>;

    if (cardId) {
      const exists = discard.some((card) => card.id === cardId);
      if (!exists) throw new Error("Selected card is not in discard pile.");
      const takenByOther = pending.seats.some((otherSeat) => otherSeat !== seat && selections[otherSeat] === cardId);
      if (takenByOther) throw new Error("That card is already selected by another player.");
      selections[seat] = cardId;
    } else {
      selections[seat] = null;
    }
    confirmed[seat] = false;

    tx.update(gameRef, {
      pendingRecover: {
        ...pending,
        selections,
        confirmed,
      } satisfies PendingRecoverState,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function confirmPendingRecoverSelection(
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
    if (data.pulsePhase !== "recover_selection") throw new Error("No recovery selection pending.");

    const pending = data.pendingRecover;
    if (!pending || pending.reason !== "recursive_form_recover") throw new Error("No recursive recovery pending.");
    if (!pending.seats.includes(seat)) throw new Error("This seat has no recovery selection.");
    if (!canActorControlSeat(data, actorUid, seat)) throw new Error("You can't act for that seat.");

    const discard = data.pulseDiscard ?? [];
    const selections = { ...(pending.selections ?? {}) } as Partial<Record<PlayerSlot, string | null>>;
    const confirmed = { ...(pending.confirmed ?? {}) } as Partial<Record<PlayerSlot, boolean>>;

    if (skip) {
      selections[seat] = null;
    } else {
      const selectedCardId = selections[seat] ?? null;
      if (!selectedCardId) throw new Error("Select a discard card or skip.");
      const exists = discard.some((card) => card.id === selectedCardId);
      if (!exists) throw new Error("Selected card is no longer in discard pile.");
      const takenByOther = pending.seats.some((otherSeat) => otherSeat !== seat && selections[otherSeat] === selectedCardId);
      if (takenByOther) throw new Error("Selected card is already taken.");
    }
    confirmed[seat] = true;

    tx.update(gameRef, {
      pendingRecover: {
        ...pending,
        selections,
        confirmed,
      } satisfies PendingRecoverState,
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
    if (data.pulsePhase !== "actions" && data.pulsePhase !== "discard_selection" && data.pulsePhase !== "recover_selection") {
      throw new Error("Not in actions/discard/recovery phase.");
    }

    const isHost = data.createdBy === actorUid;
    const canResolveRecursiveRecover =
      data.pulsePhase === "recover_selection" &&
      data.pendingRecover?.reason === "recursive_form_recover" &&
      data.pendingRecover.seats.some((seat) => canActorControlSeat(data, actorUid, seat));
    if (!isHost && !canResolveRecursiveRecover) throw new Error("Only the host can end actions (v0).");
    if (data.exchange) throw new Error("Resolve the Communion exchange first.");
    if (data.pulsePhase === "discard_selection" && !data.pendingDiscard) {
      throw new Error("Discard selection is not initialized.");
    }
    if (data.pulsePhase === "recover_selection" && !data.pendingRecover) {
      throw new Error("Recovery selection is not initialized.");
    }

    const pendingDiscard = data.pendingDiscard ?? null;
    const pendingReason = pendingDiscard?.reason ?? null;
    const pendingSelections = { ...(pendingDiscard?.selections ?? {}) } as Partial<Record<PlayerSlot, string[]>>;
    const pendingConfirmed = { ...(pendingDiscard?.confirmed ?? {}) } as Partial<Record<PlayerSlot, boolean>>;
    const pendingRecover = data.pendingRecover ?? null;
    const pendingRecoverSelections = { ...(pendingRecover?.selections ?? {}) } as Partial<Record<PlayerSlot, string | null>>;
    const pendingRecoverConfirmed = { ...(pendingRecover?.confirmed ?? {}) } as Partial<Record<PlayerSlot, boolean>>;

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

    const promptRecoverSelection = (seats: PlayerSlot[]) => {
      const normalizedSeats = seats.filter((seat, index) => seats.indexOf(seat) === index);
      const selections: Partial<Record<PlayerSlot, string | null>> = {};
      const confirmed: Partial<Record<PlayerSlot, boolean>> = {};
      for (const seat of normalizedSeats) {
        selections[seat] = pendingRecoverSelections[seat] ?? null;
        confirmed[seat] = Boolean(pendingRecoverConfirmed[seat]);
      }
      tx.update(gameRef, {
        pulsePhase: "recover_selection" as const,
        pendingRecover: {
          reason: "recursive_form_recover",
          seats: normalizedSeats,
          selections,
          confirmed,
        } satisfies PendingRecoverState,
        updatedAt: serverTimestamp(),
      });
    };

    const terrainDeck = data.terrainDeck ?? [];
    const terrainIndex = data.terrainIndex ?? 0;
    const location = getLocationById(data.locationId ?? null);
    const locationEffects = location?.effects ?? [];
    const useThreeTerrains = locationEffects.some((e) => e?.type === "reveal_three_terrains");
    const terrainSet = useThreeTerrains
      ? terrainDeck.slice(terrainIndex, Math.min(terrainDeck.length, terrainIndex + 3))
      : terrainDeck.slice(terrainIndex, Math.min(terrainDeck.length, terrainIndex + 1));
    const terrain = terrainSet[0] ?? null;
    if (!terrain) throw new Error("No terrain card.");

    const skipThisPulse = { ...(data.skipThisPulse ?? {}) };
    const activeSeats = SLOTS.filter((seat) => Boolean(data.players?.[seat]) && !skipThisPulse[seat]);
    if (activeSeats.length === 0) throw new Error("No active seats for this Pulse.");

    const played = data.played ?? {};
    for (const seat of activeSeats) {
      if (!played[seat]?.card) throw new Error("Not all seats played.");
    }
    const chapterAbilityUsed = ensureChapterAbilityUsed(data);
    const chapterGlobalUsed = ensureChapterGlobalUsed(data);
    const reservoirSuit = data.reservoir?.suit ?? null;
    const reservoirMultiplier = reservoirCardMultiplierValue(data.reservoir);
    const locationReservoirAmplifies = locationEffects.some(
      (effect) => effect?.type === "manifested_cards_multiplier_from_reservoir_if_suit_match"
    );

    const options: number[][] = [];
    const optionSeat: PlayerSlot[] = [];
    for (const seat of activeSeats) {
      const entry = played[seat]!;
      const manifested = manifestedCards(entry);
      const firstAdditional = Array.isArray(entry.additionalCards)
        ? entry.additionalCards[0]
        : entry.extraCard ?? null;
      manifested.forEach((manifestedCard, cardIndex) => {
        const isPrimary = cardIndex === 0;
        const isExtra = cardIndex === 1 && firstAdditional && manifestedCard.id === firstAdditional.id;
        const valueOverride = isPrimary ? entry.valueOverride : undefined;
        const valueOptionsRaw = effectiveValueOptionsForCard(
          { locationId: data.locationId, partPicks: data.partPicks, seatSigils: data.seatSigils, gameMode: data.gameMode },
          seat,
          manifestedCard,
          valueOverride,
          terrain.suit
        );
        const amplifiedByReservoir =
          locationReservoirAmplifies &&
          reservoirMultiplier > 0 &&
          reservoirSuit &&
          manifestedCard.suit === reservoirSuit;
        const valueOptionsReservoirAdjusted = amplifiedByReservoir
          ? valueOptionsRaw.map((value) => value * reservoirMultiplier)
          : valueOptionsRaw;
        const postRevealValueDelta = isPrimary ? Number(entry.postRevealValueDelta ?? 0) : 0;
        const valueOptions = postRevealValueDelta
          ? valueOptionsReservoirAdjusted.map((value) => value + postRevealValueDelta)
          : valueOptionsReservoirAdjusted;
        const explicitChoice =
          isPrimary && typeof entry.valueChoice === "number" && valueOptions.includes(entry.valueChoice)
            ? entry.valueChoice
            : isExtra && typeof entry.extraValueChoice === "number" && valueOptions.includes(entry.extraValueChoice)
              ? entry.extraValueChoice
              : null;
        options.push(explicitChoice === null ? valueOptions : [explicitChoice]);
        optionSeat.push(seat);
      });
    }
    const selection = bestFitSelection(options, terrain.min, terrain.max);
    const manifestedTotalMultiplier = activeSeats.reduce((multiplier, seat) => {
      const raw = Number((played[seat] as any)?.totalMultiplier);
      if (!Number.isFinite(raw) || raw <= 1) return multiplier;
      return multiplier * raw;
    }, 1);
    const pyreEffect = locationEffects.find((effect) => effect?.type === "post_total_multiplier_by_suit_count") as
      | { suit?: PulseSuit; multiplierPerCard?: number }
      | undefined;
    const pyreSuit = pyreEffect?.suit ?? null;
    const pyreMultiplierPerCard = Math.max(1, Number(pyreEffect?.multiplierPerCard) || 1);
    const pyreCount =
      pyreSuit && pyreMultiplierPerCard > 1
        ? activeSeats.reduce((count, seat) => {
            const entry = played[seat];
            return count + manifestedCards(entry).filter((card) => card.suit === pyreSuit).length;
          }, 0)
        : 0;
    const pyreMultiplier = pyreCount > 0 ? Math.pow(pyreMultiplierPerCard, pyreCount) : 1;
    const total = selection.total * manifestedTotalMultiplier * pyreMultiplier;
    const seatManifestedValues: Partial<Record<PlayerSlot, number[]>> = {};
    selection.chosenValues.forEach((value, index) => {
      const seat = optionSeat[index];
      if (!seat) return;
      const prev = seatManifestedValues[seat] ?? [];
      prev.push(value);
      seatManifestedValues[seat] = prev;
    });

    let result: "success" | "undershoot" | "overshoot" = "success";
    const successIfMatchesNone = locationEffects.some((e) => e?.type === "success_if_matches_none");
    if (successIfMatchesNone) {
      const matchedAny = terrainSet.some((windowCard) => total >= windowCard.min && total <= windowCard.max);
      result = matchedAny ? "overshoot" : "success";
    } else {
      if (total < terrain.min) result = "undershoot";
      else if (total > terrain.max) result = "overshoot";
    }

    if (result === "undershoot" && locationEffects.some((e) => e?.type === "undershoot_counts_as_overshoot")) {
      result = "overshoot";
    }

    const consecutiveEffect = locationEffects.find((e) => e?.type === "requires_consecutive_successes") as any;
    const consecutiveNeeded = Math.max(2, Number(consecutiveEffect?.count) || 2);
    const consecutiveKey = "requires_consecutive_successes";
    let consecutiveGateAllowsAdvance = true;
    if (consecutiveEffect) {
      const current = Math.max(0, Number(chapterGlobalUsed[consecutiveKey]) || 0);
      if (result === "success") {
        const next = current + 1;
        if (next >= consecutiveNeeded) {
          chapterGlobalUsed[consecutiveKey] = 0;
          consecutiveGateAllowsAdvance = true;
        } else {
          chapterGlobalUsed[consecutiveKey] = next;
          consecutiveGateAllowsAdvance = false;
        }
      } else {
        chapterGlobalUsed[consecutiveKey] = 0;
      }
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
    const frictionIgnoredThisPulse = isFrictionIgnoredForCurrentPulse(data);
    const applyPulseFriction = (amount: number) => {
      const next = applyFrictionDelta(hp, heat, amount, { ignorePositive: frictionIgnoredThisPulse });
      hp = next.hp;
      heat = next.heat;
    };
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
          applyPulseFriction(1);
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
    const removeSuccessCardsFromGame =
      result === "success" && locationEffects.some((effect) => effect?.type === "remove_success_cards_from_game");

    // Discard played cards (public v0).
    const discardedThisPulse: PulseCard[] = [];
    for (const seat of activeSeats) {
      const entry = played[seat]!;
      const manifested = manifestedCards(entry);
      for (const card of manifested) {
        if (removeSuccessCardsFromGame) continue;
        discard.push(card);
        discardedThisPulse.push(card);
      }
    }

    const anyMatchedTerrain = activeSeats.some((seat) => {
      const entry = played[seat]!;
      const suits = manifestedCards(entry).map((card) => card.suit);
      return suits.some((s) => s !== "prism" && s === terrain.suit);
    });

    // Location rule: add friction if nobody matched the terrain suit.
    const frictionIfNoMatch = locationEffects.find((e) => e?.type === "friction_if_no_terrain_match");
    if (frictionIfNoMatch && !anyMatchedTerrain) {
      applyPulseFriction(Number((frictionIfNoMatch as any).amount) || 0);
    }

    const parityEffect = locationEffects.find((e) => e?.type === "friction_by_total_parity") as any;
    if (parityEffect) {
      if (total % 2 === 0) applyPulseFriction(Number(parityEffect.evenAmount) || 0);
      else applyPulseFriction(Number(parityEffect.oddAmount) || 0);
    }

    // Faculty rule: friction delta when playing a specific suit.
    for (const seat of activeSeats) {
      const entry = played[seat]!;
      const frictionEffects = effectsForSeat(data, seat).filter((e) => e?.type === "friction_delta_if_played_suit");
      for (const e of frictionEffects) {
        const suit = e?.suit as any;
        if (!suit) continue;
        if (seatPlayedSuit(entry, suit)) {
          applyPulseFriction(Number(e.amount) || 0);
        }
      }
    }

    const followSuitEffect = locationEffects.find((e) => e?.type === "follow_suit_or_friction") as any;
    if (followSuitEffect) {
      const herald = activeSeats.find((seat) => hasEffect(effectsForSeat(data, seat), "must_play_first_faceup")) ?? null;
      const heraldEntry = herald ? played[herald] : null;
      const heraldSuit = heraldEntry?.card?.suit ?? null;
      const penalty = Math.max(0, Number(followSuitEffect.friction) || 0);
      if (heraldSuit && heraldSuit !== "prism" && penalty > 0) {
        for (const seat of activeSeats) {
          if (seat === herald) continue;
          const suits = manifestedCards(played[seat]).map((card) => card.suit);
          const follows = suits.includes("prism") || suits.includes(heraldSuit);
          if (!follows) applyPulseFriction(penalty);
        }
      }
    }

    const frictionUnlessEtherOrPrism = locationEffects.find((e) => e?.type === "friction_unless_two_ether_or_prism") as any;
    if (frictionUnlessEtherOrPrism) {
      const threshold = Math.max(1, Number(frictionUnlessEtherOrPrism.threshold) || 2);
      const amount = Number(frictionUnlessEtherOrPrism.amount) || 0;
      const etherOrPrismCount = activeSeats.reduce((count, seat) => {
        const entry = played[seat]!;
        const suits = manifestedCards(entry).map((card) => card.suit);
        return count + suits.filter((s) => s === "ether" || s === "prism").length;
      }, 0);
      if (etherOrPrismCount < threshold) applyPulseFriction(amount);
    }

    const dualityEffect = activeSeats.some((seat) => hasEffect(effectsForSeat(data, seat), "median_heal_boundary_friction"));
    if (dualityEffect) {
      const median = Math.floor((terrain.min + terrain.max) / 2);
      if (total === median) heat = 0;
      if (total === terrain.min || total === terrain.max) applyPulseFriction(1);
    }

    const recursiveRecoverSeats: PlayerSlot[] = [];
    if (result === "success" && discard.length > 0) {
      for (const seat of SLOTS) {
        if (!data.players?.[seat]) continue;
        const recoverEffect = effectsForSeat(data, seat).find((effect) => effect?.type === "success_recover_from_discard") as
          | { count?: number }
          | undefined;
        if (!recoverEffect) continue;
        const recoverCount = Math.max(0, Number(recoverEffect.count) || 0);
        if (recoverCount > 0) recursiveRecoverSeats.push(seat);
      }
    }

    const recoveredByRecursiveForm: Array<{ seat: PlayerSlot; card: PulseCard }> = [];
    if (recursiveRecoverSeats.length) {
      let needsRecoverPrompt = pendingRecover?.reason !== "recursive_form_recover";
      const seenSelections = new Set<string>();
      for (const seat of recursiveRecoverSeats) {
        const isConfirmed = Boolean(pendingRecoverConfirmed[seat]);
        if (!isConfirmed) {
          needsRecoverPrompt = true;
          continue;
        }
        const selectedCardId = pendingRecoverSelections[seat] ?? null;
        if (!selectedCardId) continue;
        const existsInDiscard = discard.some((card) => card.id === selectedCardId);
        const duplicated = seenSelections.has(selectedCardId);
        if (!existsInDiscard || duplicated) {
          needsRecoverPrompt = true;
          break;
        }
        seenSelections.add(selectedCardId);
      }

      if (needsRecoverPrompt) {
        promptRecoverSelection(recursiveRecoverSeats);
        return;
      }

      for (const seat of recursiveRecoverSeats) {
        const selectedCardId = pendingRecoverSelections[seat] ?? null;
        if (!selectedCardId) continue;
        const discardIndex = discard.findIndex((card) => card.id === selectedCardId);
        if (discardIndex < 0) continue;
        const [recovered] = discard.splice(discardIndex, 1);
        if (!recovered) continue;
        const hand = [...(hands[seat] ?? [])];
        hand.push(recovered);
        hands[seat] = hand;
        const idx = discardedThisPulse.findIndex((discarded) => discarded.id === recovered.id);
        if (idx >= 0) discardedThisPulse.splice(idx, 1);
        recoveredByRecursiveForm.push({ seat, card: recovered });
      }
    }

    const baseHandCapacity = data.baseHandCapacity ?? 5;
    const primordialSeaActive = locationEffects.some((effect) => effect?.type === "remove_success_cards_from_game");
    const refill = (seat: PlayerSlot) => {
      const cap = handCapacityForSeat(
        {
            baseHandCapacity,
            partPicks: data.partPicks,
            locationId: data.locationId,
            seatSigils: data.seatSigils,
            gameMode: data.gameMode,
            targetPlayers: data.targetPlayers,
            players: data.players,
          },
        seat
      );
      const h = [...(hands[seat] ?? [])];
      if (h.length >= cap) {
        hands[seat] = h;
        return;
      }

      const drawn = drawCardsWithLocationRules(deck, discard, cap - h.length, {
        primordialSeaActive,
        onPrimordialSeaReshuffle: () => {
          hp = Math.max(0, hp - 2);
          return hp > 0;
        },
      });
      h.push(...drawn);
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
      if (entry.disableResonanceRefill) return false;
      const suits = manifestedCards(entry).map((card) => card.suit);
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
    const resonanceGiftConsumed = new Set<PlayerSlot>();
    const pickResonanceGiftTarget = (seat: PlayerSlot): PlayerSlot | null => {
      const entry = played[seat] as any;
      const preferred = (entry?.resonanceGiftSeat ?? null) as PlayerSlot | null;
      if (preferred && preferred !== seat && data.players?.[preferred]) return preferred;
      return SLOTS.find((other) => other !== seat && Boolean(data.players?.[other])) ?? null;
    };
    const anchorLocked = (seat: PlayerSlot) => Boolean(chapterAbilityUsed?.[seat]?.[anchorEffectKey]);
    const refillIfAllowed = (seat: PlayerSlot, source: "success" | "resonance" | "other") => {
      if ((source === "success" || source === "resonance") && anchorLocked(seat)) return;
      if (blocksRefill(seat)) return;

      const isResonanceRefill =
        source === "resonance" || (source === "success" && matchesTerrainSuit(seat));
      if (isResonanceRefill) {
        const seatEffects = effectsForSeat(data, seat);
        const entry = played[seat];
        const acidResonanceSigil = hasEffect(seatEffects, "acid_resonance_discard_two_then_refill");
        if (acidResonanceSigil && entry && seatPlayedSuit(entry as any, "acid")) {
          const h = [...(hands[seat] ?? [])];
          const maxOptionalDiscard = Math.min(2, h.length);
          if (maxOptionalDiscard > 0) {
            const request: PendingDiscardSeatRequest = {
              required: 0,
              optional: maxOptionalDiscard,
              allowSkip: true,
              label: "Sigil of Acid: you may discard up to 2 cards before Resonance refill.",
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

      if (
        isResonanceRefill &&
        hasEffect(effectsForSeat(data, seat), "resonance_grants_ally_refill") &&
        !resonanceGiftConsumed.has(seat)
      ) {
        resonanceGiftConsumed.add(seat);
        const target = pickResonanceGiftTarget(seat);
        if (target) refillIfAllowed(target, "other");
      }
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

    const terrainStride = useThreeTerrains ? terrainSet.length : 1;
    const advance = (result === "success" && consecutiveGateAllowsAdvance) || result === "overshoot";
    const nextIndex = advance ? terrainIndex + terrainStride : terrainIndex;
    const nextStep = advance ? (data.step ?? 1) + 1 : (data.step ?? 1);
    const gameMode = (data.gameMode ?? "campaign") as GameMode;
    const campaignVariant = normalizeCampaignVariant(data);
    const campaignRandomFaculties = normalizeCampaignRandomFaculties(data);
    const campaignPathId = normalizeCampaignPathId(data);
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
    const completedSingleLocationRun = completedChapter && (gameMode === "single_location" || gameMode === "tutorial");
    const locationSigilReward = completedChapter && gameMode === "campaign" ? location?.sigilReward : null;
    const rewardTier = Math.max(1, Number(locationSigilReward?.tier) || 1);
    const rewardReveal = Math.max(0, Number(locationSigilReward?.reveal) || 0);
    const rewardChoose = Math.max(0, Number(locationSigilReward?.choose) || 0);
    const shouldLocationSigilReward = Boolean(locationSigilReward && rewardReveal > 0 && rewardChoose > 0);
    const nextStage = chapter + 1;
    const nextLocations =
      completedChapter && (gameMode === "campaign" || gameMode === "tutorial")
        ? gameMode === "campaign"
          ? campaignLocationOptionsForChapter(nextStage, campaignVariant, campaignPathId)
          : getLocationsForStage(nextStage).map((l) => l.id)
        : [];
    const autoLocationCampaign = gameMode === "campaign" && campaignVariant !== "free_choice" && nextLocations.length === 1;
    const nextAutoLocationId = autoLocationCampaign ? nextLocations[0] ?? null : null;
    let partPicksForNext = { ...(data.partPicks ?? {}) } as Partial<Record<PlayerSlot, string>>;
    const rotateFaculties = result === "success" && locationEffects.some((e) => e?.type === "rotate_faculties_clockwise_on_success");
    if (rotateFaculties) {
      partPicksForNext = {
        p1: data.partPicks?.p3,
        p2: data.partPicks?.p1,
        p3: data.partPicks?.p2,
      };
    }

    const nextPulsePhase = preSelectionSeats({ locationId: data.locationId, partPicks: partPicksForNext, gameMode: data.gameMode }).length
      ? ("pre_selection" as const)
      : ("selection" as const);
    const nextExchangeFrom = mandatoryExchangeSeat({
      locationId: data.locationId,
      partPicks: partPicksForNext,
      gameMode: data.gameMode,
    });
    const nextExchange =
      nextPulsePhase !== "pre_selection" && nextExchangeFrom
        ? { from: nextExchangeFrom, status: "awaiting_offer" as const }
        : null;
    let nextSkipThisPulse = { ...(data.skipNextPulse ?? {}) };
    const conductorNext = applyConductorTransfersForPulse(
      { locationId: data.locationId, partPicks: partPicksForNext, players: data.players, gameMode: data.gameMode },
      hands
    );
    if (Object.keys(conductorNext.skipThisPulse).length) {
      nextSkipThisPulse = conductorNext.skipThisPulse;
    }
    const nextConductorPasses = conductorNext.conductorPasses;
    const nextTerrainIndexForPulse = advance ? (nextIndex >= terrainDeck.length ? 0 : nextIndex) : terrainIndex;
    const nextPulseAnchorKey = pulseKey(chapter, nextStep, nextTerrainIndexForPulse, outcomeLog.length);

    const seatName = (seat: PlayerSlot) => {
      const seatUid = data.players?.[seat] ?? "";
      return data.playerNames?.[seatUid] ?? seat.toUpperCase();
    };
    const recursiveFormNotice =
      recoveredByRecursiveForm.length > 0
        ? (() => {
            const first = recoveredByRecursiveForm[0];
            if (!first) return null;
            const firstValue = first.card.suit === "prism" ? first.card.prismRange : first.card.value;
            const recoveredLabel = `${first.card.suit.toUpperCase()} ${firstValue ?? "?"}`;
            const extraCount = recoveredByRecursiveForm.length - 1;
            return {
              id: `recursive:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
              kind: "recursive_form_recover",
              title: "Sigil of Recursive Form",
              text:
                extraCount > 0
                  ? `${seatName(first.seat)} recovered ${recoveredLabel} from the discard pile (${extraCount} more recovery).`
                  : `${seatName(first.seat)} recovered ${recoveredLabel} from the discard pile.`,
              card: first.card,
              atMs: Date.now(),
            };
          })()
        : null;

    const basePatch: Record<string, any> = {
      golem: { hp, heat },
      pulseDeck: deck,
      pulseDiscard: discard,
      lastDiscarded: discardedThisPulse,
      hands: conductorNext.hands,
      played: {},
      terrainIndex: nextTerrainIndexForPulse,
      step: nextStep,
      pulsePhase: nextPulsePhase,
      exchange: nextExchange,
      skipThisPulse: nextSkipThisPulse,
      skipNextPulse: {},
      conductorPasses: nextConductorPasses,
      partPicks: partPicksForNext,
      pulseFrictionAnchor: { key: nextPulseAnchorKey, hp, heat },
      frictionIgnoredPulseKey: null,
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
      pendingRecover: deleteField(),
      uiNotice: recursiveFormNotice ?? deleteField(),
      updatedAt: serverTimestamp(),
    };

    if (endedByDamage) {
      basePatch.status = "completed" as GameStatus;
      basePatch.endedReason = "loss" as const;
      basePatch.completedAt = serverTimestamp();
      basePatch.exchange = null;
      basePatch.pulseFrictionAnchor = null;
      basePatch.frictionIgnoredPulseKey = null;
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
        pulseFrictionAnchor: null,
        frictionIgnoredPulseKey: null,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    if (completedChapter) {
      const nextChapterResetPatch: Record<string, any> = {
        ...basePatch,
        chapter: nextStage,
        step: 1,
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
        conductorPasses: deleteField(),
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
        pulseFrictionAnchor: null,
        frictionIgnoredPulseKey: null,
        pseudoControllerUid:
          targetPlayersForGame(data) === 2
            ? ((() => {
                const p1 = data.players?.p1 ?? null;
                const p2 = data.players?.p2 ?? null;
                if (data.pseudoControllerUid && (data.pseudoControllerUid === p1 || data.pseudoControllerUid === p2)) {
                  return data.pseudoControllerUid;
                }
                return p1 ?? p2 ?? data.createdBy ?? null;
              })())
            : null,
        updatedAt: serverTimestamp(),
      };

      const enterNextChapter = () => {
        if (!nextLocations.length) {
          tx.update(gameRef, {
            ...basePatch,
            status: "completed" as GameStatus,
            endedReason: "win" as const,
            completedAt: serverTimestamp(),
            exchange: null,
            pulseFrictionAnchor: null,
            frictionIgnoredPulseKey: null,
            updatedAt: serverTimestamp(),
          });
          return;
        }

        if (autoLocationCampaign && nextAutoLocationId) {
          if (campaignRandomFaculties) {
            const randomPicks = randomPartPicksForLocation(nextAutoLocationId);
            if (!randomPicks) throw new Error("Unable to generate random faculty assignment for next chapter.");
            const playPatch = buildPlayPhasePatchFromPicks(
              { ...data, locationId: nextAutoLocationId, chapter: nextStage, gameMode },
              randomPicks
            );
            tx.update(gameRef, {
              ...nextChapterResetPatch,
              locationId: nextAutoLocationId,
              ...playPatch,
              updatedAt: serverTimestamp(),
            });
            return;
          }

          tx.update(gameRef, {
            ...nextChapterResetPatch,
            locationId: nextAutoLocationId,
            phase: "choose_parts" as const,
            partPicks: {},
            updatedAt: serverTimestamp(),
          });
          return;
        }

        tx.update(gameRef, {
          ...nextChapterResetPatch,
          phase: "choose_location" as const,
          locationId: null,
          updatedAt: serverTimestamp(),
        });
      };

      if (shouldLocationSigilReward) {
        const rewardPool = revealSigilsByTier(rewardTier, rewardReveal);
        const rewardMaxPicks = Math.min(Math.max(1, rewardChoose), rewardPool.length);
        if (!rewardPool.length) {
          enterNextChapter();
          return;
        }
        tx.update(gameRef, {
          ...nextChapterResetPatch,
          phase: "choose_sigils" as const,
          sigilDraftContext: "reward_location" as const,
          sigilDraftTier: rewardTier,
          sigilDraftPool: rewardPool,
          sigilDraftAssignments: {},
          sigilDraftMaxPicks: rewardMaxPicks,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      enterNextChapter();
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

export async function surrenderGame(gameId: string, actorUid: string) {
  const gameRef = doc(db, "games", gameId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef);
    if (!snap.exists()) throw new Error("Game not found.");
    const data = snap.data() as GameDoc;

    if (data.status !== "active") throw new Error("Only active games can be surrendered.");
    const players = data.players ?? {};
    const isSeatedPlayer = SLOTS.some((seat) => players[seat] === actorUid);
    const isHost = data.createdBy === actorUid;
    if (!isSeatedPlayer && !isHost) throw new Error("Only a current player can surrender.");

    tx.update(gameRef, {
      status: "completed" as GameStatus,
      endedReason: "loss" as const,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
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
