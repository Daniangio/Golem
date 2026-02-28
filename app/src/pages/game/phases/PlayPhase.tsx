import React, { useMemo, useState } from "react";
import { AnimatedTerrainCard } from "../../../components/game/AnimatedTerrainCard";
import { CardBack } from "../../../components/game/CardBack";
import { LocationShowcase } from "../../../components/game/LocationShowcase";
import { DeckStub, PulseCardMini, PulseCardPreview, TerrainCompactCard } from "../../../components/game/PulseCards";
import { seatLabel, playerLabel } from "../gameUtils";
import type { GameDoc, PlayerSlot, Players, PulseCard, TerrainCard } from "../../../types";

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
  terrainSet?: TerrainCard[];
  terrainHiddenState: "pre_selection" | "hidden_until_played" | "suit_only" | null;
  lastOutcomeResult?: "success" | "undershoot" | "overshoot";
  reservoir: GameDoc["reservoir"];
  reservoir2: GameDoc["reservoir2"];
  pulsePhase: GameDoc["pulsePhase"];
  isHost: boolean;
  busy: boolean;
  haveAllPlayed: boolean;
  exchangePending: boolean;
  canConfirmSelection: boolean;
  onConfirmSelection: () => void;
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
  valueMultiplierBySeat?: Partial<Record<PlayerSlot, number>>;
  players: Players;
  playerNames?: Record<string, string>;
  isOwnOrControlledSeat: (seat: PlayerSlot) => boolean;
  canSetValueSeat: (seat: PlayerSlot) => boolean;
  onCycleCardValue: (seat: PlayerSlot, target: "primary" | "extra") => void;
  canSteamSigilSeat: (seat: PlayerSlot) => boolean;
  canBalancingScaleMinus1Seat: (seat: PlayerSlot) => boolean;
  canBalancingScaleMinus2Seat: (seat: PlayerSlot) => boolean;
  canTemperedCrucibleSeat: (seat: PlayerSlot) => boolean;
  onSteamSigil: (seat: PlayerSlot) => void;
  onBalancingScale: (seat: PlayerSlot, amount: 1 | 2) => void;
  onTemperedCrucible: (seat: PlayerSlot) => void;
  canSwapR1Seat: (seat: PlayerSlot) => boolean;
  canSwapR2Seat: (seat: PlayerSlot) => boolean;
  canFuseSeat: (seat: PlayerSlot) => boolean;
  canAmplifySeat: (seat: PlayerSlot) => boolean;
  canResonanceGiftSeat: (seat: PlayerSlot) => boolean;
  resonanceGiftTargetBySeat?: Partial<Record<PlayerSlot, PlayerSlot | null>>;
  onSwapR1: (seat: PlayerSlot) => void;
  onSwapR2: (seat: PlayerSlot) => void;
  onFuse: (seat: PlayerSlot) => void;
  onAmplify: (seat: PlayerSlot) => void;
  onSetResonanceGiftSeat: (seat: PlayerSlot, target: PlayerSlot | null) => void;
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
  terrainSet,
  terrainHiddenState,
  lastOutcomeResult,
  reservoir,
  reservoir2,
  pulsePhase,
  isHost,
  busy,
  haveAllPlayed,
  exchangePending,
  canConfirmSelection,
  onConfirmSelection,
  onEndActions,
  played,
  valueChoicesBySeat,
  valueMultiplierBySeat,
  players,
  playerNames,
  isOwnOrControlledSeat,
  canSetValueSeat,
  onCycleCardValue,
  canSteamSigilSeat,
  canBalancingScaleMinus1Seat,
  canBalancingScaleMinus2Seat,
  canTemperedCrucibleSeat,
  onSteamSigil,
  onBalancingScale,
  onTemperedCrucible,
  canSwapR1Seat,
  canSwapR2Seat,
  canFuseSeat,
  canAmplifySeat,
  canResonanceGiftSeat,
  resonanceGiftTargetBySeat,
  onSwapR1,
  onSwapR2,
  onFuse,
  onAmplify,
  onSetResonanceGiftSeat,
}: PlayPhaseProps) {
  const [actionsSeat, setActionsSeat] = useState<PlayerSlot | null>(null);

  const hasAnyAction = (seat: PlayerSlot): boolean =>
    Boolean(played?.[seat]?.card) &&
    (
      canSwapR1Seat(seat) ||
      canSwapR2Seat(seat) ||
      canFuseSeat(seat) ||
      canSteamSigilSeat(seat) ||
      canBalancingScaleMinus1Seat(seat) ||
      canBalancingScaleMinus2Seat(seat) ||
      canTemperedCrucibleSeat(seat) ||
      canAmplifySeat(seat) ||
      canResonanceGiftSeat(seat)
    );

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
        const seatValueMultiplier = Math.max(1, Number(valueMultiplierBySeat?.[seat] ?? 1));
        const seatUid = players[seat] ?? "";
        const seatName = seatUid ? playerLabel(seatUid, playerNames) : seatLabel(seat);
        const manifestedCardsList: PulseCard[] = entry?.card
          ? [
              entry.card,
              ...(Array.isArray(entry.additionalCards)
                ? entry.additionalCards
                : entry.extraCard
                  ? [entry.extraCard]
                  : []),
            ]
          : [];
        const stackShift = 10;
        const stackWidth = 80 + Math.max(0, manifestedCardsList.length - 1) * stackShift;
        const stackHeight = 120 + Math.max(0, manifestedCardsList.length - 1) * stackShift;
        const firstAdditionalId = Array.isArray(entry?.additionalCards)
          ? entry.additionalCards[0]?.id
          : entry?.extraCard?.id;
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
        const amplified = Number(entry?.totalMultiplier ?? 1) > 1;
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
                    <div className="relative" style={{ width: `${stackWidth}px`, height: `${stackHeight}px` }}>
                      {manifestedCardsList.map((manifestedCard, cardIndex) => (
                        <div
                          key={`${manifestedCard.id}-${cardIndex}`}
                          className="absolute left-0 top-0"
                          style={{
                            transform: `translate(${cardIndex * stackShift}px, ${cardIndex * stackShift}px)`,
                            zIndex: cardIndex + 1,
                          }}
                        >
                          <PulseCardMini card={manifestedCard} selected={false} lift="none" onClick={() => {}} />
                          {seatValueMultiplier > 1 && (
                            <div className="pointer-events-none absolute right-1 top-1 rounded-full bg-indigo-500/35 px-1.5 py-0.5 text-[10px] font-extrabold text-indigo-100 ring-1 ring-indigo-200/30">
                              ×{seatValueMultiplier}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <CardBack />
                  )
                ) : (
                  <div className="relative" style={{ width: `${stackWidth}px`, height: `${stackHeight}px` }}>
                    {manifestedCardsList.map((manifestedCard, cardIndex) => {
                      const isPrimary = cardIndex === 0;
                      const isFirstExtra = cardIndex === 1 && Boolean(firstAdditionalId) && manifestedCard.id === firstAdditionalId;
                      const canCycleThis = (isPrimary && canCyclePrimary) || (isFirstExtra && canCycleExtra);
                      const displayValue = isPrimary ? primaryDisplayValue : isFirstExtra ? extraDisplayValue : null;
                      const displayAuto = isPrimary ? primaryAuto : isFirstExtra ? extraAuto : false;

                      return (
                        <div
                          key={`${manifestedCard.id}-${cardIndex}`}
                          className="absolute left-0 top-0"
                          style={{
                            transform: `translate(${cardIndex * stackShift}px, ${cardIndex * stackShift}px)`,
                            zIndex: cardIndex + 1,
                          }}
                          onClick={(event) => {
                            if (canCycleThis) event.stopPropagation();
                          }}
                        >
                          <PulseCardMini
                            card={manifestedCard}
                            selected={false}
                            lift="none"
                            onClick={() => {
                              if (isPrimary && canCyclePrimary) onCycleCardValue(seat, "primary");
                              if (isFirstExtra && canCycleExtra) onCycleCardValue(seat, "extra");
                            }}
                          />
                          {seatValueMultiplier > 1 && (
                            <div className="pointer-events-none absolute right-1 top-1 rounded-full bg-indigo-500/35 px-1.5 py-0.5 text-[10px] font-extrabold text-indigo-100 ring-1 ring-indigo-200/30">
                              ×{seatValueMultiplier}
                            </div>
                          )}
                          {isPrimary && fused && (
                            <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-fuchsia-500/30 px-2 py-0.5 text-[11px] font-extrabold text-fuchsia-100 ring-1 ring-fuchsia-200/20">
                              0
                            </div>
                          )}
                          {isPrimary && entry.resonanceSuitOverride && (
                            <div className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-sky-500/30 px-2 py-0.5 text-[10px] font-extrabold text-sky-100 ring-1 ring-sky-200/20">
                              Steam
                            </div>
                          )}
                          {isPrimary && amplified && (
                            <div className="pointer-events-none absolute top-8 left-2 rounded-full bg-amber-400/35 px-2 py-0.5 text-[10px] font-extrabold text-amber-50 ring-1 ring-amber-200/30">
                              ×2 Total
                            </div>
                          )}
                          {isPrimary &&
                            typeof entry.postRevealValueDelta === "number" &&
                            entry.postRevealValueDelta !== 0 && (
                              <div className="pointer-events-none absolute top-8 right-2 rounded-full bg-purple-500/35 px-2 py-0.5 text-[10px] font-extrabold text-purple-100 ring-1 ring-purple-200/30">
                                {entry.postRevealValueDelta > 0
                                  ? `+${entry.postRevealValueDelta}`
                                  : `${entry.postRevealValueDelta}`}
                              </div>
                            )}
                          {displayValue !== null && (
                            <div
                              className={`absolute left-1/2 top-0 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-extrabold shadow ring-1 ${
                                canCycleThis
                                  ? "cursor-pointer bg-emerald-400 text-slate-950 ring-emerald-200/60"
                                  : "bg-slate-900/85 text-white/90 ring-white/20"
                              }`}
                              onClick={(event) => {
                                if (!canCycleThis) return;
                                event.stopPropagation();
                                if (isPrimary) onCycleCardValue(seat, "primary");
                                if (isFirstExtra) onCycleCardValue(seat, "extra");
                              }}
                              title={
                                canCycleThis
                                  ? "Click card or badge to cycle value"
                                  : "Selected value used in resolution"
                              }
                            >
                              {displayValue}
                              {displayAuto ? " • auto" : ""}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
      <div className="mt-2 flex items-start justify-center gap-2">
        <DeckStub
          label="Deck"
          count={terrainRemaining}
          onClick={!terrainHiddenState && terrainDeckLength > 0 && canPeekTerrainDeck ? onOpenTerrainDeck : undefined}
        />
        {terrainSet && terrainSet.length > 1 && !terrainHiddenState ? (
          <div className="flex flex-col gap-1.5">
            {terrainSet.map((t) => (
              <TerrainCompactCard key={t.id} suit={t.suit} min={t.min} max={t.max} />
            ))}
          </div>
        ) : (
          <AnimatedTerrainCard terrain={terrain} hiddenState={terrainHiddenState} lastOutcomeResult={lastOutcomeResult} />
        )}
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
        {pulsePhase === "selection" && canConfirmSelection && (
          <button
            type="button"
            onClick={onConfirmSelection}
            disabled={busy || !haveAllPlayed || exchangePending}
            className="rounded-2xl bg-sky-400 px-3 py-1 text-[11px] font-extrabold text-slate-950 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reveal
          </button>
        )}
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
              {canAmplifySeat(actionsSeat) && (
                <button
                  type="button"
                  onClick={() => {
                    onAmplify(actionsSeat);
                    setActionsSeat(null);
                  }}
                  disabled={busy}
                  className="rounded-2xl bg-amber-300 px-3 py-2 text-[12px] font-extrabold text-slate-950 shadow disabled:opacity-40"
                >
                  Amplify Total ×2 (+1 Friction)
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
              {canBalancingScaleMinus1Seat(actionsSeat) && (
                <button
                  type="button"
                  onClick={() => {
                    onBalancingScale(actionsSeat, 1);
                    setActionsSeat(null);
                  }}
                  disabled={busy}
                  className="rounded-2xl bg-amber-300 px-3 py-2 text-[12px] font-extrabold text-slate-950 shadow disabled:opacity-40"
                >
                  Balance -1
                </button>
              )}
              {canBalancingScaleMinus2Seat(actionsSeat) && (
                <button
                  type="button"
                  onClick={() => {
                    onBalancingScale(actionsSeat, 2);
                    setActionsSeat(null);
                  }}
                  disabled={busy}
                  className="rounded-2xl bg-orange-300 px-3 py-2 text-[12px] font-extrabold text-slate-950 shadow disabled:opacity-40"
                >
                  Balance -2
                </button>
              )}
              {canTemperedCrucibleSeat(actionsSeat) && (
                <button
                  type="button"
                  onClick={() => {
                    onTemperedCrucible(actionsSeat);
                    setActionsSeat(null);
                  }}
                  disabled={busy}
                  className="rounded-2xl bg-rose-300 px-3 py-2 text-[12px] font-extrabold text-slate-950 shadow disabled:opacity-40"
                >
                  Temper Pulse (ignore Friction)
                </button>
              )}
              {canResonanceGiftSeat(actionsSeat) &&
                (() => {
                  const currentTarget = resonanceGiftTargetBySeat?.[actionsSeat] ?? null;
                  const targets = SLOTS.filter((seat) => seat !== actionsSeat && Boolean(players[seat]));
                  return (
                    <div className="rounded-2xl bg-white/5 p-2 ring-1 ring-white/10">
                      <div className="mb-2 text-[11px] font-semibold text-white/75">Constricted Breath target</div>
                      <div className="grid gap-1.5">
                        {targets.map((targetSeat) => {
                          const targetUid = players[targetSeat] ?? "";
                          const targetName = targetUid ? playerLabel(targetUid, playerNames) : seatLabel(targetSeat);
                          const active = currentTarget === targetSeat;
                          return (
                            <button
                              key={targetSeat}
                              type="button"
                              onClick={() => onSetResonanceGiftSeat(actionsSeat, targetSeat)}
                              disabled={busy}
                              className={`rounded-2xl px-3 py-1.5 text-left text-[11px] font-extrabold shadow-sm disabled:opacity-40 ${
                                active
                                  ? "bg-emerald-400 text-slate-950"
                                  : "bg-white/15 text-white hover:bg-white/25"
                              }`}
                            >
                              Gift refill → {targetName}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => onSetResonanceGiftSeat(actionsSeat, null)}
                          disabled={busy}
                          className={`rounded-2xl px-3 py-1.5 text-left text-[11px] font-extrabold shadow-sm disabled:opacity-40 ${
                            currentTarget === null
                              ? "bg-emerald-400 text-slate-950"
                              : "bg-white/15 text-white hover:bg-white/25"
                          }`}
                        >
                          Auto target
                        </button>
                      </div>
                    </div>
                  );
                })()}
              {!hasAnyAction(actionsSeat) && <div className="text-[11px] text-white/60">No action available.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
