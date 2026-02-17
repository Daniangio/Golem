export type GameStatus = "lobby" | "active" | "completed";
export type GameVisibility = "public" | "private";
export type GameMode = "campaign" | "single_location";

export type GamePhase =
  | "setup" // legacy (pre-start)
  | "choose_location"
  | "choose_parts"
  | "play"
  | "assign_parts"; // legacy

export type PlayerSlot = "p1" | "p2" | "p3";

export type Players = {
  p1?: string;
  p2?: string;
  p3?: string;
};

export type PlayerNames = Record<string, string>;

export type SeatVotes = Partial<Record<PlayerSlot, string>>;

export type PulseSuit = "cinder" | "stone" | "ether" | "steam" | "acid" | "prism";

export type PulseCard = {
  id: string;
  suit: PulseSuit;
  value?: number; // 0-10 (not used for Prism)
  prismRange?: "1-5" | "6-10";
};

export type SeatHands = Partial<Record<PlayerSlot, PulseCard[]>>;

export type TerrainCard = {
  id: string;
  suit: Exclude<PulseSuit, "prism">;
  min: number;
  max: number;
};
export type TerrainDeckType =
  | "sphere_1_2"
  | "sphere_3_4"
  | "sphere_5_6"
  | "sphere_1"
  | "sphere_2"
  | "sphere_3";

export type PulsePhase = "pre_selection" | "selection" | "actions";

// Per-sphere once-only abilities keyed by ability/effect id.
export type ChapterAbilityUsed = Partial<Record<PlayerSlot, Partial<Record<string, boolean>>>>;

export type ChapterGlobalUsed = Partial<Record<string, boolean>>;

export type PlayedCard = {
  card: PulseCard;
  extraCard?: PulseCard;
  valueOverride?: number; // e.g. Fuse -> 0
  revealedDuringSelection?: boolean; // Unveiled Radiance
  bySeat: PlayerSlot;
  at: any; // serverTimestamp
};

export type PlayedCards = Partial<Record<PlayerSlot, PlayedCard>>;

export type GameDoc = {
  createdAt?: any; // serverTimestamp
  updatedAt?: any; // serverTimestamp
  createdBy?: string;

  status: GameStatus;
  visibility: GameVisibility;
  gameMode?: GameMode;
  maxPlayers: 3;

  players: Players;
  playerNames?: PlayerNames;
  playerUids?: string[]; // human UIDs (used for "my games" query)
  invitedUids?: string[];

  startedAt?: any; // serverTimestamp
  startedBy?: string;
  completedAt?: any; // serverTimestamp
  endedReason?: "win" | "loss";

  // Campaign skeleton (v0)
  locationId?: string;
  locationOptions?: string[]; // location IDs shown for current stage
  locationVotes?: SeatVotes; // slot -> locationId

  phase?: GamePhase;
  partPicks?: SeatVotes; // slot -> partId

  // Cards (v0: stored in the game doc; later we may split private hands)
  pulseDeck?: PulseCard[];
  pulseDiscard?: PulseCard[];
  lastDiscarded?: PulseCard[]; // discarded in the most recent pulse resolution
  hands?: SeatHands;
  baseHandCapacity?: number; // chapter baseline before part effects

  reservoir?: PulseCard | null;
  reservoir2?: PulseCard | null;

  exchange?: {
    from: PlayerSlot;
    to?: PlayerSlot;
    offered?: PulseCard;
    status: "awaiting_offer" | "awaiting_return";
  } | null;
  skipThisPulse?: Partial<Record<PlayerSlot, boolean>>;
  skipNextPulse?: Partial<Record<PlayerSlot, boolean>>;

  terrainDeck?: TerrainCard[];
  terrainDeckType?: TerrainDeckType;
  terrainIndex?: number; // 0..terrainDeck.length-1
  terrainCardsPerRun?: number; // how many cards to draw from the selected 15-card terrain deck (default 5)
  pulsePhase?: PulsePhase;
  played?: PlayedCards;
  chapterAbilityUsed?: ChapterAbilityUsed; // once-per-chapter part abilities
  chapterGlobalUsed?: ChapterGlobalUsed; // once-per-chapter global/location effects
  lastOutcome?: {
    result: "success" | "undershoot" | "overshoot";
    total: number;
    min: number;
    max: number;
    at: any; // serverTimestamp
  };
  outcomeLog?: Array<{
    chapter: number;
    step: number;
    terrainSuit: Exclude<PulseSuit, "prism">;
    min: number;
    max: number;
    total: number;
    result: "success" | "undershoot" | "overshoot";
    atMs: number; // client timestamp (serverTimestamp() not allowed inside arrays)
  }>;

  optionalPartId?: string;
  partAssignments?: Record<string, string>; // partId -> uid
  chapter?: number;
  step?: number;
  golem?: { hp: number; heat: number };
};
