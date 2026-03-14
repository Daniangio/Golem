import React, { useEffect, useRef, useState } from "react";
import { LocationChoiceCard } from "../../../components/game/LocationChoiceCard";
import type { PlayerSlot } from "../../../types";
import type { LocationCard } from "../../../game/locations";
import { MysticPanel, MysticScene, mysticInfoPillClass } from "../../../components/chrome/MysticUI";

type ChooseLocationPhaseProps = {
  isMobileLayout: boolean;
  sphere: number;
  sphereImageUrl: string | null;
  locationOptions: LocationCard[];
  voteByValue: Record<string, PlayerSlot[]>;
  locationCarouselIndex: number;
  setLocationCarouselIndex: React.Dispatch<React.SetStateAction<number>>;
  busy: boolean;
  voteLocked: boolean;
  resolvingWinnerId: string | null;
  onResolveAnimationDone: () => void;
  onVoteLocation: (locationId: string) => void;
};

export function ChooseLocationPhase({
  isMobileLayout,
  sphere,
  sphereImageUrl,
  locationOptions,
  voteByValue,
  locationCarouselIndex,
  setLocationCarouselIndex,
  busy,
  voteLocked,
  resolvingWinnerId,
  onResolveAnimationDone,
  onVoteLocation,
}: ChooseLocationPhaseProps) {
  const [resolveStage, setResolveStage] = useState<"idle" | "focus" | "fade_others" | "winner_out">("idle");
  const resolveTimersRef = useRef<number[]>([]);
  const onResolveDoneRef = useRef(onResolveAnimationDone);

  useEffect(() => {
    onResolveDoneRef.current = onResolveAnimationDone;
  }, [onResolveAnimationDone]);

  useEffect(() => {
    return () => {
      for (const timer of resolveTimersRef.current) window.clearTimeout(timer);
      resolveTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    for (const timer of resolveTimersRef.current) window.clearTimeout(timer);
    resolveTimersRef.current = [];

    if (!resolvingWinnerId) {
      setResolveStage("idle");
      return;
    }

    const winnerIndex = locationOptions.findIndex((l) => l.id === resolvingWinnerId);
    if (winnerIndex >= 0) setLocationCarouselIndex(winnerIndex);
    setResolveStage("focus");
    resolveTimersRef.current.push(window.setTimeout(() => setResolveStage("fade_others"), 380));
    resolveTimersRef.current.push(window.setTimeout(() => setResolveStage("winner_out"), 980));
    resolveTimersRef.current.push(window.setTimeout(() => onResolveDoneRef.current(), 1700));
  }, [locationOptions, resolvingWinnerId, setLocationCarouselIndex]);

  const resolving = Boolean(resolvingWinnerId);
  const count = locationOptions.length;
  const currentIndex = count ? ((locationCarouselIndex % count) + count) % count : 0;
  const currentLocation = count ? locationOptions[currentIndex] : null;

  if (isMobileLayout) {
    return (
      <MysticScene background="Back2" className="h-full min-h-0 rounded-2xl">
        <div className="flex h-full min-h-0 flex-col px-3 py-4">
          <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2">
            <span className={mysticInfoPillClass}>Sphere {sphere}</span>
            <span className={mysticInfoPillClass}>{count} options</span>
          </div>

          <div className="mt-3 flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
            {sphereImageUrl ? (
              <MysticPanel className="w-full max-w-md p-2" glow="#67e8f9">
                <img src={sphereImageUrl} alt={`Sphere ${sphere}`} className="h-28 w-full object-contain" draggable={false} />
              </MysticPanel>
            ) : null}

            <div className="relative flex w-full max-w-[340px] items-center justify-center">
              <button
                type="button"
                onClick={() =>
                  setLocationCarouselIndex((idx) => {
                    if (!count) return 0;
                    return (idx - 1 + count) % count;
                  })
                }
                disabled={resolving || count <= 1}
                className="absolute left-0 z-30 rounded-full border border-white/10 bg-slate-950/60 px-3 py-2 text-sm font-extrabold text-white shadow-[0_0_20px_rgba(103,232,249,0.12)] backdrop-blur-md disabled:opacity-45"
                aria-label="Previous location"
                title="Previous"
              >
                {"<"}
              </button>

              {currentLocation ? (
                <div
                  className={`${
                    resolvingWinnerId === currentLocation.id && resolveStage === "focus"
                      ? "location-winner-pulse"
                      : resolvingWinnerId === currentLocation.id && resolveStage === "winner_out"
                        ? "location-winner-out"
                        : ""
                  }`}
                >
                  <LocationChoiceCard
                    sphere={sphere}
                    location={currentLocation}
                    votes={voteByValue[currentLocation.id] ?? []}
                    onVote={() => onVoteLocation(currentLocation.id)}
                    voteDisabled={busy || voteLocked || resolving}
                    cardClassName="h-[52vh] max-h-[430px] w-[min(72vw,270px)]"
                  />
                </div>
              ) : (
                <div className="flex h-[52vh] max-h-[430px] w-[min(72vw,270px)] items-center justify-center rounded-3xl bg-black/40 text-sm text-white/70 ring-1 ring-white/15">
                  No locations available
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  setLocationCarouselIndex((idx) => {
                    if (!count) return 0;
                    return (idx + 1) % count;
                  })
                }
                disabled={resolving || count <= 1}
                className="absolute right-0 z-30 rounded-full border border-white/10 bg-slate-950/60 px-3 py-2 text-sm font-extrabold text-white shadow-[0_0_20px_rgba(246,196,83,0.12)] backdrop-blur-md disabled:opacity-45"
                aria-label="Next location"
                title="Next"
              >
                {">"}
              </button>
            </div>

            {count > 1 ? (
              <div className="mt-1 flex items-center gap-1">
                {locationOptions.map((location, idx) => {
                  const active = idx === currentIndex;
                  return (
                    <button
                      key={location.id}
                      type="button"
                      onClick={() => setLocationCarouselIndex(idx)}
                      disabled={resolving}
                      className={`h-2.5 w-2.5 rounded-full ring-1 ring-white/20 transition ${
                        active ? "bg-white/80" : "bg-white/20 hover:bg-white/35"
                      }`}
                      aria-label={`Select location ${idx + 1}`}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </MysticScene>
    );
  }

  return (
    <MysticScene background="Back2" className="h-full min-h-0 rounded-2xl">
      <div className="flex h-full min-h-0 flex-col p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className={mysticInfoPillClass}>Sphere {sphere}</span>
          <span className={mysticInfoPillClass}>{locationOptions.length} revealed paths</span>
        </div>

        <div className="mt-1 min-h-0 flex-1 overflow-visible pr-1">
          <div className="grid min-h-0 grid-cols-[minmax(260px,32%)_minmax(0,1fr)] gap-4">
            <MysticPanel className="flex items-center justify-center p-4" glow="#67e8f9">
              {sphereImageUrl ? (
                <img src={sphereImageUrl} alt={`Sphere ${sphere}`} className="h-[320px] w-full object-contain sm:h-[380px]" draggable={false} />
              ) : (
                <div className="flex h-[320px] items-center justify-center text-xs text-white/60 sm:h-[380px]">Sphere art missing</div>
              )}
            </MysticPanel>

            <MysticPanel className="relative min-h-[240px] p-4 [perspective:1200px] sm:min-h-[240px]" glow="#f6c453">
              <button
                type="button"
                onClick={() =>
                  setLocationCarouselIndex((idx) => {
                    const count = locationOptions.length;
                    if (!count) return 0;
                    return (idx - 1 + count) % count;
                  })
                }
                disabled={resolving}
                className="absolute left-3 top-1/2 z-30 -translate-y-1/2 rounded-full border border-white/10 bg-slate-950/60 px-3 py-2 text-sm font-extrabold text-white backdrop-blur-md hover:bg-slate-900/80"
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
                disabled={resolving}
                className="absolute right-3 top-1/2 z-30 -translate-y-1/2 rounded-full border border-white/10 bg-slate-950/60 px-3 py-2 text-sm font-extrabold text-white backdrop-blur-md hover:bg-slate-900/80"
                aria-label="Next location"
                title="Next"
              >
                {">"}
              </button>

              {locationOptions.map((location, idx) => {
                const current = count ? ((locationCarouselIndex % count) + count) % count : 0;
                const half = Math.floor(count / 2);
                let diff = idx - current;
                if (diff > half) diff -= count;
                if (diff < -half) diff += count;

                const show = Math.abs(diff) <= 1 || count <= 3;
                const x = diff * 195;
                const rotation = diff * -28;
                const scale = diff === 0 ? 1 : 0.88;
                const opacity = diff === 0 ? 1 : 0.35;
                const isWinner = resolvingWinnerId === location.id;
                const shouldHideOther = resolving && resolveStage !== "focus" && !isWinner;
                const winnerPulse = isWinner && resolveStage === "focus";
                const winnerOut = isWinner && resolveStage === "winner_out";

                return (
                  <div
                    key={location.id}
                    className="absolute left-1/2 top-1/2 origin-center transition-[transform,opacity] duration-500 ease-out"
                    style={{
                      transform: shouldHideOther
                        ? `translate(-50%, -50%) translateX(${x * 0.55}px) scale(0.6) rotateY(${rotation}deg)`
                        : `translate(-50%, -50%) translateX(${x}px) scale(${isWinner && resolveStage !== "idle" ? 1 : scale}) rotateY(${rotation}deg)`,
                      opacity: shouldHideOther ? 0 : show ? opacity : 0,
                      zIndex: isWinner ? 30 : diff === 0 ? 20 : 10 - Math.abs(diff),
                      pointerEvents: show ? "auto" : "none",
                    }}
                    onMouseDownCapture={() => {
                      if (resolving) return;
                      if (diff !== 0) setLocationCarouselIndex(idx);
                    }}
                  >
                    <div className={winnerPulse ? "location-winner-pulse" : winnerOut ? "location-winner-out" : ""}>
                      <LocationChoiceCard
                        sphere={sphere}
                        location={location}
                        votes={voteByValue[location.id] ?? []}
                        onVote={() => onVoteLocation(location.id)}
                        voteDisabled={busy || voteLocked || resolving}
                      />
                    </div>
                  </div>
                );
              })}

              {locationOptions.length > 1 && (
                <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1">
                  {locationOptions.map((_, idx) => {
                    const count = locationOptions.length;
                    const current = count ? ((locationCarouselIndex % count) + count) % count : 0;
                    const active = idx === current;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setLocationCarouselIndex(idx)}
                        disabled={resolving}
                        className={`h-2.5 w-2.5 rounded-full ring-1 ring-white/20 transition ${
                          active ? "bg-white/80" : "bg-white/20 hover:bg-white/35"
                        }`}
                        aria-label={`Select location ${idx + 1}`}
                      />
                    );
                  })}
                </div>
              )}
            </MysticPanel>
          </div>
        </div>
      </div>
    </MysticScene>
  );
}
