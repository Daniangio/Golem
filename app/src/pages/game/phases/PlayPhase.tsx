import React, { useMemo, useState } from "react";
import { AnimatedTerrainCard } from "../../../components/game/AnimatedTerrainCard";
import { CardBack } from "../../../components/game/CardBack";
import { LocationShowcase } from "../../../components/game/LocationShowcase";
import { DeckStub, PulseCardMini, PulseCardPreview } from "../../../components/game/PulseCards";
import { seatLabel, playerLabel } from "../gameUtils";
import type { GameDoc, PlayerSlot, Players, TerrainCard } from "../../../types";

type LocationToken = { key: string; label: string; tone: "good" | "muted" };

type PlayPhaseProps = {
  isMobileLayout: boolean;
  locationName: string | null;
  locationRule: string | null;
  locationImageUrl: string | null;
  locationTokens: LocationToken[];
  spark: number;
  friction: number;
  sparkAnimClassName?: string;
  frictionAnimClassName?: string;
  terrainDeckLength: number;
  terrainRemaining: number;
  canPeekTerrainDeck: boolean;
  onOpenTerrainDeck: () => void;
  terrain: TerrainCard | null;
  terrainHiddenState: "pre_selection" | "hidden_until_played" | null;
  lastOutcomeResult?: "success" | "undershoot" | "overshoot";
  reservoir: GameDoc["reservoir"];
  reservoir2: GameDoc["reservoir2"];
  pulsePhase: GameDoc["pulsePhase"];
  isHost: boolean;
  busy: boolean;
  haveAllPlayed: boolean;
  exchangePending: boolean;
  onEndActions: () => void;
  played: GameDoc["played"];
  valueChoicesBySeat: Partial<
    Record<
      PlayerSlot,
      {
        primaryOptions: number[];
        extraOptions: number[];
        primarySuggested?: number;
        extraSuggested?: number;
        primarySelected?: number;
        extraSelected?: number;
      }
    >
  >;
  players: Players;
  playerNames?: Record<string, string>;
  isOwnOrControlledSeat: (seat: PlayerSlot) => boolean;
  canSetValueSeat: (seat: PlayerSlot) => boolean;
  onCycleCardValue: (seat: PlayerSlot, target: "primary" | "extra") => void;
  canSteamSigilSeat: (seat: PlayerSlot) => boolean;
  onSteamSigil: (seat: PlayerSlot) => void;
  canSwapR1Seat: (seat: PlayerSlot) => boolean;
  canSwapR2Seat: (seat: PlayerSlot) => boolean;
  canFuseSeat: (seat: PlayerSlot) => boolean;
  onSwapR1: (seat: PlayerSlot) => void;
  onSwapR2: (seat: PlayerSlot) => void;
  onFuse: (seat: PlayerSlot) => void;
};

const SLOTS: PlayerSlot[] = ["p1", "p2", "p3"];

