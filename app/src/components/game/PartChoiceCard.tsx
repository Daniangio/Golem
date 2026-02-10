import React from "react";
import type { LocationFaculty } from "../../game/locations";
import type { PlayerSlot } from "../../types";

function seatLabel(seat: PlayerSlot): string {
  return seat.toUpperCase();
}

export function PartChoiceCard({
  part,
  takenBy,
  onPick,
}: {
  part: LocationFaculty;
  takenBy: PlayerSlot[];
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="group relative w-full rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 p-4 text-left shadow-xl ring-1 ring-white/10 transition hover:-translate-y-1"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-extrabold text-white">{part.name}</div>
          <div className="mt-1 text-sm leading-relaxed text-white/75">{part.effect}</div>
        </div>
        <span
          className={`mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            part.type === "compulsory" ? "bg-amber-400/20 text-amber-200" : "bg-slate-200/10 text-slate-200"
          }`}
        >
          {part.type}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {takenBy.map((s) => (
          <span key={s} className="rounded-full bg-white/10 px-2 py-1 text-xs font-semibold text-white/80">
            {seatLabel(s)}
          </span>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-white/5 group-hover:ring-white/15" />
    </button>
  );
}
