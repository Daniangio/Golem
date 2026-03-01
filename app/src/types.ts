export type GameStatus = "lobby" | "active" | "completed";
export type GameVisibility = "public" | "private";
export type GameMode = "campaign" | "single_location" | "tutorial";
export type CampaignVariant = "free_choice" | "random_choice" | "preset_path";

export type GamePhase =
  | "setup" // legacy (pre-start)
  | "choose_location"
  | "choose_sigils"
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
  prismRange?: "0-3" | "4-6" | "7-10" | "1-5" | "6-10"; // old ranges kept for backward compatibility
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
  | "sphere_7"
  | "sphere_8_9"
  | "sphere_1"
  | "sphere_2"
  | "sphere_3";

export type PulsePhase = "pre_selection" | "selection" | "actions" | "discard_selection" | "recover_selection";

// Per-sphere once-only abilities keyed by ability/effect id.
export type ChapterAbilityUsed = Partial<Record<PlayerSlot, Partial<Record<string, boolean>>>>;

export type ChapterGlobalUsed = Partial<Record<string, boolean | number>>;

export type PlayedCard = {
  card: PulseCard;
  extraCard?: PulseCard;
  additionalCards?: PulseCard[];
  totalMultiplier?: number; // e.g. Harmonic Amplifier -> x2 total
  valueOverride?: number; // e.g. Fuse -> 0
  postRevealValueDelta?: number; // e.g. Sigil of Shattered Clay
  valueChoice?: number; // explicit chosen value for variable primary card
  extraValueChoice?: number; // explicit chosen value for variable extra card
  resonanceSuitOverride?: Exclude<PulseSuit, "prism">; // e.g. Sigil of Steam
  resonanceGiftSeat?: PlayerSlot; // e.g. Sigil of the Constricted Breath
  disableResonanceRefill?: boolean; // e.g. Sigil of the Great Matrix
  steamOvertonesUsed?: boolean; // Sigil of Steam Overtones (once per pulse)
  acidRecompositionUsed?: boolean; // Sigil of Acid Recomposition (once per pulse)
  revealedDuringSelection?: boolean; // Unveiled Radiance
  bySeat: PlayerSlot;
  at: any; // serverTimestamp
};

export type PlayedCards = Partial<Record<PlayerSlot, PlayedCard>>;

export type PendingDiscardReason = "acid_resonance" | "undershoot_penalty";

export type PendingDiscardSeatRequest = {
  required: number;
  optional: number;
  allowSkip: boolean;
  label: string;
};

export type PendingDiscardState = {
  reason: PendingDiscardReason;
  requests: Partial<Record<PlayerSlot, PendingDiscardSeatRequest>>;
  selections?: Partial<Record<PlayerSlot, string[]>>;
  confirmed?: Partial<Record<PlayerSlot, boolean>>;
};

export type PendingRecoverState = {
  reason: "recursive_form_recover";
  seats: PlayerSlot[];
  selections?: Partial<Record<PlayerSlot, string | null>>;
  confirmed?: Partial<Record<PlayerSlot, boolean>>;
};

export type GameDoc = {
  createdAt?: any; // serverTimestamp
  updatedAt?: any; // serverTimestamp
  createdBy?: string;

  status: GameStatus;
  visibility: GameVisibility;
  targetPlayers?: 2 | 3;
  gameMode?: GameMode;
  campaignVariant?: CampaignVariant;
  campaignRandomFaculties?: boolean;
  campaignPathId?: string | null;
  maxPlayers: 3;

  players: Players;
  playerNames?: PlayerNames;
  playerUids?: string[]; // human UIDs (used for "my games" query)
  pseudoControllerUid?: string | null;
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
  seatSigils?: Partial<Record<PlayerSlot, string[]>>;
  sigilDraftPool?: string[]; // currently revealed sigils to draft from
  sigilDraftAssignments?: Partial<Record<string, PlayerSlot>>; // sigilId -> seat
  sigilDraftTier?: number | null;
  sigilDraftMaxPicks?: number;
  sigilDraftContext?: "reward_tier_1" | "reward_location" | "single_location_setup";

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
  conductorPasses?: Partial<Record<PlayerSlot, boolean>>;

  terrainDeck?: TerrainCard[];
  terrainDeckType?: TerrainDeckType;
  terrainIndex?: number; // 0..terrainDeck.length-1
  terrainCardsPerRun?: number; // how many cards to draw from the selected 15-card terrain deck (default 5)
  pulsePhase?: PulsePhase;
  played?: PlayedCards;
  chapterAbilityUsed?: ChapterAbilityUsed; // once-per-chapter part abilities
  chapterGlobalUsed?: ChapterGlobalUsed; // once-per-chapter global/location effects
  pulseFrictionAnchor?: { key: string; hp: number; heat: number } | null;
  frictionIgnoredPulseKey?: string | null;
  pendingDiscard?: PendingDiscardState;
  pendingRecover?: PendingRecoverState;
  uiNotice?: {
    id: string;
    kind: string;
    title: string;
    text: string;
    card?: PulseCard | null;
    atMs: number;
  };
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
