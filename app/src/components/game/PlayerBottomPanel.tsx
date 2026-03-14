import React from "react";
import { PulseCardMini } from "./PulseCards";
import { CardBack } from "./CardBack";
import type { PlayerSlot, PulseCard } from "../../types";

export function PlayerBottomPanel({
  mobileLayout = false,
  seatTag,
  playerName,
  handCount,
  viewOnly,
  message,
  canSeeHand,
  hand,
  selectedCardIds,
  selectedCardId,
  onToggleSelectCard,
  canPlaySelected,
  playButtonLabel = "Play",
  onPlaySelected,
  canOverflowSelected,
  onOverflowSelected,
  canSwapSkipSelected,
  onSwapSkipSelected,
  busy,
  icons,
  desktopIdlePanel,
  hiddenNote,
  selectedCardActionButtons,
  highlightSelectedCards = false,
}: {
  mobileLayout?: boolean;
  seatTag: string;
  playerName: string;
  handCount: number;
  viewOnly: boolean;
  message?: React.ReactNode;
  canSeeHand: boolean;
  hand: PulseCard[];
  selectedCardIds?: string[];
  selectedCardId: string | null;
  onToggleSelectCard: (cardId: string) => void;
  canPlaySelected: boolean;
  playButtonLabel?: string;
  onPlaySelected: () => void;
  canOverflowSelected: boolean;
  onOverflowSelected: () => void;
  canSwapSkipSelected: boolean;
  onSwapSkipSelected: () => void;
  busy: boolean;
  icons?: React.ReactNode;
  desktopIdlePanel?: React.ReactNode;
  hiddenNote?: React.ReactNode;
  highlightSelectedCards?: boolean;
  selectedCardActionButtons?: Array<{
    key: string;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    anchorCardId?: string;
  }>;
}) {
  const mobileCardClass = "h-[102px] w-[68px] rounded-xl";
  const topCardActionWidthClass = mobileLayout ? "w-[68px]" : "w-[80px]";
  const topCardActionBtnClass = `${topCardActionWidthClass} rounded-xl bg-white px-1.5 py-0.5 text-[9px] font-extrabold text-slate-900 shadow disabled:opacity-40`;

  const cardsRow = (
    <div className="relative min-h-0 overflow-x-visible overflow-y-visible">
      <div className={`flex h-full items-end ${mobileLayout ? "gap-0.5" : "gap-2"}`}>
        {canSeeHand ? (
          hand.map((c) => {
            const selected = selectedCardIds ? selectedCardIds.includes(c.id) : selectedCardId === c.id;
            return (
              <div
                key={c.id}
                className={`relative shrink-0 pt-6 transition-transform ${
                  mobileLayout ? "-ml-4 first:ml-0" : ""
                } ${selected && highlightSelectedCards ? "-translate-y-2" : ""}`}
              >
                <PulseCardMini
                  card={c}
                  selected={selected}
                  lift="lg"
                  className={mobileLayout ? mobileCardClass : ""}
                  onClick={() => onToggleSelectCard(c.id)}
                />
                {selected && (
                  <div className="absolute left-1/2 top-6 z-20 flex -translate-x-1/2 -translate-y-full flex-col-reverse items-center gap-1">
                    {canPlaySelected && (
                      <button
                        type="button"
                        onClick={onPlaySelected}
                        disabled={busy}
                        className={topCardActionBtnClass}
                      >
                        {playButtonLabel}
                      </button>
                    )}
                    {canOverflowSelected && (
                      <button
                        type="button"
                        onClick={onOverflowSelected}
                        disabled={busy}
                        className={topCardActionBtnClass}
                      >
                        Overflow
                      </button>
                    )}
                    {canSwapSkipSelected && (
                      <button
                        type="button"
                        onClick={onSwapSkipSelected}
                        disabled={busy}
                        className={topCardActionBtnClass}
                      >
                        Transmute
                      </button>
                    )}
                    {(selectedCardActionButtons ?? []).map((action) =>
                      action.anchorCardId && action.anchorCardId !== c.id ? null : (
                        <button
                          key={action.key}
                          type="button"
                          onClick={action.onClick}
                          disabled={busy || action.disabled}
                          className={`${topCardActionBtnClass} ${action.className ?? ""}`}
                        >
                          {action.label}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          Array.from({ length: Math.max(0, hand.length) }).map((_, i) => (
            <CardBack
              key={i}
              className={`${mobileLayout ? mobileCardClass : "h-[120px] w-[80px] rounded-2xl"} shrink-0 ${
                mobileLayout ? "-ml-4 first:ml-0" : ""
              }`}
            />
          ))
        )}
      </div>
    </div>
  );

  if (mobileLayout) {
    return (
      <div className="relative z-30 flex min-h-0 flex-col overflow-visible rounded-3xl border border-white/10 bg-slate-950/58 p-2 shadow-[0_18px_48px_rgba(1,6,18,0.35)] ring-1 ring-white/6 backdrop-blur-xl">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-[11px] font-extrabold text-white">
            {seatTag} • {playerName} {viewOnly ? <span className="font-semibold text-white/50">(view-only)</span> : null}
          </div>
          <div className="shrink-0 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80 ring-1 ring-white/10">
            🂠 {handCount}
          </div>
          {hiddenNote ? <div className="text-[10px] font-semibold text-white/45">{hiddenNote}</div> : null}
        </div>

        {message ? (
          <div className="mb-1 max-h-14 overflow-auto rounded-2xl border border-white/10 bg-white/8 px-2 py-1 text-[11px] ring-1 ring-white/6 backdrop-blur-md">{message}</div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <div className="min-h-0 overflow-x-auto overflow-y-visible pb-1">{cardsRow}</div>
          <div className="flex shrink-0 flex-col items-end gap-2">{icons}</div>
        </div>
      </div>
    );
  }

  const desktopMessageContent = message ?? desktopIdlePanel ?? <div className="text-[11px] text-white/40"> </div>;

  return (
    <div className="relative z-30 flex min-h-0 flex-col overflow-visible rounded-3xl border border-white/10 bg-slate-950/58 p-2 shadow-[0_24px_56px_rgba(1,6,18,0.38)] ring-1 ring-white/6 backdrop-blur-xl">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(140px,18%)_minmax(140px,28%)_minmax(0,1fr)_auto] items-stretch gap-2">
        <div className="min-h-0 rounded-2xl border border-white/10 bg-white/8 px-3 py-2 ring-1 ring-white/6 backdrop-blur-md">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">Hand</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-[12px] font-extrabold text-white">
              {seatTag} • {playerName} {viewOnly ? <span className="font-semibold text-white/50">(view-only)</span> : null}
            </div>
            <div className="shrink-0 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80 ring-1 ring-white/10">
              🂠 {handCount}
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-auto rounded-2xl border border-white/10 bg-white/8 px-3 py-2 ring-1 ring-white/6 backdrop-blur-md">
          {desktopMessageContent}
        </div>

        {cardsRow}

        <div className="flex shrink-0 flex-col items-end justify-between gap-2">
          <div className="flex flex-col items-end gap-2">{icons}</div>
        </div>
      </div>

      {hiddenNote ? <div className="mt-1 text-[11px] font-semibold text-white/45">{hiddenNote}</div> : null}
    </div>
  );
}

type CommunionExchange = {
  from: PlayerSlot;
  to?: PlayerSlot;
  offered?: PulseCard;
  status: "awaiting_offer" | "awaiting_return";
};

export function CommunionExchangePanel({
  exchange,
  pending,
  canOffer,
  canReturn,
  recipients,
  fromHand,
  toHand,
  selectedCardId,
  busy,
  onOfferTo,
  onReturn,
}: {
  exchange: CommunionExchange | null;
  pending: boolean;
  canOffer: boolean;
  canReturn: boolean;
  recipients: Array<{ seat: PlayerSlot; name: string; enabled: boolean }>;
  fromHand: PulseCard[];
  toHand: PulseCard[];
  selectedCardId: string | null;
  busy: boolean;
  onOfferTo: (to: PlayerSlot, cardId: string) => void;
  onReturn: (cardId: string) => void;
}) {
  if (!pending || !exchange) return <div className="text-[11px] text-white/40"> </div>;

  return (
    <div className="min-h-0">
      {exchange.status === "awaiting_offer" ? (
        canOffer ? (
          <div className="mt-1 space-y-1">
            <div className="flex flex-col gap-1">
              {recipients.map((r) => {
                const canUseCard = Boolean(selectedCardId && fromHand.some((c) => c.id === selectedCardId));
                return (
                  <button
                    key={r.seat}
                      type="button"
                      onClick={() => {
                        if (!selectedCardId) return;
                        onOfferTo(r.seat, selectedCardId);
                      }}
                      disabled={busy || !selectedCardId || !canUseCard || !r.enabled}
                      className="rounded-l bg-emerald-500 text-center text-[11px] font-extrabold text-white shadow-sm disabled:opacity-40"
                    >
                      Offer to {r.name}
                    </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-3 text-[11px] text-white/60">Wait while the exchange is decided…</div>
        )
      ) : exchange.status === "awaiting_return" ? (
        canReturn && exchange.to ? (
          <div className="mt-2 space-y-2">
            <div className="text-[11px] font-semibold text-white/70">Select a card to return</div>
            {exchange.offered && (
              <div className="rounded-2xl bg-white/5 p-2 ring-1 ring-white/10">
                <div className="text-[10px] font-semibold text-white/55">Offered to you</div>
                <div className="mt-2 flex justify-center">
                  <PulseCardMini card={exchange.offered} selected={false} lift="none" onClick={() => {}} />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                if (!selectedCardId) return;
                onReturn(selectedCardId);
              }}
              disabled={busy || !selectedCardId || !Boolean(toHand.some((c) => c.id === selectedCardId))}
              className="rounded-2xl bg-emerald-500 px-3 py-2 text-left text-[11px] font-extrabold text-white shadow-sm disabled:opacity-40"
            >
              Return card
            </button>
          </div>
        ) : (
          <div className="mt-3 text-[11px] text-white/60">Wait while the recipient returns a card…</div>
        )
      ) : null}
    </div>
  );
}
