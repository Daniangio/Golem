import React, { useEffect, useRef, useState } from "react";
import type { TerrainCard } from "../../types";
import { CardBack } from "./CardBack";
import { TerrainCardView } from "./PulseCards";

const OUT_MS = 520;
const IN_MS = 620;
const DEBUG_STORE_KEY = "golem_debug_terrain_anim_events";

type HiddenState = "pre_selection" | "hidden_until_played" | null;

type TransitionState = {
  step: "out" | "in";
  outgoing: TerrainCard | null;
  incoming: TerrainCard | null;
};

type DebugEvent = {
  tick: number;
  at: number;
  prevId: string;
  nextId: string;
  hiddenState: HiddenState;
  result: string;
  terrainChanged: boolean;
  canAnimate: boolean;
  transitionStep: "out" | "in" | "none";
};

export function AnimatedTerrainCard({
  terrain,
  hiddenState,
  lastOutcomeResult,
}: {
  terrain: TerrainCard | null;
  hiddenState: HiddenState;
  lastOutcomeResult?: "success" | "undershoot" | "overshoot";
}) {
  const debugEnabled = typeof window !== "undefined" && window.localStorage.getItem("golem_debug_terrain_anim") === "1";
  const previousTerrainRef = useRef<TerrainCard | null>(terrain);
  const timersRef = useRef<number[]>([]);
  const debugTickRef = useRef(0);
  const [transition, setTransition] = useState<TransitionState | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugEvent | null>(null);
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.sessionStorage.getItem(DEBUG_STORE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, 12) as DebugEvent[];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    return () => {
      for (const timerId of timersRef.current) window.clearTimeout(timerId);
      timersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const prevTerrain = previousTerrainRef.current;
    const terrainChanged = (prevTerrain?.id ?? null) !== (terrain?.id ?? null);
    const canAnimate = terrainChanged && prevTerrain && lastOutcomeResult === "success";

    if (debugEnabled) {
      debugTickRef.current += 1;
      const event: DebugEvent = {
        tick: debugTickRef.current,
        at: Date.now(),
        prevId: prevTerrain?.id ?? "null",
        nextId: terrain?.id ?? "null",
        hiddenState,
        result: lastOutcomeResult ?? "undefined",
        terrainChanged,
        canAnimate: Boolean(canAnimate),
        transitionStep: transition?.step ?? "none",
      };
      setDebugInfo(event);
      setDebugEvents((prev) => {
        const next = [event, ...prev].slice(0, 12);
        try {
          window.sessionStorage.setItem(DEBUG_STORE_KEY, JSON.stringify(next));
        } catch {
          // noop
        }
        return next;
      });
      console.info("[terrain-anim]", event);
    }

    if (canAnimate) {
      for (const timerId of timersRef.current) window.clearTimeout(timerId);
      timersRef.current = [];
      setTransition({ step: "out", outgoing: prevTerrain, incoming: terrain });
      timersRef.current.push(
        window.setTimeout(() => {
          setTransition((current) => {
            if (!current) return current;
            return { ...current, step: "in" };
          });
        }, OUT_MS)
      );
      timersRef.current.push(window.setTimeout(() => setTransition(null), OUT_MS + IN_MS));
    } else if (terrainChanged) {
      for (const timerId of timersRef.current) window.clearTimeout(timerId);
      timersRef.current = [];
      setTransition(null);
    }

    previousTerrainRef.current = terrain;
  }, [terrain, hiddenState, lastOutcomeResult, debugEnabled]);

  const debugHud =
    debugEnabled && debugEvents.length ? (
      <div className="fixed bottom-2 right-2 z-[90] w-[300px] rounded-xl bg-black/85 p-2 text-[10px] leading-tight text-emerald-100 ring-1 ring-emerald-200/25 backdrop-blur">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="font-extrabold">Terrain anim debug</div>
          <button
            type="button"
            onClick={() => {
              setDebugEvents([]);
              try {
                window.sessionStorage.removeItem(DEBUG_STORE_KEY);
              } catch {
                // noop
              }
            }}
            className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/80 hover:bg-white/20"
          >
            Clear
          </button>
        </div>
        {debugEvents.slice(0, 5).map((entry) => (
          <div key={`${entry.tick}-${entry.at}`} className="mb-1 rounded bg-white/5 px-1.5 py-1">
            <div className="font-mono text-[9px] text-white/75">{new Date(entry.at).toLocaleTimeString()}</div>
            <div>
              tick {entry.tick} • step {entry.transitionStep} • result {entry.result}
            </div>
            <div>
              chg {String(entry.terrainChanged)} • anim {String(entry.canAnimate)} • hidden {entry.hiddenState ?? "none"}
            </div>
            <div className="truncate text-white/70">
              {entry.prevId} → {entry.nextId}
            </div>
          </div>
        ))}
      </div>
    ) : null;

  if (!transition && hiddenState === "pre_selection") {
    return (
      <>
        <CardBack>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[10px] font-semibold text-white/80">
            Pre-selection
          </div>
        </CardBack>
        {debugHud}
      </>
    );
  }

  if (!transition && hiddenState === "hidden_until_played") {
    return (
      <>
        <CardBack>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[10px] font-semibold text-white/80">
            Play first
          </div>
        </CardBack>
        {debugHud}
      </>
    );
  }

  if (!terrain && !transition) {
    return (
      <>
        <div className="text-sm text-white/60">No terrain.</div>
        {debugHud}
      </>
    );
  }

  return (
    <>
      <div className="relative h-[120px] w-[80px]">
        {transition ? (
          transition.step === "out" ? (
            transition.outgoing ? (
              <div className="terrain-win-out absolute inset-0">
                <TerrainCardView suit={transition.outgoing.suit} min={transition.outgoing.min} max={transition.outgoing.max} />
              </div>
            ) : null
          ) : transition.incoming ? (
            <div className="terrain-win-in absolute inset-0">
              {hiddenState ? (
                <CardBack className="h-full w-full" />
              ) : (
                <TerrainCardView suit={transition.incoming.suit} min={transition.incoming.min} max={transition.incoming.max} />
              )}
            </div>
          ) : (
            <div className="text-sm text-white/60">No terrain.</div>
          )
        ) : terrain ? (
          <TerrainCardView suit={terrain.suit} min={terrain.min} max={terrain.max} />
        ) : (
          <div className="text-sm text-white/60">No terrain.</div>
        )}
        {debugEnabled && debugInfo && (
          <div className="pointer-events-none absolute -bottom-[62px] left-0 z-30 w-[170px] rounded-lg bg-black/80 px-2 py-1 text-[9px] leading-tight text-emerald-200 ring-1 ring-emerald-200/20">
            <div>tick: {debugInfo.tick}</div>
            <div>prev: {debugInfo.prevId.split(":")[0]}</div>
            <div>next: {debugInfo.nextId.split(":")[0]}</div>
            <div>chg: {String(debugInfo.terrainChanged)} / anim: {String(debugInfo.canAnimate)}</div>
            <div>res: {debugInfo.result} / hidden: {debugInfo.hiddenState ?? "none"}</div>
            <div>step: {transition?.step ?? "none"}</div>
          </div>
        )}
      </div>
      {debugHud}
    </>
  );
}
