import type { PulseCard, PulseSuit, TerrainCard, TerrainDeckType } from "../../types";
import terrainDecksRaw from "../../game/data/terrainDecks.json";
import { shuffleInPlace } from "./random";

export function makePulseDeck(): PulseCard[] {
  const suits: Exclude<PulseSuit, "prism">[] = ["cinder", "stone", "ether", "steam", "acid"];
  const cards: PulseCard[] = [];
  for (const suit of suits) {
    for (let v = 0; v <= 10; v += 1) {
      cards.push({ id: `${suit}:${v}`, suit, value: v });
    }
  }
  const prismRanges: Array<PulseCard["prismRange"]> = ["0-3", "4-6", "7-10", "0-3", "4-6"];
  for (let i = 1; i <= 5; i += 1) {
    const range = prismRanges[i - 1] ?? "0-3";
    cards.push({ id: `prism:${i}:${range}`, suit: "prism", prismRange: range });
  }
  return cards;
}

export function defaultTerrainDeckTypeForSphere(sphere: number): TerrainDeckType {
  if (sphere >= 5) return "sphere_5_6";
  if (sphere >= 3) return "sphere_3_4";
  return "sphere_1_2";
}

type TerrainDeckEntry = Pick<TerrainCard, "suit" | "min" | "max">;
type CanonicalTerrainDeckType = "sphere_1_2" | "sphere_3_4" | "sphere_5_6";

const TERRAIN_DECKS = terrainDecksRaw as Record<CanonicalTerrainDeckType, TerrainDeckEntry[]>;

function canonicalTerrainDeckType(deckType: TerrainDeckType): CanonicalTerrainDeckType {
  if (deckType === "sphere_1" || deckType === "sphere_2") return "sphere_1_2";
  if (deckType === "sphere_3") return "sphere_3_4";
  return deckType;
}

export function makeTerrainDeck(deckType: TerrainDeckType, deckSize = 5): TerrainCard[] {
  const canonicalType = canonicalTerrainDeckType(deckType);
  const source = TERRAIN_DECKS[canonicalType] ?? [];
  if (source.length === 0) return [];

  const count = Math.max(1, Math.min(deckSize, source.length));
  const indexes = Array.from({ length: source.length }, (_, i) => i);
  shuffleInPlace(indexes);

  return indexes.slice(0, count).map((sourceIndex, drawIndex) => {
    const card = source[sourceIndex]!;
    return {
      id: `t:${canonicalType}:${drawIndex}:${sourceIndex}:${card.suit}:${card.min}-${card.max}`,
      suit: card.suit,
      min: card.min,
      max: card.max,
    };
  });
}

export function drawCardsWithReshuffle<T>(
  deck: T[],
  discard: T[],
  count: number
): { drawn: T[]; deck: T[]; discard: T[] } {
  const d = [...deck];
  let disc = [...discard];
  const drawn: T[] = [];
  while (drawn.length < count) {
    if (d.length === 0) {
      if (disc.length === 0) break;
      shuffleInPlace(disc);
      d.push(...disc);
      disc = [];
    }
    const next = d.shift();
    if (!next) break;
    drawn.push(next);
  }
  return { drawn, deck: d, discard: disc };
}
