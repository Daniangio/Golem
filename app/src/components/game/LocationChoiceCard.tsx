import React, { useState } from "react";
import type { LocationCard } from "../../game/locations";
import type { PlayerSlot } from "../../types";

function seatLabel(seat: PlayerSlot): string {
  return seat.toUpperCase();
}

function imgSrc(path: string | undefined | null): string | null {
  if (!path) return null;
  return encodeURI(path);
}

export function LocationChoiceCard({
  sphere,
  location,
  votes,
  onVote,
}: {
  sphere: number;
  location: LocationCard;
  votes: PlayerSlot[];
  onVote: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const frontImg = imgSrc(location.image);

  return (
    <div className="flex flex-col items-stretch gap-3">
      <button
        type="button"
        onClick={() => setFlipped((v) => !v)}
        className="group relative h-[360px] w-[250px] rounded-3xl bg-transparent [perspective:1200px] sm:h-[420px] sm:w-[290px]"
      >
        <div
          className={`absolute inset-0 rounded-3xl transition-transform duration-500 [transform-style:preserve-3d] ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          } group-hover:-translate-y-1`}
        >
          <div className="absolute inset-0 overflow-hidden rounded-3xl bg-slate-950 shadow-xl ring-1 ring-white/10 [backface-visibility:hidden]">
            {frontImg ? (
              <img
                src={frontImg}
                alt={location.name}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 p-5">
                <div className="text-center">
                  <div className="text-xs font-semibold text-white/60">Missing image</div>
                  <div className="mt-2 text-lg font-extrabold text-white">{location.name}</div>
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-3">
              <div className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/10">
                Sphere {sphere}
              </div>
              <div className="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white/80 ring-1 ring-white/10">
                Click to flip
              </div>
            </div>
          </div>

          <div className="absolute inset-0 overflow-hidden rounded-3xl bg-gradient-to-b from-slate-950 to-slate-900 p-5 shadow-xl ring-1 ring-white/10 [transform:rotateY(180deg)] [backface-visibility:hidden]">
            <div className="flex items-center justify-between">
              <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                {location.sphere === 1 ? "Sphere 1" : `Sphere ${location.sphere}`}
              </div>
              <div className="text-xs font-semibold text-white/60">Click to flip</div>
            </div>

            <div className="mt-5">
              <div className="text-xs font-semibold text-white/70">Faculties</div>
              <div className="mt-1 text-[11px] text-white/60">Hover a name to read the effect.</div>

              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[11px] font-semibold text-amber-200/90">Compulsory</div>
                  <div className="mt-2 grid grid-cols-1 gap-1">
                    {location.compulsory.map((p) => (
                      <div key={p.id} className="relative">
                        <div className="peer inline-flex max-w-full items-center gap-2 rounded-lg bg-amber-400/10 px-2 py-1 text-[11px] font-semibold text-amber-100 ring-1 ring-amber-200/15">
                          <span className="text-amber-200">✦</span>
                          <span className="truncate">{p.name}</span>
                        </div>
                        <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-64 rounded-2xl bg-slate-950/95 p-3 text-xs text-white/85 opacity-0 shadow-2xl ring-1 ring-white/10 backdrop-blur peer-hover:opacity-100">
                          <div className="text-sm font-extrabold text-white">{p.name}</div>
                          <div className="mt-1 leading-relaxed text-white/75">{p.effect}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-slate-200/80">Optional</div>
                  <div className="mt-2 grid grid-cols-1 gap-1">
                    {location.optional.map((p) => (
                      <div key={p.id} className="relative">
                        <div className="peer inline-flex max-w-full items-center gap-2 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/85 ring-1 ring-white/10">
                          <span className="text-white/70">•</span>
                          <span className="truncate">{p.name}</span>
                        </div>
                        <div className="pointer-events-none absolute left-0 top-full z-30 mt-2 w-64 rounded-2xl bg-slate-950/95 p-3 text-xs text-white/85 opacity-0 shadow-2xl ring-1 ring-white/10 backdrop-blur peer-hover:opacity-100">
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
