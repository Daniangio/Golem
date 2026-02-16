import type { PulseCard, PulseSuit, TerrainCard, TerrainDeckType } from "../../types";
import { randomInt, shuffleInPlace } from "./random";

export function makePulseDeck(): PulseCard[] {
  const suits: Exclude<PulseSuit, "prism">[] = ["cinder", "stone", "ether", "steam", "acid"];
  const cards: PulseCard[] = [];
  for (const suit of suits) {
    for (let v = 0; v <= 10; v += 1) {
      cards.push({ id: `${suit}:${v}`, suit, value: v });
    }
  }
  for (let i = 1; i <= 5; i += 1) {
    const range: PulseCard["prismRange"] = i % 2 === 0 ? "1-5" : "6-10";
    cards.push({ id: `prism:${i}:${range}`, suit: "prism", prismRange: range });
  }
  return cards;
}

export function defaultTerrainDeckTypeForSphere(sphere: number): TerrainDeckType {
  if (sphere >= 3) return "sphere_3";
  if (sphere === 2) return "sphere_2";
  return "sphere_1";
}

export function makeTerrainDeck(deckType: TerrainDeckType): TerrainCard[] {
  const suits: TerrainCard["suit"][] = ["cinder", "stone", "ether", "steam", "acid"];
  const cfgByType: Record<
    TerrainDeckType,
    { count: number; minFloor: number; maxCeil: number; widthMin: number; widthMax: number }
  > = {
    sphere_1: { count: 5, minFloor: 8, maxCeil: 22, widthMin: 5, widthMax: 9 },
    sphere_2: { count: 5, minFloor: 9, maxCeil: 23, widthMin: 4, widthMax: 8 },
    sphere_3: { count: 5, minFloor: 10, maxCeil: 24, widthMin: 4, widthMax: 7 },
  };
  const cfg = cfgByType[deckType];
  const deck: TerrainCard[] = [];
  for (let i = 0; i < cfg.count; i += 1) {
    const suit = suits[randomInt(suits.length)]!;
    const width = cfg.widthMin + randomInt(cfg.widthMax - cfg.widthMin + 1);
    const min = cfg.minFloor + randomInt(cfg.maxCeil - cfg.minFloor - width + 1);
    const max = min + width;
    deck.push({ id: `t:${deckType}:${i}:${suit}:${min}-${max}`, suit, min, max });
  }
  return deck;
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
