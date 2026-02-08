import locationsRaw from "./data/locations.json";
import partsRaw from "./data/parts.json";
import upgradesRaw from "./data/upgrades.json";

export type PartType = "compulsory" | "optional";

export type Effect =
  | { type: "hand_capacity_delta"; amount: number; scope: "chapter" }
  | { type: "disable_match_refill_on_failure" }
  | { type: "once_per_chapter_extra_card_after_reveal" }
  | { type: "once_per_chapter_fuse_to_zero_after_reveal" };

export type PartDef = {
  id: string;
  name: string;
  type: PartType;
  text: string;
  effects: Effect[];
};

export type UpgradeDef = {
  id: string;
  name: string;
  text: string;
  effects: Effect[];
};

export type LocationDef = {
  id: string;
  stage: number;
  name: string;
  flavor: string;
  rule: string;
  rewards: string[];
  compulsoryPartIds: string[];
  optionalPartIds: string[];
  effects: Effect[];
};

export type LocationPart = {
  id: string;
  name: string;
  type: PartType;
  effect: string;
  effects: Effect[];
};

export type LocationCard = {
  id: string;
  name: string;
  flavor: string;
  stage: number;
  compulsory: LocationPart[];
  optional: LocationPart[];
  rule: string;
  rewards: string[];
  effects: Effect[];
};

const PARTS: PartDef[] = partsRaw as any;
const UPGRADES: UpgradeDef[] = upgradesRaw as any;
const LOCATIONS: LocationDef[] = locationsRaw as any;

const partById = new Map<string, PartDef>();
for (const p of PARTS) partById.set(p.id, p);

const upgradeById = new Map<string, UpgradeDef>();
for (const u of UPGRADES) upgradeById.set(u.id, u);

function toLocationPart(partId: string): LocationPart {
  const p = partById.get(partId);
  if (!p) throw new Error(`Unknown part id: ${partId}`);
  return { id: p.id, name: p.name, type: p.type, effect: p.text, effects: p.effects ?? [] };
}

export function getLocationsForStage(stage: number): LocationCard[] {
  return LOCATIONS.filter((l) => l.stage === stage).map((l) => ({
    id: l.id,
    name: l.name,
    flavor: l.flavor,
    stage: l.stage,
    compulsory: l.compulsoryPartIds.map(toLocationPart),
    optional: l.optionalPartIds.map(toLocationPart),
    rule: l.rule,
    rewards: l.rewards,
    effects: l.effects ?? [],
  }));
}

export function getLocationById(id: string | undefined | null): LocationCard | null {
  if (!id) return null;
  const def = LOCATIONS.find((l) => l.id === id);
  if (!def) return null;
  return {
    id: def.id,
    name: def.name,
    flavor: def.flavor,
    stage: def.stage,
    compulsory: def.compulsoryPartIds.map(toLocationPart),
    optional: def.optionalPartIds.map(toLocationPart),
    rule: def.rule,
    rewards: def.rewards,
    effects: def.effects ?? [],
  };
}

export function getPartById(id: string | undefined | null): PartDef | null {
  if (!id) return null;
  return partById.get(id) ?? null;
}

export function getUpgradeById(id: string | undefined | null): UpgradeDef | null {
  if (!id) return null;
  return upgradeById.get(id) ?? null;
}

export function getAllUpgrades(): UpgradeDef[] {
  return [...UPGRADES];
}
