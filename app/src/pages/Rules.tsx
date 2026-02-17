import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatedTerrainCard } from "../components/game/AnimatedTerrainCard";
import { LocationShowcase } from "../components/game/LocationShowcase";
import { CardBack } from "../components/game/CardBack";
import { PulseCardMini } from "../components/game/PulseCards";
import { getAllLocations } from "../game/locations";
import type { PulseCard, TerrainCard } from "../types";

const TERRAIN_DEMO: TerrainCard[] = [
  { id: "rules:t:0", suit: "steam", min: 12, max: 16 },
  { id: "rules:t:1", suit: "stone", min: 10, max: 15 },
  { id: "rules:t:2", suit: "acid", min: 13, max: 18 },
];

const PLAY_DEMO_CARDS: PulseCard[] = [
  { id: "rules:p1", suit: "steam", value: 6 },
  { id: "rules:p2", suit: "stone", value: 5 },
  { id: "rules:p3", suit: "prism", prismRange: "1-5" },
];

export default function Rules() {
  const allLocations = useMemo(() => getAllLocations(), []);
  const exampleLocation = useMemo(
    () => allLocations.find((location) => Boolean(location.image)) ?? allLocations[0] ?? null,
    [allLocations]
  );

  const [terrainIndex, setTerrainIndex] = useState(0);
  const [hiddenState, setHiddenState] = useState<"pre_selection" | "hidden_until_played" | null>(null);
  const [lastOutcomeResult, setLastOutcomeResult] = useState<"success" | "undershoot" | "overshoot" | undefined>(
    undefined
  );

  const [spark, setSpark] = useState(5);
  const [friction, setFriction] = useState(0);
  const [sparkAnimClassName, setSparkAnimClassName] = useState("");
  const [frictionAnimClassName, setFrictionAnimClassName] = useState("");
  const animationTimersRef = useRef<number[]>([]);

  const [showReference, setShowReference] = useState(false);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [referenceText, setReferenceText] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/docs/GAME_RULES.md")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (!active) return;
        setReferenceText(text);
      })
      .catch(() => {
        if (!active) return;
        setReferenceText("Rules reference file was not found at `/docs/GAME_RULES.md`.");
      })
      .finally(() => {
        if (!active) return;
        setReferenceLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of animationTimersRef.current) window.clearTimeout(timer);
      animationTimersRef.current = [];
    };
  }, []);

  const terrain = TERRAIN_DEMO[terrainIndex] ?? null;

  const applyTimedClass = (
    setClassName: React.Dispatch<React.SetStateAction<string>>,
    className: string,
    ms: number
  ) => {
    setClassName(className);
    const timer = window.setTimeout(() => setClassName(""), ms);
    animationTimersRef.current.push(timer);
  };

  const runSuccessDemo = () => {
    setHiddenState(null);
    setLastOutcomeResult("success");
    setTerrainIndex((prev) => (prev + 1) % TERRAIN_DEMO.length);
  };

  const runFrictionUpDemo = () => {
    setFriction((prev) => Math.min(3, prev + 1));
    applyTimedClass(setFrictionAnimClassName, "friction-stat-up", 900);
  };

  const runFrictionDownDemo = () => {
    setFriction((prev) => Math.max(0, prev - 1));
    applyTimedClass(setFrictionAnimClassName, "friction-stat-down", 900);
  };

  const runSparkLossDemo = () => {
    setSpark((prev) => Math.max(0, prev - 1));
    applyTimedClass(setSparkAnimClassName, "spark-stat-loss", 900);
  };

  const runSparkGainDemo = () => {
    setSpark((prev) => Math.min(9, prev + 1));
    applyTimedClass(setSparkAnimClassName, "spark-stat-gain", 900);
  };

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tutorial</div>
            <h1 className="mt-1 text-2xl font-black text-slate-900">How to play CORE</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Learn the loop with interactive examples using the same card components and animations as the game board.
            </p>
          </div>
          <Link
            to="/"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Back to Lobby
          </Link>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm ring-1 ring-slate-800">
        <div className="text-sm font-semibold uppercase tracking-wide text-white/60">Pulse Walkthrough</div>
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
          <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="text-xs font-semibold text-white/60">Terrain / Law card</div>
            <div className="mt-3 flex justify-center">
              <AnimatedTerrainCard terrain={terrain} hiddenState={hiddenState} lastOutcomeResult={lastOutcomeResult} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={runSuccessDemo}
                className="rounded-xl bg-emerald-400/90 px-3 py-2 text-xs font-extrabold text-slate-950 hover:bg-emerald-300"
              >
                Success + Draw next
              </button>
              <button
                type="button"
                onClick={() => {
                  setLastOutcomeResult("undershoot");
                  setHiddenState(null);
                }}
                className="rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                Stall (same card)
              </button>
              <button
                type="button"
                onClick={() => setHiddenState("pre_selection")}
                className="rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                Pre-selection hidden
              </button>
              <button
                type="button"
                onClick={() => setHiddenState("hidden_until_played")}
                className="rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20"
              >
                Veiled Eye hidden
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="text-xs font-semibold text-white/60">Selection and reveal</div>
            <div className="mt-3 flex items-end gap-2 overflow-x-auto pb-1">
              {PLAY_DEMO_CARDS.map((card) => (
                <PulseCardMini key={card.id} card={card} selected={false} onClick={() => {}} />
              ))}
              <div className="pl-2">
                <CardBack />
              </div>
            </div>
            <ol className="mt-4 space-y-2 text-xs text-white/80">
              <li>1. Reveal terrain card and target window.</li>
              <li>2. Players commit cards face-down (or earlier if an effect says so).</li>
              <li>3. Reveal cards, resolve Prism value at resolution time.</li>
              <li>4. Commit outcome: Success, Stall, or Overshoot.</li>
              <li>5. Apply Resonance and refill order, then move to next pulse.</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm ring-1 ring-slate-800">
        <div className="text-sm font-semibold uppercase tracking-wide text-white/60">Location + Vessel effects</div>
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex items-start overflow-x-auto pb-2">
            <LocationShowcase
              locationName={exampleLocation?.name ?? "Location example"}
              locationRule={exampleLocation?.rule ?? "Location rule text"}
              locationImageUrl={exampleLocation?.image ?? null}
              spark={spark}
              friction={friction}
              sparkAnimClassName={sparkAnimClassName}
              frictionAnimClassName={frictionAnimClassName}
            />
          </div>

          <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="text-xs font-semibold text-white/60">Try stat animations</div>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={runFrictionUpDemo}
                className="rounded-xl bg-rose-400/90 px-3 py-2 text-xs font-extrabold text-white hover:bg-rose-300"
              >
                Add Friction
              </button>
              <button
                type="button"
                onClick={runFrictionDownDemo}
                className="rounded-xl bg-sky-400/90 px-3 py-2 text-xs font-extrabold text-slate-950 hover:bg-sky-300"
              >
                Reduce Friction
              </button>
              <button
                type="button"
                onClick={runSparkLossDemo}
                className="rounded-xl bg-rose-500/85 px-3 py-2 text-xs font-extrabold text-white hover:bg-rose-400"
              >
                Take Damage (Spark -1)
              </button>
              <button
                type="button"
                onClick={runSparkGainDemo}
                className="rounded-xl bg-emerald-400/90 px-3 py-2 text-xs font-extrabold text-slate-950 hover:bg-emerald-300"
              >
                Gain Spark
              </button>
            </div>
            <p className="mt-3 text-xs text-white/70">
              These are the same animation classes used by the live game UI for Spark/Friction feedback.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Reference</div>
            <div className="mt-1 text-xl font-black text-slate-900">Full rules document</div>
          </div>
          <button
            type="button"
            onClick={() => setShowReference((prev) => !prev)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            {showReference ? "Hide Rules Text" : "Show Rules Text"}
          </button>
        </div>

        {showReference && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {referenceLoading ? (
              <div className="text-sm text-slate-600">Loading `GAME_RULES.md`…</div>
            ) : (
              <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap text-[12px] leading-6 text-slate-800">
                {referenceText}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