export function PlayPhase({
  isMobileLayout,
  locationName,
  locationRule,
  locationImageUrl,
  locationTokens,
  spark,
  friction,
  sparkAnimClassName,
  frictionAnimClassName,
  terrainDeckLength,
  terrainRemaining,
  canPeekTerrainDeck,
  onOpenTerrainDeck,
  terrain,
  terrainHiddenState,
  lastOutcomeResult,
  reservoir,
  reservoir2,
  pulsePhase,
  isHost,
  busy,
  haveAllPlayed,
  exchangePending,
  onEndActions,
  played,
  valueChoicesBySeat,
  players,
  playerNames,
  isOwnOrControlledSeat,
  canSetValueSeat,
  onCycleCardValue,
  canSteamSigilSeat,
  onSteamSigil,
  canSwapR1Seat,
  canSwapR2Seat,
  canFuseSeat,
  onSwapR1,
  onSwapR2,
  onFuse,
}: PlayPhaseProps) {
  const [actionsSeat, setActionsSeat] = useState<PlayerSlot | null>(null);

  const hasAnyAction = (seat: PlayerSlot): boolean =>
    Boolean(played?.[seat]?.card) &&
    (canSwapR1Seat(seat) || canSwapR2Seat(seat) || canFuseSeat(seat) || canSteamSigilSeat(seat));

  const actionsTitle = useMemo(() => {
    if (!actionsSeat) return null;
    const seatUid = players[actionsSeat] ?? "";
    const seatName = seatUid ? playerLabel(seatUid, playerNames) : seatLabel(actionsSeat);
    return `${seatLabel(actionsSeat)} • ${seatName}`;
  }, [actionsSeat, playerNames, players]);

  const playedCardsGrid = (
    <div className="mt-1 grid min-h-0 grid-cols-3 gap-1.5">
      {SLOTS.map((seat) => {
        const entry = played?.[seat];
        const valueChoice = valueChoicesBySeat?.[seat];
        const seatUid = players[seat] ?? "";
        const seatName = seatUid ? playerLabel(seatUid, playerNames) : seatLabel(seat);
        const revealedToAll = Boolean(entry?.revealedDuringSelection && pulsePhase === "selection");
        const showFaceUpInSelection = Boolean(
          entry?.card &&
            (pulsePhase === "selection" || pulsePhase === "pre_selection") &&
            (revealedToAll || isOwnOrControlledSeat(seat))
        );
        const fused = entry?.valueOverride === 0;
        const canOpenActions = pulsePhase === "actions" && hasAnyAction(seat);
        const isActionSeat = actionsSeat === seat;
        const canSetSeatValue = canSetValueSeat(seat);
        const primaryOptions = valueChoice?.primaryOptions ?? [];
        const extraOptions = valueChoice?.extraOptions ?? [];
        const primaryDisplayValue =
          entry?.card
            ? typeof entry.valueOverride === "number"
              ? entry.valueOverride
              : (valueChoice?.primarySelected ?? valueChoice?.primarySuggested)
            : null;
        const extraDisplayValue = entry?.extraCard ? (valueChoice?.extraSelected ?? valueChoice?.extraSuggested) : null;
        const canCyclePrimary =
          pulsePhase === "actions" &&
          canSetSeatValue &&
          typeof entry?.valueOverride !== "number" &&
          primaryOptions.length > 1;
        const canCycleExtra =
          pulsePhase === "actions" &&
          canSetSeatValue &&
          Boolean(entry?.extraCard) &&
          extraOptions.length > 1;
        const primaryAuto =
          typeof entry?.valueOverride !== "number" &&
          primaryDisplayValue !== null &&
          primaryOptions.length > 1 &&
          valueChoice?.primarySelected === undefined;
        const extraAuto =
          extraDisplayValue !== null &&
          extraOptions.length > 1 &&
          valueChoice?.extraSelected === undefined;

        return (
          <button
            key={seat}
            type="button"
            onClick={() => {
              if (!canOpenActions) return;
              setActionsSeat((prev) => (prev === seat ? null : seat));
            }}
            disabled={!canOpenActions}
            className={`relative rounded-2xl bg-white/5 p-2 text-left ring-1 transition ${
              isActionSeat ? "ring-emerald-200/40" : "ring-white/10"
            } ${canOpenActions ? "hover:bg-white/10" : ""}`}
          >
            <div className="min-w-0 truncate text-[10px] font-semibold text-white/70">
              {seatLabel(seat)} • {seatName}
            </div>
            <div className="mt-1 flex items-center justify-center">
              {entry?.card ? (
                pulsePhase === "selection" || pulsePhase === "pre_selection" ? (
                  showFaceUpInSelection ? (
                    <PulseCardMini card={entry.card} selected={false} lift="none" onClick={() => {}} />
                  ) : (
                    <CardBack />
                  )
                ) : (
                  <div className="flex flex-row items-center gap-1">
                    <div
                      className="relative pt-1"
                      onClick={(event) => {
                        if (canCyclePrimary) event.stopPropagation();
                      }}
                    >
                      <PulseCardMini
                        card={entry.card}
                        selected={false}
                        lift="none"
                        onClick={() => {
                          if (canCyclePrimary) onCycleCardValue(seat, "primary");
                        }}
                      />
                      {fused && (
                        <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-fuchsia-500/30 px-2 py-0.5 text-[11px] font-extrabold text-fuchsia-100 ring-1 ring-fuchsia-200/20">
                          0
                        </div>
                      )}
                      {entry.resonanceSuitOverride && (
                        <div className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-sky-500/30 px-2 py-0.5 text-[10px] font-extrabold text-sky-100 ring-1 ring-sky-200/20">
                          Steam
                        </div>
                      )}
                      {primaryDisplayValue !== null && (
                        <div
                          className={`absolute left-1/2 top-0 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-extrabold shadow ring-1 ${
                            canCyclePrimary
                              ? "cursor-pointer bg-emerald-400 text-slate-950 ring-emerald-200/60"
                              : "bg-slate-900/85 text-white/90 ring-white/20"
                          }`}
                          onClick={(event) => {
                            if (!canCyclePrimary) return;
                            event.stopPropagation();
                            onCycleCardValue(seat, "primary");
                          }}
                          title={
                            canCyclePrimary
                              ? "Click card or badge to cycle value"
                              : "Selected value used in resolution"
                          }
                        >
                          {primaryDisplayValue}
                          {primaryAuto ? " • auto" : ""}
                        </div>
                      )}
                    </div>
                    {entry.extraCard && (
                      <div
                        className="relative flex flex-col items-center gap-1"
                        onClick={(event) => {
                          if (canCycleExtra) event.stopPropagation();
                        }}
                      >
                        <div className="text-[10px] font-semibold text-emerald-200/80">Overflow</div>
                        <PulseCardMini
                          card={entry.extraCard}
                          selected={false}
                          lift="none"
                          className="scale-[0.9]"
                          onClick={() => {
                            if (canCycleExtra) onCycleCardValue(seat, "extra");
                          }}
                        />
                        {extraDisplayValue !== null && (
                          <div
                            className={`absolute left-1/2 top-4 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-extrabold shadow ring-1 ${
                              canCycleExtra
                                ? "cursor-pointer bg-emerald-400 text-slate-950 ring-emerald-200/60"
                                : "bg-slate-900/85 text-white/90 ring-white/20"
                            }`}
                            onClick={(event) => {
                              if (!canCycleExtra) return;
                              event.stopPropagation();
                              onCycleCardValue(seat, "extra");
                            }}
                            title={canCycleExtra ? "Click card or badge to cycle value" : "Selected value used in resolution"}
                          >
                            {extraDisplayValue}
                            {extraAuto ? " • auto" : ""}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="text-xs text-white/50">Not played yet.</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );

  const deckPanel = (
    <div className={`${isMobileLayout ? "rounded-2xl bg-black/35 p-2 ring-1 ring-white/15" : "w-[220px] shrink-0 rounded-2xl bg-white/5 p-2 ring-1 ring-white/10"}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-white/80">{isMobileLayout ? "Law Deck" : "Terrain"}</div>
        <div className="text-[11px] font-semibold text-white/60">{terrainRemaining} left</div>
      </div>
      {isMobileLayout && locationName ? (
        <div className="mt-1 truncate text-[10px] font-semibold text-white/70">{locationName}</div>
      ) : null}
      <div className="mt-2 flex items-center justify-center gap-2">
        <DeckStub
          label="Deck"
          count={terrainRemaining}
          onClick={!terrainHiddenState && terrainDeckLength > 0 && canPeekTerrainDeck ? onOpenTerrainDeck : undefined}
        />
        <AnimatedTerrainCard terrain={terrain} hiddenState={terrainHiddenState} lastOutcomeResult={lastOutcomeResult} />
      </div>
    </div>
  );

  const reservoirPanel = (
    <div className={`${isMobileLayout ? "rounded-2xl bg-black/35 p-2 ring-1 ring-white/15" : "w-[120px] shrink-0 rounded-2xl bg-white/5 p-2 ring-1 ring-white/10"}`}>
      <div className="text-center text-xs font-semibold text-white/80">Akashic Reservoir</div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {reservoir ? (
          <div className="flex flex-col items-center gap-2">
            <PulseCardPreview card={reservoir} />
          </div>
        ) : null}
        {reservoir2 ? (
          <div className="flex flex-col items-center gap-2">
            <PulseCardPreview card={reservoir2} />
          </div>
        ) : null}
        {!reservoir && !reservoir2 ? <div className="text-sm text-white/60">No reservoir.</div> : null}
      </div>
    </div>
  );

  const playedCardsPanel = (
    <div className={`${isMobileLayout ? "min-h-0 overflow-auto rounded-2xl bg-black/35 p-2 ring-1 ring-white/15" : "w-[330px] shrink-0 rounded-2xl bg-white/5 p-2 ring-1 ring-white/10"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-white/80">Played cards</div>
        {pulsePhase === "actions" && isHost && (
          <button
            type="button"
            onClick={onEndActions}
            disabled={busy || !haveAllPlayed || exchangePending}
            className="rounded-2xl bg-emerald-500 px-3 py-1 text-[11px] font-extrabold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            End actions
          </button>
        )}
      </div>
      {playedCardsGrid}
    </div>
  );

  return (
    <div
      className={`relative h-full min-h-0 ${isMobileLayout ? "overflow-hidden rounded-2xl" : "overflow-x-auto overflow-y-hidden pr-1"}`}
    >
      {isMobileLayout && locationImageUrl ? (
        <>
          <img src={locationImageUrl} alt={locationName ?? "Location"} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          <div className="pointer-events-none absolute inset-0 bg-slate-950/65" />
        </>
      ) : null}

      {isMobileLayout ? (
        <div className="relative z-10 grid h-full grid-rows-[auto_minmax(0,1fr)] gap-2 p-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(110px,34%)] gap-2">
            {deckPanel}
            {reservoirPanel}
          </div>
          {playedCardsPanel}
        </div>
      ) : (
        <div className="relative flex h-full min-w-max items-start gap-2">
          {locationName && locationRule ? (
            <LocationShowcase
              locationName={locationName}
              locationRule={locationRule}
              locationImageUrl={locationImageUrl}
              locationTokens={locationTokens}
              spark={spark}
              friction={friction}
              sparkAnimClassName={sparkAnimClassName}
              frictionAnimClassName={frictionAnimClassName}
            />
          ) : (
            <div className="w-[260px] shrink-0 rounded-2xl bg-slate-950/85 p-3 text-sm text-white/70 ring-1 ring-white/10">
              No location chosen yet.
            </div>
          )}
          {deckPanel}
          {reservoirPanel}
          {playedCardsPanel}
        </div>
      )}

      {actionsSeat && pulsePhase === "actions" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45 p-4" onMouseDown={() => setActionsSeat(null)}>
          <div
            className="w-full max-w-xs rounded-3xl bg-slate-950 p-4 text-white shadow-2xl ring-1 ring-white/15"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold text-white/60">Pulse actions</div>
                <div className="text-sm font-extrabold text-white">{actionsTitle}</div>
              </div>
              <button
                type="button"
                onClick={() => setActionsSeat(null)}
                className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/15"
              >
                Close
              </button>
            </div>

            <div className="mt-3 grid gap-2">
              {canSwapR1Seat(actionsSeat) && (
                <button
                  type="button"
                  onClick={() => {
                    onSwapR1(actionsSeat);
                    setActionsSeat(null);
                  }}
                  disabled={busy}
                  className="rounded-2xl bg-white px-3 py-2 text-[12px] font-extrabold text-slate-900 shadow disabled:opacity-40"
                >
                  Swap with Reservoir 1
                </button>
              )}
              {canSwapR2Seat(actionsSeat) && (
                <button
                  type="button"
                  onClick={() => {
                    onSwapR2(actionsSeat);
                    setActionsSeat(null);
                  }}
                  disabled={busy}
                  className="rounded-2xl bg-white px-3 py-2 text-[12px] font-extrabold text-slate-900 shadow disabled:opacity-40"
                >
                  Swap with Reservoir 2
                </button>
              )}
              {canFuseSeat(actionsSeat) && (
                <button
                  type="button"
                  onClick={() => {
                    onFuse(actionsSeat);
                    setActionsSeat(null);
                  }}
                  disabled={busy}
                  className="rounded-2xl bg-fuchsia-400 px-3 py-2 text-[12px] font-extrabold text-slate-950 shadow disabled:opacity-40"
                >
                  Dissolve to 0
                </button>
              )}
              {canSteamSigilSeat(actionsSeat) && (
                <button
                  type="button"
                  onClick={() => {
                    onSteamSigil(actionsSeat);
                    setActionsSeat(null);
                  }}
                  disabled={busy}
                  className="rounded-2xl bg-sky-300 px-3 py-2 text-[12px] font-extrabold text-slate-950 shadow disabled:opacity-40"
                >
                  Force Steam Resonance
                </button>
              )}
              {!hasAnyAction(actionsSeat) && <div className="text-[11px] text-white/60">No action available.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
