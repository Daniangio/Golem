import React from "react";
import type { AssignedPartDetail, AssignedSigilDetail, FacultyToken } from "./AssignedFacultyPanel";

function truncStyle(lines: number): React.CSSProperties {
  return {
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };
}

function tokenToneClass(tone: FacultyToken["tone"] | undefined): string {
  if (tone === "good") return "bg-emerald-400/20 text-emerald-200 ring-emerald-200/30";
  return "bg-white/10 text-white/70 ring-white/10";
}

function AbilityFieldCard({
  title,
  text,
  accentColor,
  leftBadge,
  rightBadge,
}: {
  title: string;
  text: string;
  accentColor: string;
  leftBadge?: React.ReactNode;
  rightBadge?: React.ReactNode;
}) {
  const glowStyle = { ["--sigil-glow-color" as any]: accentColor } as React.CSSProperties;

  return (
    <div className="group relative h-[138px] w-[104px] shrink-0">
      <div className="sigil-glow-border h-full w-full rounded-2xl p-[1px]" style={glowStyle}>
        <div className="flex h-full w-full flex-col rounded-2xl bg-slate-950/90 p-2 ring-1 ring-white/10">
          <div className="flex items-start justify-between gap-1">
            <div className="text-[10px] font-extrabold text-white" style={truncStyle(2)}>
              {title}
            </div>
            {rightBadge}
          </div>
          {leftBadge ? <div className="mt-1">{leftBadge}</div> : null}
          <div className="mt-1 text-[9px] leading-tight text-white/80" style={truncStyle(8)}>
            {text}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-40 w-[300px] -translate-x-1/2 opacity-0 transition group-hover:opacity-100">
        <div className="sigil-glow-border rounded-2xl p-[1px]" style={glowStyle}>
          <div className="rounded-2xl bg-slate-950/95 p-3 text-xs text-white ring-1 ring-white/15">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-extrabold text-white">{title}</div>
              {rightBadge}
            </div>
            {leftBadge ? <div className="mt-2">{leftBadge}</div> : null}
            <div className="mt-2 whitespace-pre-wrap leading-relaxed text-white/85">{text}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TableAbilityCardsRow({
  part,
  token,
  sigils,
}: {
  part: AssignedPartDetail | null;
  token?: FacultyToken | null;
  sigils: AssignedSigilDetail[];
}) {
  const facultyAccent = part?.type === "compulsory" ? "#f59e0b" : "#9ca3af";

  return (
    <div className="rounded-2xl bg-white/5 p-2 ring-1 ring-white/10">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/50">Assigned Faculty & Sigils</div>
      <div className="flex gap-2 overflow-x-auto overflow-y-visible pb-1">
        {part ? (
          <AbilityFieldCard
            title={part.name}
            text={part.effect}
            accentColor={facultyAccent}
            leftBadge={
              <span
                className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ${
                  part.type === "compulsory" ? "bg-amber-400/20 text-amber-200 ring-amber-200/25" : "bg-white/10 text-white/70 ring-white/10"
                }`}
              >
                {part.type}
              </span>
            }
            rightBadge={
              token ? (
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ${tokenToneClass(token.tone)}`}>
                  {token.label}
                </span>
              ) : undefined
            }
          />
        ) : (
          <AbilityFieldCard title="No Faculty" text="No faculty assigned." accentColor="#94a3b8" />
        )}

        {sigils.length ? (
          sigils.map((sigil) => (
            <AbilityFieldCard
              key={sigil.id}
              title={sigil.name}
              text={sigil.text}
              accentColor={sigil.color}
              leftBadge={
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold text-white/75 ring-1 ring-white/10">
                  Tier {sigil.tier}
                </span>
              }
              rightBadge={
                sigil.oncePerChapterKey ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ${
                      sigil.used
                        ? "bg-white/10 text-white/60 ring-white/10"
                        : "bg-emerald-400/20 text-emerald-200 ring-emerald-200/25"
                    }`}
                  >
                    {sigil.used ? "Used" : "Ready"}
                  </span>
                ) : undefined
              }
            />
          ))
        ) : (
          <AbilityFieldCard title="No Sigils" text="No sigils assigned." accentColor="#64748b" />
        )}
      </div>
    </div>
  );
}
