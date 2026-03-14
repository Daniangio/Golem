import React from "react";

type MysticBackground = "Back1" | "Back2";

const BACKGROUND_SRC: Record<MysticBackground, string> = {
  Back1: "/images/backgrounds/Back1.png",
  Back2: "/images/backgrounds/Back2.png",
};

const PARTICLES = [
  { left: "7%", top: "14%", size: 6, delay: "0s", duration: "12s" },
  { left: "14%", top: "72%", size: 8, delay: "1.2s", duration: "15s" },
  { left: "22%", top: "38%", size: 5, delay: "2.8s", duration: "13s" },
  { left: "33%", top: "18%", size: 7, delay: "0.6s", duration: "11s" },
  { left: "41%", top: "82%", size: 9, delay: "1.8s", duration: "14s" },
  { left: "57%", top: "26%", size: 6, delay: "3.1s", duration: "16s" },
  { left: "64%", top: "64%", size: 7, delay: "0.9s", duration: "12s" },
  { left: "73%", top: "12%", size: 10, delay: "2.4s", duration: "18s" },
  { left: "82%", top: "48%", size: 6, delay: "1.5s", duration: "13s" },
  { left: "91%", top: "78%", size: 8, delay: "2.1s", duration: "17s" },
];

const RUNES = [
  { left: "6%", top: "10%", symbol: "✶", size: "text-3xl", delay: "0s", duration: "24s" },
  { left: "88%", top: "14%", symbol: "⟁", size: "text-2xl", delay: "1.5s", duration: "22s" },
  { left: "11%", top: "84%", symbol: "☉", size: "text-2xl", delay: "3.2s", duration: "26s" },
  { left: "86%", top: "80%", symbol: "✷", size: "text-3xl", delay: "0.8s", duration: "28s" },
];

export function mysticButtonClass(
  variant: "primary" | "secondary" | "ghost" | "danger" = "primary",
  fullWidth: boolean = false
) {
  const base =
    "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-40";
  const width = fullWidth ? " w-full" : "";
  if (variant === "secondary") {
    return `${base}${width} border border-cyan-200/25 bg-cyan-300/12 text-cyan-50 shadow-[0_0_28px_rgba(56,189,248,0.12)] hover:bg-cyan-300/18`;
  }
  if (variant === "ghost") {
    return `${base}${width} border border-white/12 bg-white/6 text-white/84 backdrop-blur-md hover:bg-white/12`;
  }
  if (variant === "danger") {
    return `${base}${width} border border-rose-200/20 bg-rose-400/16 text-rose-50 shadow-[0_0_24px_rgba(251,113,133,0.15)] hover:bg-rose-400/22`;
  }
  return `${base}${width} border border-amber-200/25 bg-[linear-gradient(135deg,rgba(251,191,36,0.26),rgba(103,232,249,0.18))] text-white shadow-[0_0_32px_rgba(251,191,36,0.16)] hover:brightness-110`;
}

export const mysticInputClass =
  "w-full rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2.5 text-sm text-white placeholder:text-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] outline-none ring-1 ring-white/5 backdrop-blur-md transition focus:border-cyan-300/35 focus:ring-cyan-300/20";

export const mysticSelectClass = `${mysticInputClass} appearance-none`;

export const mysticInfoPillClass =
  "inline-flex items-center rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white/78 backdrop-blur-md";

export function MysticScene({
  background = "Back1",
  className = "",
  children,
}: {
  background?: MysticBackground;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`mystic-scene relative isolate overflow-hidden ${className}`}>
      <img
        src={BACKGROUND_SRC[background]}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center opacity-90 sm:object-top"
        draggable={false}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.16),transparent_36%),radial-gradient(circle_at_bottom,rgba(251,191,36,0.16),transparent_32%),linear-gradient(180deg,rgba(5,8,18,0.14),rgba(4,6,14,0.86))]" />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.03)_0%,transparent_24%,transparent_76%,rgba(255,255,255,0.03)_100%)] opacity-70" />

      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          className="mystic-particle absolute rounded-full"
          style={
            {
              left: particle.left,
              top: particle.top,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              animationDelay: particle.delay,
              animationDuration: particle.duration,
            } as React.CSSProperties
          }
        />
      ))}

      {RUNES.map((rune, index) => (
        <span
          key={index}
          className={`mystic-rune absolute ${rune.size} font-semibold text-white/18`}
          style={
            {
              left: rune.left,
              top: rune.top,
              animationDelay: rune.delay,
              animationDuration: rune.duration,
            } as React.CSSProperties
          }
          aria-hidden="true"
        >
          {rune.symbol}
        </span>
      ))}

      <div className="pointer-events-none absolute inset-0">
        <div className="mystic-orbit absolute -left-24 top-8 h-56 w-56 rounded-full border border-cyan-200/10" />
        <div className="mystic-orbit absolute bottom-[-4.5rem] right-[-3.5rem] h-72 w-72 rounded-full border border-amber-100/10" />
      </div>

      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

export function MysticPanel({
  children,
  className = "",
  glow = "#f6c453",
}: {
  children: React.ReactNode;
  className?: string;
  glow?: string;
}) {
  return (
    <section
      className={`mystic-panel relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/42 backdrop-blur-xl ${className}`}
      style={{ ["--mystic-panel-glow" as any]: glow } as React.CSSProperties}
    >
      <div className="relative z-10 h-full">{children}</div>
    </section>
  );
}
