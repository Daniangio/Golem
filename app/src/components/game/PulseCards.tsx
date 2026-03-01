import React from "react";
import type { PulseCard, PulseSuit } from "../../types";
import { CardBack } from "./CardBack";

function suitMeta(suit: PulseSuit): { label: string; accent: string; bg: string; terrainChip: string; pip: string } {
  switch (suit) {
    case "cinder":
      return {
        label: "Cinder",
        accent: "text-red-200",
        bg: "from-red-500/30 to-slate-950",
        terrainChip: "bg-red-500/20 text-red-100 ring-red-200/30",
        pip: "◆",
      };
    case "stone":
      return {
        label: "Stone",
        accent: "text-amber-200",
        bg: "from-amber-500/25 to-slate-950",
        terrainChip: "bg-amber-500/20 text-amber-100 ring-amber-200/30",
        pip: "⬟",
      };
    case "ether":
      return {
        label: "Ether",
        accent: "text-sky-200",
        bg: "from-sky-500/25 to-slate-950",
        terrainChip: "bg-sky-500/20 text-sky-100 ring-sky-200/30",
        pip: "✦",
      };
    case "steam":
      return {
        label: "Steam",
        accent: "text-slate-200",
        bg: "from-slate-200/20 to-slate-950",
        terrainChip: "bg-slate-300/20 text-slate-100 ring-slate-100/30",
        pip: "◯",
      };
    case "acid":
      return {
        label: "Acid",
        accent: "text-emerald-200",
        bg: "from-emerald-500/25 to-slate-950",
        terrainChip: "bg-emerald-500/20 text-emerald-100 ring-emerald-200/30",
        pip: "✶",
      };
    case "prism":
      return {
        label: "Prism",
        accent: "text-fuchsia-200",
        bg: "from-fuchsia-500/25 to-slate-950",
        terrainChip: "bg-fuchsia-500/20 text-fuchsia-100 ring-fuchsia-200/30",
        pip: "✧",
      };
  }
}

function cardValueLabel(card: PulseCard): string {
  return card.suit === "prism" ? card.prismRange ?? "?" : String(card.value ?? "?");
}

function cardPipCount(card: PulseCard): number {
  if (card.suit === "prism") return 0;
  const raw = Number(card.value ?? 0);
  return Math.max(0, Math.min(10, Number.isFinite(raw) ? raw : 0));
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
  const value = cardValueLabel(card);
  const pipCount = cardPipCount(card);
  const hoverLift =
    lift === "none" ? "" : lift === "lg" ? "hover:-translate-y-6 hover:z-30" : "hover:-translate-y-1";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-[120px] w-[80px] rounded-xl bg-gradient-to-b ${meta.bg} p-2 text-left shadow-xl ring-1 transition ${
        selected ? "ring-white/60" : `ring-white/10 ${hoverLift} hover:ring-white/20`
      } ${className}`}
    >
      <div className={`absolute right-2 top-2 text-center text-[9px] font-bold uppercase tracking-[0.1em] ${meta.accent}`}>{meta.label}</div>
      <div className={`absolute left-2 top-2 text-[10px] font-extrabold ${meta.accent}`}>{value}</div>
      <div className={`absolute bottom-2 right-2 text-[10px] font-extrabold ${meta.accent}`}>{value}</div>
      <div className="flex h-[82px] flex-wrap content-center justify-center gap-x-1 gap-y-0.5 px-1 text-[11px] text-white/95">
        {pipCount > 0 ? Array.from({ length: pipCount }).map((_, index) => <span key={index}>{meta.pip}</span>) : null}
      </div>
    </button>
  );
}

export function PulseCardPreview({ card }: { card: PulseCard }) {
  const meta = suitMeta(card.suit);
  const value = cardValueLabel(card);
  const pipCount = cardPipCount(card);

  return (
    <div className={`relative h-[120px] w-[80px] rounded-xl bg-gradient-to-b ${meta.bg} p-2 shadow-xl ring-1 ring-white/15`}>
      <div className={`absolute right-2 top-2 text-center text-[9px] font-bold uppercase tracking-[0.1em] ${meta.accent}`}>{meta.label}</div>
      <div className={`absolute left-2 top-2 text-[10px] font-extrabold ${meta.accent}`}>{value}</div>
      <div className={`absolute bottom-2 right-2 text-[10px] font-extrabold ${meta.accent}`}>{value}</div>
      <div className="flex h-[82px] flex-wrap content-center justify-center gap-x-1 gap-y-0.5 px-1 text-[11px] text-white/95">
        {pipCount > 0 ? Array.from({ length: pipCount }).map((_, index) => <span key={index}>{meta.pip}</span>) : null}
      </div>
    </div>
  );
}

export function TerrainCardView({ suit, min, max }: { suit: Exclude<PulseSuit, "prism">; min: number; max: number }) {
  const meta = suitMeta(suit);
  const median = Math.floor((min + max) / 2);
  return (
    <div className={`group relative h-[120px] w-[80px] rounded-xl bg-gradient-to-b ${meta.bg} p-4 shadow-xl ring-1 ring-white/15`}>
      <div className="text-center">
        <div className={`text-xs font-extrabold ${meta.accent}`}>{meta.label}</div>
      </div>
      <div className="mt-2 text-center text-l font-extrabold tracking-tight text-white">
        {min}–{max}
      </div>
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 rounded-lg bg-slate-950/95 px-2 py-1 text-[10px] font-semibold text-white/85 opacity-0 ring-1 ring-white/10 transition group-hover:opacity-100">
        Median {median}
      </div>
    </div>
  );
}

export function TerrainCompactCard({
  suit,
  min,
  max,
}: {
  suit: Exclude<PulseSuit, "prism">;
  min: number;
  max: number;
}) {
  const meta = suitMeta(suit);
  const median = Math.floor((min + max) / 2);
  return (
    <div
      className={`group relative flex h-[40px] min-w-[118px] items-center justify-between rounded-xl px-2 text-[10px] font-extrabold ring-1 ${meta.terrainChip}`}
    >
      <span>{meta.label}</span>
      <span>
        {min}–{max}
      </span>
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 rounded-lg bg-slate-950/95 px-2 py-1 text-[10px] font-semibold text-white/85 opacity-0 ring-1 ring-white/10 transition group-hover:opacity-100">
        Median {median}
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
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex h-[120px] w-[80px] shrink-0 items-stretch rounded-xl border-0 bg-transparent p-0 text-left align-top transition"
    >
      <CardBack className="h-full w-full transition group-hover:ring-white/20">{inner}</CardBack>
    </button>
  );
}
