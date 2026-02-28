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

function toneClass(tone: FacultyToken["tone"] | undefined): string {
  if (tone === "good") return "bg-emerald-400/20 text-emerald-200 ring-emerald-200/20";
  return "bg-white/10 text-white/70 ring-white/10";
}

function SmallAbilityCard({
  title,
  text,
  accent,
}: {
  title: string;
  text: string;
  accent?: string;
}) {
  return (
    <div className="group relative h-[120px] w-[82px] shrink-0">
      <div
        className="h-full w-full rounded-2xl bg-white/5 p-1.5 text-[9px] ring-1 ring-white/10"
        style={accent ? ({ borderColor: `${accent}66` } as React.CSSProperties) : undefined}
      >
        <div className="font-extrabold text-white" style={truncStyle(2)}>
          {title}
        </div>
        <div className="mt-1 text-[8px] leading-tight text-white/80" style={truncStyle(5)}>
          {text}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-30 w-[220px] -translate-x-1/2 opacity-0 transition group-hover:opacity-100">
        <div className="rounded-2xl bg-slate-950/95 p-3 text-xs text-white shadow-2xl ring-1 ring-white/15">
          <div className="font-extrabold">{title}</div>
          <div className="mt-2 whitespace-pre-wrap leading-relaxed text-white/85">{text}</div>
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
  return (
    <div className="rounded-2xl bg-white/5 p-2 ring-1 ring-white/10">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/50">Assigned Faculty & Sigils</div>
      <div className="flex gap-2 overflow-x-auto overflow-y-visible pb-1">
        {part ? (
          <SmallAbilityCard
            title={part.name}
            text={part.effect}
          />
        ) : (
          <SmallAbilityCard title="No Faculty" text="No faculty assigned." />
        )}

        {sigils.length ? (
          sigils.map((sigil) => (
            <SmallAbilityCard
              key={sigil.id}
              title={sigil.name}
              text={sigil.text}
              accent={sigil.color}
            />
          ))
        ) : (
          <SmallAbilityCard title="No Sigils" text="No sigils assigned." />
        )}
      </div>
    </div>
  );
}

