import locationsRaw from "./data/locations.json";
import facultiesRaw from "./data/faculties.json";
import sigilsRaw from "./data/sigils.json";
import type { PulseSuit } from "../types";

export type FacultyType = "compulsory" | "optional";

export type Effect =
  | { type: "hand_capacity_delta"; amount: number; scope?: "chapter" | "sphere" }
  | { type: "disable_match_refill_on_failure" }
  | { type: "once_per_chapter_extra_card_after_reveal" }
  | { type: "once_per_chapter_fuse_to_zero_after_reveal" }
  | { type: "pulse_value_delta"; amount: number }
  | { type: "friction_delta_if_played_suit"; suit: Exclude<PulseSuit, "prism">; amount: number }
  | { type: "discard_cards_on_undershoot"; count: number }
  | { type: "peek_terrain_deck" }
  | { type: "hide_terrain_until_played" }
  | { type: "zero_count_as_jolly_delta"; amount: [number, number] }
  | { type: "reveal_card_during_selection" }
  | { type: "mandatory_card_exchange_after_terrain_reveal" }
  | { type: "free_swap_on_suit_resonance" }
  // Location rules
  | { type: "first_stall_refill_all" }
  | { type: "no_refill_if_played_suit"; suit: Exclude<PulseSuit, "prism"> }
  | { type: "friction_if_no_terrain_match"; amount: number }
  | { type: "swap_friction_cost"; amount: number }
  | { type: "reservoir_count"; count: number };

export type FacultyDef = {
  id: string;
  name: string;
  text: string;
  effects: Effect[];
};

export type SigilDef = {
  id: string;
  name: string;
  text: string;
  effects: Effect[];
};

export type LocationDef = {
  id: string;
  sphere: number;
  name: string;
  flavor: string;
  rule: string;
  rewards: string[];
  compulsoryFacultyIds: string[];
  optionalFacultyIds: string[];
  effects: Effect[];
};

export type LocationFaculty = {
  id: string;
  name: string;
  type: FacultyType;
  effect: string;
  effects: Effect[];
};

export type LocationCard = {
  id: string;
  name: string;
  flavor: string;
  sphere: number;
  compulsory: LocationFaculty[];
  optional: LocationFaculty[];
  rule: string;
  rewards: string[];
  effects: Effect[];
};

type LocationDefRaw = {
  id: string;
  stage?: number;
  sphere?: number;
  name: string;
  flavor: string;
  rule: string;
  rewards?: string[];
  compulsoryFacultyIds?: string[];
  optionalFacultyIds?: string[];
  compulsoryPartIds?: string[];
  optionalPartIds?: string[];
  effects?: Effect[];
};

const FACULTIES: FacultyDef[] = facultiesRaw as any;
const SIGILS: SigilDef[] = sigilsRaw as any;
const LOCATIONS_RAW: LocationDefRaw[] = locationsRaw as any;

const facultyById = new Map<string, FacultyDef>();
for (const f of FACULTIES) facultyById.set(f.id, f);

const sigilById = new Map<string, SigilDef>();
for (const s of SIGILS) sigilById.set(s.id, s);

function toLocationFaculty(facultyId: string, type: FacultyType): LocationFaculty {
  const f = facultyById.get(facultyId);
  if (!f) throw new Error(`Unknown faculty id: ${facultyId}`);
  return { id: f.id, name: f.name, type, effect: f.text, effects: f.effects ?? [] };
}

function toLocation(def: LocationDefRaw): LocationCard {
  const sphere = def.sphere ?? def.stage ?? 1;
  const compulsory = def.compulsoryFacultyIds ?? def.compulsoryPartIds ?? [];
  const optional = def.optionalFacultyIds ?? def.optionalPartIds ?? [];
  return {
    id: def.id,
    name: def.name,
    flavor: def.flavor,
    sphere,
    compulsory: compulsory.map((id) => toLocationFaculty(id, "compulsory")),
    optional: optional.map((id) => toLocationFaculty(id, "optional")),
    rule: def.rule,
    rewards: def.rewards ?? [],
    effects: def.effects ?? [],
  };
}

export function getLocationsForSphere(sphere: number): LocationCard[] {
  return LOCATIONS_RAW.filter((l) => (l.sphere ?? l.stage ?? 1) === sphere).map(toLocation);
}

// Back-compat naming: older code calls these "stages".
export function getLocationsForStage(stage: number): LocationCard[] {
  return getLocationsForSphere(stage);
}

export function getLocationById(id: string | undefined | null): LocationCard | null {
  if (!id) return null;
  const def = LOCATIONS_RAW.find((l) => l.id === id);
  if (!def) return null;
  return toLocation(def);
}

export function getFacultyById(id: string | undefined | null): FacultyDef | null {
  if (!id) return null;
  return facultyById.get(id) ?? null;
}

// Back-compat: older code calls faculties "parts".
export function getPartById(id: string | undefined | null): FacultyDef | null {
  return getFacultyById(id);
}

export function getSigilById(id: string | undefined | null): SigilDef | null {
  if (!id) return null;
  return sigilById.get(id) ?? null;
}

// Back-compat: older code calls sigils "upgrades".
export function getUpgradeById(id: string | undefined | null): SigilDef | null {
  return getSigilById(id);
}

export function getAllSigils(): SigilDef[] {
  return [...SIGILS];
}

export function getAllUpgrades(): SigilDef[] {
  return getAllSigils();
}
