import locationsRaw from "./data/locations.json";
import facultiesRaw from "./data/faculties.json";
import sigilsRaw from "./data/sigils.json";
import type { PulseSuit, TerrainDeckType } from "../types";
export type { TerrainDeckType } from "../types";

export type FacultyType = "compulsory" | "optional";
export type Effect =
  | { type: "hand_capacity_delta"; amount: number; scope?: "chapter" | "sphere" }
  | { type: "disable_match_refill_on_failure" }
  | { type: "once_per_chapter_extra_card_after_reveal" }
  | { type: "once_per_chapter_fuse_to_zero_after_reveal" }
  | { type: "once_per_chapter_prevent_first_overshoot_damage" }
  | { type: "high_value_double_damage_risk" }
  | { type: "swap_and_skip_turn" }
  | { type: "prevent_stall_limited_refill" }
  | { type: "median_heal_boundary_friction" }
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
  | { type: "friction_by_total_parity"; evenAmount: number; oddAmount: number }
  | { type: "undershoot_counts_as_overshoot" }
  | { type: "prism_fixed_zero" }
  | { type: "swap_friction_cost"; amount: number }
  | { type: "reservoir_count"; count: number }
  | { type: "success_refill_highest_else_resonance" }
  | { type: "friction_unless_two_ether_or_prism"; amount: number; threshold?: number }
  | { type: "disable_resonance_refill" }
  // Sigils
  | { type: "cinder_plus_minus_one" }
  | { type: "once_per_chapter_resonance_as_steam" }
  | { type: "swap_friction_zero_if_replaced_suit"; suit: Exclude<PulseSuit, "prism"> }
  | { type: "once_per_chapter_overshoot_stone_to_friction" }
  | { type: "acid_resonance_discard_two_then_refill" };

export type FacultyDef = {
  id: string;
  name: string;
  text: string;
  effects: Effect[];
};

export type SigilDef = {
  id: string;
  tier: number;
  color: string;
  name: string;
  text: string;
  effects: Effect[];
};

export type SigilReward = {
  tier: number;
  reveal: number;
  choose: number;
};

export type LocationDef = {
  id: string;
  sphere: number;
  terrainDeckType?: TerrainDeckType;
  name: string;
  image?: string;
  flavor: string;
  rule: string;
  rewards: string[];
  sigilReward?: SigilReward;
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
  image?: string;
  sphereImage?: string;
  flavor: string;
  sphere: number;
  terrainDeckType: TerrainDeckType;
  compulsory: LocationFaculty[];
  optional: LocationFaculty[];
  rule: string;
  rewards: string[];
  sigilReward?: SigilReward;
  effects: Effect[];
};

type LocationDefRaw = {
  id: string;
  stage?: number;
  sphere?: number;
  terrainDeckType?: TerrainDeckType;
  name: string;
  image?: string;
  flavor: string;
  rule: string;
  rewards?: string[];
  sigilReward?: SigilReward;
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

const SPHERE_IMAGE_BY_NUMBER: Record<number, string> = {
  1: "/images/spheres/1-Malkuth.png",
  2: "/images/spheres/2-Yesod.png",
  3: "/images/spheres/3-Hod.png",
  4: "/images/spheres/4-Netzach.png",
  5: "/images/spheres/5-Tipharet.png",
  6: "/images/spheres/6-Gevurah.png",
  7: "/images/spheres/7-Chesed.png",
  8: "/images/spheres/8-Binah.png",
  9: "/images/spheres/9-Chokmah.png",
  10: "/images/spheres/10-Kether.png",
};

function defaultLocationImagePath(sphere: number, name: string): string | null {
  // Location images follow a convention like:
  // "1-Malkuth-The Scrapheap Awakening.png" for name "Malkuth: The Scrapheap Awakening"
  const parts = name.split(":");
  if (parts.length < 2) return null;
  const sphereName = parts[0]!.trim();
  const locationName = parts.slice(1).join(":").trim();
  if (!sphereName || !locationName) return null;
  return `/images/locations/${sphere}-${sphereName}-${locationName}.png`;
}

function defaultTerrainDeckType(sphere: number): TerrainDeckType {
  if (sphere >= 5) return "sphere_5_6";
  if (sphere >= 3) return "sphere_3_4";
  return "sphere_1_2";
}

function toLocation(def: LocationDefRaw): LocationCard {
  const sphere = def.sphere ?? def.stage ?? 1;
  const compulsory = def.compulsoryFacultyIds ?? def.compulsoryPartIds ?? [];
  const optional = def.optionalFacultyIds ?? def.optionalPartIds ?? [];
  const image = def.image ?? defaultLocationImagePath(sphere, def.name) ?? undefined;
  return {
    id: def.id,
    name: def.name,
    image,
    sphereImage: SPHERE_IMAGE_BY_NUMBER[sphere],
    flavor: def.flavor,
    sphere,
    terrainDeckType: def.terrainDeckType ?? defaultTerrainDeckType(sphere),
    compulsory: compulsory.map((id) => toLocationFaculty(id, "compulsory")),
    optional: optional.map((id) => toLocationFaculty(id, "optional")),
    rule: def.rule,
    rewards: def.rewards ?? [],
    sigilReward: def.sigilReward,
    effects: def.effects ?? [],
  };
}

export function getLocationsForSphere(sphere: number): LocationCard[] {
  return LOCATIONS_RAW.filter((l) => (l.sphere ?? l.stage ?? 1) === sphere).map(toLocation);
}

export function getAllLocations(): LocationCard[] {
  return LOCATIONS_RAW.map(toLocation);
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
