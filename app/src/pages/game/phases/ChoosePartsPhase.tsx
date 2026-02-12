import React from "react";
import { PartChoiceCard } from "../../../components/game/PartChoiceCard";
import { SphereLocationImages } from "../../../components/game/SphereLocationImages";
import type { LocationCard } from "../../../game/locations";
import type { PlayerSlot } from "../../../types";
import { seatLabel } from "../gameUtils";

type ChoosePartsPhaseProps = {
  location: LocationCard;
  sphere: number;
  sphereImageUrl: string | null;
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
  location,
  sphere,
  sphereImageUrl,
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
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,16%)_minmax(0,1fr)] gap-2">
      <div className="min-h-0 p-1 max-w-[20vw]">
        <SphereLocationImages
          sphere={sphere}
          sphereImageUrl={sphereImageUrl}
          locationName={location.name}
          locationImageUrl={locationImageUrl}
          orientation="row"
        />
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
            {location.compulsory.map((part) => (
              <PartChoiceCard
                key={part.id}
                part={part}
                takenBy={picksByValue[part.id] ?? []}
                onPick={() => {
                  const currentPicked = picksByValue[part.id]?.includes(pickingSeat);
                  onPickPart(currentPicked ? null : part.id);
                }}
              />
            ))}
            {location.optional.map((part) => (
              <PartChoiceCard
                key={part.id}
                part={part}
                takenBy={picksByValue[part.id] ?? []}
                onPick={() => {
                  const currentPicked = picksByValue[part.id]?.includes(pickingSeat);
                  onPickPart(currentPicked ? null : part.id);
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
