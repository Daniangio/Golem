import React from "react";

export type AssignedPartDetail = {
  name: string;
  effect: string;
  type: "compulsory" | "optional";
};

export type FacultyToken = {
  label: string;
  tone: "good" | "muted";
};

export type AssignedSigilDetail = {
  id: string;
  name: string;
  tier: number;
  text: string;
  color: string;
  oncePerChapterKey?: string;
  used?: boolean;
};

export function AssignedFacultyPanel({
  part,
  token,
  sigils,
  compact = false,
}: {
  part: AssignedPartDetail | null;
  token?: FacultyToken | null;
  sigils: AssignedSigilDetail[];
  compact?: boolean;
}) {
  return (
    <div className="space-y-2">
      {part ? (
        <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-extrabold text-white">{part.name}</div>
            <div className="flex items-center gap-2">
              {token && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                    token.tone === "good"
                      ? "bg-emerald-400/20 text-emerald-200 ring-emerald-200/20"
                      : "bg-white/10 text-white/70 ring-white/10"
                  }`}
                >
                  {token.label}
                </span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  part.type === "compulsory"
                    ? "bg-amber-400/20 text-amber-200"
                    : "bg-slate-200/10 text-slate-200"
                }`}
              >
                {part.type}
              </span>
            </div>
          </div>
          <div className={`${compact ? "mt-1 text-[10px]" : "mt-2 text-[11px]"} leading-relaxed text-white/80`}>
            {part.effect}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white/5 p-3 text-[11px] text-white/70 ring-1 ring-white/10">
          No faculty chosen yet.
        </div>
      )}

      <div>
        <div className="text-[11px] font-semibold text-white/60">Sigils</div>
        {sigils.length ? (
          <div className="mt-2 grid gap-2">
            {sigils.map((sigil) => (
              <div
                key={sigil.id}
                className="sigil-glow-border rounded-2xl p-[1px]"
                style={{ ["--sigil-glow-color" as any]: sigil.color }}
              >
                <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-extrabold text-white">{sigil.name}</div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
                        Tier {sigil.tier}
                      </span>
                      {sigil.oncePerChapterKey && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                            sigil.used
                              ? "bg-white/10 text-white/65 ring-white/10"
                              : "bg-emerald-400/20 text-emerald-200 ring-emerald-200/20"
                          }`}
                        >
                          {sigil.used ? "Used" : "Ready"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={`${compact ? "mt-1 text-[10px]" : "mt-2 text-[11px]"} leading-relaxed text-white/80`}>
                    {sigil.text}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 rounded-2xl bg-white/5 p-3 text-[11px] text-white/70 ring-1 ring-white/10">
            No sigils assigned.
          </div>
        )}
      </div>
    </div>
  );
}

