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
  selectedCardId,
  onToggleSelectCard,
  canPlaySelected,
  onPlaySelected,
  canOverflowSelected,
  onOverflowSelected,
  busy,
  icons,
  hiddenNote,
}: {
  mobileLayout?: boolean;
  seatTag: string;
  playerName: string;
  handCount: number;
  viewOnly: boolean;
  message?: React.ReactNode;
  canSeeHand: boolean;
  hand: PulseCard[];
  selectedCardId: string | null;
  onToggleSelectCard: (cardId: string) => void;
  canPlaySelected: boolean;
  onPlaySelected: () => void;
  canOverflowSelected: boolean;
  onOverflowSelected: () => void;
  busy: boolean;
  icons?: React.ReactNode;
  hiddenNote?: React.ReactNode;
}) {
  const mobileCardClass = "h-[102px] w-[68px] rounded-xl";

  const cardsRow = (
    <div className="relative min-h-0 overflow-x-visible overflow-y-visible">
      <div className={`flex h-full items-end ${mobileLayout ? "gap-0.5" : "gap-2"}`}>
        {canSeeHand ? (
          hand.map((c) => {
            const selected = selectedCardId === c.id;
            return (
              <div key={c.id} className={`relative shrink-0 pt-6 ${mobileLayout ? "-ml-4 first:ml-0" : ""}`}>
                <PulseCardMini
                  card={c}
                  selected={selected}
                  lift="lg"
                  className={mobileLayout ? mobileCardClass : ""}
                  onClick={() => onToggleSelectCard(c.id)}
                />
                {selected && canPlaySelected && (
                  <button
                    type="button"
                    onClick={onPlaySelected}
                    disabled={busy}
                    className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[11px] font-extrabold text-slate-900 shadow disabled:opacity-40"
                  >
                    Play
                  </button>
                )}
                {selected && canOverflowSelected && (
                  <button
                    type="button"
                    onClick={onOverflowSelected}
                    disabled={busy}
                    className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-emerald-400 px-3 py-1 text-[11px] font-extrabold text-slate-950 shadow disabled:opacity-40"
                  >
                    Overflow
                  </button>
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
      <div className="relative z-30 flex min-h-0 flex-col overflow-visible rounded-3xl bg-white/8 p-2 ring-1 ring-white/15">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="min-w-0 truncate text-[11px] font-extrabold text-white">
            {seatTag} • {playerName} {viewOnly ? <span className="font-semibold text-white/50">(view-only)</span> : null}
          </div>
          <div className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80 ring-1 ring-white/15">
            🂠 {handCount}
          </div>
          {hiddenNote ? <div className="text-[10px] font-semibold text-white/45">{hiddenNote}</div> : null}
        </div>

        {message ? (
          <div className="mb-1 max-h-14 overflow-auto rounded-2xl bg-white/10 px-2 py-1 text-[11px] ring-1 ring-white/10">{message}</div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <div className="min-h-0 overflow-x-auto overflow-y-visible pb-1">{cardsRow}</div>
          <div className="flex shrink-0 flex-col items-end gap-2">{icons}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-30 flex min-h-0 flex-col overflow-visible rounded-3xl bg-white/5 p-2 ring-1 ring-white/10">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(140px,18%)_minmax(140px,28%)_minmax(0,1fr)_auto] items-stretch gap-2">
        <div className="min-h-0 rounded-2xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
          <div className="text-[11px] font-semibold text-white/60">Hand</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-[12px] font-extrabold text-white">
              {seatTag} • {playerName} {viewOnly ? <span className="font-semibold text-white/50">(view-only)</span> : null}
            </div>
            <div className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/80 ring-1 ring-white/15">
              🂠 {handCount}
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-auto rounded-2xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
          {message ?? <div className="text-[11px] text-white/40"> </div>}
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
