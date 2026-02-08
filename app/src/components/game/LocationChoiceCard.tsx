import React, { useState } from "react";
import type { LocationCard } from "../../game/locations";
import type { PlayerSlot } from "../../types";

function seatLabel(seat: PlayerSlot): string {
  return seat.toUpperCase();
}

export function LocationChoiceCard({
  stage,
  location,
  votes,
  onVote,
}: {
  stage: number;
  location: LocationCard;
  votes: PlayerSlot[];
  onVote: () => void;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="flex flex-col items-stretch gap-3">
      <button
        type="button"
        onClick={() => setFlipped((v) => !v)}
        className="group relative h-[420px] w-[290px] rounded-3xl bg-transparent [perspective:1200px]"
      >
        <div
          className={`absolute inset-0 rounded-3xl transition-transform duration-500 [transform-style:preserve-3d] ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          } group-hover:-translate-y-1`}
        >
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-xl ring-1 ring-white/10 [backface-visibility:hidden]">
            <div className="flex items-center justify-between">
              <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">Stage {stage}</div>
              <div className="text-xs font-semibold text-white/60">Click to flip</div>
            </div>
            <div className="mt-4 text-xl font-extrabold tracking-tight text-white">{location.name}</div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-white/70">Rule</div>
              <div className="mt-1 text-sm leading-relaxed text-white/85">{location.rule}</div>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-white/70">Rewards</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/85">
                {location.rewards.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-slate-950 to-slate-900 p-5 shadow-xl ring-1 ring-white/10 [transform:rotateY(180deg)] [backface-visibility:hidden]">
            <div className="flex items-center justify-between">
              <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                {location.level === 1 ? "Level 1" : `Level ${location.level}`}
              </div>
              <div className="text-xs font-semibold text-white/60">Click to flip</div>
            </div>

            <div className="mt-4 text-sm italic leading-relaxed text-white/80">{location.flavor}</div>

            <div className="mt-5">
              <div className="text-xs font-semibold text-white/70">Parts</div>
              <div className="mt-2 text-xs text-white/60">Hover a part for details.</div>

              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-[11px] font-semibold text-amber-200/90">Compulsory</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {location.compulsory.map((p) => (
                      <div key={p.id} className="relative">
                        <div className="peer inline-flex items-center gap-2 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-100 ring-1 ring-amber-200/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-200" />
                          {p.name}
                        </div>
                        <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-2xl bg-slate-950/95 p-3 text-xs text-white/85 opacity-0 shadow-2xl ring-1 ring-white/10 backdrop-blur peer-hover:opacity-100">
                          <div className="text-sm font-extrabold text-white">{p.name}</div>
                          <div className="mt-1 leading-relaxed text-white/75">{p.effect}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-slate-200/80">Optional</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {location.optional.map((p) => (
                      <div key={p.id} className="relative">
                        <div className="peer inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/85 ring-1 ring-white/10">
                          <span className="h-1.5 w-1.5 rounded-full bg-white/60" />
                          {p.name}
                        </div>
                        <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-2xl bg-slate-950/95 p-3 text-xs text-white/85 opacity-0 shadow-2xl ring-1 ring-white/10 backdrop-blur peer-hover:opacity-100">
                          <div className="text-sm font-extrabold text-white">{p.name}</div>
                          <div className="mt-1 leading-relaxed text-white/75">{p.effect}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </button>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onVote}
          className="w-full rounded-2xl bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-sm hover:bg-slate-50"
        >
          Vote
        </button>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {votes.map((s) => (
            <span key={s} className="rounded-full bg-white/10 px-2 py-1 text-xs font-semibold text-white/80">
              {seatLabel(s)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

