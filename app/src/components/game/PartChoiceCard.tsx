import React from "react";
import type { LocationFaculty } from "../../game/locations";
import type { PlayerSlot } from "../../types";

function seatLabel(seat: PlayerSlot): string {
  return seat.toUpperCase();
}

export function PartChoiceCard({
  part,
  takenBy,
  selected = false,
  unavailable = false,
  disabled = false,
  onPick,
}: {
  part: LocationFaculty;
  takenBy: PlayerSlot[];
  selected?: boolean;
  unavailable?: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={`group relative w-full rounded-2xl bg-gradient-to-b p-4 text-left shadow-xl ring-1 transition ${
        selected
          ? "from-emerald-950/70 to-slate-950 ring-emerald-300/35"
          : "from-slate-900 to-slate-950 ring-white/10"
      } ${
        unavailable
          ? "cursor-not-allowed opacity-45 saturate-0"
          : disabled
            ? "cursor-not-allowed opacity-60"
            : "hover:-translate-y-1"
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div>
          <div className="text-base text-s font-extrabold text-white">{part.name}</div>
          <div className="mt-1 text-xs leading-relaxed text-white/75">{part.effect}</div>
        </div>
        {takenBy.map((s) => (
          <span key={s} className="rounded-full bg-white/10 px-2 py-1 text-xs font-semibold text-white/80">
            {seatLabel(s)}
          </span>
        ))}
        <span
          className={`mt-0.5 rounded-full text-[11px] font-semibold ${
            part.type === "compulsory" ? "bg-amber-400/20 text-amber-200" : "bg-slate-200/10 text-slate-200"
          }`}
        >
          {part.type}
        </span>
      </div>

      <div
        className={`pointer-events-none absolute inset-0 rounded-3xl ring-1 ${
          unavailable ? "ring-white/0" : "ring-white/5 group-hover:ring-white/15"
        }`}
      />
    </button>
  );
}
