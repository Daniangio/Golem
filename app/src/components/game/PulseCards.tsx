import React from "react";
import type { PulseCard, PulseSuit } from "../../types";
import { CardBack } from "./CardBack";

function suitMeta(suit: PulseSuit): { label: string; accent: string; bg: string } {
  switch (suit) {
    case "cinder":
      return { label: "Cinder", accent: "text-red-200", bg: "from-red-500/30 to-slate-950" };
    case "stone":
      return { label: "Stone", accent: "text-amber-200", bg: "from-amber-500/25 to-slate-950" };
    case "ether":
      return { label: "Ether", accent: "text-sky-200", bg: "from-sky-500/25 to-slate-950" };
    case "steam":
      return { label: "Steam", accent: "text-slate-200", bg: "from-slate-200/20 to-slate-950" };
    case "acid":
      return { label: "Acid", accent: "text-emerald-200", bg: "from-emerald-500/25 to-slate-950" };
    case "prism":
      return { label: "Prism", accent: "text-fuchsia-200", bg: "from-fuchsia-500/25 to-slate-950" };
  }
}

export function PulseCardMini({
  card,
  selected,
  onClick,
  lift = "sm",
  className = "",
}: {
  card: PulseCard;
  selected: boolean;
  onClick: () => void;
  lift?: "none" | "sm" | "lg";
  className?: string;
}) {
  const meta = suitMeta(card.suit);
  const value = card.suit === "prism" ? card.prismRange ?? "?" : String(card.value ?? "?");
  const hoverLift =
    lift === "none" ? "" : lift === "lg" ? "hover:-translate-y-6 hover:z-30" : "hover:-translate-y-1";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-[120px] w-[80px] rounded-2xl bg-gradient-to-b ${meta.bg} p-2 text-left shadow-xl ring-1 transition ${
        selected ? "ring-white/60" : `ring-white/10 ${hoverLift} hover:ring-white/20`
      } ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className={`text-[11px] font-extrabold ${meta.accent}`}>{meta.label}</div>
      </div>
      <div className="mt-6 text-3xl font-extrabold tracking-tight text-white">{value}</div>
    </button>
  );
}

export function PulseCardPreview({ card }: { card: PulseCard }) {
  const meta = suitMeta(card.suit);
  const value = card.suit === "prism" ? card.prismRange ?? "?" : String(card.value ?? "?");

  return (
    <div className={`relative h-[120px] w-[80px] rounded-xl bg-gradient-to-b ${meta.bg} p-4 shadow-xl ring-1 ring-white/15`}>
      <div className={`text-xs font-extrabold ${meta.accent}`}>{meta.label}</div>
      <div className="mt-2 text-xl font-extrabold tracking-tight text-white">{value}</div>
    </div>
  );
}

export function TerrainCardView({ suit, min, max }: { suit: Exclude<PulseSuit, "prism">; min: number; max: number }) {
  const meta = suitMeta(suit);
  return (
    <div className={`relative h-[120px] w-[80px] rounded-xl bg-gradient-to-b ${meta.bg} p-4 shadow-xl ring-1 ring-white/15`}>
      <div className="flex items-center justify-between">
        <div className={`text-xs font-extrabold ${meta.accent}`}>{meta.label}</div>
      </div>
      <div className="mt-2 text-l font-extrabold tracking-tight text-white">
        {min}–{max}
      </div>
    </div>
  );
}

export function DeckStub({
  label,
  count,
  onClick,
}: {
  label: string;
  count: number;
  onClick?: () => void;
}) {
  const inner = (
    <div className="absolute inset-0 p-4">
      {onClick && <div className="mt-2 text-[10px] font-semibold text-white/50">Click to peek</div>}
    </div>
  );

  if (!onClick) return <CardBack>{inner}</CardBack>;
  return (
    <button type="button" onClick={onClick} className="group rounded-xl text-left transition">
      <CardBack className="transition group-hover:ring-white/20">{inner}</CardBack>
    </button>
  );
}
