import React from "react";
import { PulseCardMini, TerrainCardView } from "./PulseCards";
import type { GameDoc, PulseCard, TerrainCard } from "../../types";

type OutcomeLogEntry = NonNullable<GameDoc["outcomeLog"]>[number];

export function DiscardModal({
  open,
  onClose,
  discardAll,
  lastDiscarded,
  selectable = false,
  selectionLabel = "Select from discard",
  selectedCardId = null,
  confirmSelectedLabel,
  onConfirmSelected,
  confirmSelectedDisabled = false,
  onSelectCard,
}: {
  open: boolean;
  onClose: () => void;
  discardAll: PulseCard[];
  lastDiscarded: PulseCard[];
  selectable?: boolean;
  selectionLabel?: string;
  selectedCardId?: string | null;
  confirmSelectedLabel?: string;
  onConfirmSelected?: () => void;
  confirmSelectedDisabled?: boolean;
  onSelectCard?: (cardId: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-4xl rounded-3xl bg-slate-950 p-5 text-white shadow-2xl ring-1 ring-white/10"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold">Discard pile</div>
            <div className="mt-1 text-xs text-white/60">{discardAll.length} cards</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/15"
          >
            Close
          </button>
        </div>

        {lastDiscarded.length ? (
          <div className="mt-4">
            <div className="text-xs font-semibold text-white/60">Last discarded</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {lastDiscarded.map((card) => (
                <PulseCardMini key={`last:${card.id}`} card={card} selected={false} lift="none" onClick={() => {}} />
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-white/60">All discarded</div>
            {selectable && onSelectCard ? (
              <div className="text-[11px] font-semibold text-violet-200/85">{selectionLabel}</div>
            ) : null}
          </div>
          <div className="mt-2 max-h-[60vh] overflow-visible rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
            <div className="flex flex-wrap gap-2">
              {[...discardAll].reverse().map((card, idx) => (
                <div key={`${card.id}:${idx}`} className="relative">
                  <PulseCardMini
                    card={card}
                    selected={selectedCardId === card.id}
                    lift="none"
                    className="scale-[0.9]"
                    onClick={() => {
                      if (!selectable || !onSelectCard) return;
                      onSelectCard(card.id);
                    }}
                  />
                  {selectedCardId === card.id && onConfirmSelected && confirmSelectedLabel ? (
                    <button
                      type="button"
                      onClick={onConfirmSelected}
                      disabled={confirmSelectedDisabled}
                      className="absolute left-1/2 top-0 z-20 w-[72px] -translate-x-1/2 -translate-y-full rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-slate-900 shadow disabled:opacity-40"
                    >
                      {confirmSelectedLabel}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GameNoticeToast({
  notice,
}: {
  notice:
    | {
        id: string;
        kind: string;
        title: string;
        text: string;
        card?: PulseCard | null;
      }
    | null
    | undefined;
}) {
  if (!notice) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[90] flex justify-center px-3">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-slate-950/95 px-3 py-2 text-white shadow-2xl ring-1 ring-white/15">
        <div className="text-[11px] font-semibold text-violet-200/90">{notice.title}</div>
        <div className="mt-0.5 text-[12px] text-white/85">{notice.text}</div>
        {notice.card ? (
          <div className="mt-2 flex justify-center">
            <PulseCardMini card={notice.card} selected={false} lift="none" onClick={() => {}} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function TerrainDeckModal({
  open,
  onClose,
  terrainDeck,
  terrainIndex,
}: {
  open: boolean;
  onClose: () => void;
  terrainDeck: TerrainCard[];
  terrainIndex: number;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-3xl rounded-3xl bg-slate-950 p-5 text-white shadow-2xl ring-1 ring-white/10"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold">Terrain deck</div>
            <div className="mt-1 text-xs text-white/60">{terrainDeck.length} cards (ordered)</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/15"
          >
            Close
          </button>
        </div>

        <div className="mt-4 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
          {terrainDeck.length ? (
            <div className="flex flex-wrap gap-3">
              {terrainDeck.map((terrain, idx) => (
                <div key={terrain.id} className="flex flex-col items-center gap-2">
                  <div className={`text-[11px] font-semibold ${idx === terrainIndex ? "text-emerald-200" : "text-white/55"}`}>
                    Step {idx + 1}
                    {idx === terrainIndex ? " • current" : ""}
                  </div>
                  <TerrainCardView suit={terrain.suit} min={terrain.min} max={terrain.max} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-white/60">No terrain deck.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function OutcomeHistoryModal({
  open,
  onClose,
  outcomeLog,
}: {
  open: boolean;
  onClose: () => void;
  outcomeLog: OutcomeLogEntry[];
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-3xl rounded-3xl bg-slate-950 p-5 text-white shadow-2xl ring-1 ring-white/10"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold">Pulse history</div>
            <div className="mt-1 text-xs text-white/60">{outcomeLog.length} entries</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 hover:bg-white/15"
          >
            Close
          </button>
        </div>

        <div className="mt-4 max-h-[70vh] overflow-visible rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
          <div className="space-y-2">
            {[...outcomeLog].reverse().map((entry, idx) => (
              <div key={`${entry.chapter}:${entry.step}:${idx}`} className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-extrabold text-white">{entry.result.toUpperCase()}</div>
                  <div className="text-[11px] font-semibold text-white/50">
                    Sphere {entry.chapter} • Step {entry.step} • {entry.terrainSuit.toUpperCase()}
                  </div>
                </div>
                <div className="mt-1 text-sm text-white/70">
                  total <span className="font-extrabold text-white">{entry.total}</span> • target {entry.min}–{entry.max}
                </div>
              </div>
            ))}
            {!outcomeLog.length && <div className="text-sm text-white/60">No entries yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
