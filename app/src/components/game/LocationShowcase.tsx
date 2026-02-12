import React from "react";

type LocationToken = {
  key: string;
  label: string;
  tone: "good" | "muted";
};

type LocationShowcaseProps = {
  locationName: string;
  locationRule: string;
  locationImageUrl: string | null;
  locationTokens?: LocationToken[];
  spark?: number;
  friction?: number;
  sparkAnimClassName?: string;
  frictionAnimClassName?: string;
  panelClassName?: string;
  imageClassName?: string;
};

export function LocationShowcase({
  locationName,
  locationRule,
  locationImageUrl,
  locationTokens = [],
  spark,
  friction,
  sparkAnimClassName,
  frictionAnimClassName,
  panelClassName,
  imageClassName,
}: LocationShowcaseProps) {
  const showStats = typeof spark === "number" && typeof friction === "number";

  return (
    <>
      <div className={`rotating-glow-border shrink-0 rounded-2xl p-[1px] ${panelClassName ?? "w-[260px]"}`}>
        <div className="relative z-10 rounded-2xl bg-slate-950/85 p-3 ring-1 ring-white/10">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-white/55">Current location</div>
          <div className="mt-1 text-sm font-extrabold leading-tight text-white">{locationName}</div>
          <div
            className="mt-2 text-[11px] leading-relaxed text-white/80"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: showStats ? 6 : 9,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {locationRule}
          </div>
          {locationTokens.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {locationTokens.map((token) => (
                <span
                  key={token.key}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                    token.tone === "good"
                      ? "bg-emerald-400/15 text-emerald-100 ring-emerald-200/20"
                      : "bg-white/10 text-white/60 ring-white/10"
                  }`}
                >
                  {token.label}
                </span>
              ))}
            </div>
          ) : null}

          {showStats && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className={`rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10 ${sparkAnimClassName ?? ""}`}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl leading-none text-sky-200">✦</span>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Spark</div>
                    <div className="text-xl font-extrabold leading-none text-white">{spark}</div>
                  </div>
                </div>
              </div>

              <div
                className={`rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10 ${frictionAnimClassName ?? ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl leading-none text-amber-200">⟁</span>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-white/60">Friction</div>
                    <div className="text-xl font-extrabold leading-none text-white">{friction}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 rounded-2xl bg-white/5 p-2 ring-1 ring-white/10">
        {locationImageUrl ? (
          <img
            src={locationImageUrl}
            alt={locationName}
            className={imageClassName ?? "h-[224px] w-[154px] rounded-xl object-cover"}
            draggable={false}
          />
        ) : (
          <div className="flex h-[224px] w-[154px] items-center justify-center rounded-xl bg-slate-950/70 text-center text-xs text-white/60">
            Location art missing
          </div>
        )}
      </div>
    </>
  );
}
