export type PartType = "compulsory" | "optional";

export type LocationPart = {
  id: string;
  name: string;
  type: PartType;
  effect: string;
};

export type LocationCard = {
  id: string;
  name: string;
  flavor: string;
  level: 1;
  compulsory: LocationPart[];
  optional: LocationPart[];
  rule: string;
  rewards: string[];
};

export const LOCATIONS_L1: LocationCard[] = [
  {
    id: "L1_SCRAPHEAP_AWAKENING",
    name: "The Scrapheap Awakening",
    flavor:
      "“The Golem stirs amidst the rusted remains of its predecessors. Systems are coming online, but the frame is stiff and uncoordinated.”",
    level: 1,
    compulsory: [
      {
        id: "static_core",
        name: "Static Core",
        type: "compulsory",
        effect: "The assigned player cannot use the passive effect of their card suits.",
      },
      {
        id: "numb_leg",
        name: "Numb Leg",
        type: "compulsory",
        effect: "Passive. The assigned player’s hand capacity is permanently reduced by 1 for this Chapter.",
      },
    ],
    optional: [
      {
        id: "aux_battery",
        name: "Auxiliary Battery",
        type: "optional",
        effect: "Once per Chapter, the player may contribute an extra card to a Pulse after the reveal.",
      },
      {
        id: "fuse",
        name: "Fuse",
        type: "optional",
        effect: "Once per Chapter, the player may ignore the value of a played card in a Pulse after the reveal.",
      },
    ],
    rule:
      "System Warm-up: The first Undershoot of this Chapter does not penalize the draw phase; the Golem is still finding its momentum.",
    rewards: ["Self-Repair: Heal the Golem for 1 HP (Max 5)."],
  },
  {
    id: "L1_WHISPERING_MIRE",
    name: "The Whispering Mire",
    flavor:
      "“A thick, acidic fog clings to the Golem’s joints. Visibility is low, and every step requires precise thermal management to avoid a meltdown.”",
    level: 1,
    compulsory: [
      {
        id: "numb_leg",
        name: "Numb Leg",
        type: "compulsory",
        effect: "Passive. The assigned player’s hand capacity is permanently reduced by 1 for this Chapter.",
      },
      {
        id: "muddled_sensors",
        name: "Muddled Sensors",
        type: "compulsory",
        effect: "The assigned player must play their first card face-down before the Terrain card for the next Step is revealed.",
      },
    ],
    optional: [
      {
        id: "cooling_fan",
        name: "Cooling Fan",
        type: "optional",
        effect: "When this player plays a Steam (White) card, it reduces Heat by 1.",
      },
    ],
    rule:
      "Acidic Haze: A player cannot refill their hand if they play an Acid (Green) card, even if the group succeeds or they match the suit.",
    rewards: ["Self-Repair: Heal the Golem for 1 HP (Max 5)."],
  },
  {
    id: "L1_SHATTERED_ASCENT",
    name: "The Shattered Ascent",
    flavor:
      "“The path turns vertical. Gravity is a constant enemy, and the Golem must divert all power to its pistons to clear the jagged peaks.”",
    level: 1,
    compulsory: [
      {
        id: "cracked_pistons",
        name: "Cracked Pistons",
        type: "compulsory",
        effect: "If the group Undershoots, this player takes an additional -1 to their hand capacity for the next step.",
      },
      {
        id: "heavy_chassis",
        name: "Heavy Chassis",
        type: "compulsory",
        effect: "This player’s cards always count as +2 value, making it harder to avoid overshooting.",
      },
    ],
    optional: [
      {
        id: "sharp_eye",
        name: "Sharp Eye",
        type: "optional",
        effect: "This player may secretly inspect the 5 Terrain cards in the Chapter deck at any time, even before the reveal.",
      },
      {
        id: "aux_battery",
        name: "Auxiliary Battery",
        type: "optional",
        effect: "Once per Chapter, the player may contribute an extra card to a Pulse after the reveal.",
      },
      {
        id: "fuse",
        name: "Fuse",
        type: "optional",
        effect: "Once per Chapter, the player may ignore the value of a played card in a Pulse after the reveal.",
      },
    ],
    rule:
      "Gravitational Pull: If no player matches the Terrain suit during a Pulse, the group must immediately add +1 Heat as the Golem struggles to maintain its position.",
    rewards: [
      "Self-Repair: Heal the Golem for 1 HP (Max 5).",
      "Mulligan Token: Gain a shared token that allows one player to discard their entire hand and draw back to capacity at any time.",
    ],
  },
];

export function getLocationById(id: string | undefined | null): LocationCard | null {
  if (!id) return null;
  return LOCATIONS_L1.find((l) => l.id === id) ?? null;
}
