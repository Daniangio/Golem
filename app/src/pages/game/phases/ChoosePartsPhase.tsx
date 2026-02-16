import React from "react";
import { PartChoiceCard } from "../../../components/game/PartChoiceCard";
import { LocationShowcase } from "../../../components/game/LocationShowcase";
import type { LocationCard } from "../../../game/locations";
import type { PlayerSlot } from "../../../types";
import { seatLabel } from "../gameUtils";

type ChoosePartsPhaseProps = {
  isMobileLayout: boolean;
  location: LocationCard;
  locationImageUrl: string | null;
  selectedSeat: PlayerSlot;
  pickingSeat: PlayerSlot;
  canActForSelected: boolean;
  picksByValue: Record<string, PlayerSlot[]>;
  isHost: boolean;
  busy: boolean;
  canConfirmParts: boolean;
  onPickPart: (partId: string | null) => void;
  onConfirmParts: () => void;
};

export function ChoosePartsPhase({
  isMobileLayout,
  location,
  locationImageUrl,
  selectedSeat,
  pickingSeat,
  canActForSelected,
  picksByValue,
  isHost,
  busy,
  canConfirmParts,
  onPickPart,
  onConfirmParts,
}: ChoosePartsPhaseProps) {
  if (isMobileLayout) {
    return (
      <div className="relative h-full min-h-0 overflow-hidden rounded-2xl">
        {locationImageUrl ? (
          <>
            <img src={locationImageUrl} alt={location.name} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            <div className="absolute inset-0 bg-slate-950/70" />
          </>
        ) : (
          <div className="absolute inset-0 bg-slate-950/85" />
        )}

        <div className="relative z-10 flex h-full min-h-0 flex-col p-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-sm font-extrabold text-white">Assign faculties</div>
              <div className="mt-1 text-xs text-white/70">
                Selected seat: <span className="font-extrabold text-white">{seatLabel(selectedSeat)}</span> {canActForSelected ? "" : "(view-only)"}
              </div>
            </div>
            {isHost && (
              <button
                onClick={onConfirmParts}
                disabled={busy || !canConfirmParts}
                className="rounded-2xl bg-emerald-500 px-3 py-2 text-xs font-extrabold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirm faculties
              </button>
            )}
          </div>

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2">
              {[...location.compulsory, ...location.optional].map((part) => {
                const takenBy = picksByValue[part.id] ?? [];
                const selectedBySelf = takenBy.includes(pickingSeat);
                const takenByOthers = takenBy.some((seat) => seat !== pickingSeat);
                const disabled = busy || !canActForSelected || takenByOthers;
                return (
                  <PartChoiceCard
                    key={part.id}
                    part={part}
                    takenBy={takenBy}
                    selected={selectedBySelf}
                    unavailable={takenByOthers}
                    disabled={disabled}
                    compact
                    onPick={() => {
                      if (disabled) return;
                      onPickPart(selectedBySelf ? null : part.id);
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(240px,460px)_minmax(0,1fr)] gap-2">
      <div className="min-h-0 overflow-visible rounded-2xl bg-white/5 p-2 ring-1 ring-white/10">
        <div className="flex h-full min-h-0 items-start gap-2">
          <LocationShowcase
            locationName={location.name}
            locationRule={location.rule}
            locationImageUrl={locationImageUrl}
            panelClassName="w-[250px]"
            imageClassName="h-[250px] w-[172px] rounded-xl object-cover"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-sm font-extrabold text-white">Assign faculties</div>
            <div className="mt-1 text-xs text-white/65">
              Selected seat: <span className="font-extrabold text-white">{seatLabel(selectedSeat)}</span> {canActForSelected ? "" : "(view-only)"}
            </div>
          </div>
          {isHost && (
            <button
              onClick={onConfirmParts}
              disabled={busy || !canConfirmParts}
              className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-extrabold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              Confirm faculties
            </button>
          )}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-visible pr-1">
          <div className="grid gap-3 lg:grid-cols-2">
            {[...location.compulsory, ...location.optional].map((part) => {
              const takenBy = picksByValue[part.id] ?? [];
              const selectedBySelf = takenBy.includes(pickingSeat);
              const takenByOthers = takenBy.some((seat) => seat !== pickingSeat);
              const disabled = busy || !canActForSelected || takenByOthers;
              return (
                <PartChoiceCard
                  key={part.id}
                  part={part}
                  takenBy={takenBy}
                  selected={selectedBySelf}
                  unavailable={takenByOthers}
                  disabled={disabled}
                  onPick={() => {
                    if (disabled) return;
                    onPickPart(selectedBySelf ? null : part.id);
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
