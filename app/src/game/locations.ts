import { getLocationsForStage } from "./catalog";

export {
  getLocationById,
  getLocationsForStage,
  getLocationsForSphere,
  getPartById,
  getFacultyById,
  getUpgradeById,
  getAllUpgrades,
  getSigilById,
  getAllSigils,
  type LocationCard,
  type LocationFaculty,
  type FacultyDef,
  type SigilDef,
  type Effect,
} from "./catalog";

// Back-compat exports used by older code.
export const LOCATIONS_L1 = getLocationsForStage(1);
