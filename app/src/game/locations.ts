import { getLocationsForStage } from "./catalog";

export {
  getLocationById,
  getLocationsForStage,
  getPartById,
  getUpgradeById,
  getAllUpgrades,
  type LocationCard,
  type LocationPart,
  type PartDef,
  type UpgradeDef,
  type Effect,
} from "./catalog";

// Back-compat exports used by older code.
export const LOCATIONS_L1 = getLocationsForStage(1);
