import React from "react";
import type { SigilDef } from "../../../game/locations";
import type { PlayerSlot } from "../../../types";
import { seatLabel } from "../gameUtils";

type ChooseSigilsPhaseProps = {
  isMobileLayout: boolean;
  selectedSeat: PlayerSlot;
  assigningSeat: PlayerSlot;
  canActForSelected: boolean;
  sigils: SigilDef[];
  assignments: Record<string, PlayerSlot>;
  assignedBySeat: Partial<Record<PlayerSlot, string[]>>;
  context: "reward_tier_1" | "reward_location" | "single_location_setup" | null;
  maxPicks: number;
  isHost: boolean;
  busy: boolean;
  canConfirm: boolean;
  onAssignSigil: (sigilId: string, seat: PlayerSlot | null) => void;
  onConfirm: () => void;
};

export function ChooseSigilsPhase({
  isMobileLayout,
  selectedSeat,
  assigningSeat,
  canActForSelected,
  sigils,
  assignments,
  assignedBySeat,
  context,
  maxPicks,
  isHost,
  busy,
  canConfirm,
  onAssignSigil,
  onConfirm,
}: ChooseSigilsPhaseProps) {
  const assignedCount = Object.keys(assignments).length;
  const tierSet = Array.from(new Set(sigils.map((sigil) => sigil.tier))).sort((a, b) => a - b);
  const tierLabel = tierSet.length === 1 ? `Tier ${tierSet[0]}` : "Mixed tiers";
  const isRewardDraft = context === "reward_tier_1" || context === "reward_location";
  const subtitle = isRewardDraft
    ? `Reward draft: choose ${maxPicks} among ${sigils.length} revealed (${tierLabel}).`
    : "Single location loadout: assign any number of revealed Sigils.";

  const infoPillClass = "rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/80 ring-1 ring-white/10";

  const cards = sigils.map((sigil) => {
    const assignedSeat = assignments[sigil.id] ?? null;
    const selectedBySeat = assignedSeat === assigningSeat;
    const canEdit = isHost && !busy && canActForSelected;
    const cardStyle = { ["--sigil-glow-color" as any]: sigil.color } as React.CSSProperties;
    return (
      <button
        key={sigil.id}
        type="button"
        disabled={!canEdit}
        onClick={() => onAssignSigil(sigil.id, selectedBySeat ? null : assigningSeat)}
        className={`sigil-glow-border relative rounded-2xl p-[1px] text-left transition ${
          canEdit ? "hover:-translate-y-0.5" : "opacity-70"
        } ${isMobileLayout ? "w-full" : "w-full max-w-[260px]"}`}
        style={cardStyle}
      >
        <div
          className={`rounded-2xl bg-slate-950/90 p-2 ring-1 ${
            selectedBySeat ? "ring-emerald-200/40" : "ring-white/10"
          } ${isMobileLayout ? "min-h-[220px]" : "h-[118px]"}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="line-clamp-1 text-[11px] font-extrabold text-white">{sigil.name}</div>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
              T{sigil.tier}
            </span>
          </div>
          <div className={`mt-1 text-[10px] leading-relaxed text-white/75 ${isMobileLayout ? "line-clamp-6" : "line-clamp-3"}`}>
            {sigil.text}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-white/65">
              {assignedSeat ? `Assigned: ${seatLabel(assignedSeat)}` : "Unassigned"}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                selectedBySeat
                  ? "bg-emerald-400/20 text-emerald-200 ring-emerald-200/20"
                  : "bg-white/10 text-white/60 ring-white/10"
              }`}
            >
              {selectedBySeat ? "Selected" : "Tap"}
            </span>
          </div>
        </div>
      </button>
    );
  });

  const list = isMobileLayout ? (
    <div className="grid grid-cols-2 gap-2">{cards}</div>
  ) : (
    <div className="grid h-full grid-cols-[repeat(auto-fit,minmax(220px,260px))] content-start justify-center gap-3">
      {cards}
    </div>
  );

  if (isMobileLayout) {
    return (
      <div className="relative h-full min-h-0 overflow-hidden rounded-2xl bg-slate-950/80">
        <div className="relative z-10 flex h-full min-h-0 flex-col p-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-sm font-extrabold text-white">Assign Sigils</div>
              <div className="mt-1 text-[11px] text-white/75">{subtitle}</div>
            </div>
            {isHost && (
              <button
                type="button"
                onClick={onConfirm}
                disabled={!canConfirm || busy}
                className="rounded-2xl bg-emerald-500 px-3 py-2 text-xs font-extrabold text-white shadow-sm disabled:opacity-40"
              >
                Confirm Sigils
              </button>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={infoPillClass}>
              Revealed: {sigils.length}
            </span>
            <span className={infoPillClass}>
              Chosen: {assignedCount}/{maxPicks}
            </span>
            <span className={infoPillClass}>
              {tierLabel}
            </span>
            <span className={infoPillClass}>
              Active seat: {seatLabel(selectedSeat)}
            </span>
            <span className={infoPillClass}>
              Assigning as: {seatLabel(assigningSeat)}
            </span>
          </div>

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">{list}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-h-0 flex-col rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-extrabold text-white">Assign Sigils</div>
          <div className="mt-1 text-xs text-white/70">{subtitle}</div>
        </div>
        {isHost && (
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || busy}
            className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-white shadow-sm disabled:opacity-40"
          >
            Confirm Sigils
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={infoPillClass}>
          Revealed: {sigils.length}
        </span>
        <span className={infoPillClass}>
          Chosen: {assignedCount}/{maxPicks}
        </span>
        <span className={infoPillClass}>
          {tierLabel}
        </span>
        <span className={infoPillClass}>
          P1: {(assignedBySeat.p1 ?? []).length}
        </span>
        <span className={infoPillClass}>
          P2: {(assignedBySeat.p2 ?? []).length}
        </span>
        <span className={infoPillClass}>
          P3: {(assignedBySeat.p3 ?? []).length}
        </span>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-hidden pr-1">{list}</div>
    </div>
  );
}
