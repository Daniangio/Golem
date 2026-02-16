import { getLocationsForStage } from "./catalog";

export {
  getLocationById,
  getAllLocations,
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
  type TerrainDeckType,
} from "./catalog";

// Back-compat exports used by older code.
export const LOCATIONS_L1 = getLocationsForStage(1);
