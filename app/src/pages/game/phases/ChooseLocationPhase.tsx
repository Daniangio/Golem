import React from "react";
import { LocationChoiceCard } from "../../../components/game/LocationChoiceCard";
import type { PlayerSlot } from "../../../types";
import type { LocationCard } from "../../../game/locations";
import { seatLabel } from "../gameUtils";

type ChooseLocationPhaseProps = {
  sphere: number;
  sphereImageUrl: string | null;
  locationOptions: LocationCard[];
  voteByValue: Record<string, PlayerSlot[]>;
  locationCarouselIndex: number;
  setLocationCarouselIndex: React.Dispatch<React.SetStateAction<number>>;
  actingSeat: PlayerSlot | null;
  isHost: boolean;
  busy: boolean;
  canConfirmLocation: boolean;
  onVoteLocation: (locationId: string) => void;
  onAutoVoteBots: () => void;
  onConfirmLocation: () => void;
};

export function ChooseLocationPhase({
  sphere,
  sphereImageUrl,
  locationOptions,
  voteByValue,
  locationCarouselIndex,
  setLocationCarouselIndex,
  actingSeat,
  isHost,
  busy,
  canConfirmLocation,
  onVoteLocation,
  onAutoVoteBots,
  onConfirmLocation,
}: ChooseLocationPhaseProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mt-1 min-h-0 flex-1 overflow-visible pr-1">
        <div className="grid min-h-0 grid-cols-[minmax(0,32%)_minmax(0,1fr)] gap-4">
          {sphereImageUrl ? (
            <img src={sphereImageUrl} alt={`Sphere ${sphere}`} className="h-[360px] w-full object-contain sm:h-[420px]" draggable={false} />
          ) : (
            <div className="flex h-[360px] items-center justify-center text-xs text-white/60 sm:h-[420px]">Sphere art missing</div>
          )}
          <div className="relative min-h-[360px] [perspective:1200px] sm:min-h-[420px]">
            <button
              type="button"
              onClick={() =>
                setLocationCarouselIndex((idx) => {
                  const count = locationOptions.length;
                  if (!count) return 0;
                  return (idx - 1 + count) % count;
                })
              }
              className="absolute left-1 top-1/2 z-30 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-sm font-extrabold text-white ring-1 ring-white/10 hover:bg-white/15"
              aria-label="Previous location"
              title="Previous"
            >
              {"<"}
            </button>
            <button
              type="button"
              onClick={() =>
                setLocationCarouselIndex((idx) => {
                  const count = locationOptions.length;
                  if (!count) return 0;
                  return (idx + 1) % count;
                })
              }
              className="absolute right-1 top-1/2 z-30 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-sm font-extrabold text-white ring-1 ring-white/10 hover:bg-white/15"
              aria-label="Next location"
              title="Next"
            >
              {">"}
            </button>

            {locationOptions.map((location, idx) => {
              const count = locationOptions.length;
              const current = count ? ((locationCarouselIndex % count) + count) % count : 0;
              const half = Math.floor(count / 2);
              let diff = idx - current;
              if (diff > half) diff -= count;
              if (diff < -half) diff += count;

              const show = Math.abs(diff) <= 1 || count <= 3;
              const x = diff * 220;
              const rotation = diff * -28;
              const scale = diff === 0 ? 1 : 0.88;
              const opacity = diff === 0 ? 1 : 0.35;

              return (
                <div
                  key={location.id}
                  className="absolute left-1/2 top-1/2 origin-center transition-[transform,opacity] duration-500 ease-out"
                  style={{
                    transform: `translate(-50%, -50%) translateX(${x}px) scale(${scale}) rotateY(${rotation}deg)`,
                    opacity: show ? opacity : 0,
                    zIndex: diff === 0 ? 20 : 10 - Math.abs(diff),
                    pointerEvents: show ? "auto" : "none",
                  }}
                  onMouseDownCapture={() => {
                    if (diff !== 0) setLocationCarouselIndex(idx);
                  }}
                >
                  <LocationChoiceCard
                    sphere={sphere}
                    location={location}
                    votes={voteByValue[location.id] ?? []}
                    onVote={() => onVoteLocation(location.id)}
                  />
                </div>
              );
            })}

            {locationOptions.length > 1 && (
              <div className="absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1">
                {locationOptions.map((_, idx) => {
                  const count = locationOptions.length;
                  const current = count ? ((locationCarouselIndex % count) + count) % count : 0;
                  const active = idx === current;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setLocationCarouselIndex(idx)}
                      className={`h-2 w-2 rounded-full ring-1 ring-white/20 transition ${
                        active ? "bg-white/80" : "bg-white/20 hover:bg-white/35"
                      }`}
                      aria-label={`Select location ${idx + 1}`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <div className="text-[11px] font-semibold text-white/70">
          Voting as: <span className="font-extrabold text-white">{actingSeat ? seatLabel(actingSeat) : "—"}</span>
        </div>
        {isHost && (
          <button
            onClick={onAutoVoteBots}
            disabled={busy}
            className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/85 ring-1 ring-white/10 hover:bg-white/15 disabled:opacity-40"
          >
            Auto-vote bots
          </button>
        )}
        {isHost && (
          <button
            onClick={onConfirmLocation}
            disabled={busy || !canConfirmLocation}
            className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm location
          </button>
        )}
      </div>
    </div>
  );
}
